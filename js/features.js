/**
 * features.js — Ví/tài khoản, Giao dịch định kỳ, Mục tiêu tiết kiệm,
 *               Ảnh hóa đơn, Đa tiền tệ, Xuất PDF
 */

const Features = {
  esc(s) {
    const d = document.createElement('div');
    d.textContent = s == null ? '' : String(s);
    return d.innerHTML;
  },

  DEFAULT_WALLETS: [
    { id: 'cash', name: 'Tiền mặt', icon: 'fa-money-bill-wave' },
    { id: 'bank', name: 'Ngân hàng', icon: 'fa-building-columns' },
    { id: 'momo', name: 'MoMo', icon: 'fa-wallet' }
  ],

  CURRENCIES: {
    VND: { symbol: 'đ', rate: 1, locale: 'vi-VN' },
    USD: { symbol: '$', rate: 26000, locale: 'en-US' },
    EUR: { symbol: '€', rate: 29000, locale: 'de-DE' }
  },

  // ============================================================
  // WALLETS
  // ============================================================
  getWallets() {
    let wallets = Storage.get('spendwise_wallets', null);
    if (!wallets) {
      wallets = [...this.DEFAULT_WALLETS];
      Storage.set('spendwise_wallets', wallets);
    }
    return wallets;
  },

  saveWallets(wallets) {
    Storage.set('spendwise_wallets', wallets);
  },

  getWalletById(id) {
    return this.getWallets().find(w => w.id === id) || null;
  },

  addWallet(name) {
    const wallets = this.getWallets();
    wallets.push({ id: 'w_' + Utils.generateId(), name, icon: 'fa-wallet' });
    this.saveWallets(wallets);
    this.renderWalletList();
    this.renderWalletOptions();
  },

  /**
   * Xóa ví — nếu ví đang được giao dịch sử dụng thì hỏi xử lý,
   * tránh để lại giao dịch trỏ tới ví không tồn tại.
   */
  deleteWallet(id) {
    if (this.getWallets().length <= 1) {
      Toast.error('Cần ít nhất 1 ví!');
      return;
    }
    const wallet = this.getWalletById(id);
    const used = (Storage.getTransactions() || []).filter(t => t.wallet === id);

    const doDelete = (reassignTo) => {
      if (used.length > 0 && reassignTo) {
        const txs = Storage.getTransactions().map(t =>
          t.wallet === id ? Object.assign({}, t, { wallet: reassignTo }) : t);
        Storage.saveTransactions(txs);
      }
      this.saveWallets(this.getWallets().filter(w => w.id !== id));
      this.renderWalletList();
      this.renderWalletOptions();
      TransactionManager.renderTransactions();
      if (typeof TransactionManager !== 'undefined') TransactionManager.renderHomeBudget();
    };

    if (used.length === 0) {
      doDelete(null);
      Toast.success('Đã xóa ví "' + (wallet ? wallet.name : '') + '"!');
      return;
    }

    // Có giao dịch đang dùng ví này → hỏi cách xử lý
    const others = this.getWallets().filter(w => w.id !== id);
    ConfirmDialog.show({
      title: 'Xóa ví "' + (wallet ? wallet.name : '') + '"?',
      message: used.length + ' giao dịch đang dùng ví này. ' +
        'Giao dịch sẽ được chuyển sang ví "' + others[0].name + '".',
      confirmText: 'Xóa & chuyển ví',
      onConfirm: () => {
        doDelete(others[0].id);
        Toast.success(`Đã xóa ví và chuyển ${used.length} giao dịch sang "${others[0].name}"!`);
      }
    });
  },

  renderWalletOptions() {
    const select = document.getElementById('inputWallet');
    if (!select) return;
    select.innerHTML = this.getWallets()
      .map(w => `<option value="${w.id}">${this.esc(w.name)}</option>`).join('');
  },

  renderWalletList() {
    const container = document.getElementById('walletList');
    if (!container) return;
    container.innerHTML = this.getWallets().map(w => `
      <div class="settings-item">
        <div class="settings-item__info">
          <span class="settings-item__title"><i class="fa-solid ${w.icon}"></i> ${this.esc(w.name)}</span>
        </div>
        <button class="settings-btn settings-btn--danger" data-wallet-id="${w.id}">
          <i class="fa-solid fa-trash"></i>
        </button>
      </div>
    `).join('');
    container.querySelectorAll('[data-wallet-id]').forEach(btn => {
      btn.addEventListener('click', () => this.deleteWallet(btn.dataset.walletId));
    });
  },

  bindWalletEvents() {
    const btnAdd = document.getElementById('btnAddWallet');
    if (btnAdd) {
      btnAdd.addEventListener('click', () => {
        const input = document.getElementById('inputWalletName');
        const name = input.value.trim();
        if (!name) { Toast.error('Nhập tên ví!'); return; }
        this.addWallet(name);
        input.value = '';
        Toast.success('Đã thêm ví mới!');
      });
    }
  },

  // ============================================================
  // GOALS (Mục tiêu tiết kiệm)
  // ============================================================
  getGoals() {
    return Storage.get('spendwise_goals', []);
  },

  saveGoals(goals) {
    Storage.set('spendwise_goals', goals);
  },

  addGoal(name, target) {
    const goals = this.getGoals();
    goals.push({ id: 'g_' + Utils.generateId(), name, target, saved: 0 });
    this.saveGoals(goals);
    this.renderGoals();
    Toast.success('Đã thêm mục tiêu!');
  },

  /** Chuẩn hoá mục tiêu trước khi lưu (giống hợp lệ với Firestore rules) */
  validateGoalInput(name, targetRaw) {
    const cleanName = String(name || '').trim();
    if (!cleanName) return { error: 'Vui lòng nhập tên mục tiêu!' };
    if (cleanName.length > 50) return { error: 'Tên mục tiêu không được vượt quá 50 ký tự!' };
    const target = Business.parseAmount(targetRaw);
    if (target === null) return { error: 'Số tiền mục tiêu không hợp lệ (VD: 20000000 hoặc 20tr).' };
    return { name: cleanName, target };
  },

  addToGoal(id) {
    const amountStr = prompt('Nhập số tiền muốn nạp vào mục tiêu (VD: 500000 hoặc 2tr):');
    if (!amountStr) return;
    // Dùng chung bộ phân tích số tiền: chấp nhận 1.500.000, 2tr, 2.5 (triệu USD)...
    const amount = Business.parseAmount(amountStr);
    if (amount === null) { Toast.error('Số tiền không hợp lệ!'); return; }
    const goals = this.getGoals();
    const goal = goals.find(g => g.id === id);
    if (!goal) return;
    goal.saved += amount;
    this.saveGoals(goals);
    this.renderGoals();
    Toast.success(`Đã nạp ${Utils.formatCurrency(amount)} vào "${goal.name}"!`);
  },

  deleteGoal(id) {
    const goal = this.getGoals().find(g => g.id === id);
    ConfirmDialog.show({
      title: 'Xóa mục tiêu?',
      message: goal ? `Bạn có chắc muốn xóa mục tiêu "${goal.name}"?` : 'Bạn có chắc muốn xóa mục tiêu này?',
      onConfirm: () => {
        this.saveGoals(this.getGoals().filter(g => g.id !== id));
        this.renderGoals();
        Toast.success('Đã xóa mục tiêu!');
      }
    });
  },

  renderGoals() {
    const container = document.getElementById('goalList');
    if (!container) return;
    const goals = this.getGoals();
    if (goals.length === 0) {
      container.innerHTML = `<p style="text-align:center;color:var(--text-muted);padding:var(--space-lg)">Chưa có mục tiêu tiết kiệm nào. Thêm mục tiêu đầu tiên!</p>`;
      return;
    }
    container.innerHTML = goals.map(g => {
      const progress = Business.goalProgress(g);
      const pct = progress.percent;
      return `
      <div class="goal-item">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:var(--space-xs)">
          <strong>${this.esc(g.name)}</strong>
          <span style="font-size:var(--font-size-sm);color:var(--text-secondary)">${pct}%</span>
        </div>
        <div class="budget-summary__progress-bar" style="margin-bottom:var(--space-xs)">
          <div class="budget-summary__progress-fill budget-summary__progress-fill--safe" style="width:${pct}%"></div>
        </div>
        <div style="display:flex;justify-content:space-between;align-items:center">
          <span style="font-size:var(--font-size-sm)">${Utils.formatCurrency(g.saved)} / ${Utils.formatCurrency(g.target)}
            ${progress.completed ? '<strong style="color:var(--success-text)"> — Đạt!</strong>' : ''}</span>
          <span style="display:flex;gap:var(--space-xs)">
            <button class="settings-btn" data-goal-add="${g.id}" aria-label="Nạp tiền vào mục tiêu ${this.esc(g.name)}"><i class="fa-solid fa-plus"></i> Nạp</button>
            <button class="settings-btn settings-btn--danger" data-goal-del="${g.id}" aria-label="Xóa mục tiêu ${this.esc(g.name)}"><i class="fa-solid fa-trash"></i></button>
          </span>
        </div>
      </div>`;
    }).join('');
    container.querySelectorAll('[data-goal-add]').forEach(b => b.addEventListener('click', () => this.addToGoal(b.dataset.goalAdd)));
    container.querySelectorAll('[data-goal-del]').forEach(b => b.addEventListener('click', () => this.deleteGoal(b.dataset.goalDel)));
  },

  bindGoalEvents() {
    const btn = document.getElementById('btnAddGoal');
    if (btn) {
      btn.addEventListener('click', () => {
        const input = this.validateGoalInput(
          document.getElementById('inputGoalName').value,
          document.getElementById('inputGoalTarget').value
        );
        if (input.error) { Toast.error(input.error); return; }
        this.addGoal(input.name, input.target);
        document.getElementById('inputGoalName').value = '';
        document.getElementById('inputGoalTarget').value = '';
      });
    }
  },

  // ============================================================
  // RECURRING (Giao dịch định kỳ)
  // ============================================================
  toDateStr(d) {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
  },

  getRecurring() {
    return Storage.get('spendwise_recurring', []);
  },

  saveRecurring(list) {
    Storage.set('spendwise_recurring', list);
  },

  addRecurring(data) {
    const list = this.getRecurring();
    list.push({ id: 'r_' + Utils.generateId(), ...data, lastRun: null });
    this.saveRecurring(list);
    this.renderRecurringList();
  },

  deleteRecurring(id) {
    this.saveRecurring(this.getRecurring().filter(r => r.id !== id));
    this.renderRecurringList();
  },

  getNextDate(date, frequency) {
    const d = Utils.parseDateLocal(date);
    if (frequency === 'daily') {
      d.setDate(d.getDate() + 1);
    } else if (frequency === 'weekly') {
      d.setDate(d.getDate() + 7);
    } else if (frequency === 'monthly') {
      // Giữ ngày cố định, nhưng không vượt quá số ngày của tháng đích
      // (VD: 31/01 → 28/02 thay vì nhảy sang 03/03)
      const day = d.getDate();
      d.setDate(1);
      d.setMonth(d.getMonth() + 1);
      const daysInTarget = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();
      d.setDate(Math.min(day, daysInTarget));
    }
    return d;
  },

  /**
   * Khóa duy nhất cho một lần lặp: ruleId + ngày phát sinh
   * => bảo đảm không tạo trùng giao dịch khi mở app nhiều lần
   */
  occurrenceKey(ruleId, date) {
    const d = Utils.parseDateLocal(date);
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${ruleId}__${y}-${m}-${day}`;
  },

  /**
   * Kiểm tra định kỳ khi ngày đổi (app mở suốt đêm hoặc tab bị ẩn)
   */
  startRecurringScheduler() {
    let lastCheckedDay = new Date().toDateString();

    const check = () => {
      const today = new Date().toDateString();
      if (today === lastCheckedDay) return;
      lastCheckedDay = today;
      this.processRecurring();
    };

    setInterval(check, 60 * 1000);
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible') check();
    });
    window.addEventListener('focus', check);
  },

  processRecurring() {
    const list = this.getRecurring();
    const today = new Date();
    today.setHours(23, 59, 59, 999);
    let totalCreated = 0;

    const existingIds = new Set(Storage.getTransactions().map(t => t.id));

    list.forEach(rule => {
      // Bắt đầu từ ngày kế tiếp lần chạy trước (nếu có), ngược lại là startDate
      let cursor = rule.lastRun
        ? this.getNextDate(new Date(rule.lastRun), rule.frequency)
        : new Date(rule.startDate);

      let created = 0;
      while (cursor <= today && created < 365) {
        const dateStr = this.toDateStr(cursor);
        const key = this.occurrenceKey(rule.id, dateStr);

        // Bỏ qua nếu lần lặp này đã tồn tại (chống tạo trùng)
        if (!existingIds.has(key)) {
          Storage.addTransaction({
            id: key,                      // ID ổn định theo rule + ngày
            name: rule.name,
            amount: rule.amount,           // luôn là VNĐ
            type: rule.type,
            category: rule.category,
            wallet: rule.wallet,
            date: dateStr,
            note: 'Tự động (định kỳ)'
          });
          existingIds.add(key);
          created++;
        }

        rule.lastRun = dateStr;
        cursor = this.getNextDate(cursor, rule.frequency);
      }
      totalCreated += created;
    });

    this.saveRecurring(list);

    if (totalCreated > 0) {
      if (typeof TransactionManager !== 'undefined') {
        TransactionManager.renderTransactions();
        TransactionManager.updateSummary();
      }
      if (typeof Toast !== 'undefined') {
        Toast.success(`Đã tự động thêm ${totalCreated} giao dịch định kỳ!`);
      }
    }
  },

  renderRecurringList() {
    const container = document.getElementById('recurringList');
    if (!container) return;
    const list = this.getRecurring();
    if (list.length === 0) {
      container.innerHTML = `<p style="text-align:center;color:var(--text-muted);padding:var(--space-md)">Chưa có giao dịch định kỳ nào.</p>`;
      return;
    }
    const freqLabel = { daily: 'Hàng ngày', weekly: 'Hàng tuần', monthly: 'Hàng tháng' };
    container.innerHTML = list.map(r => `
      <div class="settings-item">
        <div class="settings-item__info">
          <span class="settings-item__title">${this.esc(r.name)} — ${Utils.formatCurrency(r.amount)}</span>
          <span class="settings-item__desc">${freqLabel[r.frequency] || r.frequency}</span>
        </div>
        <button class="settings-btn settings-btn--danger" data-rec-del="${r.id}">
          <i class="fa-solid fa-trash"></i>
        </button>
      </div>`).join('');
    container.querySelectorAll('[data-rec-del]').forEach(b => {
      b.addEventListener('click', () => {
        this.deleteRecurring(b.dataset.recDel);
        Toast.success('Đã xóa giao dịch định kỳ!');
      });
    });
  },

  // ============================================================
  // CURRENCY (Đa tiền tệ — lưu gốc bằng VNĐ, hiển thị theo lựa chọn)
  // ============================================================
  async refreshRates() {
    /**
     * Tỷ giá do NGƯỜI DÙNG tự đặt (mặc định gợi ý).
     * Trước đây code ghi cứng 26.000/29.000 mà giao diện lại ghi "tỷ giá đầu tháng"
     * → người dùng hiểu nhầm đây là tỷ giá thị trường. Giờ hiển thị rõ
     * tỷ giá đang dùng + ngày cập nhật, và cho phép sửa trong Cài đặt.
     */
    const current = Storage.get('spendwise_rates', null);
    const defaultRates = { USD: 26000, EUR: 29000 };

    if (!current || !current.rates) {
      Storage.set('spendwise_rates', {
        rates: defaultRates,
        updatedAt: new Date().toISOString(),
        source: 'default'
      });
      this.CURRENCIES.USD.rate = defaultRates.USD;
      this.CURRENCIES.EUR.rate = defaultRates.EUR;
      return;
    }

    const usd = Math.max(1, Math.round(Number(current.rates.USD) || defaultRates.USD));
    const eur = Math.max(1, Math.round(Number(current.rates.EUR) || defaultRates.EUR));
    this.CURRENCIES.USD.rate = usd;
    this.CURRENCIES.EUR.rate = eur;
  },

  /** Lưu tỷ giá do người dùng đặt (1 USD = bao nhiêu VNĐ) */
  setRates(usd, eur) {
    const u = Math.max(1, Math.round(Number(usd) || 26000));
    const e = Math.max(1, Math.round(Number(eur) || 29000));
    Storage.set('spendwise_rates', {
      rates: { USD: u, EUR: e },
      updatedAt: new Date().toISOString(),
      source: 'user'
    });
    this.CURRENCIES.USD.rate = u;
    this.CURRENCIES.EUR.rate = e;
    return { USD: u, EUR: e };
  },

  /** Thông tin tỷ giá để hiển thị minh bạch trong Cài đặt */
  getRateInfo() {
    const r = Storage.get('spendwise_rates', null);
    return {
      USD: (r && r.rates && r.rates.USD) || 26000,
      EUR: (r && r.rates && r.rates.EUR) || 29000,
      updatedAt: (r && r.updatedAt) || '',
      source: (r && r.source) || 'default'
    };
  },

  getCurrency() {
    return Storage.get('spendwise_currency', 'VND');
  },

  /**
   * Đổi đơn vị hiển thị.
   * QUAN TRỌNG: KHÔNG sửa số tiền gốc của giao dịch/ngân sách/mục tiêu.
   * Mọi số tiền luôn được lưu bằng VNĐ; chỉ định dạng hiển thị thay đổi.
   */
  setCurrency(code) {
    const oldBase = this.getCurrency();
    if (oldBase === code) return;

    Storage.set('spendwise_currency', code);

    // Form thêm giao dịch mặc định theo đồng tiền mới
    const txCur = document.getElementById('inputCurrencyTx');
    if (txCur) txCur.value = code;

    if (typeof TransactionManager !== 'undefined') {
      TransactionManager.renderTransactions();
      TransactionManager.updateSummary();
    }
    if (typeof BudgetManager !== 'undefined') {
      BudgetManager.renderBudgetList();
      BudgetManager.updateBudgetSummary();
    }
    if (typeof ChartManager !== 'undefined' && typeof PageManager !== 'undefined' && PageManager.currentPage === 'pageStats') {
      ChartManager.renderAllCharts();
    }
    this.renderGoals();
  },

  // ============================================================
  // RECEIPT (Ảnh hóa đơn) — nén ảnh bằng canvas, lưu base64
  // ============================================================
  handleReceiptFile(file, callback) {
    if (!file) { callback(null); return; }
    if (!file.type.startsWith('image/')) { Toast.error('Vui lòng chọn file ảnh!'); callback(null); return; }
    const reader = new FileReader();
    reader.onload = e => {
      const img = new Image();
      img.onload = () => {
        const max = 600;
        const scale = Math.min(1, max / Math.max(img.width, img.height));
        const canvas = document.createElement('canvas');
        canvas.width = img.width * scale;
        canvas.height = img.height * scale;
        canvas.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height);
        callback(canvas.toDataURL('image/jpeg', 0.7));
      };
      img.src = e.target.result;
    };
    reader.readAsDataURL(file);
  },

  // ============================================================
  // PDF EXPORT (in báo cáo ra PDF qua print CSS)
  // ============================================================
  exportPDF() {
    const transactions = Storage.getTransactions();
    // Dùng lớp nghiệp vụ dùng chung để số liệu khớp với Trang chủ & Thống kê
    const totalIncome = Business.totalIncome(transactions);
    const totalExpense = Business.totalExpense(transactions);

    // Báo cáo in: mới nhất trước, giới hạn số dòng để không in hàng nghìn trang
    const MAX_ROWS = 800;
    const sorted = transactions.slice().sort((a, b) => (b.date || '').localeCompare(a.date || ''));
    const printed = sorted.slice(0, MAX_ROWS);
    const omitted = sorted.length - printed.length;

    const rows = printed.map(t => `
      <tr>
        <td>${Utils.formatDate(t.date)}</td>
        <td>${this.esc(t.name)}${t.note ? `<br><small style="color:#888">${this.esc(t.note)}</small>` : ''}</td>
        <td>${t.type === 'income' ? 'Thu nhập' : 'Chi tiêu'}</td>
        <td style="text-align:right;color:${t.type === 'income' ? '#0B7D59' : '#C0392B'}">
          ${t.type === 'income' ? '+' : '-'}${Utils.formatCurrency(t.amount)}
        </td>
      </tr>`).join('');

    document.getElementById('printReport').innerHTML = `
      <h1 style="margin-bottom:4px">💰 SpendWise — Báo cáo thu chi</h1>
      <p style="color:#666;margin-bottom:16px">Ngày xuất: ${Utils.formatDate(new Date().toISOString())}</p>
      <p><strong>Tổng thu:</strong> ${Utils.formatCurrency(totalIncome)} &nbsp;|&nbsp;
         <strong>Tổng chi:</strong> ${Utils.formatCurrency(totalExpense)} &nbsp;|&nbsp;
         <strong>Số dư:</strong> ${Utils.formatCurrency(Business.balance(transactions))}</p>
      ${omitted > 0 ? `<p style="color:#b45309">Báo cáo chỉ in ${MAX_ROWS} giao dịch mới nhất, còn ${omitted} giao dịch cũ hơn không in. Hãy xuất Excel để xem đầy đủ.</p>` : ''}
      <table>
        <thead><tr><th>Ngày</th><th>Tên giao dịch</th><th>Loại</th><th style="text-align:right">Số tiền</th></tr></thead>
        <tbody>${rows}</tbody>
      </table>`;
    window.print();
  },

  // ============================================================
  // INIT
  // ============================================================
  init() {
    this.renderWalletOptions();
    this.renderWalletList();
    this.bindWalletEvents();
    this.renderGoals();
    this.bindGoalEvents();
    this.renderRecurringList();
    this.processRecurring();
    this.startRecurringScheduler();

    // Form thêm giao dịch mặc định theo đồng tiền hiện tại
    const txCurInit = document.getElementById('inputCurrencyTx');
    if (txCurInit) txCurInit.value = this.getCurrency();

    // Tỉ giá đầu tháng — sau khi lấy xong sẽ vẽ lại UI
    this.refreshRates().then(() => {
      if (typeof TransactionManager !== 'undefined') {
        TransactionManager.renderTransactions();
        TransactionManager.updateSummary();
      }
      if (typeof BudgetManager !== 'undefined') {
        BudgetManager.renderBudgetList();
        BudgetManager.updateBudgetSummary();
      }
      if (typeof ChartManager !== 'undefined' && typeof PageManager !== 'undefined' && PageManager.currentPage === 'pageStats') {
        ChartManager.renderAllCharts();
      }
      this.renderGoals();
    });

    // Phiên bản build (giúp xác nhận đang chạy bản mới nhất)
    const verTag = document.getElementById('appVersionTag');
    if (verTag && typeof AuthManager !== 'undefined' && AuthManager.APP_VERSION) {
      verTag.textContent = 'v' + AuthManager.APP_VERSION;
    }

    // Currency select
    const currencySelect = document.getElementById('inputCurrency');
    const rateRow = document.getElementById('rateRow');
    const rateInfo = document.getElementById('rateInfo');
    const usdInput = document.getElementById('inputRateUsd');
    const eurInput = document.getElementById('inputRateEur');

    const paintRates = () => {
      const info = this.getRateInfo();
      if (rateRow) rateRow.hidden = this.getCurrency() === 'VND';
      if (rateInfo) {
        const ngay = info.updatedAt ? new Date(info.updatedAt).toLocaleDateString('vi-VN') : '';
        // Luôn hiển thị tỷ giá bằng VNĐ, không dùng formatCurrency
        // (nếu không sẽ bị đổi sang $ khi người dùng chọn USD)
        const dinhDang = (n) => Number(n).toLocaleString('vi-VN') + 'đ';
        rateInfo.textContent = `1 USD = ${dinhDang(info.USD)} · 1 EUR = ${dinhDang(info.EUR)}` +
          (ngay ? ` · cập nhật ${ngay}` : '') +
          (info.source === 'user' ? ' · do bạn đặt' : ' · giá trị mặc định');
      }
      if (usdInput && !usdInput.dataset.touched) usdInput.value = info.USD;
      if (eurInput && !eurInput.dataset.touched) eurInput.value = info.EUR;
    };

    if (currencySelect) {
      currencySelect.value = this.getCurrency();
      currencySelect.addEventListener('change', e => {
        this.setCurrency(e.target.value);
        paintRates();
      });
    }
    [usdInput, eurInput].forEach(el => {
      if (el) el.addEventListener('input', () => { el.dataset.touched = '1'; });
    });
    const btnSaveRates = document.getElementById('btnSaveRates');
    if (btnSaveRates) {
      btnSaveRates.addEventListener('click', () => {
        const u = Business.parseAmount(usdInput ? usdInput.value : '');
        const e = Business.parseAmount(eurInput ? eurInput.value : '');
        if (!u || u < 1 || !e || e < 1) {
          Toast.error('Tỷ giá phải là số lớn hơn 0 (VD: 26000 cho 1 USD).');
          return;
        }
        this.setRates(u, e);
        if (usdInput) delete usdInput.dataset.touched;
        if (eurInput) delete eurInput.dataset.touched;
        paintRates();
        TransactionManager.renderTransactions();
        TransactionManager.updateSummary();
        Toast.success('Đã lưu tỷ giá quy đổi.');
      });
    }
    paintRates();

    // Receipt preview
    const receiptInput = document.getElementById('inputReceipt');
    const showReceipt = (dataUrl) => {
      this._pendingReceipt = dataUrl || null;
      const preview = document.getElementById('receiptPreview');
      if (preview) {
        preview.src = dataUrl || '';
        preview.style.display = dataUrl ? 'block' : 'none';
      }
      const btnRemove = document.getElementById('btnRemoveReceipt');
      if (btnRemove) btnRemove.style.display = dataUrl ? '' : 'none';
    };
    this._showReceipt = showReceipt;

    if (receiptInput) {
      receiptInput.addEventListener('change', e => {
        const file = e.target.files[0];
        if (file) {
          this.handleReceiptFile(file, dataUrl => showReceipt(dataUrl));
        }
      });
    }

    // Bỏ ảnh hóa đơn đang gắn vào giao dịch
    const btnRemoveReceipt = document.getElementById('btnRemoveReceipt');
    if (btnRemoveReceipt) {
      btnRemoveReceipt.addEventListener('click', () => {
        showReceipt(null);
        if (receiptInput) receiptInput.value = '';
        Toast.show('Đã bỏ ảnh hóa đơn khỏi giao dịch này.', 'info');
      });
    }

    // PDF button
    const btnPDF = document.getElementById('btnExportPDF');
    if (btnPDF) btnPDF.addEventListener('click', () => this.exportPDF());
  }
};
