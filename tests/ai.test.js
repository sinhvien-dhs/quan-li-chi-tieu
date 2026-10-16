/**
 * tests/ai.test.js — Kiểm thử bộ phân tích AI (Local Parser, Slang, Date detection)
 *
 * Chạy: node tests/ai.test.js
 */

const fs = require('fs');
const path = require('path');
const vm = require('vm');

const files = [
  'js/utils.js',
  'js/business.js',
  'js/storage.js',
  'js/category.js',
  'js/features.js',
  'js/ai.js'
];

// Mock localStorage
const mockStorage = {};
const localStorageMock = {
  getItem: (k) => mockStorage[k] || null,
  setItem: (k, v) => { mockStorage[k] = String(v); },
  removeItem: (k) => { delete mockStorage[k]; },
  clear: () => { Object.keys(mockStorage).forEach(k => delete mockStorage[k]); }
};

const sandbox = {
  console,
  localStorage: localStorageMock,
  window: { localStorage: localStorageMock },
  navigator: { onLine: true },
  setTimeout,
  clearTimeout
};

vm.createContext(sandbox);

files.forEach((f) => {
  const code = fs.readFileSync(path.join(__dirname, '..', f), 'utf8');
  vm.runInContext(code, sandbox);
});

// Expose lexical bindings to sandbox root
vm.runInContext(`
  this.Utils = Utils;
  this.Business = Business;
  this.Storage = Storage;
  this.Categories = Categories;
  this.Features = Features;
  this.AIEntry = AIEntry;
`, sandbox);

const { AIEntry, Utils, Business } = sandbox;

let passed = 0, failed = 0;
function test(name, fn) {
  try {
    fn();
    passed++;
    console.log('  ✓ ' + name);
  } catch (err) {
    failed++;
    console.error('  ✗ ' + name);
    console.error('    ' + err.message);
  }
}

function eq(actual, expected, msg = '') {
  if (actual !== expected) {
    throw new Error(`${msg} Mong muốn: ${expected}, thực tế: ${actual}`);
  }
}

console.log('\n== Kiểm thử AI Entry (Local Parser & Slang) ==\n');

test('Phân tích câu chi tiêu cơ bản', () => {
  const res = AIEntry.parseLocal('Ăn bún bò 40k');
  eq(res.items.length, 1);
  eq(res.items[0].name, 'Ăn bún bò');
  eq(res.items[0].amount, 40000);
  eq(res.items[0].type, 'expense');
  eq(res.items[0].category, 'food');
  eq(res.items[0].date, Utils.getToday());
});

test('Phân tích câu thu nhập', () => {
  const res = AIEntry.parseLocal('Nhận lương 10tr');
  eq(res.items.length, 1);
  eq(res.items[0].name, 'Nhận lương');
  eq(res.items[0].amount, 10000000);
  eq(res.items[0].type, 'income');
  eq(res.items[0].category, 'salary');
});

test('Tiếng lóng: cành, lít, củ, xu', () => {
  const res1 = AIEntry.parseLocal('Đổ xăng 50 cành');
  eq(res1.items[0].amount, 50000);
  eq(res1.items[0].category, 'transport');

  const res2 = AIEntry.parseLocal('Mua áo 2 lít');
  eq(res2.items[0].amount, 200000);
  eq(res2.items[0].category, 'shopping');

  const res3 = AIEntry.parseLocal('Thưởng dự án 3 củ');
  eq(res3.items[0].amount, 3000000);
  eq(res3.items[0].type, 'income');

  const res4 = AIEntry.parseLocal('Uống trà đá 10 xu');
  eq(res4.items[0].amount, 10000);
  eq(res4.items[0].category, 'food');
});

test('Tiếng lóng đặc biệt: nửa củ, nửa lít', () => {
  const res1 = AIEntry.parseLocal('Đóng tiền điện nửa củ');
  eq(res1.items[0].amount, 500000);
  eq(res1.items[0].name, 'Đóng tiền điện');
  eq(res1.items[0].category, 'bills');

  const res2 = AIEntry.parseLocal('Uống sinh tố nửa lít');
  eq(res2.items[0].amount, 50000);
  eq(res2.items[0].name, 'Uống sinh tố');
  eq(res2.items[0].category, 'food');
});

test('Nhận diện ngày: hôm qua, hôm kia, sáng nay', () => {
  const resYesterday = AIEntry.parseLocal('Hôm qua ăn lẩu 300k');
  eq(resYesterday.items[0].name, 'Ăn lẩu');
  eq(resYesterday.items[0].amount, 300000);
  eq(resYesterday.items[0].date, AIEntry.getDateOffset(-1));

  const res2DaysAgo = AIEntry.parseLocal('Hôm kia mua sách 120k');
  eq(res2DaysAgo.items[0].name, 'Mua sách');
  eq(res2DaysAgo.items[0].amount, 120000);
  eq(res2DaysAgo.items[0].date, AIEntry.getDateOffset(-2));

  const resToday = AIEntry.parseLocal('Sáng nay uống cà phê 35k');
  eq(resToday.items[0].name, 'Uống cà phê');
  eq(resToday.items[0].amount, 35000);
  eq(resToday.items[0].date, Utils.getToday());
});

test('Tách nhiều giao dịch trong 1 câu', () => {
  const res = AIEntry.parseLocal('Ăn bún bò 40k, đổ xăng 50k, uống trà sữa 30k');
  eq(res.items.length, 3);
  eq(res.items[0].amount, 40000);
  eq(res.items[1].amount, 50000);
  eq(res.items[2].amount, 30000);
});

test('Tách câu thông minh khi người dùng không gõ dấu phẩy', () => {
  const res = AIEntry.parseLocal('sáng nay ăn cơm hết 100k chiều uống nước 50k và cả ngày đi xe hết 200k');
  eq(res.items.length, 3);
  eq(res.items[0].name, 'Ăn cơm');
  eq(res.items[0].amount, 100000);
  eq(res.items[0].category, 'food');

  eq(res.items[1].name, 'Uống nước');
  eq(res.items[1].amount, 50000);
  eq(res.items[1].category, 'food');

  eq(res.items[2].amount, 200000);
  eq(res.items[2].category, 'transport');
});

test('Lưu & đọc cấu hình 9Router (URL, Key, Model)', () => {
  AIEntry.set9RouterUrl('http://localhost:20128/v1');
  eq(AIEntry.get9RouterUrl(), 'http://localhost:20128/v1');
  eq(AIEntry.has9Router(), true);

  AIEntry.set9RouterKey('sk-9router-secret');
  eq(AIEntry.get9RouterKey(), 'sk-9router-secret');

  AIEntry.set9RouterModel('gemini-2.5-flash');
  eq(AIEntry.get9RouterModel(), 'gemini-2.5-flash');

  // Khôi phục
  AIEntry.set9RouterUrl('');
  AIEntry.set9RouterKey('');
  AIEntry.set9RouterModel('');
  eq(AIEntry.has9Router(), false);
  eq(AIEntry.get9RouterModel(), 'gemini-2.0-flash'); // Default fallback
});

test('Trạng thái chế độ AI (Engine Mode)', () => {
  // Khi không có 9router và không có key
  const m1 = AIEntry.getEngineMode();
  eq(m1.engine, 'local');
  eq(m1.label, 'Cục bộ (Sẵn sàng)');

  // Khi có 9Router
  AIEntry.set9RouterUrl('http://localhost:20128/v1');
  AIEntry.set9RouterModel('gemini-2.0-flash');
  const m9r = AIEntry.getEngineMode();
  eq(m9r.engine, '9router');
  eq(m9r.label, '9Router Gateway');
  AIEntry.set9RouterUrl('');

  // Khi có direct key
  AIEntry.setApiKey('test-key');
  const mKey = AIEntry.getEngineMode();
  eq(mKey.engine, 'gemini');
  eq(mKey.label, 'Gemini Direct');
  AIEntry.setApiKey('');

  // Khi offline
  sandbox.navigator.onLine = false;
  const m3 = AIEntry.getEngineMode();
  eq(m3.engine, 'local');
  eq(m3.label, 'Ngoại tuyến');

  // Khôi phục
  sandbox.navigator.onLine = true;
});

console.log(`\nKết quả: ${passed} đạt, ${failed} không đạt\n`);
if (failed > 0) process.exit(1);
