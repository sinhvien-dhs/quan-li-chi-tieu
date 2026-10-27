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
      // Báo rõ cho người dùng thay vì báo "thành công" giả
      const isQuota = e && (e.name === 'QuotaExceededError' || e.code === 22 || e.code === 1014);
      if (typeof Toast !== 'undefined') {
        Toast.error(isQuota
          ? 'Bộ nhớ trình duyệt đã đầy — không thể lưu thêm. Hãy xóa ảnh hóa đơn cũ hoặc sao lưu rồi dọn dữ liệu.'
          : 'Không lưu được dữ liệu trên máy này. Hãy kiểm tra cài đặt trình duyệt.');
      }
      this.lastSaveFailed = true;
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
    if (key === this.KEYS.TRANSACTIONS) this._txCache = null;
    localStorage.removeItem(key);
  },

  // ===== Transaction Methods =====
  _txCache: null,

  invalidateTxCache() {
    this._txCache = null;
  },

  /**
   * Lấy tất cả giao dịch (có bộ nhớ đệm in-memory, tránh parse JSON và sanitize lặp đi lặp lại)
   * @returns {Array}
   */
  getTransactions() {
    if (this._txCache !== null) {
      return this._txCache.slice();
    }
    const list = this.get(this.KEYS.TRANSACTIONS, []);
    if (!Array.isArray(list)) {
      this._txCache = [];
      return [];
    }
    let sanitized = list;
    if (typeof ExportManager !== 'undefined' && typeof ExportManager.sanitizeTransactions === 'function') {
      sanitized = ExportManager.sanitizeTransactions(list);
    } else {
      sanitized = list.filter(t => t && typeof t === 'object');
    }
    this._txCache = sanitized;
    return this._txCache.slice();
  },

  /**
   * Lưu danh sách giao dịch
   * @param {Array} transactions
   */
  saveTransactions(transactions) {
    this._txCache = Array.isArray(transactions) ? transactions.slice() : null;
    return this.set(this.KEYS.TRANSACTIONS, transactions);
  },

  /**
   * Thêm giao dịch mới
   * @param {Object} transaction
   * @returns {Object|null} giao dịch đã thêm, hoặc null nếu KHÔNG lưu được
   *   (bộ nhớ đầy / bị chặn). Trả null để phía gọi KHÔNG báo "thành công" giả.
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

    if (!this.saveTransactions(transactions)) {
      // Hoàn tác thay đổi trong bộ nhớ để không có "bóng ma" giao dịch
      transactions.shift();
      return null;
    }
    return newTransaction;
  },

  /**
   * Cập nhật giao dịch
   * @param {string} id
   * @param {Object} updates
   * @returns {Object|null} null nếu không tìm thấy hoặc lưu thất bại
   */
  updateTransaction(id, updates) {
    const transactions = this.getTransactions();
    const index = transactions.findIndex(t => t.id === id);
    if (index === -1) return null;

    const backup = transactions[index];
    transactions[index] = {
      ...transactions[index],
      ...updates,
      syncState: 'pending',
      updatedAt: new Date().toISOString()
    };

    if (!this.saveTransactions(transactions)) {
      transactions[index] = backup;
      return null;
    }
    return transactions[index];
  },

  /**
   * Xóa giao dịch
   * @param {string} id
   * @returns {boolean} true nếu đã xóa và lưu được; false nếu không tồn tại hoặc lưu hỏng
   */
  deleteTransaction(id) {
    const transactions = this.getTransactions();
    const filtered = transactions.filter(t => t.id !== id);
    if (filtered.length === transactions.length) return false;
    if (!this.saveTransactions(filtered)) return false;
    if (typeof SyncManager !== 'undefined') SyncManager.markDeleted(id);
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
