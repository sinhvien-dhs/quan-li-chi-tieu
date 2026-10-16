/**
 * SpendWise AI Proxy — Cloudflare Worker
 *
 * Chức năng:
 * - Tiếp nhận câu văn chi tiêu tự nhiên từ SpendWise frontend
 * - Bảo vệ Gemini API Key an toàn trong Cloudflare Environment Variables (Secret: GEMINI_API_KEY)
 * - Gọi Google Gemini 2.0 Flash với prompt tối ưu và định dạng JSON output
 * - Trả về kết quả cho frontend kèm CORS headers
 * - Hỗ trợ kiểm tra kết nối (ping test) và xử lý lỗi mềm
 */

export default {
  async fetch(request, env, ctx) {
    const corsHeaders = {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization',
      'Access-Control-Max-Age': '86400',
    };

    // 1. CORS Preflight
    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: corsHeaders });
    }

    // 2. Health check (GET)
    if (request.method === 'GET') {
      return new Response(
        JSON.stringify({
          status: 'ok',
          service: 'SpendWise AI Proxy',
          version: '1.0.0',
          model: 'gemini-2.0-flash',
          configured: !!env.GEMINI_API_KEY,
        }),
        {
          headers: { ...corsHeaders, 'Content-Type': 'application/json; charset=utf-8' },
        }
      );
    }

    if (request.method !== 'POST') {
      return new Response(
        JSON.stringify({ ok: false, error: 'Phương thức không được hỗ trợ' }),
        {
          status: 405,
          headers: { ...corsHeaders, 'Content-Type': 'application/json; charset=utf-8' },
        }
      );
    }

    // 3. Kiểm tra API Key cấu hình trên Worker
    const apiKey = env.GEMINI_API_KEY;
    if (!apiKey) {
      return new Response(
        JSON.stringify({
          ok: false,
          error: 'Chưa cấu hình GEMINI_API_KEY trong Cloudflare Worker Secrets/Variables.',
        }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json; charset=utf-8' } }
      );
    }

    // 4. Parse request body
    let body;
    try {
      body = await request.json();
    } catch (e) {
      return new Response(
        JSON.stringify({ ok: false, error: 'JSON payload không hợp lệ' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json; charset=utf-8' } }
      );
    }

    // 5. Test ping
    if (body && body.action === 'test') {
      try {
        const testRes = await fetch(
          `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${encodeURIComponent(apiKey)}`,
          {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'x-goog-api-key': apiKey
            },
            body: JSON.stringify({
              contents: [{ parts: [{ text: 'Trả lời đúng 2 chữ: OK' }] }],
              generationConfig: { temperature: 0, maxOutputTokens: 10 },
            }),
          }
        );
        if (!testRes.ok) {
          const detail = await testRes.text();
          return new Response(
            JSON.stringify({ ok: false, message: `Lỗi kết nối Gemini (${testRes.status}): ${detail.slice(0, 100)}` }),
            { status: 502, headers: { ...corsHeaders, 'Content-Type': 'application/json; charset=utf-8' } }
          );
        }
        return new Response(
          JSON.stringify({ ok: true, message: 'Kết nối máy chủ Cloudflare AI thành công (Gemini 2.0 Flash)!' }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json; charset=utf-8' } }
        );
      } catch (err) {
        return new Response(
          JSON.stringify({ ok: false, message: 'Lỗi gọi Gemini: ' + err.message }),
          { status: 502, headers: { ...corsHeaders, 'Content-Type': 'application/json; charset=utf-8' } }
        );
      }
    }

    // 6. Xử lý phân tích câu văn
    const text = String(body.text || '').trim();
    if (!text) {
      return new Response(
        JSON.stringify({ ok: false, error: 'Vui lòng cung cấp nội dung cần phân tích (text)' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json; charset=utf-8' } }
      );
    }

    if (text.length > 500) {
      return new Response(
        JSON.stringify({ ok: false, error: 'Câu nhập quá dài (tối đa 500 ký tự)' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json; charset=utf-8' } }
      );
    }

    const categories = body.categories || 'food, transport, shopping, bills, education, health, entertainment, freelance, salary';
    const wallets = body.wallets || 'Tiền mặt, MoMo, Ngân hàng';
    const today = body.today || new Date().toISOString().split('T')[0];

    const prompt = [
      'Bạn là trợ lý trích xuất giao dịch tài chính thông minh cho ứng dụng SpendWise (Việt Nam).',
      `Ngày hiện tại: ${today} (định dạng YYYY-MM-DD).`,
      `Danh mục hợp lệ: ${categories}.`,
      `Ví hiện có: ${wallets}.`,
      '',
      'Quy tắc nhận diện số tiền tiếng Việt:',
      '- 40k = 40000, 1.5tr = 1500000, 2 triệu = 2000000',
      '- Tiếng lóng: "50 cành" = 50000, "2 lít" / "2 loét" = 200000, "1 củ" = 1000000, "nửa củ" = 500000, "nửa lít" = 50000, "50 xu" = 50000',
      '',
      'Quy tắc ngày tháng:',
      '- "hôm qua", "tối qua" = lùi 1 ngày so với ngày hiện tại',
      '- "hôm kia" = lùi 2 ngày so với ngày hiện tại',
      '- "sáng nay", "chiều nay", "hôm nay" = ngày hiện tại',
      '- Nếu có ngày cụ thể như "12/10", gán đúng ngày theo YYYY-MM-DD.',
      '',
      'Phân loại loại giao dịch:',
      '- Thu nhập: lương, thưởng, bán đồ, hoàn tiền, nhận chuyển khoản -> type="income"',
      '- Chi tiêu: ăn uống, mua sắm, đổ xăng, đóng tiền, trả nợ -> type="expense"',
      '',
      'Chỉ trả về JSON thuần túy theo mẫu sau, không bọc ```json, không thêm giải thích:',
      '{"items":[{"name":"Tên giao dịch","amount":40000,"type":"expense","category":"mã danh mục","wallet":"tên ví","date":"YYYY-MM-DD","note":""}]}',
      '',
      `Câu cần trích xuất: "${text}"`
    ].join('\n');

    try {
      const geminiRes = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${encodeURIComponent(apiKey)}`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-goog-api-key': apiKey
          },
          body: JSON.stringify({
            contents: [{ parts: [{ text: prompt }] }],
            generationConfig: {
              temperature: 0.1,
              responseMimeType: 'application/json'
            }
          })
        }
      );

      if (!geminiRes.ok) {
        const errDetail = await geminiRes.text();
        return new Response(
          JSON.stringify({ ok: false, error: `Gemini API lỗi ${geminiRes.status}: ${errDetail.slice(0, 120)}` }),
          { status: 502, headers: { ...corsHeaders, 'Content-Type': 'application/json; charset=utf-8' } }
        );
      }

      const geminiData = await geminiRes.json();
      const rawText = geminiData.candidates?.[0]?.content?.parts?.[0]?.text;
      if (!rawText) {
        return new Response(
          JSON.stringify({ ok: false, error: 'Gemini không trả về nội dung' }),
          { status: 502, headers: { ...corsHeaders, 'Content-Type': 'application/json; charset=utf-8' } }
        );
      }

      let parsed;
      try {
        parsed = JSON.parse(rawText);
      } catch (err) {
        return new Response(
          JSON.stringify({ ok: false, error: 'Gemini trả về JSON không hợp lệ: ' + rawText.slice(0, 80) }),
          { status: 502, headers: { ...corsHeaders, 'Content-Type': 'application/json; charset=utf-8' } }
        );
      }

      const items = Array.isArray(parsed.items) ? parsed.items : [];
      return new Response(
        JSON.stringify({ ok: true, items: items, engine: 'gemini' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json; charset=utf-8' } }
      );
    } catch (err) {
      return new Response(
        JSON.stringify({ ok: false, error: 'Lỗi mạng khi kết nối Gemini: ' + err.message }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json; charset=utf-8' } }
      );
    }
  }
};
