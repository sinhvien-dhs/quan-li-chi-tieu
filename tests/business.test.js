/**
 * tests/business.test.js — Kiểm thử lớp nghiệp vụ (chạy bằng Node, không cần thư viện)
 *
 * Chạy:  node tests/business.test.js
 */

const fs = require('fs');
const path = require('path');
const vm = require('vm');

// Nạp business.js vào sandbox
const src = fs.readFileSync(path.join(__dirname, '..', 'js', 'business.js'), 'utf8');
const sandbox = { console };
vm.createContext(sandbox);
// const ở top-level tạo lexical binding, không tự gắn lên sandbox
// → gán thủ công vào global để đọc được từ Node
vm.runInContext(src + '\n;this.Business = Business;', sandbox);
const Business = sandbox.Business;

if (!Business) {
  console.error('Không nạp được Business từ js/business.js');
  process.exit(1);
}

let passed = 0, failed = 0;
function test(name, fn) {
  try {
    fn();
    passed++;
    console.log('  ✓ ' + name);
  } catch (e) {
    failed++;
    console.log('  ✗ ' + name + ' → ' + e.message);
  }
}
function eq(actual, expected, msg) {
  if (actual !== expected) {
    throw new Error((msg || '') + ' expected=' + expected + ' actual=' + actual);
  }
}
function ok(v, msg) { if (!v) throw new Error(msg || 'expected truthy'); }

test('gộp bản ghi local + cloud theo updatedAt', () => {
  const local = [{ id: 'a', amount: 1, updatedAt: '2026-10-10' }, { id: 'c', amount: 3 }];
  const cloud = [{ id: 'a', amount: 9, updatedAt: '2026-10-09' }, { id: 'b', amount: 2, updatedAt: '2026-10-08' }];
  const merged = Business.mergeById(local, cloud);
  eq(merged.length, 3);
  const a = merged.find(x => x.id === 'a');
  eq(a.amount, 1, 'ban local moi hon phai thang');
  ok(merged.find(x => x.id === 'b'), 'ban chi co tren cloud van duoc giu');
});

test('gộp: bản ghi đã xoá (tombstone) không hồi sinh từ cloud', () => {
  const cloud = [{ id: 'x1', amount: 100 }, { id: 'x2', amount: 200 }];
  const merged = Business.mergeById([], cloud, ['x1']);
  eq(merged.length, 1);
  eq(merged[0].id, 'x2');
});

test('gộp: tombstone cũng loại bản đang có ở máy', () => {
  const merged = Business.mergeById([{ id: 'y1', amount: 50 }], [], ['y1']);
  eq(merged.length, 0);
});

console.log('\n== Lớp nghiệp vụ SpendWise ==\n');

test('tổng thu / tổng chi / số dư', () => {
  const tx = [
    { type: 'income', amount: 8000000 },
    { type: 'expense', amount: 2760000 },
    { type: 'expense', amount: 2480000 }
  ];
  eq(Business.totalIncome(tx), 8000000);
  eq(Business.totalExpense(tx), 5240000);
  eq(Business.balance(tx), 2760000);
});

test('bỏ qua bản ghi hỏng (thiếu amount)', () => {
  const tx = [{ type: 'expense', amount: 'abc' }, { type: 'expense', amount: 1000 }, null];
  eq(Business.totalExpense(tx), 1000);
});

test('ngân sách: tổng, đã chi, còn lại, phần trăm', () => {
  const budgets = { food: 3000000, transport: 1000000 };
  const tx = [
    { type: 'expense', category: 'food', amount: 1500000, date: '2026-10-05' },
    { type: 'expense', category: 'food', amount: 500000, date: '2026-10-06' },
    { type: 'expense', category: 'transport', amount: 200000, date: '2026-10-06' }
  ];
  const s = Business.budgetSummary(budgets, tx, '2026-10');
  eq(s.totalLimit, 4000000);
  eq(s.totalSpent, 2200000);
  eq(s.remaining, 1800000);
  eq(s.percent, 55);
});

test('ngân sách: giao dịch tháng khác không bị tính nhầm', () => {
  const budgets = { food: 3000000 };
  const tx = [
    { type: 'expense', category: 'food', amount: 1000000, date: '2026-09-30' },
    { type: 'expense', category: 'food', amount: 500000, date: '2026-10-01' }
  ];
  eq(Business.budgetSummary(budgets, tx, '2026-10').totalSpent, 500000);
});

test('chia tiền bảo toàn tổng (100.000đ / 3 người)', () => {
  const r = Business.splitBill(100000, 3);
  eq(r.amounts.length, 3);
  eq(r.amounts.reduce((a, b) => a + b, 0), 100000);
});

test('chia tiền: 100.000đ / 7 người vẫn đúng tổng', () => {
  const r = Business.splitBill(100000, 7);
  eq(r.amounts.reduce((a, b) => a + b, 0), 100000);
});

test('chia tiền: chia hết không có phần dư', () => {
  const r = Business.splitBill(90000, 3);
  eq(r.remainder, 0);
  eq(r.base, 30000);
});

test('parseAmount chặn giá trị không hợp lệ', () => {
  eq(Business.parseAmount('50000'), 50000);
  eq(Business.parseAmount('-100'), null);
  eq(Business.parseAmount(''), null);
  eq(Business.parseAmount('abc'), null);
  eq(Business.parseAmount('1e12'), null);
  eq(Business.parseAmount('999999999999999'), null);
  eq(Business.parseAmount('0'), null);
  eq(Business.parseAmount('1.2.3'), null);
});

test('parseAmount hiểu cách gõ tiền kiểu Việt Nam', () => {
  eq(Business.parseAmount('1.500.000'), 1500000);      // dấu chấm phân cách nghìn
  eq(Business.parseAmount('1,500,000'), 1500000);      // dấu phẩy phân cách nghìn
  eq(Business.parseAmount('2 500 000'), 2500000);      // khoảng trắng phân cách nghìn
  eq(Business.parseAmount('2tr'), 2000000);            // triệu
  eq(Business.parseAmount('2 triệu'), 2000000);
  eq(Business.parseAmount('1.5tr'), 1500000);
  eq(Business.parseAmount('20k'), 20000);              // nghìn
  eq(Business.parseAmount('1.2 tỷ'), 1200000000);      // tỷ
  eq(Business.parseAmount('12.5'), 13);                // thập phân → làm tròn
});

test('isValidDate kiểm tra ngày theo lịch', () => {
  ok(Business.isValidDate('2026-10-01'));
  ok(!Business.isValidDate('2026-02-30'));
  ok(!Business.isValidDate('2026-13-01'));
  ok(!Business.isValidDate('abc'));
  ok(Business.isValidDate('2028-02-29')); // năm nhuận
});

test('tiến độ mục tiêu', () => {
  const p = Business.goalProgress({ target: 10000000, saved: 2500000 });
  eq(p.percent, 25);
  eq(p.remaining, 7500000);
  ok(!p.completed);
});

test('hợp nhất ngân sách theo "thay đổi mới nhất"', () => {
  // local mới hơn → giữ local (kể cả khi nhỏ hơn)
  eq(Business.mergeBudgetValue(1200000, 1500000, '2026-10-07', '2026-10-06'), 1200000);
  // cloud mới hơn → giữ cloud
  eq(Business.mergeBudgetValue(1000000, 1500000, '2026-10-05', '2026-10-08'), 1500000);
  // chỉ có một phía
  eq(Business.mergeBudgetValue(undefined, 1500000, '', ''), 1500000);
  eq(Business.mergeBudgetValue(900000, undefined, '', ''), 900000);
});

test('số dư theo ví (không cộng vào tổng)', () => {
  const wallets = [{ id: 'cash', name: 'Tiền mặt' }, { id: 'bank', name: 'Ngân hàng' }];
  const tx = [
    { type: 'income', amount: 1000000, wallet: 'bank' },
    { type: 'expense', amount: 250000, wallet: 'cash' }
  ];
  const rows = Business.balanceByWallet(tx, wallets);
  eq(rows.length, 2);
  eq(rows.find(r => r.id === 'bank').balance, 1000000);
  eq(rows.find(r => r.id === 'cash').balance, -250000);
  eq(Business.balance(tx), 750000);
});

console.log(`\nKết quả: ${passed} đạt, ${failed} không đạt\n`);
process.exit(failed > 0 ? 1 : 0);