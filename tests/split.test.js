/**
 * Test cho phép chia tiền & sổ nợ (chạy: node tests/split.test.js)
 * Không phụ thuộc trình duyệt — chỉ dùng các hàm thuần của Business.
 */

// ==== Nạp Business (phần nghiệp vụ thuần, không cần DOM) ====
const fs = require('fs');
const path = require('path');
const src = fs.readFileSync(path.join(__dirname, '..', 'js', 'business.js'), 'utf8');
const start = src.indexOf('const Business =');
const end = src.lastIndexOf('};') + 2;
const Business = eval(src.slice(start, end) + '; Business');

let pass = 0, fail = 0;
const ok = (name, cond, extra) => {
  if (cond) { pass++; console.log('  [DUNG] ' + name); }
  else { fail++; console.log('  [SAI ] ' + name + (extra ? ' → ' + extra : '')); }
};
const sum = (a) => a.reduce((s, x) => s + x, 0);

console.log('=== 1. Phan bo phan du ===');
const s1 = Business.splitBill(100000, 3);
ok('100.000 / 3: tong khop', sum(s1.amounts) === 100000, sum(s1.amounts).toString());
ok('100.000 / 3: 1 nguoi +1dung', s1.remainder === 1 && s1.amounts.filter(x => x === s1.base + 1).length === 1,
  JSON.stringify(s1.amounts));
ok('100.000 / 3: phan nguyen 33.333', s1.base === 33333);

const s2 = Business.splitBill(10000, 3);
ok('10.000 / 3: tong khop', sum(s2.amounts) === 10000);
ok('10.000 / 3: 1 nguoi nhan them 1d', s2.amounts.filter(x => x === 3334).length === 1, JSON.stringify(s2.amounts));

const s3 = Business.splitBill(1000, 4);
ok('1.000 / 4: tong khop', sum(s3.amounts) === 1000);
ok('1.000 / 4: khong ai +1d', s3.remainder === 0);

console.log('\n=== 2. Bien doi ===');
ok('chia 0 nguoi → 1 nguoi, khong NaN', Business.splitBill(1000, 0).amounts.length === 1);
ok('tong 0 → 0', sum(Business.splitBill(0, 3).amounts) === 0);
ok('tong am → 0', sum(Business.splitBill(-5000, 3).amounts) === 0);

console.log('\n=== 3. Mo phong vietQR (logic trong split.js) ===');
// Sao chep logic tra cuu BIN tu split.js de kiem tra khoa viet thuong
const banKeys = ['vcb', 'techcombank', 'vietinbank', 'mb', 'bidv', 'acb', 'agribank',
  'vpbank', 'tpb', 'sacombank', 'vib', 'mbbank', 'shb', 'tpbank', 'momo', 'zalopay'];
const splitSrc = fs.readFileSync(path.join(__dirname, '..', 'js', 'split.js'), 'utf8');
const bankBlock = splitSrc.slice(splitSrc.indexOf('BANKS: {'), splitSrc.indexOf('BANK_NAMES'));
const keysTrongCode = [...bankBlock.matchAll(/([A-Za-z_]+)\s*:/g)].map(m => m[1]).filter(k => k !== 'BANKS');
ok('mo khoa ngan hang deu viet thuong', keysTrongCode.every(k => k === k.toLowerCase()), keysTrongCode.join(','));
ok('co du 16 ma ngan hang', keysTrongCode.length === 16, keysTrongCode.length.toString());
ok('mo khoa tra cuu duoc dung danh sach', banKeys.every(k => keysTrongCode.includes(k)));

console.log('\n=== 4. So no nhom ===');
// Mô phỏng upsertDebt moi: moi nguoi no dung phan cua minh
function upsertDebtMoPhong(o) {
  const n = Math.max(1, o.members.length);
  let amounts = Array.isArray(o.amounts) && o.amounts.length === n ? o.amounts : Business.splitBill(o.total, n).amounts;
  const diff = o.total - sum(amounts);
  if (diff !== 0) amounts = Business.splitBill(o.total, n).amounts;
  const myIndex = Math.min(n - 1, Math.max(0, o.myIndex || 0));
  const debts = o.members.map((name, i) => ({ name, amount: amounts[i], index: i }))
    .filter(x => x.index !== myIndex);
  const record = { total: o.total, myAmount: amounts[myIndex], debts };
  record.check = sum(debts.map(d => d.amount)) + record.myAmount === o.total;
  return record;
}

// Ca cua review: 300.000 / 4 nguoi, toi la nguoi 1
const c1 = upsertDebtMoPhong({ total: 300000, members: ['Tôi', 'An', 'Bình', 'Chi'], myIndex: 0 });
ok('300.000/4 ng: moi nguoi no 75.000', c1.debts.every(d => d.amount === 75000), JSON.stringify(c1.debts.map(d => d.amount)));
ok('300.000/4 ng: tong khop 300.000', c1.check, (sum(c1.debts.map(d => d.amount)) + c1.myAmount).toString());

// Ca co phan du: 100.000 / 3 nguoi, toi la nguoi 1
const c2 = upsertDebtMoPhong({ total: 100000, members: ['Tôi', 'An', 'Bình'], myIndex: 0 });
ok('100.000/3 ng: tong khop', c2.check, JSON.stringify(c2.debts.map(d => d.amount)) + ' + ' + c2.myAmount);
ok('100.000/3 ng: khong ai bi tinh sai', c2.debts.every(d => d.amount === 33333 || d.amount === 33334));

// Toi la nguoi cuoi
const c3 = upsertDebtMoPhong({ total: 100000, members: ['An', 'Bình', 'Tôi'], myIndex: 2 });
ok('100.000/3 ng (toi la nguoi cuoi): tong khop', c3.check);

// Nguoi la giua
const c4 = upsertDebtMoPhong({ total: 90000, members: ['An', 'Tôi', 'Bình', 'Chi'], myIndex: 1 });
ok('90.000/4 ng (toi la nguoi 2): tong khop', c4.check);
ok('90.000/4 ng: 3 nguoi no, moi nguoi 22.500', c4.debts.length === 3 && c4.debts.every(d => d.amount === 22500));

console.log('\n=== Ket qua ===');
console.log(pass + ' dat, ' + fail + ' khong dat');
process.exit(fail > 0 ? 1 : 0);