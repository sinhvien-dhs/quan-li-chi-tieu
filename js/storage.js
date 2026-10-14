/**
 * storage.js — Xử lý localStorage
 */

const Storage = {
  KEYS: {
    TRANSACTIONS: 'spendwise_transactions',
    THEME: 'spendwise_theme',
    SETTINGS: 'spendwise_settings'
  },

  /**
   * Lưu dữ liệu vào localStorage
   */
  set(key, data) {
    try {
      localStorage.setItem(key, JSON.stringify(data));
      return true;
    } catch (e) {
      console.error('Lỗi lưu dữ liệu:', e);
      return false;
    }
  },

  /**
   * Đọc dữ liệu từ localStorage
   */
  get(key, defaultValue = null) {
    try {
      const data = localStorage.getItem(key);
      return data ? JSON.parse(data) : defaultValue;
    } catch (e) {
      console.error('Lỗi đọc dữ liệu:', e);
      return defaultValue;
    }
  },

  /**
   * Xóa dữ liệu
   */
  remove(key) {
    localStorage.removeItem(key);
  },

  // ===== Transaction Methods =====

  /**
   * Lấy tất cả giao dịch
   * @returns {Array}
   */
  getTransactions() {
    const list = this.get(this.KEYS.TRANSACTIONS, []);
    // Không coi dữ liệu cục bộ là đáng tin cậy — kiểm tra trước khi dùng
    if (!Array.isArray(list)) return [];
    if (typeof ExportManager !== 'undefined' && typeof ExportManager.sanitizeTransactions === 'function') {
      return ExportManager.sanitizeTransactions(list);
    }
    return list.filter(t => t && typeof t === 'object');
  },

  /**
   * Lưu danh sách giao dịch
   * @param {Array} transactions
   */
  saveTransactions(transactions) {
    return this.set(this.KEYS.TRANSACTIONS, transactions);
  },

  /**
   * Thêm giao dịch mới
   * @param {Object} transaction
   * @returns {Object} transaction đã thêm (có id)
   */
  addTransaction(transaction) {
    const transactions = this.getTransactions();
    const newTransaction = {
      id: Utils.generateId(),
      ...transaction,
      // Trạng thái đồng bộ: pending → synced sau khi push thành công
      syncState: 'pending',
      createdAt: new Date().toISOString()
    };
    transactions.unshift(newTransaction);
    this.saveTransactions(transactions);
    return newTransaction;
  },

  /**
   * Cập nhật giao dịch
   * @param {string} id
   * @param {Object} updates
   * @returns {Object|null}
   */
  updateTransaction(id, updates) {
    const transactions = this.getTransactions();
    const index = transactions.findIndex(t => t.id === id);
    if (index === -1) return null;

    transactions[index] = {
      ...transactions[index],
      ...updates,
      syncState: 'pending',
      updatedAt: new Date().toISOString()
    };
    this.saveTransactions(transactions);
    return transactions[index];
  },

  /**
   * Xóa giao dịch
   * @param {string} id
   * @returns {boolean}
   */
  deleteTransaction(id) {
    const transactions = this.getTransactions();
    const filtered = transactions.filter(t => t.id !== id);
    if (filtered.length === transactions.length) return false;
    this.saveTransactions(filtered);
    return true;
  },

  /**
   * Lấy giao dịch theo ID
   * @param {string} id
   * @returns {Object|null}
   */
  getTransactionById(id) {
    const transactions = this.getTransactions();
    return transactions.find(t => t.id === id) || null;
  },

  // ===== Theme =====

  getTheme() {
    return this.get(this.KEYS.THEME, 'light');
  },

  setTheme(theme) {
    this.set(this.KEYS.THEME, theme);
  }
};
