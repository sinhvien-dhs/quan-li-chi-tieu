/**
 * budget.js — Quản lý ngân sách chi tiêu theo danh mục
 */

const BudgetManager = {
  STORAGE_KEY: 'spendwise_budgets',
  UPDATED_AT_KEY: 'spendwise_budgets_updated_at',

  // Ngân sách mặc định mẫu (VNĐ)
  defaultBudgets: {
    food: 2000000,
    transport: 500000,
    shopping: 1000000,
    entertainment: 500000,
    education: 500000,
    health: 300000,
    bills: 800000,
    other_expense: 300000
  },

  /**
   * Khởi tạo
   */
  init() {
    this.ensureDefaultBudgets();
    this.bindEvents();
  },

  /**
   * Khởi tạo ngân sách nếu chưa có
   */
  ensureDefaultBudgets() {
    const existing = Storage.get(this.STORAGE_KEY);
    if (!existing) {
      Storage.set(this.STORAGE_KEY, this.defaultBudgets);
    }
  },

  /**
   * Lấy danh sách ngân sách
   * @returns {Object} { categoryId: amount }
   */
  getBudgets() {
    return Storage.get(this.STORAGE_KEY, this.defaultBudgets);
  },

  /**
   * Thời điểm cập nhật ngân sách gần nhất (dùng cho quy tắc hợp nhất
   * "thay đổi mới nhất thắng" thay vì "số lớn hơn thắng")
   */
  getBudgetsUpdatedAt() {
    return Storage.get(this.UPDATED_AT_KEY, null);
  },

  /**
   * Lưu ngân sách cho một danh mục
   * @param {string} categoryId
   * @param {number} amount
   */
  setBudget(categoryId, amount) {
    const budgets = this.getBudgets();
    budgets[categoryId] = amount;
    Storage.set(this.STORAGE_KEY, budgets);
    Storage.set(this.UPDATED_AT_KEY, new Date().toISOString());
    this.renderBudgetList();
    this.updateBudgetSummary();
    if (typeof TransactionManager !== 'undefined') TransactionManager.renderHomeBudget();
  },

  /**
   * Tính số tiền đã chi trong tháng hiện tại cho một danh mục
   * @param {string} categoryId
   * @returns {number}
   */
  getSpentThisMonth(categoryId) {
    // Dùng lớp nghiệp vụ dùng chung để khớp với Trang chủ & Thống kê
    const monthTx = Business.filterThisMonth(Storage.getTransactions());
    return Business.spentByCategory(monthTx, categoryId);
  },

  /**
   * Kiểm tra cảnh báo ngân sách khi thêm mới hoặc sửa giao dịch
   * @param {string} categoryId
   * @param {number} addedAmount
   */
  checkBudgetAlert(categoryId, addedAmount = 0) {
    const budgets = this.getBudgets();
    const budget = budgets[categoryId];
    if (!budget || budget <= 0) return;

    const spent = this.getSpentThisMonth(categoryId);
    const cat = Categories.getById(categoryId);
    const catName = cat ? cat.name : 'Danh mục';

    const pct = Math.round((spent / budget) * 100);

    if (pct >= 100) {
      Toast.warning(`⚠️ Cảnh báo: Đã vượt ngân sách ${catName} (${pct}%)!`);
    } else if (pct >= 85) {
      Toast.warning(`⚠️ Chú ý: Đã dùng ${pct}% ngân sách ${catName}!`);
    }
  },

  /**
   * Gán sự kiện
   */
  bindEvents() {
    // Modal sửa ngân sách
    const modal = document.getElementById('budgetModal');
    const closeBtn = document.getElementById('budgetModalClose');
    const form = document.getElementById('budgetForm');

    if (closeBtn) {
      closeBtn.addEventListener('click', () => this.closeModal());
    }

    if (modal) {
      modal.addEventListener('click', (e) => {
        if (e.target === modal) this.closeModal();
      });
    }

    if (form) {
      form.addEventListener('submit', (e) => {
        e.preventDefault();
        const catId = document.getElementById('budgetCategorySelect').value;
        const amount = parseInt(document.getElementById('budgetAmountInput').value) || 0;
        if (amount <= 0) {
          Toast.error('Vui lòng nhập mức ngân sách hợp lệ!');
          return;
        }
        this.setBudget(catId, amount);
        this.closeModal();
        Toast.success('Đã cập nhật ngân sách thành công!');
      });
    }

    // Nút mở modal thiết lập ngân sách
    const openBtn = document.getElementById('btnOpenBudgetModal');
    if (openBtn) {
      openBtn.addEventListener('click', () => this.openModal());
    }
  },

  /**
   * Mở modal chỉnh ngân sách
   * @param {string|null} preselectCategory
   */
  openModal(preselectCategory = null) {
    const modal = document.getElementById('budgetModal');
    const select = document.getElementById('budgetCategorySelect');
    const input = document.getElementById('budgetAmountInput');

    // Điền options danh mục chi
    select.innerHTML = Categories.expense.map(c => `
      <option value="${c.id}">${c.name}</option>
    `).join('');

    const targetCat = preselectCategory || Categories.expense[0].id;
    select.value = targetCat;

    const budgets = this.getBudgets();
    input.value = budgets[targetCat] || 500000;

    select.onchange = () => {
      input.value = budgets[select.value] || 500000;
    };

    modal.classList.add('active');
    document.body.style.overflow = 'hidden';
  },

  closeModal() {
    const modal = document.getElementById('budgetModal');
    if (modal) {
      modal.classList.remove('active');
      document.body.style.overflow = '';
    }
  },

  /**
   * Render danh sách tiến độ ngân sách từng danh mục
   */
  renderBudgetList() {
    const container = document.getElementById('budgetList');
    if (!container) return;

    const budgets = this.getBudgets();
    const categories = Categories.expense;

    container.innerHTML = categories.map(cat => {
      const budget = budgets[cat.id] || 0;
      const spent = this.getSpentThisMonth(cat.id);
      const remaining = budget - spent;
      const pct = budget > 0 ? Math.min(Math.round((spent / budget) * 100), 100) : 0;
      const rawPct = budget > 0 ? ((spent / budget) * 100).toFixed(0) : 0;

      // Màu sắc theo tỷ lệ chi tiêu
      let statusClass = 'safe'; // < 80%
      let statusText = 'Ổn định';
      if (rawPct >= 100) {
        statusClass = 'danger'; // >= 100%
        statusText = 'Vượt hạn mức';
      } else if (rawPct >= 80) {
        statusClass = 'warning'; // 80 - 99%
        statusText = 'Sắp chạm hạn mức';
      }

      return `
        <div class="budget-item budget-item--${statusClass}" data-category="${cat.id}">
          <div class="budget-item__top">
            <div class="budget-item__category">
              <span class="budget-item__icon" style="background: ${cat.bg}; color: ${cat.color}">
                <i class="fa-solid ${cat.icon}"></i>
              </span>
              <div>
                <span class="budget-item__name">${cat.name}</span>
                <span class="budget-item__badge budget-item__badge--${statusClass}">${statusText}</span>
              </div>
            </div>
            <button class="budget-item__edit-btn" onclick="BudgetManager.openModal('${cat.id}')" title="Sửa hạn mức">
              <i class="fa-solid fa-pen-to-square"></i>
            </button>
          </div>

          <div class="budget-item__amounts">
            <div>
              <span class="budget-item__label">Đã chi:</span>
              <strong class="budget-item__spent">${Utils.formatCurrency(spent)}</strong>
            </div>
            <div class="text-right">
              <span class="budget-item__label">Hạn mức:</span>
              <strong class="budget-item__limit">${Utils.formatCurrency(budget)}</strong>
            </div>
          </div>

          <div class="budget-item__progress-bar">
            <div class="budget-item__progress-fill budget-item__progress-fill--${statusClass}" style="width: ${pct}%"></div>
          </div>

          <div class="budget-item__footer">
            <span>${rawPct}% đã dùng</span>
            <span>${remaining >= 0 ? `Còn lại: ${Utils.formatCurrency(remaining)}` : `Vượt: ${Utils.formatCurrency(Math.abs(remaining))}`}</span>
          </div>
        </div>
      `;
    }).join('');
  },

  /**
   * Cập nhật thẻ tổng quan ngân sách tháng
   */
  updateBudgetSummary() {
    const budgets = this.getBudgets();
    const totalBudget = Object.values(budgets).reduce((sum, v) => sum + (Number(v) || 0), 0);
    const totalSpent = this.getSpentThisMonth(null);
    const remaining = totalBudget - totalSpent;
    const pct = totalBudget > 0 ? Math.min(Math.round((totalSpent / totalBudget) * 100), 100) : 0;
    const rawPct = totalBudget > 0 ? ((totalSpent / totalBudget) * 100).toFixed(0) : 0;

    const totalBudgetEl = document.getElementById('budgetTotalLimit');
    const totalSpentEl = document.getElementById('budgetTotalSpent');
    const remainingEl = document.getElementById('budgetTotalRemaining');
    const overallBar = document.getElementById('budgetOverallProgress');
    const overallPct = document.getElementById('budgetOverallPercent');

    if (totalBudgetEl) totalBudgetEl.textContent = Utils.formatCurrency(totalBudget);
    if (totalSpentEl) totalSpentEl.textContent = Utils.formatCurrency(totalSpent);
    if (remainingEl) {
      remainingEl.textContent = Utils.formatCurrency(remaining);
      remainingEl.style.color = remaining < 0 ? 'var(--danger)' : 'var(--success)';
    }
    if (overallBar) {
      overallBar.style.width = `${pct}%`;
      overallBar.className = `budget-summary__progress-fill budget-summary__progress-fill--${rawPct >= 100 ? 'danger' : rawPct >= 80 ? 'warning' : 'safe'}`;
    }
    if (overallPct) {
      overallPct.textContent = `${rawPct}%`;
    }
  }
};
