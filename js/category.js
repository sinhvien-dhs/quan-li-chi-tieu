/**
 * category.js — Quản lý danh mục chi tiêu
 */

const Categories = {
  // Danh mục chi (expense)
  expense: [
    { id: 'food',         name: 'Ăn uống',     icon: 'fa-utensils',        color: '#FF6B6B', bg: '#FFE8E8' },
    { id: 'transport',    name: 'Di chuyển',    icon: 'fa-motorcycle',      color: '#4ECDC4', bg: '#E0F9F6' },
    { id: 'shopping',     name: 'Mua sắm',      icon: 'fa-bag-shopping',    color: '#FF85A2', bg: '#FFE4EC' },
    { id: 'entertainment',name: 'Giải trí',     icon: 'fa-gamepad',         color: '#A78BFA', bg: '#EDE9FE' },
    { id: 'education',    name: 'Học tập',      icon: 'fa-graduation-cap',  color: '#60A5FA', bg: '#DBEAFE' },
    { id: 'health',       name: 'Sức khỏe',     icon: 'fa-heart-pulse',     color: '#F472B6', bg: '#FCE7F3' },
    { id: 'bills',        name: 'Hóa đơn',      icon: 'fa-file-invoice',    color: '#FBBF24', bg: '#FEF3C7' },
    { id: 'other_expense',name: 'Khác',         icon: 'fa-ellipsis',        color: '#94A3B8', bg: '#F1F5F9' }
  ],

  // Danh mục thu (income)
  income: [
    { id: 'salary',       name: 'Lương',        icon: 'fa-wallet',          color: '#00C897', bg: '#E6FAF4' },
    { id: 'freelance',    name: 'Freelance',    icon: 'fa-laptop-code',     color: '#6C63FF', bg: '#EDEBFF' },
    { id: 'gift',         name: 'Quà tặng',     icon: 'fa-gift',            color: '#FF85A2', bg: '#FFE4EC' },
    { id: 'investment',   name: 'Đầu tư',       icon: 'fa-chart-line',      color: '#FBBF24', bg: '#FEF3C7' },
    { id: 'scholarship',  name: 'Học bổng',     icon: 'fa-award',           color: '#60A5FA', bg: '#DBEAFE' },
    { id: 'other_income', name: 'Khác',         icon: 'fa-ellipsis',        color: '#94A3B8', bg: '#F1F5F9' }
  ],

  /**
   * Lấy danh mục theo type
   * @param {string} type - 'income' | 'expense'
   * @returns {Array}
   */
  getByType(type) {
    return this[type] || this.expense;
  },

  /**
   * Tìm danh mục theo ID
   * @param {string} id
   * @returns {Object|null}
   */
  getById(id) {
    const all = [...this.expense, ...this.income];
    return all.find(c => c.id === id) || null;
  },

  /**
   * Render HTML cho category button trong form
   * @param {string} type
   * @returns {string}
   */
  renderCategoryButtons(type) {
    const categories = this.getByType(type);
    return categories.map(cat => `
      <button type="button" class="form__category-btn" data-category="${cat.id}">
        <span class="form__category-icon" style="color: ${cat.color}">
          <i class="fa-solid ${cat.icon}"></i>
        </span>
        <span class="form__category-name">${cat.name}</span>
      </button>
    `).join('');
  }
};
