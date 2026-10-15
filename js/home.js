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

    // Lối tắt: nhảy tới Cài đặt để dán API key Gemini
    const configLink = document.getElementById('aiConfigLink');
    if (configLink) {
      configLink.addEventListener('click', (e) => {
        e.preventDefault();
        PageManager.switchTo('pageSettings');
        // Mở đúng nhóm "Tiện ích & AI" để không phải tìm trong 11 mục
        if (typeof SettingsTabs !== 'undefined') SettingsTabs.switchTo('tienich');
        setTimeout(() => {
          const key = document.getElementById('inputGeminiKey');
          if (key) {
            key.scrollIntoView({ block: 'center' });
            key.focus();
            Toast.show('Dán API key Gemini vào ô trên rồi bấm Thử kết nối.', 'info');
          }
        }, 350);
      });
    }

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
      hint.textContent = result.engine === 'gemini'
        ? 'Đã phân tích bằng Gemini.'
        : 'Phân tích bằng bộ đọc trong máy — không cần mạng.';
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
      return `
        <div class="ai-preview__item">
          <i class="fa-solid ${cat ? cat.icon : 'fa-circle'}" style="color:${cat ? cat.color : '#94A3B8'}"></i>
          <span class="ai-preview__name">${it.name}${wallet ? ' · ' + Utils.escapeHtml(wallet.name) : ''}</span>
          <span class="ai-preview__amount ${it.type === 'income' ? 'ai-preview__amount--income' : ''}">${sign}${Utils.formatCurrency(it.amount)}</span>
        </div>`;
    }).join('');

    const warn = result.error ? `<p class="ai-entry__hint" style="color:var(--warning-text)">${Utils.escapeHtml(result.error)}</p>` : '';

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
    this.preview.forEach((item) => {
      Storage.addTransaction({
        name: item.name,
        amount: item.amount,
        type: item.type,
        category: item.category,
        wallet: item.wallet,
        date: item.date || Utils.getToday(),
        note: item.note || ''
      });
    });
    const count = this.preview.length;
    TransactionManager.renderTransactions();
    TransactionManager.updateSummary();
    BudgetManager.updateBudgetSummary();
    BudgetManager.renderBudgetList();
    this.refreshDemoCard();
    this.clear();
    Toast.success(`Đã thêm ${count} giao dịch từ câu nhập nhanh!`);
  },

  clear() {
    this.preview = [];
    const box = document.getElementById('aiPreview');
    if (box) { box.hidden = true; box.innerHTML = ''; }
    const input = document.getElementById('aiInput');
    if (input) input.value = '';
  }
};
