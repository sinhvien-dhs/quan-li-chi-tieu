/**
 * ai.js — Nhập nhanh giao dịch bằng câu văn tự nhiên / giọng nói
 *
 * 2 tầng xử lý:
 *  1. Parser cục bộ (luôn chạy, không cần mạng, không gửi dữ liệu ra ngoài):
 *     "Ăn bún bò 40k, đổ xăng 50k bằng ví MoMo, nhận lương 8tr"
 *     → tách thành từng giao dịch có tên / số tiền / loại / danh mục / ví
 *  2. Gemini API (tuỳ chọn): người dùng tự dán API key trong Cài đặt.
 *     Chỉ gửi câu nhập của chính họ, không tự động bật.
 *
 * Mọi kết quả trả về đều đi qua Business.parseAmount / Categories để
 * không tạo ra giao dịch sai định dạng.
 */

const AIEntry = {
  GEMINI_KEY_STORAGE: 'spendwise_gemini_key',
  MAX_ITEMS: 10,

  // ============================================================
  //  Từ khoá nhận diện loại giao dịch
  // ============================================================
  INCOME_WORDS: [
    'lương', 'luong', 'salary', 'thưởng', 'thuong', 'bonus', 'cộng', 'cong',
    'nhận', 'nhan', 'thu', 'bán', 'ban', 'lãi', 'lai', 'hoàn', 'hoan',
    'refund', 'hoàn tiền', 'hoan tien', 'chuyển vào', 'chuyen vao', 'gửi vô'
  ],

  EXPENSE_WORDS: [
    'ăn', 'an', 'mua', 'mua', 'uống', 'uong', 'cà phê', 'ca phe', 'trà', 'tra',
    'xăng', 'xang', 'đổ xăng', 'do xang', 'điện', 'dien', 'nước', 'nuoc',
    'wifi', 'internet', 'thuê', 'thue', 'mua sắm', 'mua sam', 'quần', 'quan',
    'áo', 'ao', 'giày', 'giay', 'sách', 'sach', 'học', 'hoc', 'khám', 'kham',
    'thuốc', 'thuoc', 'phim', 'vé', 've', 'gửi', 'gui', 'nộp', 'nop', 'trả', 'tra',
    'đóng', 'dong', 'phí', 'phi', 'rượu', 'ruou', 'bia', 'nước', 'nuoc'
  ],

  // Từ khoá → mã danh mục (khớp với Categories trong category.js)
  CATEGORY_KEYWORDS: {
    food: ['ăn', 'an ', 'cơm', 'phở', 'pho', 'bún', 'bun', 'bánh', 'banh', 'nước ăn', 'cà phê', 'ca phe', 'trà sữa', 'tra sua', 'quán', 'quan', 'ăn uống', 'an uong', 'đồ ăn', 'do an', 'bia', 'rượu', 'ruou', 'nhà hàng', 'nha hang'],
    transport: ['xăng', 'xang', 'grab', 'taxi', 'xe', 'bus', 'tàu', 'tau', 'máy bay', 'may bay', 'di chuyển', 'di chuyen', 'gửi xe', 'gui xe', 'vô xe'],
    shopping: ['mua', 'mua sắm', 'mua sam', 'quần', 'quan', 'áo', 'ao', 'giày', 'giay', 'mỹ phẩm', 'my pham', 'shop', 'shopee', 'lazada'],
    bills: ['điện', 'dien', 'nước', 'nuoc', 'internet', 'wifi', 'điện thoại', 'dien thoai', 'hóa đơn', 'hoa don', 'hóa đơn điện', 'bill'],
    education: ['học', 'hoc', 'sách', 'sach', 'khóa học', 'khoa hoc', 'học phí', 'hoc phi', 'tập vở'],
    health: ['thuốc', 'thuoc', 'khám', 'kham', 'bệnh', 'benh', 'viện phí', 'vien phi', 'y tế', 'y te', 'nha khoa', 'nha khoa'],
    entertainment: ['phim', 'xem phim', 'xem phim', 'giải trí', 'giai tri', 'game', 'nhạc', 'nhac', 'youtube', 'netflix', 'vui chơi', 'vui choi', 'cà phê sữa'],
    education_fee: ['học phí', 'hoc phi'],
    gift: ['quà', 'qua', 'tặng', 'tang', 'sinh nhật', 'sinh nhat', 'biếu', 'bieu'],
    freelance: ['freelance', 'dự án', 'du an', 'khách hàng', 'khach hang', 'thuê bao', 'thue bao'],
    salary: ['lương', 'luong', 'tháng lương', 'salary', 'payroll']
  },

  // Từ khoá nhận diện ví (so khớp không dấu với tên ví của người dùng)
  WALLET_KEYWORDS: ['ví', 'vi', 'tài khoản', 'tai khoan', 'thẻ', 'the', 'momo', 'zalo', 'visa', 'mastercard', 'vnd', 'cash', 'bank', 'techcombank', 'vib', 'mb bank', 'acb', 'agribank', 'vpbank', 'tpb', 'bidv'],

  // ============================================================
  //  TIỆN ÍCH
  // ============================================================
  hasApiKey() {
    return !!Storage.get(this.GEMINI_KEY_STORAGE, '');
  },

  getApiKey() {
    return Storage.get(this.GEMINI_KEY_STORAGE, '');
  },

  setApiKey(key) {
    Storage.set(this.GEMINI_KEY_STORAGE, String(key || '').trim());
  },

  /** Tách câu thành các mệnh đề độc lập */
  splitClauses(text) {
    return String(text)
      .replace(/[;\n]+/g, ',')
      .split(/\s*(?:,| và | rồi | sau đó | ngoài ra )+\s*/i)
      .map(s => s.trim())
      .filter(Boolean)
      .slice(0, this.MAX_ITEMS);
  },

  /** Số tiền trong một mệnh đề (hỗ trợ 40k, 1.5tr, 1.500.000, 2 triệu) */
  extractAmount(clause) {
    const patterns = [
      /(\d[\d.,]*\s*(?:k|nghìn|nghin|tr|triệu|trieu|tỷ|ty)\b)/i,
      /(\d[\d.,]*)/,
      /(\d+[.,]\d{1,2}\s*(?:tr|triệu|trieu|tỷ|ty))/i
    ];
    for (const re of patterns) {
      const m = clause.match(re);
      if (m) {
        const value = Business.parseAmount(m[1]);
        if (value !== null) return value;
      }
    }
    return null;
  },

  /** Suy đoán loại: thu hay chi */
  detectType(clause) {
    const norm = Utils.normalizeText(clause);
    const isIncome = this.INCOME_WORDS.some(w => norm.includes(Utils.normalizeText(w)));
    const isExpense = this.EXPENSE_WORDS.some(w => norm.includes(Utils.normalizeText(w)));
    if (isIncome && !isExpense) return 'income';
    if (isExpense && !isIncome) return 'expense';
    // Mặc định: có dấu "+" hoặc từ "nhận/lương" → thu, ngược lại → chi
    if (/\+|nhận|nhan|lương|luong/i.test(clause)) return 'income';
    return 'expense';
  },

  /** Suy đoán danh mục theo từ khoá */
  detectCategory(clause, type) {
    const norm = Utils.normalizeText(clause);
    let best = null;
    let bestLen = 0;
    Object.keys(this.CATEGORY_KEYWORDS).forEach((catId) => {
      this.CATEGORY_KEYWORDS[catId].forEach((kw) => {
        const n = Utils.normalizeText(kw).trim();
        if (n && norm.includes(n) && n.length > bestLen) {
          best = catId;
          bestLen = n.length;
        }
      });
    });
    if (best && typeof Categories !== 'undefined' && Categories.getById(best)) return best;
    return type === 'income' ? 'salary' : 'food';
  },

  /** Tìm ví theo tên trong danh sách ví của người dùng */
  detectWallet(clause) {
    if (typeof Features === 'undefined') return null;
    const wallets = Features.getWallets();
    const norm = Utils.normalizeText(clause);
    // Ưu tiên khớp tên ví đầy đủ
    const exact = wallets.find(w => {
      const n = Utils.normalizeText(w.name);
      return n && norm.includes(n);
    });
    if (exact) return exact.id;
    // Sau đó thử từ khoá ví chung
    for (const kw of this.WALLET_KEYWORDS) {
      const n = Utils.normalizeText(kw);
      if (norm.includes(n)) {
        const hit = wallets.find(w => Utils.normalizeText(w.name).includes(n));
        if (hit) return hit.id;
      }
    }
    return null;
  },

  /** Tên giao dịch: bỏ số tiền và các từ nối */
  cleanName(clause) {
    let name = String(clause)
      .replace(/\b\d[\d.,]*\s*(?:k|nghìn|nghin|tr|triệu|trieu|tỷ|ty)?\b/gi, ' ')
      .replace(/(?:bằng|ở|từ|voi|vo|với|using|qua|qua)\s+(?:ví|vi|thẻ|the|tài khoản|tai khoan|momo|zalo)?\s*\w*\s*$/i, ' ')
      .replace(/\s+/g, ' ')
      .trim();
    if (!name) name = 'Giao dịch';
    if (name.length > 50) name = name.slice(0, 50);
    // Viết hoa chữ cái đầu
    return name.charAt(0).toUpperCase() + name.slice(1);
  },

  /**
   * Kiểm tra API key Gemini có hoạt động không (gọi thử 1 lần, rất nhỏ)
   */
  async testConnection() {
    const key = this.getApiKey();
    if (!key) {
      return { ok: false, message: 'Chưa có API key. Hãy dán key rồi bấm Lưu trước.' };
    }
    try {
      const res = await fetch(
        'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=' + encodeURIComponent(key),
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            contents: [{ parts: [{ text: 'Trả lời duy nhất bằng chữ OK' }] }],
            generationConfig: { temperature: 0, maxOutputTokens: 10 }
          })
        }
      );

      if (!res.ok) {
        const detail = await res.text();
        let msg = 'Gemini trả về lỗi ' + res.status;
        if (res.status === 400) msg = 'Key không hợp lệ — hãy kiểm tra lại chuỗi AIza...';
        if (res.status === 403) msg = 'Key bị từ chối — có thể chưa bật Generative Language API cho project.';
        if (res.status === 429) msg = 'Đã vượt hạn mức miễn phí, thử lại sau ít phút.';
        console.warn('Gemini test:', detail.slice(0, 200));
        return { ok: false, message: msg };
      }

      const data = await res.json();
      const text = data.candidates && data.candidates[0] &&
        data.candidates[0].content && data.candidates[0].content.parts &&
        data.candidates[0].content.parts[0].text;
      return {
        ok: true,
        message: 'Kết nối thành công! Gemini trả lời: "' + String(text || 'OK').trim().slice(0, 30) + '"'
      };
    } catch (err) {
      return { ok: false, message: 'Không gọi được Gemini (kiểm tra mạng): ' + err.message };
    }
  },
  // ============================================================
  //  PARSER CỤC BỘ (không cần mạng)
  // ============================================================
  parseLocal(text) {
    const clauses = this.splitClauses(text);
    const items = [];
    let skipped = 0;

    clauses.forEach((clause) => {
      const amount = this.extractAmount(clause);
      if (amount === null || amount <= 0) { skipped++; return; }
      const type = this.detectType(clause);
      items.push({
        name: this.cleanName(clause),
        amount: amount,
        type: type,
        category: this.detectCategory(clause, type),
        wallet: this.detectWallet(clause),
        date: Utils.getToday(),
        note: ''
      });
    });

    return { items: items, skipped: skipped, engine: 'local' };
  },

  // ============================================================
  //  GEMINI (tuỳ chọn — chỉ chạy khi người dùng tự bật)
  // ============================================================
  async parseWithGemini(text) {
    const key = this.getApiKey();
    if (!key) throw new Error('Chưa có API key Gemini');

    const categories = (typeof Categories !== 'undefined')
      ? [...Categories.expense, ...Categories.income].map(c => c.id).join(',')
      : 'food,transport,shopping,bills,education,health,entertainment,freelance,salary';
    const wallets = (typeof Features !== 'undefined')
      ? Features.getWallets().map(w => `${w.name}`).join(', ')
      : '';

    const prompt = [
      'Bạn là trợ lý trích xuất giao dịch chi tiêu của một ứng dụng tài chính Việt Nam.',
      `Danh mục hợp lệ: ${categories}`,
      `Ví hiện có: ${wallets || '(chưa có ví)'}`,
      'Số tiền luôn là số nguyên VNĐ, ví dụ "40k" = 40000, "1.5tr" = 1500000.',
      'Chỉ trả về JSON đúng theo mẫu, không thêm giải thích:',
      '{"items":[{"name":"tên giao dịch","amount":40000,"type":"expense|income","category":"mã danh mục","wallet":"tên ví hoặc rỗng"}]}',
      `Câu cần phân tích: "${text}"`
    ].join('\n');

    const res = await fetch(
      'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=' + encodeURIComponent(key),
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: { temperature: 0.1, responseMimeType: 'application/json' }
        })
      }
    );

    if (!res.ok) throw new Error('Gemini lỗi ' + res.status);
    const data = await res.json();
    const raw = data.candidates && data.candidates[0] &&
      data.candidates[0].content && data.candidates[0].content.parts &&
      data.candidates[0].content.parts[0].text;
    if (!raw) throw new Error('Gemini không trả về nội dung');

    let parsed;
    try {
      parsed = JSON.parse(raw);
    } catch (e) {
      throw new Error('Gemini trả về dữ liệu không hợp lệ');
    }

    const items = (parsed.items || []).map((it) => {
      const amount = Business.parseAmount(it.amount);
      const wallet = (typeof Features !== 'undefined')
        ? Features.getWallets().find(w => Utils.normalizeText(w.name) === Utils.normalizeText(it.wallet))
        : null;
      return {
        name: String(it.name || 'Giao dịch').slice(0, 50),
        amount: amount === null ? 0 : amount,
        type: it.type === 'income' ? 'income' : 'expense',
        category: (typeof Categories !== 'undefined' && Categories.getById(it.category)) ? it.category : 'food',
        wallet: wallet ? wallet.id : null,
        date: Utils.getToday(),
        note: ''
      };
    }).filter((it) => it.amount > 0);

    return { items: items, skipped: 0, engine: 'gemini' };
  },

  /**
   * Phân tích câu nhập: ưu tiên Gemini nếu đã bật, không thì dùng parser cục bộ.
   * @returns {Promise<{items:Array, engine:string, error?:string}>}
   */
  async parse(text) {
    const clean = String(text || '').trim();
    if (!clean) return { items: [], engine: 'local', error: 'Bạn chưa nhập gì.' };

    if (this.hasApiKey()) {
      try {
        return await this.parseWithGemini(clean);
      } catch (err) {
        const fallback = this.parseLocal(clean);
        fallback.error = 'Gemini không phản hồi (' + err.message + ') — đã dùng bộ phân tích trong máy.';
        return fallback;
      }
    }
    return this.parseLocal(clean);
  }
};
