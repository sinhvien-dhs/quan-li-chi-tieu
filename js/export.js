/**
 * export.js — Xuất dữ liệu Excel (XLSX) và Sao lưu / Phục hồi JSON
 */

const ExportManager = {
  init() {
    this.bindEvents();
  },

  bindEvents() {
    // Export Excel
    const btnExcel = document.getElementById('btnExportExcel');
    if (btnExcel) {
      btnExcel.addEventListener('click', () => this.exportToExcel());
    }

    // Backup JSON
    const btnBackup = document.getElementById('btnBackupJSON');
    if (btnBackup) {
      btnBackup.addEventListener('click', () => this.backupJSON());
    }

    // Restore JSON input
    const inputRestore = document.getElementById('inputRestoreJSON');
    if (inputRestore) {
      inputRestore.addEventListener('change', (e) => this.restoreJSON(e));
    }

    // Clear all data
    const btnClear = document.getElementById('btnClearAllData');
    if (btnClear) {
      btnClear.addEventListener('click', () => this.clearAllData());
    }
  },

  /**
   * Xuất danh sách giao dịch ra file Excel (.xlsx) bằng SheetJS
   */
  exportToExcel() {
    const transactions = Storage.getTransactions();
    if (transactions.length === 0) {
      Toast.error('Chưa có giao dịch nào để xuất file!');
      return;
    }

    if (typeof XLSX === 'undefined') {
      Toast.error('Thư viện Excel đang tải, vui lòng thử lại sau vài giây!');
      return;
    }

    // Chuẩn bị dữ liệu hiển thị tiếng Việt rõ ràng (mới nhất trước)
    const sorted = transactions.slice().sort((a, b) => (b.date || '').localeCompare(a.date || ''));
    const rows = sorted.map((t, index) => {
      const cat = Categories.getById(t.category);
      const wallet = (typeof Features !== 'undefined' && Features.getWalletById(t.wallet)) || null;
      return {
        'STT': index + 1,
        'Ngày': Utils.formatDate(t.date),
        'Loại giao dịch': t.type === 'income' ? 'Thu nhập' : 'Chi tiêu',
        'Danh mục': cat ? cat.name : 'Khác',
        'Tên giao dịch': t.name,
        'Số tiền (VNĐ)': t.amount,
        'Ví': wallet ? wallet.name : '',
        'Ghi chú': t.note || ''
      };
    });

    const worksheet = XLSX.utils.json_to_sheet(rows);

    // Căn chỉnh độ rộng cột tự động
    const colWidths = [
      { wch: 6 },  // STT
      { wch: 14 }, // Ngày
      { wch: 16 }, // Loại
      { wch: 16 }, // Danh mục
      { wch: 25 }, // Tên
      { wch: 16 }, // Số tiền
      { wch: 14 }, // Ví
      { wch: 25 }  // Ghi chú
    ];
    worksheet['!cols'] = colWidths;

    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, 'GiaoDich');

    // Sheet tóm tắt: dùng chung lớp nghiệp vụ nên số liệu khớp với app
    const budgetSummary = Business.budgetSummary(BudgetManager.getBudgets(), transactions);
    const summaryRows = [
      { 'Chỉ số': 'Tổng thu nhập', 'Giá trị': Business.totalIncome(transactions) },
      { 'Chỉ số': 'Tổng chi tiêu', 'Giá trị': Business.totalExpense(transactions) },
      { 'Chỉ số': 'Số dư', 'Giá trị': Business.balance(transactions) },
      { 'Chỉ số': 'Số giao dịch', 'Giá trị': transactions.length },
      { 'Chỉ số': 'Tổng hạn mức ngân sách', 'Giá trị': budgetSummary.totalLimit },
      { 'Chỉ số': 'Đã chi trong tháng', 'Giá trị': budgetSummary.totalSpent },
      { 'Chỉ số': 'Còn lại trong hạn mức', 'Giá trị': budgetSummary.remaining }
    ];
    const summarySheet = XLSX.utils.json_to_sheet(summaryRows);
    summarySheet['!cols'] = [{ wch: 28 }, { wch: 18 }];
    XLSX.utils.book_append_sheet(workbook, summarySheet, 'TomTat');

    const fileName = `SpendWise_BaoCao_${Utils.getToday()}.xlsx`;
    XLSX.writeFile(workbook, fileName);
    Toast.success('Đã xuất file Excel thành công!');
  },

  /**
   * Sao lưu toàn bộ cấu hình & giao dịch ra file JSON
   */
  backupJSON(silent = false) {
    const data = {
      app: 'SpendWise',
      version: 2,
      exportedAt: new Date().toISOString(),
      transactions: Storage.getTransactions(),
      budgets: BudgetManager.getBudgets(),
      wallets: Storage.get('spendwise_wallets', []),
      goals: Storage.get('spendwise_goals', []),
      recurring: Storage.get('spendwise_recurring', []),
      currency: Storage.get('spendwise_currency', 'VND'),
      theme: Storage.getTheme(),
      reminderTime: localStorage.getItem('spendwise_reminder_time') || null
    };

    const jsonStr = JSON.stringify(data, null, 2);
    const blob = new Blob([jsonStr], { type: 'application/json' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `SpendWise_Backup_${Utils.getToday()}.json`;
    link.click();
    if (!silent) Toast.success('Đã tải xuống file sao lưu!');
  },

  /**
   * Khôi phục dữ liệu từ file JSON
   */
  restoreJSON(event) {
    const file = event.target.files[0];
    if (!file) return;

    // 1) Giới hạn kích thước file (chống DoS & nhồi dữ liệu)
    const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10 MB
    if (file.size > MAX_FILE_SIZE) {
      Toast.error('File quá lớn (tối đa 10MB)!');
      event.target.value = '';
      return;
    }

    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        let data;
        try {
          data = JSON.parse(e.target.result);
        } catch (parseErr) {
          throw new Error('File không phải JSON hợp lệ!');
        }

        // 2) Kiểm tra cấu trúc tổng thể
        if (!data || typeof data !== 'object' || Array.isArray(data)) {
          throw new Error('Cấu trúc dữ liệu không hợp lệ!');
        }
        if (!data.transactions || !Array.isArray(data.transactions)) {
          throw new Error('Thiếu trường transactions!');
        }

        // 3) Giới hạn số lượng bản ghi
        const MAX_TX = 20000;
        if (data.transactions.length > MAX_TX) {
          throw new Error(`Quá nhiều giao dịch (tối đa ${MAX_TX})!`);
        }

        // 4) Kiểm tra & LÀM SẠCH từng giao dịch (loại bỏ field không hợp lệ, ép kiểu dữ liệu)
        const clean = ExportManager.sanitizeTransactions(data.transactions);
        const invalid = data.transactions.length - clean.length;

        // 4b) Làm sạch ví / mục tiêu / giao dịch định kỳ (nếu có trong file)
        const cleanWallets = this.sanitizeSimpleList(data.wallets, ['name'], 100, 40);
        const cleanGoals = this.sanitizeGoals(data.goals);
        const cleanRecurring = this.sanitizeRecurring(data.recurring);

        if (clean.length === 0 && cleanGoals.length === 0 &&
            Object.keys(data.budgets || {}).length === 0) {
          throw new Error('File không có dữ liệu hợp lệ nào để khôi phục!');
        }

        // 5) Kiểm tra budgets nếu có
        let budgets = null;
        if (data.budgets && typeof data.budgets === 'object' && !Array.isArray(data.budgets)) {
          budgets = {};
          Object.keys(data.budgets).slice(0, 50).forEach(k => {
            const v = Number(data.budgets[k]);
            if (typeof k === 'string' && k.length <= 40 && isFinite(v) && v >= 0) {
              budgets[k] = v;
            }
          });
        }

        const theme = (data.theme === 'dark' || data.theme === 'light') ? data.theme : null;
        const currency = (['VND', 'USD', 'EUR'].indexOf(data.currency) > -1) ? data.currency : null;
        const reminderTime = (typeof data.reminderTime === 'string' && /^\d{2}:\d{2}$/.test(data.reminderTime))
          ? data.reminderTime : null;

        // 6) Tự động sao lưu dữ liệu hiện tại trước khi ghi đè (phương án khôi phục)
        if (Storage.getTransactions().length > 0 || Storage.get('spendwise_goals', []).length > 0) {
          this.backupJSON(true);
        }

        ConfirmDialog.show({
          title: 'Khôi phục dữ liệu?',
          message: `Trong file có: ${clean.length} giao dịch` +
                   (invalid > 0 ? ` (loại ${invalid} bản ghi lỗi)` : '') +
                   `, ${cleanWallets.length} ví, ${cleanGoals.length} mục tiêu, ${cleanRecurring.length} quy tắc định kỳ.` +
                   `\nDữ liệu hiện tại của các mục này sẽ bị thay thế. Bản sao lưu tự động đã tải về máy.`,
          confirmText: 'Khôi phục ngay',
          onConfirm: () => {
            Storage.saveTransactions(clean);
            if (budgets) {
              Storage.set(BudgetManager.STORAGE_KEY, budgets);
            }
            if (cleanWallets.length) Storage.set('spendwise_wallets', cleanWallets);
            if (cleanGoals.length) Storage.set('spendwise_goals', cleanGoals);
            if (cleanRecurring.length) Storage.set('spendwise_recurring', cleanRecurring);
            if (currency) Storage.set('spendwise_currency', currency);
            if (reminderTime) localStorage.setItem('spendwise_reminder_time', reminderTime);
            if (theme) {
              Storage.setTheme(theme);
              ThemeManager.applyTheme(theme);
            }

            TransactionManager.renderTransactions();
            TransactionManager.updateSummary();
            BudgetManager.renderBudgetList();
            BudgetManager.updateBudgetSummary();
            if (typeof Features !== 'undefined') {
              Features.renderWalletList();
              Features.renderWalletOptions();
              Features.renderGoals();
              Features.renderRecurringList();
            }

            Toast.success('Khôi phục dữ liệu thành công!');
          }
        });
      } catch (err) {
        Toast.error('Không thể đọc file sao lưu: ' + err.message);
      } finally {
        event.target.value = '';
      }
    };
    reader.readAsText(file);
  },

  /**
   * Làm sạch danh sách đơn giản (ví...): chỉ giữ id + các trường hợp lệ
   */
  sanitizeSimpleList(list, textFields, maxItems, maxLen) {
    if (!Array.isArray(list)) return [];
    const seen = new Set();
    const out = [];
    for (const item of list.slice(0, maxItems || 100)) {
      if (!item || typeof item !== 'object' || Array.isArray(item)) continue;
      const clean = {};
      let id = typeof item.id === 'string' ? item.id.replace(/[<>]/g, '').slice(0, 64) : '';
      if (!id) id = 'w_' + Utils.generateId();
      if (seen.has(id)) continue;
      seen.add(id);
      clean.id = id;
      textFields.forEach(f => {
        if (typeof item[f] === 'string') {
          clean[f] = item[f].replace(/[<>]/g, '').slice(0, maxLen || 40);
        }
      });
      if (typeof item.icon === 'string') clean.icon = item.icon.replace(/[^a-z0-9-]/gi, '').slice(0, 60);
      out.push(clean);
    }
    return out;
  },

  sanitizeGoals(list) {
    if (!Array.isArray(list)) return [];
    const seen = new Set();
    const out = [];
    for (const g of list.slice(0, 500)) {
      if (!g || typeof g !== 'object') continue;
      const name = typeof g.name === 'string' ? g.name.replace(/[<>]/g, '').slice(0, 60) : '';
      const target = Number(g.target);
      const saved = Number(g.saved);
      if (!name || !isFinite(target) || target <= 0 || !isFinite(saved) || saved < 0) continue;
      let id = typeof g.id === 'string' ? g.id.replace(/[<>]/g, '').slice(0, 64) : '';
      if (!id) id = 'g_' + Utils.generateId();
      if (seen.has(id)) continue;
      seen.add(id);
      out.push({ id: id, name: name, target: Math.round(target), saved: Math.round(saved) });
    }
    return out;
  },

  sanitizeRecurring(list) {
    if (!Array.isArray(list)) return [];
    const seen = new Set();
    const out = [];
    for (const r of list.slice(0, 200)) {
      if (!r || typeof r !== 'object') continue;
      const name = typeof r.name === 'string' ? r.name.replace(/[<>]/g, '').slice(0, 80) : '';
      const amount = Number(r.amount);
      const freq = ['daily', 'weekly', 'monthly'].indexOf(r.frequency) > -1 ? r.frequency : null;
      const type = (r.type === 'income' || r.type === 'expense') ? r.type : null;
      const startDate = typeof r.startDate === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(r.startDate)
        ? r.startDate : null;
      if (!name || !isFinite(amount) || amount <= 0 || !freq || !type || !startDate) continue;
      let id = typeof r.id === 'string' ? r.id.replace(/[<>]/g, '').slice(0, 64) : '';
      if (!id) id = 'r_' + Utils.generateId();
      if (seen.has(id)) continue;
      seen.add(id);
      const item = {
        id: id, name: name, amount: Math.round(amount), type: type,
        frequency: freq, startDate: startDate,
        lastRun: (typeof r.lastRun === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(r.lastRun)) ? r.lastRun : null
      };
      if (typeof r.category === 'string') item.category = r.category.replace(/[<>]/g, '').slice(0, 40);
      if (typeof r.wallet === 'string') item.wallet = r.wallet.replace(/[<>]/g, '').slice(0, 64);
      out.push(item);
    }
    return out;
  },

  /**
   * Kiểm tra & chuẩn hóa danh sách giao dịch từ file JSON
   * - Ép kiểu amount về số, loại bỏ record không hợp lệ
   * - Chuẩn hóa date về YYYY-MM-DD
   * - Giới hạn độ dài chuỗi, loại bỏ field lạ (chống prototype pollution / XSS)
   * - Loại bỏ ID trùng
   */
  sanitizeTransactions(list) {
    const seen = new Set();
    const out = [];
    const str = (v, max) => (typeof v === 'string' ? v.replace(/[<>]/g, '').slice(0, max) : '');
    const num = (v) => {
      const n = Number(v);
      return isFinite(n) && n >= 0 && n <= 1e12 ? Math.round(n) : NaN;
    };
    const isoDate = (d) => {
      if (typeof d !== 'string') return null;
      const s = d.trim().slice(0, 10);
      const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
      if (!m) return null;
      const year = +m[1], month = +m[2], day = +m[3];
      if (month < 1 || month > 12 || day < 1 || day > 31) return null;
      const daysInMonth = new Date(Date.UTC(year, month, 0)).getUTCDate();
      if (day > daysInMonth) return null; //VD: 2026-02-30 -> loại
      return s;
    };

    for (const t of list.slice(0, 20000)) {
      if (!t || typeof t !== 'object' || Array.isArray(t)) continue;

      const amount = num(t.amount);
      const date = isoDate(t.date);
      const name = str(t.name, 80);
      const type = t.type === 'income' ? 'income' : (t.type === 'expense' ? 'expense' : null);

      if (isNaN(amount) || amount <= 0 || !date || !name || !type) continue;

      let id = str(t.id, 64) || ('tx_' + Utils.generateId());
      if (seen.has(id)) id = id + '_' + Utils.generateId();
      seen.add(id);

      const item = {
        id: id,
        name: name,
        amount: amount,
        type: type,
        category: str(t.category, 40) || 'other_expense',
        date: date,
        note: str(t.note, 200)
      };

      const wallet = str(t.wallet, 64);
      if (wallet) item.wallet = wallet;

      // Chỉ giữ ảnh hóa đơn đúng định dạng data URL và giới hạn kích thước
      if (typeof t.receipt === 'string' &&
          t.receipt.length <= 700000 &&
          /^data:image\/(jpeg|png|webp);base64,/.test(t.receipt)) {
        item.receipt = t.receipt;
      }

      if (typeof t.createdAt === 'string' && t.createdAt.length <= 40) item.createdAt = t.createdAt;
      // Giữ trạng thái đồng bộ cục bộ để hiển thị "chờ đồng bộ" chính xác
      if (typeof t.syncState === 'string' && ['pending', 'synced', 'failed'].indexOf(t.syncState) > -1) {
        item.syncState = t.syncState;
      }
      if (typeof t.updatedAt === 'string' && t.updatedAt.length <= 40) item.updatedAt = t.updatedAt;

      out.push(item);
    }
    return out;
  },

  /**
   * Xóa toàn bộ dữ liệu ứng dụng
   */
  clearAllData() {
    ConfirmDialog.show({
      title: 'Xóa toàn bộ dữ liệu?',
      message: 'Mọi giao dịch và cài đặt ngân sách sẽ bị xóa sạch và không thể hoàn tác!',
      confirmText: 'Xóa toàn bộ',
      onConfirm: () => {
        Storage.remove(Storage.KEYS.TRANSACTIONS);
        Storage.remove(BudgetManager.STORAGE_KEY);
        TransactionManager.renderTransactions();
        TransactionManager.updateSummary();
        BudgetManager.renderBudgetList();
        BudgetManager.updateBudgetSummary();
        Toast.warning('Đã xóa sạch toàn bộ dữ liệu!');
      }
    });
  }
};
