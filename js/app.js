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

  bindEvents() {
    // Type toggle buttons
    document.querySelectorAll('.form__type-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        document.querySelectorAll('.form__type-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        this.currentType = btn.dataset.type;
        this.renderCategories(this.currentType);
        this.selectedCategory = null;
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

    // Format amount input on blur
    document.getElementById('inputAmount').addEventListener('input', (e) => {
      // Chỉ cho phép số
      e.target.value = e.target.value.replace(/[^0-9.]/g, '')
        .split('.').map((p, i) => i === 0 ? p : p.replace(/\./g, '')).join('.');
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
    if (typeof Features !== 'undefined') Features._pendingReceipt = null;
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
    document.querySelectorAll('.bottom-nav__item').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.preventDefault();
        const pageId = btn.dataset.page;
        this.switchTo(pageId);

        // Update active state
        document.querySelectorAll('.bottom-nav__item').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
      });
    });
  },

  switchTo(pageId) {
    // Hide all pages
    document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));

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
        requestAnimationFrame(() => ChartManager.renderAllCharts());
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
  if (typeof Features !== 'undefined') {
    Features.init();
  }
  if (typeof SyncManager !== 'undefined') {
    SyncManager.init();
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

  // Thêm dữ liệu mẫu nếu chưa có — chỉ ở chế độ local (chưa cấu hình Firebase);
  // tài khoản Firebase thật luôn bắt đầu trống
  // Chỉ thêm dữ liệu mẫu ở chế độ demo (không đăng nhập và chưa từng dùng app)
  const isDemo = Storage.get('spendwise_demo_mode', false);
  if (isDemo && Storage.getTransactions().length === 0) {
    addSampleData();
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
      Storage.set('spendwise_demo_mode', !on);
      if (!on) addSampleData();
      Toast.success(!on ? 'Đã bật dữ liệu mẫu cho chế độ demo.' : 'Đã tắt dữ liệu mẫu.');
      location.reload();
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
