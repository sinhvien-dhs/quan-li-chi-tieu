/**
 * ai.js — Nhập nhanh giao dịch bằng câu văn tự nhiên / giọng nói
 *
 * Hệ thống AI Đa tầng (Hybrid AI Router):
 *  1. Ngoại tuyến / Cục bộ (luôn chạy, không cần mạng, xử lý trực tiếp trên máy):
 *     - Nhận diện mệnh đề, danh mục, ví, số tiền kèm tiếng lóng (cành, lít, loét, củ, xu, nửa củ, nửa lít)
 *     - Nhận diện thời gian tương đối (hôm qua, hôm kia, sáng nay, ngày cụ thể)
 *  2. Trực tuyến qua 9Router AI Gateway (Cục bộ/Mạng nội bộ thông minh):
 *     - Cổng OpenAI-compatible kết nối Gemini / GPT / Claude an toàn
 *     - Tự động chuyển mượt (fallback) về AI cục bộ khi ngắt kết nối (>8s)
 *  3. Gemini Direct (Tuỳ chọn cho người dùng nâng cao có API key riêng)
 */

const AIEntry = {
  ROUTER9_URL_STORAGE: 'spendwise_9router_url',
  ROUTER9_KEY_STORAGE: 'spendwise_9router_key',
  ROUTER9_MODEL_STORAGE: 'spendwise_9router_model',
  DEFAULT_ROUTER9_URL: 'http://localhost:20128/v1',
  DEFAULT_ROUTER9_MODEL: 'gemini-2.0-flash',

  GEMINI_KEY_STORAGE: 'spendwise_gemini_key',
  MAX_ITEMS: 10,

  // ============================================================
  //  Từ khoá nhận diện loại giao dịch
  // ============================================================
  INCOME_WORDS: [
    'lương', 'luong', 'salary', 'thưởng', 'thuong', 'bonus', 'cộng', 'cong',
    'nhận', 'nhan', 'thu nhập', 'thu nhap', 'tiền thu', 'tien thu', 'thu tiền', 'thu tien',
    'thu nợ', 'thu no', 'khoản thu', 'khoan thu', 'bán', 'ban', 'lãi', 'lai',
    'hoàn tiền', 'hoan tien', 'hoàn', 'hoan', 'refund', 'chuyển vào', 'chuyen vao', 'gửi vô'
  ],

  EXPENSE_WORDS: [
    'ăn', 'an', 'mua', 'uống', 'uong', 'cà phê', 'ca phe', 'trà', 'tra',
    'xăng', 'xang', 'đổ xăng', 'do xang', 'điện', 'dien', 'nước', 'nuoc',
    'wifi', 'internet', 'thuê', 'thue', 'tiền nhà', 'tien nha', 'tiền phòng', 'tien phong',
    'tiền trọ', 'tien tro', 'mua sắm', 'mua sam', 'quần', 'quan',
    'áo', 'ao', 'giày', 'giay', 'sách', 'sach', 'học', 'hoc', 'học phí', 'hoc phi',
    'khám', 'kham', 'thuốc', 'thuoc', 'tiền thuốc', 'tien thuoc', 'phim', 'vé', 've',
    'gửi', 'gui', 'nộp', 'nop', 'trả', 'tra', 'tốn', 'ton', 'hết', 'het',
    'đóng', 'dong', 'phí', 'phi', 'rượu', 'ruou', 'bia'
  ],

  // Từ khoá → mã danh mục (khớp với Categories trong category.js)
  CATEGORY_KEYWORDS: {
    food: ['ăn', 'an', 'cơm', 'phở', 'pho', 'bún', 'bun', 'bánh mì', 'banh mi', 'cơm tấm', 'com tam', 'bánh', 'banh', 'uống', 'uong', 'uống nước', 'uong nuoc', 'nước mía', 'nuoc mia', 'sinh tố', 'sinh to', 'cà phê', 'ca phe', 'trà sữa', 'tra sua', 'trà đào', 'tra dao', 'trà đá', 'tra da', 'trà', 'tra', 'quán', 'quan', 'ăn uống', 'an uong', 'đồ ăn', 'do an', 'bia', 'rượu', 'ruou', 'nhà hàng', 'nha hang'],
    transport: ['xăng', 'xang', 'đổ xăng', 'do xang', 'grab', 'taxi', 'xe', 'bus', 'tàu', 'tau', 'máy bay', 'may bay', 'di chuyển', 'di chuyen', 'gửi xe', 'gui xe', 'vô xe', 'đi xe', 'di xe', 'đi lại', 'di lai'],
    shopping: ['mua', 'mua sắm', 'mua sam', 'quần', 'quan', 'áo', 'ao', 'giày', 'giay', 'mỹ phẩm', 'my pham', 'shop', 'shopee', 'lazada', 'tiki'],
    bills: ['điện', 'dien', 'tiền nước', 'tien nuoc', 'hóa đơn nước', 'hoa don nuoc', 'nước máy', 'nuoc may', 'tiền điện', 'tien dien', 'internet', 'wifi', 'điện thoại', 'dien thoai', 'hóa đơn', 'hoa don', 'bill', 'tiền mạng', 'tien mang', 'tiền trọ', 'tien tro', 'tiền phòng', 'tien phong', 'tiền nhà', 'tien nha', 'thuê nhà', 'thue nha', 'thuê phòng', 'thue phong', 'thuê trọ', 'thue tro', 'thuê', 'thue'],
    education: ['học', 'hoc', 'sách', 'sach', 'khóa học', 'khoa hoc', 'học phí', 'hoc phi', 'tập vở'],
    health: ['thuốc', 'thuoc', 'tiền thuốc', 'tien thuoc', 'mua thuốc', 'mua thuoc', 'uống thuốc', 'uong thuoc', 'khám', 'kham', 'bệnh', 'benh', 'viện phí', 'vien phi', 'y tế', 'y te', 'nha khoa'],
    entertainment: ['phim', 'xem phim', 'giải trí', 'giai tri', 'game', 'nhạc', 'nhac', 'youtube', 'netflix', 'vui chơi', 'vui choi'],
    gift: ['quà', 'qua', 'tặng', 'tang', 'sinh nhật', 'sinh nhat', 'biếu', 'bieu', 'lì xì', 'li xi', 'mừng tuổi', 'mung tuoi'],
    freelance: ['freelance', 'dự án', 'du an', 'khách hàng', 'khach hang', 'làm thêm', 'lam them'],
    salary: ['lương', 'luong', 'tháng lương', 'salary', 'payroll', 'thưởng', 'thuong', 'bonus']
  },

  // Từ khoá nhận diện ví
  WALLET_KEYWORDS: ['ví', 'vi', 'tài khoản', 'tai khoan', 'thẻ', 'the', 'momo', 'zalo', 'zalopay', 'visa', 'mastercard', 'vnd', 'cash', 'bank', 'tiền mặt', 'tien mat', 'techcombank', 'vib', 'mb', 'mb bank', 'acb', 'agribank', 'vpbank', 'tpb', 'bidv', 'vietcombank', 'vietinbank'],

  // ============================================================
  //  CẤU HÌNH & TRẠNG THÁI
  // ============================================================
  has9Router() {
    return !!this.get9RouterUrl();
  },

  get9RouterUrl() {
    return Storage.get(this.ROUTER9_URL_STORAGE, '');
  },

  set9RouterUrl(url) {
    Storage.set(this.ROUTER9_URL_STORAGE, String(url || '').trim());
  },

  get9RouterKey() {
    return Storage.get(this.ROUTER9_KEY_STORAGE, '');
  },

  set9RouterKey(key) {
    Storage.set(this.ROUTER9_KEY_STORAGE, String(key || '').trim());
  },

  get9RouterModel() {
    return Storage.get(this.ROUTER9_MODEL_STORAGE, this.DEFAULT_ROUTER9_MODEL) || this.DEFAULT_ROUTER9_MODEL;
  },

  set9RouterModel(model) {
    Storage.set(this.ROUTER9_MODEL_STORAGE, String(model || '').trim());
  },

  hasApiKey() {
    return !!Storage.get(this.GEMINI_KEY_STORAGE, '');
  },

  getApiKey() {
    return Storage.get(this.GEMINI_KEY_STORAGE, '');
  },

  setApiKey(key) {
    Storage.set(this.GEMINI_KEY_STORAGE, String(key || '').trim());
  },

  /**
   * Xác định chế độ AI hiện tại cho giao diện (Settings & Home)
   */
  getEngineMode() {
    const isOnline = (typeof navigator === 'undefined' || navigator.onLine !== false);
    const has9R = this.has9Router();
    const hasKey = this.hasApiKey();

    if (!isOnline) {
      return {
        engine: 'local',
        online: false,
        label: 'Ngoại tuyến (Sẵn sàng)',
        desc: 'Model AI tích hợp sẵn chạy trực tiếp trên thiết bị — phân tích nhanh, không cần mạng hay bất kỳ API key nào.'
      };
    }

    if (has9R) {
      const model = this.get9RouterModel() || this.DEFAULT_ROUTER9_MODEL;
      return {
        engine: '9router',
        online: true,
        label: '9Router Gateway',
        desc: `Trực tuyến — Phân tích qua 9Router AI Gateway (${model}). Tự động fallback về AI trong máy khi ngắt kết nối.`
      };
    }

    if (hasKey) {
      return {
        engine: 'gemini',
        online: true,
        label: 'Gemini Direct',
        desc: 'Trực tuyến — Đang dùng Google Gemini API với key cá nhân của bạn.'
      };
    }

    return {
      engine: 'local',
      online: true,
      label: 'Tích hợp sẵn (Sẵn sàng)',
      desc: 'Model AI tài chính tích hợp sẵn — Phân tích tức thì, xử lý cục bộ trên thiết bị, không cần cấu hình API key.'
    };
  },

  // ============================================================
  //  TIỆN ÍCH TRÍCH XUẤT CỤC BỘ
  // ============================================================
  /** Tách câu thành các mệnh đề độc lập */
  splitClauses(text) {
    let raw = String(text).replace(/[;\n]+/g, ',');

    // Tự động ngắt mệnh đề sau số tiền nếu người dùng không gõ dấu phẩy:
    // Ví dụ: "...hết 100k chiều uống nước 50k..." -> "...hết 100k, chiều uống nước 50k..."
    const amountPattern = /(\d[\d.,]*\s*(?:k|nghìn|nghin|tr|triệu|trieu|tỷ|ty|cành|canh|lít|lit|loét|loet|củ|cu|xu))\s+(?=(?:sáng|sang|trưa|trua|chiều|chieu|tối|toi|đêm|dem|hôm|hom|ngày|ngay|ăn|an|uống|uong|mua|đổ|do|đi|di|trả|tra|nhận|nhan|lương|luong|nộp|nop|đóng|dong|thưởng|thuong|cả ngày|ca ngay)(?:[^\p{L}\p{N}]|$))/giu;
    raw = raw.replace(amountPattern, '$1, ');

    return raw
      .split(/\s*(?:,| và | rồi | sau đó | ngoài ra )+\s*/i)
      .map(s => s.trim())
      .filter(Boolean)
      .slice(0, this.MAX_ITEMS);
  },

  /** Tính ngày lệch so với hiện tại */
  getDateOffset(days) {
    const d = new Date();
    d.setDate(d.getDate() + days);
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  },

  /** Nhận diện ngày từ câu văn */
  detectDate(clause) {
    const norm = Utils.normalizeText(clause);
    // Hôm qua / tối qua / chiều qua
    if (/\b(?:hom qua|toi qua|chieu qua|hoi hom)\b/.test(norm)) {
      return this.getDateOffset(-1);
    }
    // Hôm kia
    if (/\b(?:hom kia)\b/.test(norm)) {
      return this.getDateOffset(-2);
    }
    // Hôm nay / sáng nay / trưa nay / chiều nay / tối nay
    if (/\b(?:hom nay|sang nay|trua nay|chieu nay|toi nay)\b/.test(norm)) {
      return Utils.getToday();
    }
    // Ngày cụ thể: ngày 15/10 hoặc 15-10 hoặc 15/10/2026
    const m = clause.match(/\b(?:ngày|ngay|hôm|hom)?\s*(\d{1,2})[/-](\d{1,2})(?:[/-](\d{4}))?\b/i);
    if (m) {
      const day = String(m[1]).padStart(2, '0');
      const month = String(m[2]).padStart(2, '0');
      const year = m[3] ? String(m[3]) : new Date().getFullYear().toString();
      const dateStr = `${year}-${month}-${day}`;
      if (typeof Business !== 'undefined' && Business.isValidDate && Business.isValidDate(dateStr)) {
        return dateStr;
      }
    }
    return Utils.getToday();
  },

  /** Số tiền trong một mệnh đề (hỗ trợ 40k, 1.5tr, cành, lít, loét, củ, xu, nửa củ, nửa lít) */
  extractAmount(clause) {
    const trimmed = String(clause).trim();

    // Tiếng lóng đặc biệt đứng riêng (dùng Unicode boundary thay cho \b vì ký tự tiếng Việt)
    if (/(?:^|[^\p{L}\p{N}])n[uử]a\s+c[uủ](?=[^\p{L}\p{N}]|$)/iu.test(trimmed)) return 500000;
    if (/(?:^|[^\p{L}\p{N}])n[uử]a\s+l[ií]t(?=[^\p{L}\p{N}]|$)/iu.test(trimmed)) return 50000;

    const patterns = [
      /(\d[\d.,]*\s*(?:k|nghìn|nghin|tr|triệu|trieu|tỷ|ty|cành|canh|lít|lit|loét|loet|củ|cu|xu))(?=[^\p{L}\p{N}]|$)/iu,
      /(\d+[.,]\d{1,2}\s*(?:tr|triệu|trieu|tỷ|ty|cành|canh|lít|lit|loét|loet|củ|cu|xu))(?=[^\p{L}\p{N}]|$)/iu,
      /(\d[\d.,]*)/
    ];
    for (const re of patterns) {
      const m = trimmed.match(re);
      if (m) {
        const value = Business.parseAmount(m[1]);
        if (value !== null && value > 0) return value;
      }
    }
    return null;
  },

  /** Suy đoán loại: thu hay chi */
  detectType(clause) {
    const raw = String(clause || '').trim();
    if (!raw) return 'expense';

    // 1. Kiểm tra ưu tiên các từ khóa thu/chi rõ ràng (nguyên từ)
    const hasIncomeStrong = /(?:^|[^\p{L}\p{N}])(?:\+|nhận|nhan|lương|luong|thưởng|thuong|bonus|cộng|cong|lãi|lai|hoàn tiền|hoan tien|refund|gửi vào|chuyển vào|được chuyển|thu nhập|thu nhap|thu nợ|thu no|thu tiền|thu tien)(?=[^\p{L}\p{N}]|$)/iu.test(raw);
    const hasExpenseStrong = /(?:^|[^\p{L}\p{N}])(?:-|chi|mua|thuê|thue|trả|tra|tốn|ton|hết|het|đóng|dong|nộp|nop|tiền thuốc|thuốc|thuoc|tiền nhà|tien nha|tiền phòng|tien phong|khám|kham|học phí|hoc phi)(?=[^\p{L}\p{N}]|$)/iu.test(raw);

    if (hasExpenseStrong && !hasIncomeStrong) return 'expense';
    if (hasIncomeStrong && !hasExpenseStrong) return 'income';
    if (hasExpenseStrong && hasIncomeStrong) {
      // Khi cả hai xuất hiện (ví dụ: "dùng tiền lương mua thuốc 120k"), hành động chính là mua thuốc -> chi tiêu
      return 'expense';
    }

    const norm = Utils.normalizeText(raw);
    const padded = ' ' + norm + ' ';

    const matchWord = (w) => {
      const nw = Utils.normalizeText(w).trim();
      if (!nw) return false;
      // Khớp nguyên từ (word boundary) tránh bắt nhầm xâu con (như "thu" trong "thuoc" hay "thue")
      return padded.includes(' ' + nw + ' ');
    };

    const isExpense = this.EXPENSE_WORDS.some(matchWord);
    const isIncome = this.INCOME_WORDS.some(matchWord);

    if (isExpense && !isIncome) return 'expense';
    if (isIncome && !isExpense) return 'income';
    if (isExpense && isIncome) return 'expense';

    return 'expense';
  },

  /** Suy đoán danh mục theo từ khoá */
  detectCategory(clause, type) {
    const norm = Utils.normalizeText(clause);
    const padded = ' ' + norm + ' ';
    let best = null;
    let bestLen = 0;

    const incomeCategories = ['salary', 'freelance', 'gift'];

    Object.keys(this.CATEGORY_KEYWORDS).forEach((catId) => {
      // Phân tách danh mục theo loại thu/chi
      if (type === 'income' && !incomeCategories.includes(catId)) return;
      if (type === 'expense' && incomeCategories.includes(catId)) return;

      this.CATEGORY_KEYWORDS[catId].forEach((kw) => {
        const n = Utils.normalizeText(kw).trim();
        if (n && (padded.includes(' ' + n + ' ') || norm.startsWith(n + ' ') || norm.endsWith(' ' + n) || norm === n)) {
          if (n.length > bestLen) {
            best = catId;
            bestLen = n.length;
          }
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

  /** Tên giao dịch: bỏ số tiền, từ nối, mốc thời gian và từ cảm thán thừa */
  cleanName(clause) {
    let name = String(clause)
      .replace(/(?:^|[^\p{L}\p{N}])n[uử]a\s+c[uủ](?=[^\p{L}\p{N}]|$)/giu, ' ')
      .replace(/(?:^|[^\p{L}\p{N}])n[uử]a\s+l[ií]t(?=[^\p{L}\p{N}]|$)/giu, ' ')
      .replace(/(\d[\d.,]*\s*(?:k|nghìn|nghin|tr|triệu|trieu|tỷ|ty|cành|canh|lít|lit|loét|loet|củ|cu|xu))(?=[^\p{L}\p{N}]|$)/giu, ' ')
      .replace(/\b\d[\d.,]*\b/g, ' ')
      .replace(/(?:^|[^\p{L}\p{N}])(?:hôm qua|hom qua|hôm kia|hom kia|hôm nay|hom nay|(?:sáng|sang|trưa|trua|chiều|chieu|tối|toi|đêm|dem)(?:\s+(?:nay|qua|hom nay))?|tối qua|toi qua|chiều qua|chieu qua|hồi hôm|hoi hom|cả ngày|ca ngay)(?=[^\p{L}\p{N}]|$)/giu, ' ')
      .replace(/\b(?:ngày|ngay|hôm|hom)?\s*\d{1,2}[/-]\d{1,2}(?:[/-]\d{4})?\b/gi, ' ')
      .replace(/(?:^|[^\p{L}\p{N}])(?:bằng|ở|từ|voi|vo|với|using|qua)\s+(?:ví|vi|thẻ|the|tài khoản|tai khoan|momo|zalo|zalopay)?\s*\w*\s*$/giu, ' ')
      .replace(/\s+(?:hết|het|mất|mat|tổng|tong|tổng cộng|tong cong|là|la)\s*$/iu, ' ')
      .replace(/\s+/g, ' ')
      .trim();
    if (!name) name = 'Giao dịch';
    if (name.length > 50) name = name.slice(0, 50);
    // Viết hoa chữ cái đầu
    return name.charAt(0).toUpperCase() + name.slice(1);
  },

  // ============================================================
  //  KIỂM TRA KẾT NỐI
  // ============================================================
  async testConnection() {
    const router9Url = this.get9RouterUrl();
    const directKey = this.getApiKey();

    if (!router9Url && !directKey) {
      return {
        ok: false,
        message: 'Chưa cấu hình máy chủ 9Router hoặc Gemini API key.'
      };
    }

    // Ưu tiên 1: Kiểm tra 9Router AI Gateway
    if (router9Url) {
      try {
        const base = router9Url.replace(/\/+$/, '');
        const endpoint = base.endsWith('/v1') ? `${base}/chat/completions` : `${base}/v1/chat/completions`;
        const headers = { 'Content-Type': 'application/json' };
        const key = this.get9RouterKey();
        if (key) headers['Authorization'] = `Bearer ${key}`;

        const model = this.get9RouterModel() || this.DEFAULT_ROUTER9_MODEL;
        const res = await fetch(endpoint, {
          method: 'POST',
          headers: headers,
          body: JSON.stringify({
            model: model,
            messages: [{ role: 'user', content: 'Trả lời đúng 2 chữ: OK' }],
            max_tokens: 10,
            temperature: 0
          })
        });

        if (!res.ok) {
          const detail = await res.text().catch(() => '');
          return { ok: false, message: `9Router báo lỗi ${res.status}: ${detail.slice(0, 100)}` };
        }
        return {
          ok: true,
          message: `Kết nối thành công tới 9Router AI Gateway (${model})!`
        };
      } catch (err) {
        return { ok: false, message: 'Không gọi được 9Router (kiểm tra 9Router đã khởi chạy chưa): ' + err.message };
      }
    }

    // Kiểm tra trực tiếp Google Gemini API
    try {
      const res = await fetch(
        'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=' + encodeURIComponent(directKey),
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-goog-api-key': directKey
          },
          body: JSON.stringify({
            contents: [{ parts: [{ text: 'Trả lời duy nhất bằng chữ OK' }] }],
            generationConfig: { temperature: 0, maxOutputTokens: 10 }
          })
        }
      );

      if (!res.ok) {
        const detail = await res.text().catch(() => '');
        let msg = 'Gemini trả về lỗi ' + res.status;
        if (res.status === 400 || res.status === 401) msg = 'Key không hợp lệ hoặc chưa được cấp quyền — hãy kiểm tra lại key từ Google AI Studio (bắt đầu bằng AQ... hoặc AIza...).';
        if (res.status === 403) msg = 'Key bị từ chối — có thể chưa bật Generative Language API cho project.';
        if (res.status === 429) msg = 'Đã vượt hạn mức miễn phí, thử lại sau ít phút.';
        console.warn('Gemini test:', detail.slice(0, 200));
        return { ok: false, message: msg };
      }

      return {
        ok: true,
        message: 'Kết nối thành công tới Google Gemini 2.0 Direct!'
      };
    } catch (err) {
      return { ok: false, message: 'Không gọi được Gemini (kiểm tra mạng): ' + err.message };
    }
  },

  // ============================================================
  //  1. PARSER CỤC BỘ (Không cần mạng, xử lý trực tiếp trên máy)
  // ============================================================
  parseLocal(text) {
    const clauses = this.splitClauses(text);
    const items = [];
    let skipped = 0;

    clauses.forEach((clause) => {
      const amount = this.extractAmount(clause);
      if (amount === null || amount <= 0) { skipped++; return; }
      const type = this.detectType(clause);
      const date = this.detectDate(clause);
      items.push({
        name: this.cleanName(clause),
        amount: amount,
        type: type,
        category: this.detectCategory(clause, type),
        wallet: this.detectWallet(clause),
        date: date,
        note: ''
      });
    });

    return { items: items, skipped: skipped, engine: 'local' };
  },

  // ============================================================
  //  2. GOOGLE GEMINI DIRECT (Tuỳ chọn người dùng nâng cao)
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
      'Bạn là trợ lý trích xuất giao dịch chi tiêu của ứng dụng tài chính SpendWise Việt Nam.',
      `Ngày hôm nay: ${Utils.getToday()} (YYYY-MM-DD).`,
      `Danh mục hợp lệ: ${categories}`,
      `Ví hiện có: ${wallets || '(chưa có ví)'}`,
      'Số tiền luôn là số nguyên VNĐ (ví dụ "40k" = 40000, "1.5tr" = 1500000, "50 cành" = 50000, "2 lít" = 200000, "1 củ" = 1000000).',
      'Nếu nhắc đến "hôm qua", "hôm kia", hoặc ngày cụ thể, hãy tính ngày tương ứng theo YYYY-MM-DD.',
      'Chỉ trả về JSON đúng theo mẫu, không thêm giải thích:',
      '{"items":[{"name":"tên giao dịch","amount":40000,"type":"expense|income","category":"mã danh mục","wallet":"tên ví hoặc rỗng","date":"YYYY-MM-DD"}]}',
      `Câu cần phân tích: "${text}"`
    ].join('\n');

    const res = await fetch(
      'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=' + encodeURIComponent(key),
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-goog-api-key': key
        },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: { temperature: 0.1, responseMimeType: 'application/json' }
        })
      }
    );

    if (!res.ok) {
      if (res.status === 400 || res.status === 401) {
        throw new Error('API key không hợp lệ (mã ' + res.status + ' — hãy kiểm tra lại key từ Google AI Studio)');
      }
      throw new Error('Gemini lỗi ' + res.status);
    }
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
      const validDate = (it.date && Business.isValidDate(it.date)) ? it.date : Utils.getToday();

      return {
        name: String(it.name || 'Giao dịch').slice(0, 50),
        amount: amount === null ? 0 : amount,
        type: it.type === 'income' ? 'income' : 'expense',
        category: (typeof Categories !== 'undefined' && Categories.getById(it.category)) ? it.category : 'food',
        wallet: wallet ? wallet.id : null,
        date: validDate,
        note: ''
      };
    }).filter((it) => it.amount > 0);

    return { items: items, skipped: 0, engine: 'gemini' };
  },

  // ============================================================
  //  4. 9ROUTER AI GATEWAY (OpenAI-compatible)
  // ============================================================
  async parseWith9Router(text) {
    const url = this.get9RouterUrl();
    if (!url) throw new Error('Chưa cấu hình URL 9Router');

    const base = url.replace(/\/+$/, '');
    const endpoint = base.endsWith('/v1') ? `${base}/chat/completions` : `${base}/v1/chat/completions`;
    const headers = { 'Content-Type': 'application/json' };
    const key = this.get9RouterKey();
    if (key) headers['Authorization'] = `Bearer ${key}`;

    const categories = (typeof Categories !== 'undefined')
      ? [...Categories.expense, ...Categories.income].map(c => `${c.id} (${c.name})`).join(', ')
      : 'food (Ăn uống), transport (Di chuyển), shopping (Mua sắm), bills (Hóa đơn), education (Học tập), health (Sức khỏe), entertainment (Giải trí), freelance (Làm thêm), salary (Lương)';
    const wallets = (typeof Features !== 'undefined')
      ? Features.getWallets().map(w => w.name).join(', ')
      : '';
    const today = (typeof Utils !== 'undefined') ? Utils.getToday() : new Date().toISOString().split('T')[0];

    const systemPrompt = [
      'Bạn là trợ lý trích xuất giao dịch tài chính thông minh cho ứng dụng SpendWise (Việt Nam).',
      `Ngày hiện tại: ${today} (định dạng YYYY-MM-DD).`,
      `Danh mục hợp lệ: ${categories}.`,
      `Ví hiện có: ${wallets || '(chưa có)'}.`,
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
      'YÊU CẦU ĐẶC BIỆT:',
      '- Chỉ trả về duy nhất chuỗi JSON hợp lệ theo định dạng:',
      '{"items":[{"name":"tên ngắn gọn","amount":40000,"type":"expense","category":"food","wallet":"tên ví nếu có","date":"YYYY-MM-DD"}]}',
      '- Không giải thích thêm, không kèm văn bản ngoài JSON.'
    ].join('\n');

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 8000);

    try {
      const res = await fetch(endpoint, {
        method: 'POST',
        headers: headers,
        body: JSON.stringify({
          model: this.get9RouterModel() || this.DEFAULT_ROUTER9_MODEL,
          messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: text }
          ],
          temperature: 0.1,
          response_format: { type: 'json_object' }
        }),
        signal: controller.signal
      });

      clearTimeout(timeoutId);

      if (!res.ok) {
        const errText = await res.text().catch(() => '');
        throw new Error(`9Router báo lỗi ${res.status}: ${errText.slice(0, 100)}`);
      }

      const data = await res.json();
      const content = data?.choices?.[0]?.message?.content;
      if (!content) throw new Error('9Router không trả về nội dung');

      let jsonStr = content.trim();
      const matchFence = jsonStr.match(/```(?:json)?\s*([\s\S]*?)\s*```/i);
      if (matchFence) jsonStr = matchFence[1].trim();

      const parsed = JSON.parse(jsonStr);
      const rawList = Array.isArray(parsed) ? parsed : (parsed.items || []);

      const items = rawList.map((it) => {
        const amount = (typeof Business !== 'undefined') ? Business.parseAmount(it.amount) : Number(it.amount);
        const wallet = (typeof Features !== 'undefined' && it.wallet)
          ? Features.getWallets().find(w => Utils.normalizeText(w.name) === Utils.normalizeText(it.wallet))
          : null;
        const validDate = (it.date && typeof Business !== 'undefined' && Business.isValidDate(it.date)) ? it.date : today;

        return {
          name: String(it.name || 'Giao dịch').slice(0, 50),
          amount: amount === null ? 0 : amount,
          type: it.type === 'income' ? 'income' : 'expense',
          category: (typeof Categories !== 'undefined' && Categories.getById(it.category)) ? it.category : (it.type === 'income' ? 'salary' : 'food'),
          wallet: wallet ? wallet.id : null,
          date: validDate,
          note: it.note ? String(it.note).slice(0, 100) : ''
        };
      }).filter((it) => it.amount > 0);

      return { items: items, skipped: 0, engine: '9router' };
    } catch (err) {
      clearTimeout(timeoutId);
      throw err;
    }
  },

  // ============================================================
  //  ROUTER PHÂN TÍCH THÔNG MINH (HYBRID)
  // ============================================================
  /**
   * Phân tích câu nhập:
   * - Nếu offline: chạy ngay parser cục bộ trong máy.
   * - Nếu online và có 9Router AI Gateway: gọi 9Router, tự động fallback cục bộ nếu lỗi/chậm (>8s).
   * - Nếu online và có direct Gemini API key: gọi Gemini direct, fallback cục bộ nếu lỗi.
   * - Mặc định: chạy parser cục bộ trong máy.
   * @param {string} text
   * @returns {Promise<{items:Array, engine:string, notice?:string, error?:string}>}
   */
  async parse(text) {
    const clean = String(text || '').trim();
    if (!clean) return { items: [], engine: 'local', error: 'Bạn chưa nhập gì.' };

    const isOnline = (typeof navigator === 'undefined' || navigator.onLine !== false);
    const router9Url = this.get9RouterUrl();
    const directKey = this.getApiKey();

    // 1. Khi ngoại tuyến: ưu tiên chạy bộ phân tích cục bộ, không đợi network timeout
    if (!isOnline) {
      const localResult = this.parseLocal(clean);
      localResult.notice = '⚡ Đang ngoại tuyến — dùng bộ phân tích tức thì trong máy.';
      return localResult;
    }

    // 2. Khi trực tuyến: Ưu tiên 9Router AI Gateway (nếu đã cấu hình)
    if (router9Url) {
      try {
        return await this.parseWith9Router(clean);
      } catch (err) {
        console.warn('9Router failed, falling back to local:', err);
        const fallback = this.parseLocal(clean);
        fallback.notice = '⚡ 9Router không phản hồi (' + (err.name === 'AbortError' ? 'Quá thời gian 8s' : err.message) + ') — đã tự động chuyển sang AI trong máy.';
        return fallback;
      }
    }

    // 3. Nếu người dùng tự cấu hình direct Gemini API key
    if (directKey) {
      try {
        return await this.parseWithGemini(clean);
      } catch (err) {
        console.warn('Direct Gemini failed, falling back to local:', err);
        const fallback = this.parseLocal(clean);
        fallback.notice = '⚡ Gemini không phản hồi (' + err.message + ') — đã dùng bộ phân tích trong máy.';
        return fallback;
      }
    }

    // 4. Mặc định: dùng bộ phân tích cục bộ
    return this.parseLocal(clean);
  }
};
