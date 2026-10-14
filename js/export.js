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

    // Chuẩn bị dữ liệu hiển thị tiếng Việt rõ ràng
    const rows = transactions.map((t, index) => {
      const cat = Categories.getById(t.category);
      return {
        'STT': index + 1,
        'Ngày': Utils.formatDate(t.date),
        'Loại giao dịch': t.type === 'income' ? 'Thu nhập' : 'Chi tiêu',
        'Danh mục': cat ? cat.name : 'Khác',
        'Tên giao dịch': t.name,
        'Số tiền (VNĐ)': t.amount,
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
      { wch: 25 }  // Ghi chú
    ];
    worksheet['!cols'] = colWidths;

    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, 'GiaoDich');

    const fileName = `SpendWise_BaoCao_${Utils.getToday()}.xlsx`;
    XLSX.writeFile(workbook, fileName);
    Toast.success('Đã xuất file Excel thành công!');
  },

  /**
   * Sao lưu toàn bộ cấu hình & giao dịch ra file JSON
   */
  backupJSON(silent = false) {
    const data = {
      version: '1.0',
      exportedAt: new Date().toISOString(),
      transactions: Storage.getTransactions(),
      budgets: BudgetManager.getBudgets(),
      theme: Storage.getTheme()
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
        if (clean.length === 0) {
          throw new Error('Không có giao dịch hợp lệ nào trong file!');
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

        // 6) Tự động sao lưu dữ liệu hiện tại trước khi ghi đè (phương án khôi phục)
        if (Storage.getTransactions().length > 0) {
          this.backupJSON(true);
        }

        ConfirmDialog.show({
          title: 'Khôi phục dữ liệu?',
          message: `File có ${clean.length} giao dịch hợp lệ` +
                   (invalid > 0 ? ` (đã loại ${invalid} bản ghi lỗi)` : '') +
                   `. Dữ liệu hiện tại sẽ bị thay thế. Bản sao lưu tự động đã được tải về.`,
          confirmText: 'Khôi phục ngay',
          onConfirm: () => {
            Storage.saveTransactions(clean);
            if (budgets) {
              Storage.set(BudgetManager.STORAGE_KEY, budgets);
            }
            if (theme) {
              Storage.setTheme(theme);
              ThemeManager.applyTheme(theme);
            }

            TransactionManager.renderTransactions();
            TransactionManager.updateSummary();
            BudgetManager.renderBudgetList();
            BudgetManager.updateBudgetSummary();

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
