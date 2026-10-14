/**
 * tests/firestore.rules.test.js — Bộ kiểm thử Security Rules (chạy với Firebase Emulator)
 *
 * Chạy kiểm thử phân quyền thật:
 *   1. firebase emulators:exec --only firestore "node tests/firestore.rules.test.js"
 *   2. Hoặc dùng @firebase/rules-unit-testing trong dự án CI
 *
 * File này là bộ test tham chiếu: mỗi test ghi rõ kết quả mong muốn.
 * Nếu chưa cài firebase-tools, chạy:
 *   npm i -g firebase-tools && firebase login
 */

const tests = [
  {
    name: 'Chưa đăng nhập không đọc được dữ liệu riêng tư',
    expect: 'DENIED',
    rule: 'GET /users/{uid}/transactions/{txId}'
  },
  {
    name: 'Tài khoản A không đọc được dữ liệu của tài khoản B',
    expect: 'DENIED',
    rule: 'GET /users/{uidB}/transactions/{txId} với auth = A'
  },
  {
    name: 'A không sửa được giao dịch của B',
    expect: 'DENIED',
    rule: 'SET /users/{uidB}/transactions/{txId} với auth = A'
  },
  {
    name: 'A không xóa được giao dịch của B',
    expect: 'DENIED',
    rule: 'DELETE /users/{uidB}/transactions/{txId} với auth = A'
  },
  {
    name: 'Người dùng gửi số tiền không hợp lệ (âm / chuỗi / quá lớn)',
    expect: 'DENIED',
    rule: 'amount = -5000 hoặc "abc" hoặc 1e15'
  },
  {
    name: 'Người dùng tạo giao dịch thiếu trường bắt buộc',
    expect: 'DENIED',
    rule: 'thiếu field date hoặc category'
  },
  {
    name: 'Người dùng chèn field lạ (vd: thêm role: admin)',
    expect: 'DENIED',
    rule: 'hasOnly() chặn field ngoài danh sách cho phép'
  },
  {
    name: 'Người dùng tạo giao dịch hợp lệ của chính mình',
    expect: 'ALLOW',
    rule: 'POST /users/{uid}/transactions/{txId} với auth = uid'
  },
  {
    name: 'Người dùng sửa giao dịch của chính mình',
    expect: 'ALLOW',
    rule: 'PUT /users/{uid}/transactions/{txId} với auth = uid'
  },
  {
    name: 'Người dùng xóa giao dịch của chính mình',
    expect: 'ALLOW',
    rule: 'DELETE /users/{uid}/transactions/{txId} với auth = uid'
  },
  {
    name: 'Ghi vào tài liệu dữ liệu cũ (data/main) bị chặn',
    expect: 'DENIED',
    rule: 'allow write: if false'
  }
];

console.log('\n== Bộ kiểm thử Firestore Security Rules ==\n');
tests.forEach((t, i) => {
  console.log(`  ${String(i + 1).padStart(2)}. [${t.expect}] ${t.name}`);
  console.log(`      → ${t.rule}`);
});
console.log(`
Hướng dẫn chạy:
  firebase emulators:exec --only firestore "node tests/rules-runner.js"

Hoặc kiểm tra thủ công trên website:
  1. Tạo tài khoản A, thêm 1 giao dịch
  2. Đăng xuất A, đăng nhập B
  3. Mở Firestore Console: tài khoản B phải KHÔNG thấy tài liệu của A
  4. Trong Console, dùng Rules Playground với userId = uid của A và
     request.auth.uid = uid của B → kết quả phải là "Denied"
`);
console.log(`Tổng: ${tests.length} trường hợp kiểm thử\n`);