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
  /** Loai giao dich chuyen tien giua cac vi (khong lam thay doi tong so du) */
  isTransfer(t) {
    return !!t && t.type === 'transfer';
  },

  /** Tong thu trong mot mang giao dich (bo qua giao dich chuyen khoan) */
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
      if (!t) return;
      const amt = Math.round(Number(t.amount) || 0);

      // Chuyen tien giua 2 vi: tru vi nguon, cong vi dich (tong khong doi)
      if (Business.isTransfer(t)) {
        const from = map.get(t.fromWallet || t.wallet);
        const to = map.get(t.toWallet);
        if (from) { from.balance -= amt; from.expense += amt; }
        if (to) { to.balance += amt; to.income += amt; }
        return;
      }

      if (!t.wallet) return;
      const row = map.get(t.wallet);
      if (!row) return;
      if (t.type === 'income') { row.income += amt; row.balance += amt; }
      else { row.expense += amt; row.balance -= amt; }
    });

    return result;
  },

  /**
   * Chuyển tiền giữa các ví: tiền đi từ ví nguồn sang ví đích.
   * Lưu ý: tổng số dư toàn hệ thống KHÔNG đổi khi chuyển khoản.
   * @param {Object} o {amount, fromWallet, toWallet, date, note}
   * @returns {Object|null} giao dịch chuyển khoản hợp lệ
   */
  buildTransfer(o) {
    const amount = Math.round(Number(o && o.amount) || 0);
    const from = o && o.fromWallet;
    const to = o && o.toWallet;
    if (!(amount > 0) || !from || !to || from === to) return null;
    return {
      name: (o.name && String(o.name).slice(0, 50)) || 'Chuyển tiền giữa ví',
      amount: amount,
      type: 'transfer',
      category: 'transfer',
      wallet: from,
      fromWallet: from,
      toWallet: to,
      date: o.date || new Date().toISOString().slice(0, 10),
      note: o.note ? String(o.note).slice(0, 200) : ''
    };
  },

  /**
   * Gộp hai mảng bản ghi theo id khi đồng bộ cloud:
   * - Bản có updatedAt/lastRun mới hơn thắng
   * - Bản ghi nằm trong `tombstones` (đã xoá trên máy này) bị loại khỏi cả
   *   bản cloud lẫn kết quả → không bao giờ "hồi sinh" bản ghi đã xoá.
   */
  mergeById(localArr, cloudArr, tombstones) {
    const tombs = Array.isArray(tombstones) ? tombstones : [];
    const map = new Map();
    const cloudIds = new Set();

    const addCloud = (item) => {
      if (!item || !item.id) return;
      if (tombs.indexOf(item.id) > -1) return;
      cloudIds.add(item.id);
      map.set(item.id, item);
    };

    const addLocal = (item) => {
      if (!item || !item.id) return;
      if (tombs.indexOf(item.id) > -1) return;

      // Nếu bản ghi địa phương đã từng được đồng bộ (synced) nhưng trên server
      // không còn nữa (và server có dữ liệu), tức là bản ghi đã bị xóa trên thiết bị khác!
      if (item.syncState === 'synced' && cloudIds.size > 0 && !cloudIds.has(item.id)) {
        return; // Không hồi sinh bản ghi đã bị xóa trên cloud
      }

      const cur = map.get(item.id);
      if (!cur) {
        map.set(item.id, item);
        return;
      }
      const a = cur.updatedAt || cur.lastRun || '';
      const b = item.updatedAt || item.lastRun || '';
      if (b > a) map.set(item.id, item);
    };

    (Array.isArray(cloudArr) ? cloudArr : []).forEach(addCloud);
    (Array.isArray(localArr) ? localArr : []).forEach(addLocal);
    return Array.from(map.values());
  },

  /**
   * Chuẩn hóa số tiền người dùng nhập → trả về số nguyên hợp lệ hoặc null.
   *
   * Chấp nhận các cách gõ phổ biến tại Việt Nam:
   *   "50000"      → 50000
   *   "1.500.000"  → 1500000   (dấu chấm/phẩy là dấu phân cách nghìn)
   *   "1,500,000"  → 1500000
   *   "12.5"       → 13        (phần thập phân, làm tròn)
   *   "2tr"        → 2000000   ("k"/"nghìn" = 1e3, "tr"/"triệu" = 1e6, "tỷ"/"ty" = 1e9)
   *
   * Quy tắc phân biệt: dấu "." hoặc "," đứng trước đúng 3 chữ số và đi kèm
   * phần nguyên 1-3 chữ số được hiểu là dấu phân cách nghìn.
   */
  parseAmount(input) {
    if (input === null || input === undefined) return null;
    let raw = String(input).trim().toLowerCase();
    if (raw === '') return null;

    // Tiếng lóng đặc biệt: "nửa củ" = 500k, "nửa lít" = 50k
    if (/^n[uử]a\s+c[uủ]$/i.test(raw)) return 500000;
    if (/^n[uử]a\s+l[ií]t$/i.test(raw)) return 50000;

    // Hệ số rút gọn: k / nghìn / tr / triệu / tỷ / cành / lít / loét / củ / xu
    let multiplier = 1;
    const suffixMatch = raw.match(/^([0-9][0-9.,\s]*?)\s*(nghìn|nghin|triệu|trieu|tỷ|ty|tr|k|b|cành|canh|lít|lit|loét|loet|củ|cu|xu)$/);
    if (suffixMatch) {
      const unit = suffixMatch[2];
      if (unit === 'k' || unit === 'nghìn' || unit === 'nghin' || unit === 'cành' || unit === 'canh' || unit === 'xu') {
        multiplier = 1e3;
      } else if (unit === 'lít' || unit === 'lit' || unit === 'loét' || unit === 'loet') {
        multiplier = 1e5; // 1 lít / 1 loét = 100.000đ
      } else if (unit === 'củ' || unit === 'cu' || unit === 'tr' || unit === 'triệu' || unit === 'trieu') {
        multiplier = 1e6; // 1 củ / 1 triệu = 1.000.000đ
      } else if (unit === 'tỷ' || unit === 'ty' || unit === 'b') {
        multiplier = 1e9;
      }
      raw = suffixMatch[1];
    }

    raw = raw.replace(/\s/g, '');

    // Dấu phân cách nghìn: 1.500.000 / 1,500,000
    if (/^\d{1,3}([.,]\d{3})+$/.test(raw)) {
      raw = raw.replace(/[.,]/g, '');
    } else {
      // Còn lại coi dấu phẩy là phần thập phân
      raw = raw.replace(/,/g, '.');
      if ((raw.match(/\./g) || []).length > 1) return null;
    }

    if (!/^\d+(\.\d{1,2})?$/.test(raw)) return null;

    const n = Number(raw) * multiplier;
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