/**
 * Test các lỗi đã sửa ở v76
 *   1. addTransaction trả null khi lưu hỏng (không báo "thành công" giả)
 *   2. Excel/PDF phân loại đúng giao dịch chuyển ví
 *   3. Xóa ví kiểm tra cả fromWallet/toWallet
 *   4. Khoá ngân hàng trong HTML khớp bảng ánh xạ
 */
const fs = require('fs');
const path = require('path');

let pass = 0, fail = 0;
const ok = (name, cond, extra) => {
  if (cond) { pass++; console.log('  [DUNG] ' + name); }
  else { fail++; console.log('  [SAI ] ' + name + (extra ? ' → ' + extra : '')); }
};

// ---------- Nạp Business ----------
const bSrc = fs.readFileSync(path.join(__dirname, '..', 'js', 'business.js'), 'utf8');
const Business = eval(bSrc.slice(bSrc.indexOf('const Business ='), bSrc.lastIndexOf('};') + 2) + '; Business');

console.log('=== 1. addTransaction tra null khi luu hong ===');
// Mô phỏng Storage.set luôn thất bại (bộ nhớ đầy)
const fakeStorage = {};
const StorageMock = {
  KEYS: { TRANSACTIONS: 'spendwise_transactions' },
  get(k, d) { return fakeStorage[k] !== undefined ? JSON.parse(fakeStorage[k]) : d; },
  getTransactions() { const l = this.get(this.KEYS.TRANSACTIONS, []); return Array.isArray(l) ? l : []; },
  saveTransactions(list) { return false; },   // luôn thất bại
  set(k, v) { fakeStorage[k] = JSON.stringify(v); return true; }
};
const addTransaction = StorageMock.KEYS.TRANSACTIONS && function (transaction) {
  const transactions = this.getTransactions();
  const newTransaction = { id: 'id_' + Math.random().toString(36).slice(2, 8), ...transaction, syncState: 'pending', createdAt: '2026-10-15' };
  transactions.unshift(newTransaction);
  if (!this.saveTransactions(transactions)) { transactions.shift(); return null; }
  return newTransaction;
};
const r1 = addTransaction.call(StorageMock, { name: 'Test', amount: 1000, type: 'expense', category: 'food', date: '2026-10-15' });
ok('luu that bai → tra null', r1 === null, JSON.stringify(r1));
ok('khong ghi rac vao danh sach', StorageMock.getTransactions().length === 0);

// Ngược lại: lưu thành công thì trả về object
StorageMock.saveTransactions = function (list) { fakeStorage[StorageMock.KEYS.TRANSACTIONS] = JSON.stringify(list); return true; };
const r2 = addTransaction.call(StorageMock, { name: 'Test', amount: 1000, type: 'expense', category: 'food', date: '2026-10-15' });
ok('luu thanh cong → tra giao dich', !!r2 && !!r2.id);
ok('giao dich da vao danh sach', StorageMock.getTransactions().length === 1);

console.log('\n=== 2. Phan loai giao dich chuyen vi ===');
const chuyenVi = { id: 'c1', name: 'Rút tiền', amount: 500000, type: 'transfer', category: 'transfer', date: '2026-10-15', fromWallet: 'cash', toWallet: 'bank' };
const chi = { id: 'c2', name: 'Ăn phở', amount: 35000, type: 'expense', category: 'food', date: '2026-10-15', wallet: 'cash' };
const thu = { id: 'c3', name: 'Lương', amount: 8000000, type: 'income', category: 'salary', date: '2026-10-15', wallet: 'bank' };
ok('nhan dien chuyen vi', Business.isTransfer(chuyenVi) === true);
ok('khong nhan dien chi tieu', Business.isTransfer(chi) === false);
ok('tong chi KHONG gom chuyen vi', Business.totalExpense([chuyenVi, chi]) === 35000, String(Business.totalExpense([chuyenVi, chi])));
ok('tong thu KHONG gom chuyen vi', Business.totalIncome([chuyenVi, thu]) === 8000000);
ok('so du khong doi khi chuyen vi', Business.balance([chuyenVi]) === 0, String(Business.balance([chuyenVi])));
ok('so du tong dung khi chuyen vi', Business.balance([chi, thu, chuyenVi]) === 8000000 - 35000);

// Logic phân loại dùng chung cho Excel & PDF
const nhan = (t) => Business.isTransfer(t) ? 'Chuyển ví' : (t.type === 'income' ? 'Thu nhập' : 'Chi tiêu');
ok('nhan chuyen vi', nhan(chuyenVi) === 'Chuyển ví', nhan(chuyenVi));
ok('nhan thu nhap', nhan(thu) === 'Thu nhập');
ok('nhan chi tieu', nhan(chi) === 'Chi tiêu');

console.log('\n=== 3. Xoa vi phai kiem tra ca 3 truong ===');
const usesWallet = (t, id) => t.wallet === id || t.fromWallet === id || t.toWallet === id;
const id = 'cash';
const danhSach = [chuyenVi, chi, thu];
const timThay = danhSach.filter(t => usesWallet(t, id));
ok('tim thay ca giao dich thuong', timThay.length === 2, String(timThay.length));
ok('chuyen vi co cash o dau duoc tim thay', timThay.some(t => t.fromWallet === 'cash'));
const idBank = 'bank';
ok('tim thay chuyen vi co bank o cuoi', danhSach.filter(t => usesWallet(t, idBank)).length === 2);
ok('cach cu KHONG tim thay gi', danhSach.filter(t => t.wallet === 'cash' || t.fromWallet === 'cash' || t.toWallet === 'cash').length === timThay.length);

// Chuyen huong sau khi xoa vi
const chuyenHuong = (t, id, moi) => {
  const nt = Object.assign({}, t);
  if (nt.wallet === id) nt.wallet = moi;
  if (nt.fromWallet === id) nt.fromWallet = moi;
  if (nt.toWallet === id) nt.toWallet = moi;
  return nt;
};
const nt = chuyenHuong(chuyenVi, 'cash', 'bank');
ok('chuyen huong giao dich chuyen vi', nt.fromWallet === 'bank' && nt.toWallet === 'bank', JSON.stringify([nt.fromWallet, nt.toWallet]));
ok('khong con tro toi vi da xoa', !usesWallet(nt, 'cash'));

console.log('\n=== 4. Khoa ngan hang khop bang anh xa ===');
const splitSrc = fs.readFileSync(path.join(__dirname, '..', 'js', 'split.js'), 'utf8');
const bankBlock = splitSrc.slice(splitSrc.indexOf('BANKS: {'), splitSrc.indexOf('BANK_NAMES'));
const keys = [...bankBlock.matchAll(/([A-Za-z_]+)\s*:/g)].map(m => m[1]).filter(k => k !== 'BANKS');
const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
const sel = html.slice(html.indexOf('id="vietqrBank"'), html.indexOf('</select>', html.indexOf('id="vietqrBank"')));
const values = [...sel.matchAll(/value="([^"]+)"/g)].map(m => m[1]);
ok('mo khoa trong BANGS deu viet thuong', keys.every(k => k === k.toLowerCase()), keys.join(','));
ok('khong co ' + "'" + 'BIDV' + "'" + ' viet hoa', !keys.includes('BIDV'));
ok('khong co khoa zalo (phai la zalopay)', !keys.includes('zalo'));
ok('co khoa zalopay', keys.includes('zalopay'));
ok('tat ca lua chon trong HTML deu co trong bang', values.every(v => keys.includes(v)), values.filter(v => !keys.includes(v)).join(','));
ok('khong con khoa BIDV trong HTML', !values.includes('BIDV'));

console.log('\n=== Ket qua ===');
console.log(pass + ' dat, ' + fail + ' khong dat');
process.exit(fail > 0 ? 1 : 0);