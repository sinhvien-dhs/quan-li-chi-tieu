/**
 * demo.js — Dữ liệu mẫu cho chế độ dùng thử
 *
 * Nguyên tắc:
 * - Mọi giao dich mau deu co ID tien to "demo_" va duoc ghi nho trong localStorage
 * - KHONG bao gio duoc day len Firestore (khong lam anh huong tai khoan that)
 * - Tat che do demo se xoa DUNG cac ban ghi mau, khong dung du lieu that
 */

const DemoData = {
  KEY: 'spendwise_demo_ids',
  FLAG: 'spendwise_demo_mode',

  /** Giao dịch có phải dữ liệu mẫu không */
  isDemoId(id) {
    return typeof id === 'string' && id.indexOf('demo_') === 0;
  },

  /** Danh sách ID giao dịch mẫu đang có trên máy */
  getIds() {
    return Storage.get(this.KEY, []) || [];
  },

  /** Ngày YYYY-MM-DD theo giờ địa phương (không dùng toISOString để tránh lệch ngày UTC) */
  dateOffset(daysAgo) {
    const d = new Date();
    d.setDate(d.getDate() - daysAgo);
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${d.getFullYear()}-${m}-${day}`;
  },

  isEnabled() {
    return Storage.get(this.FLAG, false);
  },

  /**
   * Thêm dữ liệu mẫu (không thêm trùng nếu đã có)
   * @returns {number} số giao dịch đã thêm
   */
  add() {
    if (this.getIds().length > 0) return 0;

    const samples = [
      { name: 'Phở sáng',       amount: 45000,   type: 'expense', category: 'food',          note: 'Phở Hà Nội',         daysAgo: 0 },
      { name: 'Grab đi học',    amount: 25000,   type: 'expense', category: 'transport',     note: '',                    daysAgo: 0 },
      { name: 'Lương tháng',    amount: 8000000, type: 'income',  category: 'salary',        note: 'Lương part-time',     daysAgo: 1 },
      { name: 'Trà sữa',        amount: 55000,   type: 'expense', category: 'food',          note: 'Tiger Sugar',         daysAgo: 1 },
      { name: 'Sách lập trình', amount: 189000,  type: 'expense', category: 'education',     note: 'JavaScript nâng cao', daysAgo: 2 },
      { name: 'Xem phim',       amount: 90000,   type: 'expense', category: 'entertainment', note: 'CGV',                 daysAgo: 2 },
      { name: 'Cà phê',         amount: 35000,   type: 'expense', category: 'food',          note: 'Highlands',           daysAgo: 3 },
      { name: 'Tiền điện',      amount: 350000,  type: 'expense', category: 'bills',         note: 'Hóa đơn điện',       daysAgo: 3 },
      { name: 'Freelance web',  amount: 2000000, type: 'income',  category: 'freelance',     note: 'Landing page khách',  daysAgo: 4 },
      { name: 'Thuốc cảm',      amount: 65000,   type: 'expense', category: 'health',        note: '',                    daysAgo: 4 }
    ];

    const stamp = Date.now().toString(36);
    const ids = [];

    samples.forEach((s, i) => {
      const id = `demo_${stamp}_${i}`;
      ids.push(id);
      Storage.addTransaction({
        id: id,
        name: s.name,
        amount: s.amount,
        type: s.type,
        category: s.category,
        date: this.dateOffset(s.daysAgo),
        note: s.note
      });
    });

    localStorage.setItem(this.KEY, JSON.stringify(ids));

    if (typeof TransactionManager !== 'undefined') {
      TransactionManager.renderTransactions();
      TransactionManager.updateSummary();
    }
    return samples.length;
  },

  /**
   * Xoá dữ liệu mẫu (chỉ xoá bản ghi demo, giữ nguyên dữ liệu thật)
   * @returns {number} số giao dịch đã xoá
   */
  remove() {
    const all = Storage.getTransactions();
    const kept = all.filter((t) => !this.isDemoId(t.id));
    const removed = all.length - kept.length;

    if (removed > 0) {
      Storage.saveTransactions(kept);
    }
    localStorage.removeItem(this.KEY);

    if (typeof TransactionManager !== 'undefined') {
      TransactionManager.renderTransactions();
      TransactionManager.updateSummary();
    }
    return removed;
  },

  /**
   * Bỏ bản ghi demo khỏi danh sách trước khi đẩy lên cloud
   */
  filterForCloud(list) {
    return (list || []).filter((item) => !(item && this.isDemoId(item.id)));
  }
};
