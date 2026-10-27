/**
 * home.js — Điều khiển các thành phần trên trang chủ:
 *   1. Thẻ "Nhập nhanh bằng AI" (AIEntry)
 *   2. Thẻ mời bật dữ liệu mẫu (DemoData)
 *   3. Giọng nói (Web Speech API) nếu trình duyệt hỗ trợ
 */

const HomeWidgets = {
  preview: [],

  init() {
    this.bindDemo();
    this.bindAI();
    this.refreshDemoCard();
  },

  // ============================================================
  //  DEMO
  // ============================================================
  bindDemo() {
    const btnDemo = document.getElementById('btnDemoHome');
    if (btnDemo) {
      btnDemo.addEventListener('click', () => {
        const added = DemoData.add();
        Storage.set('spendwise_demo_mode', true);
        Toast.success(added
          ? `Đã thêm ${added} giao dịch mẫu. Xem thử thỏa mái, dữ liệu mẫu không lên cloud!`
          : 'Dữ liệu mẫu đã có sẵn trên máy này.');
        this.refreshDemoCard();
        TransactionManager.renderTransactions();
        TransactionManager.updateSummary();
      });
    }

    const btnHide = document.getElementById('btnDemoHide');
    if (btnHide) {
      btnHide.addEventListener('click', () => {
        document.getElementById('homeDemoCard').hidden = true;
        Storage.set('spendwise_demo_dismissed', true);
      });
    }
  },

  /** Hiện thẻ demo khi: đã bỏ qua trước đó, chưa bật demo và chưa có giao dịch thật */
  refreshDemoCard() {
    const card = document.getElementById('homeDemoCard');
    if (!card) return;
    const dismissed = Storage.get('spendwise_demo_dismissed', false);
    const demoOn = Storage.get('spendwise_demo_mode', false);
    const hasReal = Storage.getTransactions().some((t) => !DemoData.isDemoId(t.id));
    card.hidden = !(!dismissed && !demoOn && !hasReal);
  },

  // ============================================================
  //  NHẬP NHANH BẰNG AI
  // ============================================================
  bindAI() {
    const input = document.getElementById('aiInput');
    const btnGo = document.getElementById('btnAiParse');
    const btnMic = document.getElementById('btnAiMic');
    if (!input || !btnGo) return;

    this.bindConfigLink();
    this.updateHint();
    window.addEventListener('online', () => this.updateHint());
    window.addEventListener('offline', () => this.updateHint());

    btnGo.addEventListener('click', () => this.run());
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') { e.preventDefault(); this.run(); }
    });

    if (btnMic) {
      if (!this.speechSupported()) {
        btnMic.disabled = true;
        btnMic.title = 'Trình duyệt này không hỗ trợ nhập bằng giọng nói';
      } else {
        btnMic.addEventListener('click', () => this.toggleMic(btnMic));
      }
    }
  },

  updateHint() {
    const hint = document.getElementById('aiHint');
    if (!hint) return;
    const mode = (typeof AIEntry !== 'undefined' && AIEntry.getEngineMode) ? AIEntry.getEngineMode() : { online: true, engine: 'local' };
    if (!mode.online) {
      hint.innerHTML = '⚡ <strong>Chế độ Ngoại tuyến:</strong> Model AI xử lý trực tiếp trên máy, không cần mạng hay API key.';
    } else if (mode.engine === '9router') {
      const model = (typeof AIEntry !== 'undefined' && AIEntry.get9RouterModel) ? AIEntry.get9RouterModel() : 'gemini-3.8-flash';
      hint.innerHTML = `✨ <strong>9Router AI:</strong> Đang kết nối Gateway (${model}). <a href="#" id="aiConfigLink">Cài đặt</a>`;
      this.bindConfigLink();
    } else if (mode.engine === 'gemini') {
      hint.innerHTML = '✨ <strong>Gemini Cá nhân:</strong> Đã kết nối API key. <a href="#" id="aiConfigLink">Cài đặt</a>';
      this.bindConfigLink();
    } else {
      hint.innerHTML = '✨ <strong>Model AI đã tích hợp sẵn:</strong> Nhập câu tự nhiên (VD: <em>"Ăn phở 45k, đổ xăng 50 cành"</em>) — Dùng ngay, không cần API key!';
    }
  },

  bindConfigLink() {
    const configLink = document.getElementById('aiConfigLink');
    if (configLink && !configLink._bound) {
      configLink._bound = true;
      configLink.addEventListener('click', (e) => {
        e.preventDefault();
        PageManager.switchTo('pageSettings');
        if (typeof SettingsTabs !== 'undefined') SettingsTabs.switchTo('tienich');
        setTimeout(() => {
          const target = document.getElementById('input9RouterUrl') || document.getElementById('inputGeminiKey');
          if (target) {
            target.scrollIntoView({ block: 'center' });
            target.focus();
            Toast.show('Cấu hình máy chủ 9Router AI Gateway hoặc Gemini API key.', 'info');
          }
        }, 350);
      });
    }
  },

  speechSupported() {
    return !!(window.SpeechRecognition || window.webkitSpeechRecognition);
  },

  toggleMic(btn) {
    if (this.recognition) { this.stopMic(btn); return; }

    const Rec = window.SpeechRecognition || window.webkitSpeechRecognition;
    const rec = new Rec();
    rec.lang = 'vi-VN';
    rec.interimResults = false;
    rec.maxAlternatives = 1;

    rec.onresult = (event) => {
      const text = event.results[0][0].transcript;
      const input = document.getElementById('aiInput');
      if (input) input.value = text;
      this.stopMic(btn);
      this.run();
    };
    rec.onerror = () => {
      Toast.error('Không nghe rõ, bạn thử gõ lại nhé.');
      this.stopMic(btn);
    };
    rec.onend = () => this.stopMic(btn);

    try {
      rec.start();
      this.recognition = rec;
      btn.classList.add('is-recording');
      Toast.show('Đang nghe... hãy nói tên giao dịch và số tiền.', 'info');
    } catch (err) {
      Toast.error('Không mở được microphone!');
    }
  },

  stopMic(btn) {
    if (this.recognition) {
      try { this.recognition.stop(); } catch (e) { /* ignore */ }
      this.recognition = null;
    }
    if (btn) btn.classList.remove('is-recording');
  },

  async run() {
    const input = document.getElementById('aiInput');
    const text = input ? input.value.trim() : '';
    if (!text) {
      Toast.error('Hãy nhập hoặc nói nội dung giao dịch trước!');
      return;
    }

    const hint = document.getElementById('aiHint');
    if (hint) hint.textContent = 'Đang phân tích...';

    let result;
    try {
      result = await AIEntry.parse(text);
    } catch (err) {
      Toast.error('Không phân tích được: ' + err.message);
      if (hint) hint.textContent = 'AI chạy ngay trong máy — không cần mạng.';
      return;
    }

    this.preview = result.items || [];
    this.renderPreview(result);

    if (hint) {
      if (result.notice) {
        hint.textContent = result.notice;
      } else if (result.engine === '9router') {
        const model = (typeof AIEntry !== 'undefined' && AIEntry.get9RouterModel) ? AIEntry.get9RouterModel() : 'gemini-3.8-flash';
        hint.textContent = `✨ Phân tích qua 9Router AI Gateway (${model}).`;
      } else if (result.engine === 'gemini') {
        hint.textContent = '✨ Phân tích qua Google Gemini Direct.';
      } else {
        hint.textContent = '⚡ Phân tích tức thì bằng AI nội bộ trong máy.';
      }
    }
  },

  renderPreview(result) {
    const box = document.getElementById('aiPreview');
    if (!box) return;

    if (!this.preview.length) {
      box.hidden = false;
      box.innerHTML = '<p class="ai-entry__hint">Không tìm thấy giao dịch nào. Thử ví dụ: <em>"Ăn phở 35k"</em> hoặc <em>"nhận lương 8 triệu"</em>.</p>';
      return;
    }

    const rows = this.preview.map((it, i) => {
      const wallet = (typeof Features !== 'undefined' && Features.getWalletById(it.wallet)) || null;
      const cat = (typeof Categories !== 'undefined' && Categories.getById(it.category)) || null;
      const sign = it.type === 'income' ? '+' : '-';
      const dateText = (it.date && it.date !== Utils.getToday()) ? ` · ${Utils.formatDateFriendly(it.date)}` : '';
      return `
        <div class="ai-preview__item">
          <i class="fa-solid ${cat ? cat.icon : 'fa-circle'}" style="color:${cat ? cat.color : '#94A3B8'}"></i>
          <span class="ai-preview__name">${it.name}${wallet ? ' · ' + Utils.escapeHtml(wallet.name) : ''}${dateText}</span>
          <span class="ai-preview__amount ${it.type === 'income' ? 'ai-preview__amount--income' : ''}">${sign}${Utils.formatCurrency(it.amount)}</span>
        </div>`;
    }).join('');

    const noticeMsg = result.error || result.notice;
    const warn = noticeMsg ? `<p class="ai-entry__hint" style="color:var(--text-muted)">${Utils.escapeHtml(noticeMsg)}</p>` : '';

    box.hidden = false;
    box.innerHTML = rows + `
      <div class="ai-preview__actions">
        <button type="button" class="ai-preview__btn" id="btnAiSaveAll">
          <i class="fa-solid fa-check"></i> Thêm ${this.preview.length} giao dịch
        </button>
        <button type="button" class="ai-preview__btn ai-preview__btn--ghost" id="btnAiDiscard">Bỏ</button>
      </div>${warn}`;

    const save = document.getElementById('btnAiSaveAll');
    if (save) save.addEventListener('click', () => this.saveAll());
    const discard = document.getElementById('btnAiDiscard');
    if (discard) discard.addEventListener('click', () => this.clear());
  },

  saveAll() {
    if (!this.preview.length) return;
    // Đếm số giao dịch THỰC SỰ lưu được — không báo "thành công" nếu lưu hỏng
    let savedCount = 0;
    const failed = [];
    this.preview.forEach((item, idx) => {
      const r = Storage.addTransaction({
        name: item.name,
        amount: item.amount,
        type: item.type,
        category: item.category,
        wallet: item.wallet,
        date: item.date || Utils.getToday(),
        note: item.note || ''
      });
      if (r) savedCount++;
      else failed.push(idx + 1);
    });

    if (savedCount > 0) {
      TransactionManager.renderTransactions();
      TransactionManager.updateSummary();
      BudgetManager.updateBudgetSummary();
      BudgetManager.renderBudgetList();
      this.refreshDemoCard();
    }

    if (savedCount === 0) {
      // Giữ nguyên phần nhập để người dùng không mất dữ liệu
      Toast.error('Không lưu được giao dịch — bộ nhớ trình duyệt có thể đã đầy. Hãy dọn ảnh hoá đơn cũ rồi thử lại.');
      return;
    }

    this.clear();
    if (failed.length) {
      Toast.warning(`Đã thêm ${savedCount}/${this.preview.length} giao dịch. ${failed.length} giao dịch không lưu được.`);
    } else {
      Toast.success(`Đã thêm ${savedCount} giao dịch từ câu nhập nhanh!`);
    }
  },

  clear() {
    this.preview = [];
    const box = document.getElementById('aiPreview');
    if (box) { box.hidden = true; box.innerHTML = ''; }
    const input = document.getElementById('aiInput');
    if (input) input.value = '';
  }
};
