/**
 * business.js — Lớp nghiệp vụ dùng chung
 *
 * Mọi công thức tiền (số dư, tổng thu/chi, mức dùng ngân sách, tiến độ tiết
 * kiệm, thống kê) đều tính ở ĐÂY DUY NHẤT, để các màn hình không tự tính
 * lại dẫn tới khác biệt số liệu giữa Trang chủ / Thống kê / Ngân sách / Báo cáo.
 *
 * Nguyên tắc:
 *  - Số tiền luôn là số nguyên đồng (VNĐ), không dùng số thực để cộng/trừ.
 *  - Không sửa dữ liệu gốc khi đổi đơn vị hiển thị.
 */

const Business = {
  /** Tổng thu trong một mảng giao dịch */
  totalIncome(transactions) {
    if (!Array.isArray(transactions)) return 0;
    return transactions
      .filter(t => t && t.type === 'income' && Number.isFinite(t.amount))
      .reduce((s, t) => s + Math.round(t.amount), 0);
  },

  /** Tổng chi trong một mảng giao dịch */
  totalExpense(transactions) {
    if (!Array.isArray(transactions)) return 0;
    return transactions
      .filter(t => t && t.type === 'expense' && Number.isFinite(t.amount))
      .reduce((s, t) => s + Math.round(t.amount), 0);
  },

  /** Số dư = thu − chi (duy nhất một nơi định nghĩa) */
  balance(transactions) {
    return Business.totalIncome(transactions) - Business.totalExpense(transactions);
  },

  /** Lọc giao dịch theo khoảng thời gian [from, to] (chuỗi YYYY-MM-DD) */
  filterByDate(transactions, fromDate, toDate) {
    if (!Array.isArray(transactions)) return [];
    return transactions.filter(t => {
      if (!t || !t.date) return false;
      if (fromDate && t.date < fromDate) return false;
      if (toDate && t.date > toDate) return false;
      return true;
    });
  },

  /** Lọc theo tháng hiện tại (YYYY-MM của now) */
  filterThisMonth(transactions, now = new Date()) {
    const prefix = now.toISOString().slice(0, 7);
    return (transactions || []).filter(t => t && typeof t.date === 'string' && t.date.startsWith(prefix));
  },

  /** Số ngày còn lại của tháng (kể cả hôm nay) */
  daysLeftInMonth(now = new Date()) {
    const last = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
    return last - now.getDate() + 1;
  },

  /**
   * Ngân sách: tổng hạn mức, đã chi, còn lại, % đã dùng
   * @param {Object} budgets  {categoryId: limit}
   * @param {Array} transactions
   * @param {String} monthPrefix ví dụ '2026-10'
   */
  budgetSummary(budgets, transactions, monthPrefix = null) {
    const limits = budgets || {};
    const list = Array.isArray(transactions) ? transactions : [];
    const tx = monthPrefix
      ? list.filter(t => t && typeof t.date === 'string' && t.date.startsWith(monthPrefix))
      : Business.filterThisMonth(list);

    let totalLimit = 0;
    let totalSpent = 0;

    Object.keys(limits).forEach(catId => {
      const limit = Number(limits[catId]) || 0;
      totalLimit += limit;
      totalSpent += Business.spentByCategory(tx, catId);
    });

    const remaining = totalLimit - totalSpent;
    const percent = totalLimit > 0 ? Math.round((totalSpent / totalLimit) * 100) : 0;

    return {
      totalLimit,
      totalSpent,
      remaining,
      percent,
      isOver: totalSpent > totalLimit && totalLimit > 0
    };
  },

  /** Đã chi theo 1 danh mục */
  spentByCategory(transactions, categoryId) {
    if (!Array.isArray(transactions)) return 0;
    return transactions
      .filter(t => t && t.type === 'expense' && t.category === categoryId && Number.isFinite(t.amount))
      .reduce((s, t) => s + Math.round(t.amount), 0);
  },

  /**
   * Dự phóng mức chi cuối tháng theo nhịp chi hiện tại
   * (chỉ mang tính tham khảo, không thay số liệu thật)
   */
  projectMonthExpense(transactions, now = new Date()) {
    const spent = Business.totalExpense(Business.filterThisMonth(transactions, now));
    const days = now.getDate();
    if (days <= 0) return 0;
    return Math.round((spent / days) * new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate());
  },

  /** Tiến độ tiết kiệm của một mục tiêu */
  goalProgress(goal) {
    if (!goal) return { percent: 0, remaining: 0 };
    const target = Number(goal.target) || 0;
    const saved = Number(goal.saved) || 0;
    const percent = target > 0 ? Math.min(100, Math.round((saved / target) * 100)) : 0;
    return {
      percent,
      remaining: Math.max(0, target - saved),
      completed: target > 0 && saved >= target
    };
  },

  /** Chia tiền chính xác: phần nguyên + phần dư (tổng luôn bằng tổng hóa đơn) */
  splitBill(total, people) {
    const t = Math.max(0, Math.round(Number(total) || 0));
    const n = Math.max(1, Math.round(Number(people) || 1));
    const base = Math.floor(t / n);
    const remainder = t - base * n;
    return {
      base,
      remainder,
      amounts: Array.from({ length: n }, (_, i) => base + (i < remainder ? 1 : 0))
    };
  },

  /** Số dư theo từng ví (ví là nhãn phân loại, không cộng vào tổng) */
  balanceByWallet(transactions, wallets) {
    const result = (wallets || []).map(w => ({
      id: w.id,
      name: w.name,
      income: 0,
      expense: 0,
      balance: 0
    }));
    const map = new Map(result.map(r => [r.id, r]));

    (transactions || []).forEach(t => {
      if (!t || !t.wallet) return;
      const row = map.get(t.wallet);
      if (!row) return;
      const amt = Math.round(Number(t.amount) || 0);
      if (t.type === 'income') { row.income += amt; row.balance += amt; }
      else { row.expense += amt; row.balance -= amt; }
    });

    return result;
  },

  /** Chuẩn hóa số tiền người dùng nhập → trả về số nguyên hợp lệ hoặc null */
  parseAmount(input) {
    if (input === null || input === undefined) return null;
    const raw = String(input).replace(/\s/g, '').replace(/,/g, '');
    if (raw === '' || !/^\d+(\.\d{1,2})?$/.test(raw)) return null;
    const n = Number(raw);
    if (!Number.isFinite(n) || n <= 0 || n > 1e12) return null;
    return Math.round(n);
  },

  /** Kiểm tra ngày hợp lệ (không phụ thuộc múi giờ) */
  isValidDate(str) {
    if (typeof str !== 'string') return false;
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(str.trim());
    if (!m) return false;
    const year = +m[1], month = +m[2], day = +m[3];
    if (month < 1 || month > 12 || day < 1) return false;
    const daysInMonth = new Date(Date.UTC(year, month, 0)).getUTCDate();
    return day <= daysInMonth;
  },

  /**
   * Hợp nhất hai giá trị ngân sách theo "thay đổi mới nhất" (last-write-wins)
   * thay vì "chọn số lớn hơn" — tránh tự khôi phục hạn mức cũ.
   */
  mergeBudgetValue(localValue, cloudValue, localUpdatedAt, cloudUpdatedAt) {
    if (localValue === undefined || localValue === null) return cloudValue || 0;
    if (cloudValue === undefined || cloudValue === null) return localValue;
    return (localUpdatedAt || '') > (cloudUpdatedAt || '') ? localValue : cloudValue;
  }
};