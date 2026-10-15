/**
 * app.js — Entry point, khởi tạo ứng dụng
 */

// ===== Toast Notification =====
const Toast = {
  container: null,

  init() {
    this.container = document.getElementById('toastContainer');
  },

  show(message, type = 'success') {
    // Chỉ hiển thị 1 toast tại một thời điểm, tránh chồng lấn
    if (this.container) {
      this.container.innerHTML = '';
    }

    const icons = {
      success: 'fa-circle-check',
      error: 'fa-circle-xmark',
      warning: 'fa-triangle-exclamation'
    };

    const toast = document.createElement('div');
    toast.className = `toast toast--${type}`;
    toast.innerHTML = `
      <i class="fa-solid ${icons[type]} toast__icon"></i>
      <span class="toast__message"></span>
      <button class="toast__close" aria-label="Đóng" style="background:none;border:none;color:inherit;cursor:pointer;padding:0 0 0 8px;font-size:14px">
        <i class="fa-solid fa-xmark"></i>
      </button>
    `;

    // Dùng textContent để tuyệt đối an toàn với dữ liệu người dùng (chống XSS)
    toast.querySelector('.toast__message').textContent = String(message ?? '');

    this.container.appendChild(toast);

    // Hiệu ứng theo mẫu: hiện dần (fadein 0.5s), giữ 3s, rồi mờ dần (fadeout 0.5s)
    // fadein 0.5s → giữ hiển thị 2s → fadeout 0.5s
    toast.style.animation = 'fadein 0.5s forwards, fadeout 0.5s 2.5s forwards';
    setTimeout(() => toast.remove(), 3000);

    // Bấm ✕ để đóng ngay (giữ nguyên hiệu ứng fadeout)
    toast.querySelector('.toast__close').addEventListener('click', () => {
      toast.style.animation = 'fadeout 0.3s forwards';
      setTimeout(() => toast.remove(), 300);
    });
  },

  success(msg) { this.show(msg, 'success'); },
  error(msg) { this.show(msg, 'error'); },
  warning(msg) { this.show(msg, 'warning'); }
};

// ===== Trợ giúp đóng modal bằng phím Esc (hỗ trợ bàn phím) =====
const ModalHelper = {
  OVERLAYS: ['onboardingOverlay', 'authRegisterOverlay', 'authOverlay', 'splitterModal',
             'budgetModal', 'modalOverlay', 'confirmOverlay'],

  init() {
    document.addEventListener('keydown', (e) => {
      if (e.key !== 'Escape') return;
      // Đóng lớp trên cùng đang mở
      for (let i = this.OVERLAYS.length - 1; i >= 0; i--) {
        const el = document.getElementById(this.OVERLAYS[i]);
        if (el && el.classList.contains('active')) {
          // Modal xác nhận xóa cần bấm chọn, không đóng bằng Esc để tránh mất dữ liệu
          if (el.id === 'confirmOverlay') return;
          el.classList.remove('active');
          document.body.style.overflow = '';
          return;
        }
      }
    });

    // Giữ tiêu điểm bàn phím bên trong modal đang mở (focus trap)
    document.addEventListener('keydown', (e) => {
      if (e.key !== 'Tab') return;
      const overlay = this.topActive();
      if (!overlay) return;

      const focusables = Array.prototype.slice.call(
        overlay.querySelectorAll('button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])')
      ).filter(el => !el.disabled && el.offsetParent !== null);

      if (focusables.length === 0) return;
      const first = focusables[0];
      const last = focusables[focusables.length - 1];

      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    });
  },

  /** Lớp phủ trên cùng đang mở */
  topActive() {
    for (let i = this.OVERLAYS.length - 1; i >= 0; i--) {
      const el = document.getElementById(this.OVERLAYS[i]);
      if (el && el.classList.contains('active')) return el;
    }
    return null;
  },

  /** Đưa tiêu điểm vào ô nhập đầu tiên của modal (dùng chung cho các modal khác) */
  focusFirst(overlayId) {
    const overlay = document.getElementById(overlayId);
    if (!overlay) return;
    const target = overlay.querySelector('input:not([type="hidden"]), select, textarea, button');
    if (target) target.focus();
  }
};

// ===== Confirm Dialog =====
const ConfirmDialog = {
  overlay: null,
  onConfirmCallback: null,

  init() {
    this.overlay = document.getElementById('confirmOverlay');

    document.getElementById('confirmCancel').addEventListener('click', () => {
      this.hide();
    });

    document.getElementById('confirmOk').addEventListener('click', () => {
      if (this.onConfirmCallback) this.onConfirmCallback();
      this.hide();
    });

    // Click outside to close
    this.overlay.addEventListener('click', (e) => {
      if (e.target === this.overlay) this.hide();
    });
  },

  show({ title, message, confirmText = 'Xóa', onConfirm }) {
    document.getElementById('confirmTitle').textContent = title;
    document.getElementById('confirmMessage').textContent = message;
    document.getElementById('confirmOk').textContent = confirmText;
    this.onConfirmCallback = onConfirm;
    this.overlay.classList.add('active');
  },

  hide() {
    this.overlay.classList.remove('active');
    this.onConfirmCallback = null;
  }
};

// ===== Form Manager =====
const FormManager = {
  overlay: null,
  form: null,
  currentType: 'expense',
  selectedCategory: null,

  init() {
    this.overlay = document.getElementById('modalOverlay');
    this.form = document.getElementById('transactionForm');

    this.bindEvents();
    this.renderCategories('expense');
    this.setDefaultDate();
  },

  /**
   * Cập nhật giao diện form theo loại giao dịch đang chọn
   * (Chi tiêu / Thu nhập / Chuyển ví)
   */
  applyTypeUI() {
    const isTransfer = this.currentType === 'transfer';

    // Ô danh mục: ẩn với giao dịch chuyển ví
    const catGroup = document.getElementById('categoryContainer');
    if (catGroup && catGroup.parentElement) {
      catGroup.parentElement.hidden = isTransfer;
    }

    // Ô lặp định kỳ: không áp dụng cho chuyển ví
    const repeatSel = document.getElementById('inputRepeat');
    if (repeatSel && repeatSel.parentElement) {
      repeatSel.parentElement.hidden = isTransfer;
    }

    // Khối chuyển ví
    const box = document.getElementById('transferBox');
    if (box) box.hidden = !isTransfer;

    // Nhãn ví đơn lẻ -> ẩn (dùng 2 ô From/To)
    const walletSel = document.getElementById('inputWallet');
    if (walletSel && walletSel.parentElement) {
      walletSel.parentElement.hidden = isTransfer;
    }

    if (isTransfer) {
      this.renderTransferWallets();
      this.selectedCategory = 'transfer';
      const nameInput = document.getElementById('inputName');
      if (nameInput && !nameInput.value.trim()) nameInput.value = 'Chuyển tiền giữa ví';
    } else {
      this.renderCategories(this.currentType);
      this.selectedCategory = null;
    }
  },

  /** Đổ danh sách ví cho 2 ô From / To (luôn khác nhau) */
  renderTransferWallets() {
    if (typeof Features === 'undefined') return;
    const wallets = Features.getWallets();
    const from = document.getElementById('inputFromWallet');
    const to = document.getElementById('inputToWallet');
    if (!from || !to) return;

    const prevFrom = from.value;
    const prevTo = to.value;
    from.innerHTML = wallets.map(w =>
      `<option value="${Utils.escapeAttr(w.id)}">${Utils.escapeHtml(w.name)}</option>`).join('');
    to.innerHTML = from.innerHTML;

    if (prevFrom) from.value = prevFrom;
    if (prevTo && prevTo !== from.value) to.value = prevTo;
    else to.selectedIndex = from.selectedIndex === 0 ? Math.min(1, wallets.length - 1) : 0;

    from.onchange = () => {
      if (from.value === to.value) {
        to.selectedIndex = from.selectedIndex === 0 ? Math.min(1, to.options.length - 1) : 0;
      }
    };
  },

  bindEvents() {
    // Type toggle buttons
    document.querySelectorAll('.form__type-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        document.querySelectorAll('.form__type-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        this.currentType = btn.dataset.type;
        this.applyTypeUI();
      });
    });

    // Close modal
    document.getElementById('modalClose').addEventListener('click', () => this.closeModal());
    this.overlay.addEventListener('click', (e) => {
      if (e.target === this.overlay) this.closeModal();
    });

    // Submit
    this.form.addEventListener('submit', (e) => {
      e.preventDefault();
      this.handleSubmit();
    });

    // Tự động in hoa chữ cái đầu ngay khi gõ chữ đầu tiên
    const inputNameEl = document.getElementById('inputName');
    if (inputNameEl) {
      inputNameEl.addEventListener('input', () => {
        if (inputNameEl.value.length === 1) {
          inputNameEl.value = inputNameEl.value.toUpperCase();
        }
      });
    }

    // Ô số tiền: cho phép gõ theo kiểu Việt (1.500.000, 2tr, 20k)
    const amountInput = document.getElementById('inputAmount');
    amountInput.addEventListener('input', (e) => {
      // Giữ chữ số, dấu . , khoảng trắng và chữ cái (dùng cho hậu tố tr/k/tỷ)
      e.target.value = e.target.value.replace(/[^\d.,\sÀ-ỹa-zA-Z]/g, '');
    });

    // Rời ô nhập → hiển thị lại dạng dễ đọc (2tr → 2.000.000)
    amountInput.addEventListener('blur', (e) => {
      const parsed = Business.parseAmount(e.target.value);
      if (parsed !== null) {
        e.target.value = Utils.formatNumber(parsed);
      }
    });
  },

  renderCategories(type) {
    const container = document.getElementById('categoryContainer');
    container.innerHTML = Categories.renderCategoryButtons(type);

    // Bind click events cho category buttons
    container.querySelectorAll('.form__category-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        container.querySelectorAll('.form__category-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        this.selectedCategory = btn.dataset.category;
      });
    });
  },

  setDefaultDate() {
    document.getElementById('inputDate').value = Utils.getToday();
  },

  openModal() {
    this.overlay.classList.add('active');
    document.body.style.overflow = 'hidden';
    // Focus vào input tên
    setTimeout(() => document.getElementById('inputName').focus(), 300);
  },

  closeModal() {
    this.overlay.classList.remove('active');
    document.body.style.overflow = '';
  },

  setTitle(title) {
    document.getElementById('modalTitle').textContent = title;
  },

  setSubmitText(text) {
    document.getElementById('formSubmitBtn').textContent = text;
  },

  resetForm() {
    this.form.reset();
    this.currentType = 'expense';
    this.selectedCategory = null;

    // Reset type buttons
    document.querySelectorAll('.form__type-btn').forEach(b => b.classList.remove('active'));
    document.querySelector('.form__type-btn--expense').classList.add('active');

    // Reset categories
    this.renderCategories('expense');
    this.setDefaultDate();

    // Reset ví, lặp, ảnh hóa đơn, tiền tệ
    const repeatSel = document.getElementById('inputRepeat');
    if (repeatSel) repeatSel.value = 'none';
    const txCurSel = document.getElementById('inputCurrencyTx');
    if (txCurSel) txCurSel.value = 'VND';
    const receiptInput = document.getElementById('inputReceipt');
    if (receiptInput) receiptInput.value = '';
    const preview = document.getElementById('receiptPreview');
    if (preview) { preview.style.display = 'none'; preview.src = ''; }
    if (typeof Features !== 'undefined') {
      Features._pendingReceipt = null;
      if (typeof Features._showReceipt === 'function') {
        Features._showReceipt(null);
      } else {
        const preview = document.getElementById('receiptPreview');
        if (preview) { preview.style.display = 'none'; preview.src = ''; }
        const btnRemove = document.getElementById('btnRemoveReceipt');
        if (btnRemove) btnRemove.style.display = 'none';
      }
    }
  },

  fillForm(transaction) {
    document.getElementById('inputName').value = transaction.name;
    document.getElementById('inputAmount').value = transaction.amount;
    const txCur = document.getElementById('inputCurrencyTx');
    if (txCur) txCur.value = 'VND';
    document.getElementById('inputDate').value = transaction.date;
    document.getElementById('inputNote').value = transaction.note || '';

    // Set type
    this.currentType = transaction.type;
    document.querySelectorAll('.form__type-btn').forEach(b => b.classList.remove('active'));
    document.querySelector(`.form__type-btn--${transaction.type}`).classList.add('active');

    // Render & select category
    this.renderCategories(transaction.type);
    this.selectedCategory = transaction.category;
    const catBtn = document.querySelector(`[data-category="${transaction.category}"]`);
    if (catBtn) catBtn.classList.add('active');

    // Ví + ảnh hóa đơn
    const walletSelect = document.getElementById('inputWallet');
    if (walletSelect && transaction.wallet) walletSelect.value = transaction.wallet;
    if (typeof Features !== 'undefined' && transaction.receipt) {
      Features._pendingReceipt = transaction.receipt;
      const preview = document.getElementById('receiptPreview');
      preview.src = transaction.receipt;
      preview.style.display = 'block';
      const btnRemove = document.getElementById('btnRemoveReceipt');
      if (btnRemove) btnRemove.style.display = '';
    }
  },

  handleSubmit() {
    const submitBtn = document.getElementById('formSubmitBtn');
    if (this._saving) return;           // chặn bấm liên tiếp

    const name = document.getElementById('inputName').value.trim();
    const rawAmount = parseFloat(document.getElementById('inputAmount').value);
    const currency = (document.getElementById('inputCurrencyTx') || {}).value || 'VND';

    // Số tiền LUÔN được lưu bằng VNĐ.
    // Nếu nhập bằng ngoại tệ → quy đổi sang VNĐ và lưu kèm thông tin gốc để truy vết.
    const rate = (typeof Features !== 'undefined' && Features.CURRENCIES[currency])
      ? Features.CURRENCIES[currency].rate : 1;
    const amount = Math.round(rawAmount * rate);

    const foreign = currency !== 'VND';
    const originalInfo = foreign ? {
      originalAmount: rawAmount,
      originalCurrency: currency,
      exchangeRate: rate
    } : {};
    const date = document.getElementById('inputDate').value;
    const note = document.getElementById('inputNote').value.trim();

    // Validate
    if (!name) {
      Toast.error('Vui lòng nhập tên giao dịch!');
      return;
    }
    if (name.length > 50) {
      Toast.error('Tên giao dịch không được vượt quá 50 ký tự!');
      return;
    }
    // Số tiền: chặn âm, rỗng, NaN, vượt giới hạn — dùng chung Business.parseAmount
    const validAmount = Business.parseAmount(document.getElementById('inputAmount').value);
    if (validAmount === null) {
      Toast.error('Số tiền không hợp lệ (phải là số dương, tối đa 1 nghìn tỷ).');
      return;
    }
    if (!Business.isValidDate(date)) {
      Toast.error('Ngày giao dịch không hợp lệ!');
      return;
    }
    if (date > Utils.getToday()) {
      Toast.error('Không thể chọn ngày trong tương lai!');
      return;
    }

    // ===== Chuyển tiền giữa các ví =====
    if (this.currentType === 'transfer') {
      const transfer = Business.buildTransfer({
        name: name,
        amount: validAmount,
        fromWallet: (document.getElementById('inputFromWallet') || {}).value || null,
        toWallet: (document.getElementById('inputToWallet') || {}).value || null,
        date: date,
        note: note
      });
      if (!transfer) {
        Toast.error('Chuyển ví cần chọn 2 ví khác nhau và số tiền hợp lệ!');
        return;
      }

      this._saving = true;
      if (submitBtn) { submitBtn.disabled = true; submitBtn.textContent = 'Đang lưu...'; }
      try {
        const ok = TransactionManager.handleSubmit(transfer);
        this._saving = false;
        if (submitBtn) { submitBtn.disabled = false; submitBtn.textContent = 'Lưu giao dịch'; }
        if (ok) {
          this.closeModal();
          Toast.success('Đã ghi nhận chuyển tiền giữa 2 ví (tổng số dư không đổi).');
        }
      } catch (err) {
        this._saving = false;
        if (submitBtn) { submitBtn.disabled = false; submitBtn.textContent = 'Lưu giao dịch'; }
        Toast.error('Không lưu được: ' + err.message);
      }
      return;
    }

    if (!this.selectedCategory) {
      Toast.error('Vui lòng chọn danh mục!');
      return;
    }

    const data = {
      name,
      amount: validAmount,
      date,
      note,
      type: this.currentType,
      category: this.selectedCategory,
      wallet: (document.getElementById('inputWallet') || {}).value || null,
      receipt: (typeof Features !== 'undefined' && Features._pendingReceipt) || null,
      ...originalInfo
    };

    // Lặp định kỳ
    const repeat = (document.getElementById('inputRepeat') || {}).value;
    if (repeat && repeat !== 'none' && typeof Features !== 'undefined' && !TransactionManager.editingId) {
      Features.addRecurring({
        name, amount: validAmount, type: this.currentType, category: this.selectedCategory,
        wallet: data.wallet, frequency: repeat,
        startDate: date,
        lastRun: date,      // ngày hôm nay đã tạo giao dịch thủ công → không tạo trùng
        ...originalInfo
      });
    }

    if (typeof Features !== 'undefined') {
      Features._pendingReceipt = null;
      const preview = document.getElementById('receiptPreview');
      if (preview) { preview.style.display = 'none'; preview.src = ''; }
    }

    // Trạng thái "đang lưu" để chặn bấm liên tiếp
    this._saving = true;
    if (submitBtn) {
      submitBtn.disabled = true;
      submitBtn.textContent = 'Đang lưu...';
    }

    try {
      const ok = TransactionManager.handleSubmit(data);
      if (ok === false) {
        // Lưu thất bại (không đủ bộ nhớ): giữ nguyên nội dung người dùng đã nhập
        Toast.warning('Chưa lưu được. Dữ liệu bạn nhập vẫn còn trong biểu mẫu.');
      }
    } finally {
      this._saving = false;
      if (submitBtn) {
        submitBtn.disabled = false;
        submitBtn.textContent = TransactionManager.editingId ? 'Lưu thay đổi' : 'Thêm giao dịch';
      }
    }
  }
};

// ===== Theme Manager =====
const ThemeManager = {
  init() {
    const savedTheme = Storage.getTheme();
    this.applyTheme(savedTheme);

    document.getElementById('themeToggle').addEventListener('click', () => {
      const current = document.documentElement.getAttribute('data-theme');
      const newTheme = current === 'dark' ? 'light' : 'dark';
      this.applyTheme(newTheme);
      Storage.setTheme(newTheme);

      // Re-render charts nếu đang ở trang stats
      if (PageManager.currentPage === 'pageStats') {
        ChartManager.renderAllCharts();
      }
    });
  },

  applyTheme(theme) {
    document.documentElement.setAttribute('data-theme', theme);
    const icon = document.querySelector('#themeToggle i');
    if (theme === 'dark') {
      icon.className = 'fa-solid fa-sun';
    } else {
      icon.className = 'fa-solid fa-moon';
    }
  }
};

// ===== Page Manager (Multi-page Navigation) =====
const PageManager = {
  currentPage: 'pageHome',

  init() {
    this.bindEvents();
  },

  bindEvents() {
    document.querySelectorAll('.bottom-nav__item').forEach((btn) => {
      btn.addEventListener('click', (e) => {
        e.preventDefault();
        this.switchTo(btn.dataset.page);
      });
    });
  },

  /** Đồng bộ trạng thái active của thanh điều hướng theo trang đang mở */
  syncNav(pageId) {
    document.querySelectorAll('.bottom-nav__item').forEach((btn) => {
      btn.classList.toggle('active', btn.dataset.page === pageId);
    });
  },

  switchTo(pageId) {
    // Hide all pages
    document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));

    // Thanh điều hướng luôn phải khớp với trang đang mở
    // (kể cả khi chuyển trang bằng code chứ không phải do bấm nút)
    this.syncNav(pageId);

    // FAB chỉ hiện ở Trang chủ
    const fab = document.getElementById('fabAdd');
    if (fab) {
      fab.style.display = pageId === 'pageHome' ? 'flex' : 'none';
    }

    // Show target page
    const targetPage = document.getElementById(pageId);
    if (targetPage) {
      targetPage.classList.add('active');
      this.currentPage = pageId;

      // Render charts khi mở trang Stats
      if (pageId === 'pageStats' && typeof ChartManager !== 'undefined') {
        // Gọi trực tiếp để chắc chắn có dữ liệu, rAF chỉ để canvas có kích thước
        ChartManager.renderAllCharts();
        requestAnimationFrame(() => {
          if (!ChartManager.pieChart) ChartManager.renderAllCharts();
        });
      }

      // Render ngân sách khi mở trang Budget
      if (pageId === 'pageBudget' && typeof BudgetManager !== 'undefined') {
        BudgetManager.renderBudgetList();
        BudgetManager.updateBudgetSummary();
      }

      // Cập nhật trạng thái thông báo khi mở Settings
      if (pageId === 'pageSettings' && typeof NotificationManager !== 'undefined') {
        NotificationManager.updateStatusBadge();
      }

      // Scroll to top
      window.scrollTo(0, 0);
    }
  }
};

// ===== Tabs phu trong trang Cài đặt =====
// Trang Cài đặt dài hơn 3000px nên chia thành 4 nhóm để người dùng
// không phải cuộn quá nhiều mới tìm thấy mục cần dùng.
const SettingsTabs = {
  current: 'chung',

  init() {
    const bar = document.querySelector('.settings-tabs');
    if (!bar) return;
    bar.addEventListener('click', (e) => {
      const btn = e.target.closest('.settings-tab');
      if (!btn) return;
      this.switchTo(btn.dataset.tab);
    });
    this.switchTo(this.current);
  },

  switchTo(tab) {
    const bar = document.querySelector('.settings-tabs');
    if (!bar || !bar.querySelector('[data-tab="' + tab + '"]')) return;
    this.current = tab;

    bar.querySelectorAll('.settings-tab').forEach(btn => {
      const on = btn.dataset.tab === tab;
      btn.classList.toggle('is-active', on);
      btn.setAttribute('aria-pressed', on ? 'true' : 'false');
    });

    // Ẩn/hiện các section thuộc nhóm tương ứng
    document.querySelectorAll('#pageSettings .settings-section').forEach(sec => {
      const show = sec.dataset.tab === tab;
      sec.hidden = !show;
    });

    // Bảo đảm tab đang chọn nhìn thấy trong thanh cuộn ngang
    const active = bar.querySelector('.settings-tab.is-active');
    if (active && bar.scrollWidth > bar.clientWidth) {
      const target = active.offsetLeft - (bar.clientWidth - active.offsetWidth) / 2;
      bar.scrollTo({ left: Math.max(0, target), behavior: 'smooth' });
    }

    // Cuộn trang lên đầu nhóm vừa mở
    const page = document.getElementById('pageSettings');
    if (page) window.scrollTo(0, 0);
  }
};

// ===== Cài đặt AI & Bảo mật =====
const SecuritySettings = {
  /** Cài đặt: Gemini key, PIN khoá app, ẩn số dư */
  bindSecuritySettings() {
    // Gemini API key
    const keyInput = document.getElementById('inputGeminiKey');
    const aiTag = document.getElementById('aiStatusTag');
    const aiText = document.getElementById('aiStatusText');
    const paintAi = () => {
      const on = AIEntry.hasApiKey();
      if (aiTag) {
        aiTag.textContent = on ? 'Gemini' : 'Offline';
        aiTag.className = 'status-tag ' + (on ? 'status-tag--success' : 'status-tag--warning');
      }
      if (aiText) {
        aiText.textContent = on
          ? 'Dang dung Gemini cho cau nhap phuc tap (van co bo doc trong may du phong)'
          : 'Dang dung bo phan tich trong may';
      }
      if (keyInput && !keyInput.value) keyInput.value = AIEntry.getApiKey();
    };
    if (keyInput) {
      keyInput.addEventListener('change', () => {
        AIEntry.setApiKey(keyInput.value);
        paintAi();
        Toast.success(keyInput.value ? 'Đã lưu API key Gemini trên máy này.' : 'Đã xoá API key, dùng bộ đọc trong máy.');
      });
    }
    // Nút thử kết nối Gemini
    const btnTestGemini = document.getElementById('btnTestGemini');
    const geminiTestText = document.getElementById('geminiTestText');
    if (btnTestGemini && keyInput) {
      btnTestGemini.addEventListener('click', async () => {
        AIEntry.setApiKey(keyInput.value);
        btnTestGemini.disabled = true;
        const original = btnTestGemini.innerHTML;
        btnTestGemini.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Đang thử...';
        if (geminiTestText) geminiTestText.textContent = 'Đang gửi câu thử nghiệm tới Gemini...';

        const result = await AIEntry.testConnection();

        btnTestGemini.disabled = false;
        btnTestGemini.innerHTML = original;
        if (geminiTestText) geminiTestText.textContent = result.message;
        if (result.ok) {
          paintAi();
          Toast.success(result.message);
        } else {
          Toast.error(result.message);
        }
      });
    }
    paintAi();
    const pinInput = document.getElementById('inputPin');
    const btnSavePin = document.getElementById('btnSavePin');
    const lockText = document.getElementById('lockStatusText');
    const paintLock = () => {
      if (lockText) {
        lockText.textContent = (AppLock.isEnabled() && AppLock.hasPin())
          ? 'Đang bật — mở app sẽ yêu cầu mã PIN'
          : 'Chưa bật khoá ứng dụng';
      }
    };
    if (btnSavePin && pinInput) {
      btnSavePin.addEventListener('click', async () => {
        const pin = pinInput.value.trim();
        if (!/^\d{4,8}$/.test(pin)) { Toast.error('PIN phải có 4-8 chữ số!'); return; }
        try {
          await AppLock.setPin(pin);
          pinInput.value = '';
          Storage.set('spendwise_lock_at', Date.now());
          paintLock();
          Toast.success('Đã bật khoá ứng dụng bằng PIN.');
        } catch (err) {
          Toast.error(err.message);
        }
      });
    }
    paintLock();

    // An so du
    const btnToggle = document.getElementById('btnToggleBalance');
    if (btnToggle) {
      btnToggle.addEventListener('click', () => {
        const hidden = AppLock.toggleBalanceVisibility();
        Toast.success(hidden ? 'Đã ẩn số dư trên Trang chủ.' : 'Đã hiện số dư.');
      });
    }
    AppLock.applyBalanceMask();
  }
};

// ===== App Initialization =====
document.addEventListener('DOMContentLoaded', () => {
  // Khởi tạo các module
  ModalHelper.init();
  Toast.init();
  ConfirmDialog.init();
  FormManager.init();
  ThemeManager.init();
  TransactionManager.init();
  ChartManager.init();
  BudgetManager.init();
  ExportManager.init();
  NotificationManager.init();
  PageManager.init();
  SettingsTabs.init();
  if (typeof Features !== 'undefined') {
    Features.init();
  }
  if (typeof SyncManager !== 'undefined') {
    SyncManager.init();
  }
  if (typeof HomeWidgets !== 'undefined') {
    HomeWidgets.init();
  }
  if (typeof SecuritySettings !== 'undefined') {
    SecuritySettings.bindSecuritySettings();
  }
  if (typeof AppLock !== 'undefined') {
    AppLock.init();
  }
  if (typeof AuthManager !== 'undefined') {
    AuthManager.init();
  }
  if (typeof PWAManager !== 'undefined') {
    PWAManager.init();
  }

  // FAB button
  document.getElementById('fabAdd').addEventListener('click', () => {
    TransactionManager.openAddModal();
  });

  // Mở theo tham số URL: ?action=add (shortcut PWA) hoặc ?page=stats
  try {
    const params = new URLSearchParams(window.location.search);
    const pageParam = params.get('page');
    if (pageParam && typeof PageManager !== 'undefined') {
      // Chấp nhận cả dạng ngắn (stats) lẫn dạng đầy đủ (pageStats)
      const aliases = { home: 'pageHome', stats: 'pageStats', budget: 'pageBudget', settings: 'pageSettings' };
      const pageId = aliases[pageParam] || (/^page[A-Z]/.test(pageParam) ? pageParam : null);
      if (pageId && document.getElementById(pageId)) {
        PageManager.switchTo(pageId);
        document.querySelectorAll('.bottom-nav__item').forEach((b) =>
          b.classList.toggle('active', b.dataset.page === pageId));
      }
    }
    if (params.get('action') === 'add') {
      TransactionManager.openAddModal();
    }
  } catch (err) {
    console.warn('Không đọc được tham số URL:', err);
  }

  // Thêm dữ liệu mẫu nếu chưa có — chỉ ở chế độ local (chưa cấu hình Firebase);
  // tài khoản Firebase thật luôn bắt đầu trống
  // Chỉ thêm dữ liệu mẫu ở chế độ demo (không đăng nhập và chưa từng dùng app)
  const isDemo = Storage.get('spendwise_demo_mode', false);
  if (isDemo && Storage.getTransactions().length === 0) {
    DemoData.add();
  }

  // Nút bật/tắt chế độ dùng thử
  const btnDemo = document.getElementById('btnDemoMode');
  if (btnDemo) {
    const updateDemoBtn = () => {
      const on = Storage.get('spendwise_demo_mode', false);
      btnDemo.innerHTML = on
        ? '<i class="fa-solid fa-flask-vial"></i> Tắt dữ liệu mẫu'
        : '<i class="fa-solid fa-wand-magic-sparkles"></i> Bật dữ liệu mẫu (demo)';
    };
    updateDemoBtn();
    btnDemo.addEventListener('click', () => {
      const on = Storage.get('spendwise_demo_mode', false);
      if (on) {
        // Tắt demo: xoá đúng các giao dịch mẫu, giữ nguyên dữ liệu thật
        const removed = DemoData.remove();
        Storage.set('spendwise_demo_mode', false);
        Toast.success(`Đã tắt dữ liệu mẫu${removed ? ` (xoá ${removed} giao dịch mẫu)` : ''}.`);
      } else {
        Storage.set('spendwise_demo_mode', true);
        const added = DemoData.add();
        Toast.success(added
          ? `Đã thêm ${added} giao dịch mẫu. Dữ liệu mẫu không được đồng bộ lên cloud.`
          : 'Dữ liệu mẫu đã có sẵn trên máy này.');
      }
      updateDemoBtn();
    });
  }

  if (Storage.getTransactions().length === 0 &&
      (typeof AuthManager === 'undefined' || !AuthManager.isConfigured())) {
    // Không tự thêm dữ liệu mẫu: tài khoản mới bắt đầu sạch
  }

  console.log('🚀 SpendWise đã khởi động thành công!');
});

/**
 * Thêm dữ liệu mẫu cho lần đầu sử dụng
 */
function addSampleData() {
  return DemoData.add();
}

/* ===== Code cũ: đã thay bằng module DemoData (js/demo.js) =====
function addSampleData() {
  const today = Utils.getToday();
  const yesterday = new Date();
  yesterday.setDate(yesterday.getDate() - 1);
  const yesterdayStr = yesterday.toISOString().split('T')[0];

  const twoDaysAgo = new Date();
  twoDaysAgo.setDate(twoDaysAgo.getDate() - 2);
  const twoDaysAgoStr = twoDaysAgo.toISOString().split('T')[0];

  const threeDaysAgo = new Date();
  threeDaysAgo.setDate(threeDaysAgo.getDate() - 3);
  const threeDaysAgoStr = threeDaysAgo.toISOString().split('T')[0];

  const fourDaysAgo = new Date();
  fourDaysAgo.setDate(fourDaysAgo.getDate() - 4);
  const fourDaysAgoStr = fourDaysAgo.toISOString().split('T')[0];

  const samples = [
    { name: 'Phở sáng',        amount: 45000,    type: 'expense', category: 'food',          date: today,           note: 'Phở Hà Nội' },
    { name: 'Grab đi học',     amount: 25000,    type: 'expense', category: 'transport',     date: today,           note: '' },
    { name: 'Lương tháng 10',  amount: 8000000,  type: 'income',  category: 'salary',        date: yesterdayStr,    note: 'Lương part-time' },
    { name: 'Trà sữa',        amount: 55000,    type: 'expense', category: 'food',          date: yesterdayStr,    note: 'Tiger Sugar' },
    { name: 'Sách lập trình', amount: 189000,   type: 'expense', category: 'education',     date: twoDaysAgoStr,   note: 'JavaScript nâng cao' },
    { name: 'Xem phim',       amount: 90000,    type: 'expense', category: 'entertainment', date: twoDaysAgoStr,   note: 'CGV' },
    { name: 'Cà phê',         amount: 35000,    type: 'expense', category: 'food',          date: threeDaysAgoStr, note: 'Highlands' },
    { name: 'Tiền điện',      amount: 350000,   type: 'expense', category: 'bills',         date: threeDaysAgoStr, note: 'Tháng 9' },
    { name: 'Freelance web',   amount: 2000000,  type: 'income',  category: 'freelance',     date: fourDaysAgoStr,  note: 'Landing page cho khách' },
    { name: 'Thuốc cảm',      amount: 65000,    type: 'expense', category: 'health',        date: fourDaysAgoStr,  note: '' },
  ];

  samples.forEach(s => Storage.addTransaction(s));
  TransactionManager.renderTransactions();
  TransactionManager.updateSummary();
}
===== Hết code cũ ===== */
