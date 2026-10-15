/**
 * budget.js — Quản lý ngân sách chi tiêu theo danh mục
 */

const BudgetManager = {
  STORAGE_KEY: 'spendwise_budgets',
  UPDATED_AT_KEY: 'spendwise_budgets_updated_at',
  ALERTED_KEY: 'spendwise_budget_alerted',

  /**
   * NGƯỠNG CẢNH BÁO — dùng chung một quy tắc cho cả hiển thị lẫn thông báo.
   * Trước đây phần hiển thị dùng 80% còn phần Toast dùng 85% → người dùng
   * thấy trạng thái "Sắp chạm hạn mức" nhưng không nhận được cảnh báo nào.
   */
  THRESHOLD_WARN: 80,   // từ 80% trở lên → "Sắp chạm hạn mức"
  THRESHOLD_OVER: 100,  // từ 100% trở lên → "Vượt hạn mức"

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
    // Luon luon luu so (nguyen don) — tránh luu chuoi nhu "3tr"
    budgets[categoryId] = Math.round(Number(amount) || 0);
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
    // categoryId = null => tổng toàn bộ chi tiêu trong tháng
    return categoryId
      ? Business.spentByCategory(monthTx, categoryId)
      : Business.totalExpense(monthTx);
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
    const level = pct >= this.THRESHOLD_OVER ? 'over' : (pct >= this.THRESHOLD_WARN ? 'warn' : null);
    if (!level) return;

    // Chỉ báo MỘT lần cho mỗi mức trong mỗi kỳ tháng → không spam khi mở lại trang
    const monthKey = Utils.getToday().slice(0, 7); // YYYY-MM
    const alerted = Storage.get(this.ALERTED_KEY, {}) || {};
    const key = categoryId + ':' + monthKey + ':' + level;
    if (alerted[key]) return;
    alerted[key] = true;
    Storage.set(this.ALERTED_KEY, alerted);

    if (level === 'over') {
      Toast.warning(`⚠️ Cảnh báo: Đã vượt ngân sách ${catName} (${pct}%)!`);
    } else {
      Toast.warning(`⚠️ Chú ý: Đã dùng ${pct}% ngân sách ${catName} — còn ${Utils.formatCurrency(Math.max(0, budget - spent))}.`);
    }
  },

  /** Xoá cờ "đã cảnh báo" khi hạn mức thay đổi (để tháng sau/đơn mới vẫn báo lại) */
  resetAlerts() {
    Storage.set(this.ALERTED_KEY, {});
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
        // Dùng chung bộ phân tích số tiền: nhận 2000000, 2.000.000 hoặc 2tr
        const amount = Business.parseAmount(document.getElementById('budgetAmountInput').value);
        if (amount === null) {
          Toast.error('Vui lòng nhập mức ngân sách hợp lệ (VD: 2000000 hoặc 2tr)!');
          return;
        }
        this.setBudget(catId, amount);
        this.resetAlerts();   // đổi hạn mức thì cho phép cảnh báo lại
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

      // Màu sắc theo tỷ lệ chi tiêu — dùng CHUNG ngưỡng với cảnh báo
      const rawPct = budget > 0 ? ((spent / budget) * 100).toFixed(0) : 0;

      let statusClass = 'safe'; // < 80%
      let statusText = 'Ổn định';
      if (rawPct >= this.THRESHOLD_OVER) {
        statusClass = 'danger'; // >= 100%
        statusText = 'Vượt hạn mức';
      } else if (rawPct >= this.THRESHOLD_WARN) {
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
    // Dùng chung lớp nghiệp vụ để số liệu luôn khớp với Trang chủ
    const summary = Business.budgetSummary(budgets, Storage.getTransactions());
    const totalBudget = summary.totalLimit;
    const totalSpent = summary.totalSpent;
    const remaining = summary.remaining;
    const pct = summary.percent;
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
      remainingEl.style.color = remaining < 0 ? 'var(--danger-text)' : 'var(--success-text)';
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
