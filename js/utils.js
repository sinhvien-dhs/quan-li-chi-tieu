/**
 * utils.js — Hàm tiện ích dùng chung
 */

const Utils = {
  /**
   * Escape HTML — dùng mọi khi chèn dữ liệu người dùng vào innerHTML
   * @param {*} value
   * @returns {string}
   */
  escapeHtml(value) {
    if (value === null || value === undefined) return '';
    return String(value)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  },

  /**
   * Escape thuộc tính (dùng trong data-*, title=...)
   */
  escapeAttr(value) {
    return Utils.escapeHtml(value);
  },

  /**
   * Làm sạch chuỗi để tránh chèn kịch bản (dùng khi render textContent)
   */
  sanitizeText(value, maxLength = 200) {
    return String(value ?? '')
      .replace(/[<>]/g, '')
      .slice(0, maxLength);
  },
  /**
   * Format số tiền theo kiểu Việt Nam
   * @param {number} amount
   * @returns {string} VD: "1.500.000đ"
   */
  /**
   * Định dạng số tiền.
   * amount luôn là số tiền gốc bằng VNĐ; hàm này chỉ quy đổi để HIỂN THỊ
   * theo đơn vị tiền tệ người dùng chọn (không sửa dữ liệu gốc).
   */
  formatCurrency(amount) {
    const absVnd = Math.abs(amount);
    const code = (typeof Storage !== 'undefined' && Storage.get) ? Storage.get('spendwise_currency', 'VND') : 'VND';
    const curr = (typeof Features !== 'undefined' && Features.CURRENCIES[code]) || { symbol: 'đ', rate: 1, locale: 'vi-VN' };

    if (code === 'VND') {
      return `${absVnd.toLocaleString('vi-VN')}đ`;
    }
    const converted = absVnd / curr.rate;
    return `${converted.toLocaleString(curr.locale, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ${curr.symbol}`;
  },

  /**
   * Format số tiền có dấu +/- 
   * @param {number} amount
   * @param {string} type - 'income' | 'expense'
   * @returns {string} VD: "+1.500.000đ" hoặc "-500.000đ"
   */
  /**
   * Định dạng số nguyên theo kiểu Việt Nam (dấu chấm phân cách nghìn)
   * VD: 2000000 → "2.000.000" (dùng cho ô nhập số tiền)
   */
  formatNumber(amount) {
    const n = Math.round(Number(amount) || 0);
    return n.toLocaleString('vi-VN');
  },

  /**
   * Format số tiền có dấu +/-
   */
  formatCurrencyWithSign(amount, type) {
    const sign = type === 'income' ? '+' : '-';
    return `${sign}${this.formatCurrency(amount)}`;
  },

  /**
   * Format ngày tháng
   * @param {string} dateStr - ISO date string
   * @returns {string} VD: "04/10/2026"
   */
  formatDate(dateStr) {
    const date = new Date(dateStr);
    const day = String(date.getDate()).padStart(2, '0');
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const year = date.getFullYear();
    return `${day}/${month}/${year}`;
  },

  /**
   * Format ngày thân thiện 
   * @param {string} dateStr
   * @returns {string} VD: "Hôm nay", "Hôm qua", "04/10"
   */
  formatDateFriendly(dateStr) {
    const date = new Date(dateStr);
    const today = new Date();
    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);

    const isSameDay = (d1, d2) =>
      d1.getDate() === d2.getDate() &&
      d1.getMonth() === d2.getMonth() &&
      d1.getFullYear() === d2.getFullYear();

    if (isSameDay(date, today)) return 'Hôm nay';
    if (isSameDay(date, yesterday)) return 'Hôm qua';

    const day = String(date.getDate()).padStart(2, '0');
    const month = String(date.getMonth() + 1).padStart(2, '0');
    return `${day}/${month}`;
  },

  /**
   * Tạo ID duy nhất
   * @returns {string}
   */
  generateId() {
    return Date.now().toString(36) + Math.random().toString(36).substr(2, 9);
  },

  /**
   * Lấy ngày hôm nay (YYYY-MM-DD)
   * @returns {string}
   */
  getToday() {
    const d = new Date();
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  },

  /**
   * Format số tiền rút gọn (1.5tr, 500k)
   * @param {number} amount
   * @returns {string}
   */
  formatCurrencyShort(amount) {
    const abs = Math.abs(amount);
    if (abs >= 1000000000) {
      return (abs / 1000000000).toFixed(1).replace('.0', '') + ' tỷ';
    }
    if (abs >= 1000000) {
      return (abs / 1000000).toFixed(1).replace('.0', '') + ' tr';
    }
    if (abs >= 1000) {
      return (abs / 1000).toFixed(0) + 'k';
    }
    return abs.toString() + 'đ';
  }
};
