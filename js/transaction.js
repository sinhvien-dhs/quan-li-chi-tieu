/**
 * transaction.js — Quản lý hiển thị & CRUD giao dịch
 */

const TransactionManager = {
  currentFilter: 'all', // 'all' | 'income' | 'expense'
  editingId: null,       // ID giao dịch đang sửa

  /**
   * Khởi tạo
   */
  init() {
    this.renderTransactions();
    this.updateSummary();
    this.bindFilterEvents();
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

    // Sắp xếp theo ngày mới nhất
    transactions.sort((a, b) => new Date(b.date) - new Date(a.date));

    return transactions;
  },

  /**
   * Render danh sách giao dịch
   */
  renderTransactions() {
    const container = document.getElementById('transactionList');
    const transactions = this.getFilteredTransactions();

    if (transactions.length === 0) {
      container.innerHTML = `
        <div class="transaction-empty">
          <i class="fa-regular fa-receipt"></i>
          <p>Chưa có giao dịch nào</p>
          <p>Nhấn nút <strong>+</strong> để thêm giao dịch đầu tiên</p>
        </div>
      `;
      return;
    }

    container.innerHTML = transactions.map(t => this.renderTransactionItem(t)).join('');
    this.bindTransactionEvents();
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
      <div class="transaction-item transaction-item--${t.type === 'income' ? 'income' : 'expense'}" data-id="${safeId}">
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
                  data-action="edit" data-id="${safeId}" title="Sửa">
            <i class="fa-solid fa-pen"></i>
          </button>
          <button class="transaction-item__action-btn transaction-item__action-btn--delete"
                  data-action="delete" data-id="${safeId}" title="Xóa">
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
  },

  /**
   * Cập nhật thẻ tổng hợp (số dư, thu, chi)
   */
  updateSummary() {
    const transactions = Storage.getTransactions();

    let totalIncome = 0;
    let totalExpense = 0;

    transactions.forEach(t => {
      if (t.type === 'income') {
        totalIncome += t.amount;
      } else {
        totalExpense += t.amount;
      }
    });

    const balance = totalIncome - totalExpense;

    document.getElementById('totalBalance').textContent = (balance < 0 ? '-' : '') + Utils.formatCurrency(balance);
    document.getElementById('totalIncome').textContent = Utils.formatCurrency(totalIncome);
    document.getElementById('totalExpense').textContent = Utils.formatCurrency(totalExpense);

    // Thêm class nếu số dư âm
    const balanceEl = document.getElementById('totalBalance');
    if (balance < 0) {
      balanceEl.style.color = '#FF6B6B';
    } else {
      balanceEl.style.color = '';
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
    if (this.editingId) {
      // Sửa
      Storage.updateTransaction(this.editingId, data);
      Toast.success('Đã cập nhật giao dịch!');
    } else {
      // Thêm
      Storage.addTransaction(data);
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
