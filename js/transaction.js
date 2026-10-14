/**
 * transaction.js — Quản lý hiển thị & CRUD giao dịch
 */

const TransactionManager = {
  currentFilter: 'all', // 'all' | 'income' | 'expense'
  editingId: null,       // ID giao dịch đang sửa
  searchTerm: '',        // từ khoá tìm kiếm
  filterWallet: '',      // lọc theo ví
  filterCategory: '',    // lọc theo danh mục
  visibleCount: 50,      // số giao dịch đang hiển thị (phân trang dạng "xem thêm")
  PAGE_SIZE: 50,

  /**
   * Khởi tạo
   */
  init() {
    this.renderTransactions();
    this.updateSummary();
    this.bindFilterEvents();
    this.bindSearchEvents();
    this.renderFilterOptions();
  },

  /**
   * Tìm kiếm / lọc nâng cao
   */
  bindSearchEvents() {
    const search = document.getElementById('searchInput');
    if (search) {
      search.addEventListener('input', (e) => {
        this.searchTerm = e.target.value.trim().toLowerCase();
        this.visibleCount = this.PAGE_SIZE;
        this.renderTransactions();
      });
    }
    const walletSel = document.getElementById('filterWallet');
    if (walletSel) {
      walletSel.addEventListener('change', (e) => {
        this.filterWallet = e.target.value;
        this.visibleCount = this.PAGE_SIZE;
        this.renderTransactions();
      });
    }
    const catSel = document.getElementById('filterCategory');
    if (catSel) {
      catSel.addEventListener('change', (e) => {
        this.filterCategory = e.target.value;
        this.visibleCount = this.PAGE_SIZE;
        this.renderTransactions();
      });
    }
    const btnMore = document.getElementById('btnLoadMore');
    if (btnMore) {
      btnMore.addEventListener('click', () => {
        this.visibleCount += this.PAGE_SIZE;
        this.renderTransactions();
      });
    }
  },

  /**
   * Danh sách ví / danh mục cho ô lọc
   */
  renderFilterOptions() {
    const walletSel = document.getElementById('filterWallet');
    if (walletSel && typeof Features !== 'undefined') {
      const current = walletSel.value;
      walletSel.innerHTML = '<option value="">Tất cả ví</option>' +
        Features.getWallets().map(w =>
          `<option value="${Utils.escapeAttr(w.id)}">${Utils.escapeHtml(w.name)}</option>`).join('');
      walletSel.value = current;
    }
    const catSel = document.getElementById('filterCategory');
    if (catSel) {
      const current = catSel.value;
      const all = [...Categories.expense, ...Categories.income];
      catSel.innerHTML = '<option value="">Tất cả danh mục</option>' +
        all.map(c => `<option value="${Utils.escapeAttr(c.id)}">${Utils.escapeHtml(c.name)}</option>`).join('');
      catSel.value = current;
    }
  },

  /**
   * Bind sự kiện cho filter tabs
   */
  bindFilterEvents() {
    document.querySelectorAll('.filter-tab').forEach(tab => {
      tab.addEventListener('click', () => {
        document.querySelectorAll('.filter-tab').forEach(t => t.classList.remove('active'));
        tab.classList.add('active');
        this.currentFilter = tab.dataset.filter;
        this.renderTransactions();
      });
    });
  },

  /**
   * Lấy giao dịch đã filter
   * @returns {Array}
   */
  getFilteredTransactions() {
    let transactions = Storage.getTransactions();

    if (this.currentFilter !== 'all') {
      transactions = transactions.filter(t => t.type === this.currentFilter);
    }
    if (this.filterWallet) {
      transactions = transactions.filter(t => t.wallet === this.filterWallet);
    }
    if (this.filterCategory) {
      transactions = transactions.filter(t => t.category === this.filterCategory);
    }
    if (this.searchTerm) {
      const term = this.searchTerm;
      transactions = transactions.filter(t => {
        const cat = Categories.getById(t.category);
        const wallet = (typeof Features !== 'undefined' && Features.getWalletById(t.wallet)) || null;
        return (t.name || '').toLowerCase().includes(term)
          || (t.note || '').toLowerCase().includes(term)
          || (cat ? cat.name.toLowerCase().includes(term) : false)
          || (wallet ? wallet.name.toLowerCase().includes(term) : false);
      });
    }

    // Sắp xếp theo ngày mới nhất
    transactions.sort((a, b) => (b.date || '').localeCompare(a.date || ''));

    return transactions;
  },

  /**
   * Render danh sách giao dịch
   */
  renderTransactions() {
    const container = document.getElementById('transactionList');
    const transactions = this.getFilteredTransactions();

    if (transactions.length === 0) {
      const hasFilter = this.searchTerm || this.filterWallet || this.filterCategory || this.currentFilter !== 'all';
      container.innerHTML = hasFilter ? `
        <div class="transaction-empty">
          <i class="fa-solid fa-magnifying-glass"></i>
          <p>Không tìm thấy giao dịch phù hợp</p>
          <p>Thử đổi từ khoá hoặc bỏ bớt bộ lọc</p>
          <button class="settings-btn" id="btnClearFilters" style="margin-top:var(--space-sm)">
            <i class="fa-solid fa-filter-circle-xmark"></i> Xoá bộ lọc
          </button>
        </div>
      ` : `
        <div class="transaction-empty">
          <i class="fa-regular fa-receipt"></i>
          <p>Chưa có giao dịch nào</p>
          <p>Nhấn nút <strong>+</strong> để thêm giao dịch đầu tiên</p>
        </div>
      `;
      const clearBtn = document.getElementById('btnClearFilters');
      if (clearBtn) clearBtn.addEventListener('click', () => this.clearFilters());
      const btnMore = document.getElementById('btnLoadMore');
      if (btnMore) btnMore.style.display = 'none';
      const label = document.getElementById('txCountLabel');
      if (label) label.textContent = '';
      return;
    }

    // Chỉ render một phần danh sách để không nặng DOM khi có hàng nghìn giao dịch
    const shown = transactions.slice(0, this.visibleCount);
    container.innerHTML = shown.map(t => this.renderTransactionItem(t)).join('');
    this.bindTransactionEvents();

    const btnMore = document.getElementById('btnLoadMore');
    if (btnMore) {
      btnMore.style.display = transactions.length > this.visibleCount ? '' : 'none';
      btnMore.innerHTML = `<i class="fa-solid fa-chevron-down"></i> Xem thêm ${Math.min(this.PAGE_SIZE, transactions.length - this.visibleCount)} giao dịch`;
    }

    const label = document.getElementById('txCountLabel');
    if (label) {
      label.textContent = shown.length < transactions.length
        ? `${shown.length}/${transactions.length}`
        : `${transactions.length} giao dịch`;
    }
  },

  /**
   * Xoá toàn bộ bộ lọc / tìm kiếm
   */
  clearFilters() {
    this.searchTerm = '';
    this.filterWallet = '';
    this.filterCategory = '';
    this.currentFilter = 'all';
    this.visibleCount = this.PAGE_SIZE;
    const search = document.getElementById('searchInput');
    if (search) search.value = '';
    const walletSel = document.getElementById('filterWallet');
    if (walletSel) walletSel.value = '';
    const catSel = document.getElementById('filterCategory');
    if (catSel) catSel.value = '';
    document.querySelectorAll('.filter-tab').forEach(t =>
      t.classList.toggle('active', t.dataset.filter === 'all'));
    this.renderTransactions();
  },

  /**
   * Render một item giao dịch
   * @param {Object} t - transaction object
   * @returns {string} HTML
   */
  renderTransactionItem(t) {
    const category = Categories.getById(t.category);
    const iconClass = category ? category.icon : 'fa-circle';
    const iconColor = category ? category.color : '#94A3B8';
    const iconBg = category ? category.bg : '#F1F5F9';
    const categoryName = category ? category.name : 'Khác';
    const walletName = (typeof Features !== 'undefined' && Features.getWalletById(t.wallet))
      ? Features.getWalletById(t.wallet).name : '';
    const safeName = Utils.escapeHtml(t.name);
    const safeCategory = Utils.escapeHtml(categoryName);
    const safeWallet = Utils.escapeHtml(walletName);
    // Chỉ chấp nhận ảnh hóa đơn dạng data URL an toàn
    const safeReceipt = (typeof t.receipt === 'string' &&
      /^data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+/=]*$/.test(t.receipt)) ? t.receipt : '';
    const safeId = Utils.escapeAttr(t.id);

    return `
      <div class="transaction-item transaction-item--${t.type === 'income' ? 'income' : 'expense'}" data-id="${safeId}" role="button" tabindex="0"
           aria-label="${safeName}, ${t.type === 'income' ? 'thu nhập' : 'chi tiêu'} ${Utils.formatCurrency(t.amount)}. Nhấn Enter để sửa.">
        <div class="transaction-item__icon" style="background: ${iconBg}; color: ${iconColor}">
          <i class="fa-solid ${iconClass}"></i>
        </div>
        <div class="transaction-item__info">
          <div class="transaction-item__name" title="${safeName}">${safeName}</div>
          <div class="transaction-item__category">${safeCategory}${safeWallet ? ' • ' + safeWallet : ''}</div>
        </div>
        ${safeReceipt ? `<img src="${safeReceipt}" alt="Hóa đơn" title="Ảnh hóa đơn" loading="lazy" style="width:36px;height:36px;object-fit:cover;border-radius:8px;flex-shrink:0">` : ''}
        <div class="transaction-item__right">
          <div class="transaction-item__amount transaction-item__amount--${t.type === 'income' ? 'income' : 'expense'}">
            ${Utils.formatCurrencyWithSign(t.amount, t.type)}
          </div>
          <div class="transaction-item__date">${Utils.formatDateFriendly(t.date)}</div>
        </div>
        <div class="transaction-item__actions">
          <button class="transaction-item__action-btn transaction-item__action-btn--edit"
                  data-action="edit" data-id="${safeId}" title="Sửa" aria-label="Sửa giao dịch ${safeName}">
            <i class="fa-solid fa-pen"></i>
          </button>
          <button class="transaction-item__action-btn transaction-item__action-btn--delete"
                  data-action="delete" data-id="${safeId}" title="Xóa" aria-label="Xóa giao dịch ${safeName}">
            <i class="fa-solid fa-trash"></i>
          </button>
        </div>
      </div>
    `;
  },

  /**
   * Bind sự kiện cho các nút sửa/xóa
   */
  bindTransactionEvents() {
    document.querySelectorAll('[data-action="edit"]').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const id = btn.dataset.id;
        this.openEditModal(id);
      });
    });

    document.querySelectorAll('[data-action="delete"]').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const id = btn.dataset.id;
        this.confirmDelete(id);
      });
    });

    // Bàn phím: Enter / Space trên dòng giao dịch để mở form sửa
    document.querySelectorAll('.transaction-item[data-id]').forEach(row => {
      row.addEventListener('keydown', (e) => {
        if (e.key !== 'Enter' && e.key !== ' ' && e.key !== 'Spacebar') return;
        if (e.target.closest('button')) return;
        e.preventDefault();
        this.openEditModal(row.dataset.id);
      });
    });
  },

  /**
   * Cập nhật thẻ tổng hợp (số dư, thu, chi)
   */
  updateSummary() {
    const transactions = Storage.getTransactions();

    // Dùng lớp nghiệp vụ dùng chung để số liệu khớp với Thống kê / Ngân sách / Báo cáo
    const income = Business.totalIncome(transactions);
    const expense = Business.totalExpense(transactions);
    const balance = Business.balance(transactions);

    document.getElementById('totalBalance').textContent = (balance < 0 ? '-' : '') + Utils.formatCurrency(balance);
    document.getElementById('totalIncome').textContent = Utils.formatCurrency(income);
    document.getElementById('totalExpense').textContent = Utils.formatCurrency(expense);

    // Cập nhật ô "Ngân sách tháng" trên Trang chủ
    this.renderHomeBudget();

    // Thêm class nếu số dư âm
    const balanceEl = document.getElementById('totalBalance');
    if (balance < 0) {
      balanceEl.style.color = '#FF6B6B';
    } else {
      balanceEl.style.color = '';
    }
  },

  /**
   * Ô "Ngân sách tháng" trên Trang chủ:
   * hiển thị đã chi / hạn mức / còn lại + thanh tiến độ.
   * Trả lời trực tiếp câu hỏi "còn bao nhiêu ngân sách?".
   */
  renderHomeBudget() {
    const box = document.getElementById('homeBudgetBox');
    if (!box) return;

    if (typeof BudgetManager === 'undefined') return;
    const budgets = BudgetManager.getBudgets();
    const summary = Business.budgetSummary(budgets, Storage.getTransactions());

    const hasBudget = summary.totalLimit > 0;
    box.style.display = hasBudget ? '' : 'none';
    if (!hasBudget) return;

    const pct = Math.min(100, summary.percent);
    const fill = document.getElementById('homeBudgetFill');
    if (fill) {
      fill.style.width = pct + '%';
      fill.className = 'budget-summary__progress-fill ' +
        (summary.percent >= 100 ? 'budget-summary__progress-fill--danger'
          : summary.percent >= 80 ? 'budget-summary__progress-fill--warning'
            : 'budget-summary__progress-fill--safe');
    }

    const setText = (id, text) => {
      const el = document.getElementById(id);
      if (el) el.textContent = text;
    };
    setText('homeBudgetSpent', Utils.formatCurrency(summary.totalSpent));
    setText('homeBudgetLimit', Utils.formatCurrency(summary.totalLimit));
    setText('homeBudgetLeft', Utils.formatCurrency(summary.remaining));
    setText('homeBudgetPercent', summary.percent + '%');

    // Cảnh báo danh mục vượt hạn mức
    const warnBox = document.getElementById('homeBudgetWarning');
    if (warnBox) {
      const over = Object.keys(budgets).filter(catId => {
        const limit = Number(budgets[catId]) || 0;
        return limit > 0 && Business.spentByCategory(Business.filterThisMonth(Storage.getTransactions()), catId) > limit;
      });
      if (over.length > 0) {
        warnBox.style.display = '';
        warnBox.textContent = '⚠️ Vượt hạn mức: ' + over.map(c => {
          const cat = Categories.getById(c);
          return cat ? cat.name : c;
        }).join(', ');
      } else {
        warnBox.style.display = 'none';
      }
    }
  },

  /**
   * Mở modal thêm giao dịch
   */
  openAddModal() {
    this.editingId = null;
    FormManager.resetForm();
    FormManager.setTitle('Thêm giao dịch');
    FormManager.setSubmitText('Thêm giao dịch');
    FormManager.openModal();
  },

  /**
   * Mở modal sửa giao dịch
   * @param {string} id
   */
  openEditModal(id) {
    const transaction = Storage.getTransactionById(id);
    if (!transaction) return;

    this.editingId = id;
    FormManager.setTitle('Sửa giao dịch');
    FormManager.setSubmitText('Lưu thay đổi');
    FormManager.fillForm(transaction);
    FormManager.openModal();
  },

  /**
   * Xử lý submit form (thêm hoặc sửa)
   * @param {Object} data
   */
  handleSubmit(data) {
    // Kiểm tra ghi bền vững: nếu lưu thất bại thì báo rõ, không báo thành công giả
    const saved = this.editingId ? Storage.updateTransaction(this.editingId, data) : Storage.addTransaction(data);
    if (!saved) return false;

    if (this.editingId) {
      Toast.success('Đã cập nhật giao dịch!');
    } else {
      Toast.success('Đã thêm giao dịch mới!');
    }

    this.editingId = null;
    FormManager.closeModal();
    this.renderTransactions();
    this.updateSummary();

    // Cập nhật biểu đồ nếu đang ở Stats
    if (typeof ChartManager !== 'undefined' && typeof PageManager !== 'undefined' && PageManager.currentPage === 'pageStats') {
      ChartManager.renderAllCharts();
    }

    // Cập nhật ngân sách & kiểm tra cảnh báo vượt hạn mức
    if (typeof BudgetManager !== 'undefined') {
      if (data.type === 'expense') {
        BudgetManager.checkBudgetAlert(data.category, data.amount);
      }
      BudgetManager.renderBudgetList();
      BudgetManager.updateBudgetSummary();
    }
  },

  /**
   * Xác nhận xóa
   * @param {string} id
   */
  confirmDelete(id) {
    const transaction = Storage.getTransactionById(id);
    if (!transaction) return;

    ConfirmDialog.show({
      title: 'Xóa giao dịch?',
      message: `Bạn có chắc muốn xóa "${transaction.name}"? Hành động này không thể hoàn tác.`,
      confirmText: 'Xóa',
      onConfirm: () => {
        Storage.deleteTransaction(id);
        // Ghi nhận đã xóa để không bị ghi đè khi đồng bộ (tombstone)
        if (typeof SyncManager !== 'undefined') SyncManager.markDeleted(id);
        Toast.success('Đã xóa giao dịch!');
        this.renderTransactions();
        this.updateSummary();
        if (typeof ChartManager !== 'undefined' && typeof PageManager !== 'undefined' && PageManager.currentPage === 'pageStats') {
          ChartManager.renderAllCharts();
        }
        if (typeof BudgetManager !== 'undefined') {
          BudgetManager.renderBudgetList();
          BudgetManager.updateBudgetSummary();
        }
      }
    });
  },

  /**
   * Escape HTML (dùng chung Utils.escapeHtml — không tin dữ liệu)
   */
  escapeHtml(text) {
    return Utils.escapeHtml(text);
  }
};
