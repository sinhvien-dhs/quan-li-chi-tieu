/**
 * tests/auth.test.js — Kiểm thử Auth Gate & xác thực bắt buộc
 *
 * Chạy: node tests/auth.test.js
 */

const fs = require('fs');
const path = require('path');
const vm = require('vm');

let passed = 0;
let failed = 0;

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

function ok(v, msg) {
  if (!v) throw new Error(msg || 'expected truthy');
}

console.log('\n== Kiểm thử Auth Wall / Login Gate ==\n');

// 1. Mock DOM and Storage sandbox
const storageMap = new Map();
const localStorageMock = {
  getItem: (k) => (storageMap.has(k) ? storageMap.get(k) : null),
  setItem: (k, v) => storageMap.set(k, String(v)),
  removeItem: (k) => storageMap.delete(k),
  clear: () => storageMap.clear()
};

const domClasses = {
  html: new Set(),
  body: new Set(),
  authOverlay: new Set(['modal-overlay']),
  authRegisterOverlay: new Set(['modal-overlay'])
};

const documentMock = {
  documentElement: {
    classList: {
      add: (c) => domClasses.html.add(c),
      remove: (c) => domClasses.html.delete(c),
      contains: (c) => domClasses.html.has(c)
    }
  },
  body: {
    classList: {
      add: (c) => domClasses.body.add(c),
      remove: (c) => domClasses.body.delete(c),
      contains: (c) => domClasses.body.has(c)
    },
    style: { overflow: '' }
  },
  getElementById: (id) => {
    if (id === 'authOverlay' || id === 'authRegisterOverlay') {
      return {
        id,
        classList: {
          add: (c) => domClasses[id].add(c),
          remove: (c) => domClasses[id].delete(c),
          contains: (c) => domClasses[id].has(c)
        }
      };
    }
    return null;
  }
};

const authSrc = fs.readFileSync(path.join(__dirname, '..', 'js', 'auth.js'), 'utf8');
const sandbox = {
  console,
  localStorage: localStorageMock,
  document: documentMock,
  FIREBASE_CONFIG: { apiKey: 'AIzaSyTest123' },
  firebase: { initializeApp: () => {}, auth: () => {}, firestore: () => {} },
  Business: { mergeById: (a, b) => a.concat(b) },
  Storage: { get: () => null, set: () => {}, KEYS: {} },
  Toast: { success: () => {}, error: () => {}, warning: () => {} },
  PWAManager: { initOnboarding: () => {} }
};

vm.createContext(sandbox);
vm.runInContext(authSrc + '\n;this.AuthManager = AuthManager;', sandbox);
const AuthManager = sandbox.AuthManager;

// Test suite
test('AuthManager.isConfigured nhận diện key hợp lệ', () => {
  ok(AuthManager.isConfigured(), 'Phải cấu hình thành công với AIzaSyTest123');
});

test('AuthManager.friendlyError dịch đúng các mã lỗi Firebase', () => {
  eq(AuthManager.friendlyError({ code: 'auth/user-not-found' }), 'Tên đăng nhập không tồn tại!');
  eq(AuthManager.friendlyError({ code: 'auth/wrong-password' }), 'Sai mật khẩu!');
  eq(AuthManager.friendlyError({ code: 'auth/email-already-in-use' }), 'Tên đăng nhập đã được đăng ký!');
  eq(AuthManager.friendlyError({ code: 'auth/invalid-email' }), 'Email không hợp lệ!');
  eq(AuthManager.friendlyError({ code: 'auth/weak-password' }), 'Mật khẩu quá yếu (tối thiểu 8 ký tự, có chữ và số)!');
});

test('showAuthGate khóa toàn bộ ứng dụng và bật lớp phủ đăng nhập', () => {
  AuthManager.showAuthGate();
  ok(domClasses.html.has('auth-pending'), 'html phải có class auth-pending');
  ok(domClasses.body.has('auth-locked'), 'body phải có class auth-locked');
  ok(domClasses.authOverlay.has('active'), 'authOverlay phải có class active');
  eq(documentMock.body.style.overflow, 'hidden', 'body.style.overflow phải là hidden');
});

test('hideAuthGate mở khóa ứng dụng khi đăng nhập thành công', () => {
  AuthManager.hideAuthGate();
  ok(!domClasses.html.has('auth-pending'), 'auth-pending phải bị xóa');
  ok(!domClasses.body.has('auth-locked'), 'auth-locked phải bị xóa');
  ok(!domClasses.authOverlay.has('active'), 'authOverlay active phải bị xóa');
  eq(documentMock.body.style.overflow, '', 'body.style.overflow phải rỗng');
});

test('clearLocalUserData không làm mất lớp khóa authOverlay', () => {
  AuthManager.showAuthGate();
  AuthManager.clearLocalUserData();
  ok(domClasses.authOverlay.has('active'), 'authOverlay vẫn phải active khi chưa có người dùng');
});

console.log(`\nKết quả: ${passed} đạt, ${failed} không đạt\n`);
if (failed > 0) process.exit(1);
