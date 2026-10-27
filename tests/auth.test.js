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

async function test(name, fn) {
  try {
    await fn();
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

const elemCache = {};

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
  querySelectorAll: () => [],
  getElementById: (id) => {
    if (!elemCache[id]) {
      if (!domClasses[id]) domClasses[id] = new Set();
      elemCache[id] = {
        id,
        textContent: '',
        style: { display: '' },
        parentElement: {
          querySelector: () => ({ textContent: '' })
        },
        addEventListener: () => {},
        classList: {
          add: (c) => domClasses[id].add(c),
          remove: (c) => domClasses[id].delete(c),
          contains: (c) => domClasses[id].has(c)
        }
      };
    }
    return elemCache[id];
  }
};

const authSrc = fs.readFileSync(path.join(__dirname, '..', 'js', 'auth.js'), 'utf8');
const sandbox = {
  console,
  localStorage: localStorageMock,
  document: documentMock,
  FIREBASE_CONFIG: { apiKey: 'AIzaSyTest123' },
  firebase: {
    initializeApp: () => {},
    auth: () => ({
      onAuthStateChanged: () => {},
      setPersistence: async () => {},
      getRedirectResult: async () => null,
      signOut: async () => {}
    }),
    firestore: () => ({
      enablePersistence: () => Promise.resolve()
    })
  },
  Business: { mergeById: (a, b) => a.concat(b) },
  Storage: { get: () => null, set: () => {}, KEYS: {} },
  Toast: { success: () => {}, error: () => {}, warning: () => {} },
  PWAManager: { initOnboarding: () => {} },
  ConfirmDialog: { show: (opts) => { if (opts && opts.onConfirm) opts.onConfirm(); } },
  PageManager: { switchTo: () => {} },
  navigator: { userAgent: 'Node' },
  window: { location: { protocol: 'https:', hostname: 'sinhvien-dhs.github.io' } },
  setTimeout,
  clearTimeout,
  Promise
};

vm.createContext(sandbox);
vm.runInContext(authSrc + '\n;this.AuthManager = AuthManager;', sandbox);
const AuthManager = sandbox.AuthManager;

// Test suite
(async () => {
  await test('AuthManager.isConfigured nhận diện key hợp lệ', () => {
    ok(AuthManager.isConfigured(), 'Phải cấu hình thành công với AIzaSyTest123');
  });

  await test('AuthManager.friendlyError dịch đúng các mã lỗi Firebase', () => {
    eq(AuthManager.friendlyError({ code: 'auth/user-not-found' }), 'Tên đăng nhập không tồn tại!');
    eq(AuthManager.friendlyError({ code: 'auth/wrong-password' }), 'Sai mật khẩu!');
    eq(AuthManager.friendlyError({ code: 'auth/email-already-in-use' }), 'Tên đăng nhập đã được đăng ký!');
    eq(AuthManager.friendlyError({ code: 'auth/invalid-email' }), 'Email không hợp lệ!');
    eq(AuthManager.friendlyError({ code: 'auth/weak-password' }), 'Mật khẩu quá yếu (tối thiểu 8 ký tự, có chữ và số)!');
    eq(AuthManager.friendlyError({ code: 'auth/popup-blocked' }), 'Cửa sổ đăng nhập Google bị trình duyệt chặn. Hãy cho phép popup hoặc thử lại.');
    eq(AuthManager.friendlyError({ code: 'auth/operation-not-supported-in-this-environment' }), 'Không hỗ trợ đăng nhập Google khi mở trực tiếp file://. Vui lòng chạy qua localhost hoặc đưa lên web.');
  });

  await test('showAuthGate khóa toàn bộ ứng dụng và bật lớp phủ đăng nhập kèm force-show', () => {
    AuthManager.showAuthGate();
    ok(domClasses.html.has('auth-pending'), 'html phải có class auth-pending');
    ok(domClasses.body.has('auth-locked'), 'body phải có class auth-locked');
    ok(domClasses.authOverlay.has('active'), 'authOverlay phải có class active');
    ok(domClasses.authOverlay.has('force-show'), 'authOverlay phải có class force-show');
    eq(documentMock.getElementById('authOverlay').style.display, 'flex', 'authOverlay.style.display phải là flex');
    eq(documentMock.body.style.overflow, 'hidden', 'body.style.overflow phải là hidden');
  });

  await test('hideAuthGate mở khóa ứng dụng khi đăng nhập thành công', () => {
    AuthManager.hideAuthGate();
    ok(!domClasses.html.has('auth-pending'), 'auth-pending phải bị xóa');
    ok(!domClasses.body.has('auth-locked'), 'auth-locked phải bị xóa');
    ok(!domClasses.authOverlay.has('active'), 'authOverlay active phải bị xóa');
    ok(!domClasses.authOverlay.has('force-show'), 'authOverlay force-show phải bị xóa');
    eq(documentMock.getElementById('authOverlay').style.display, 'none', 'authOverlay.style.display phải là none');
    eq(documentMock.body.style.overflow, '', 'body.style.overflow phải rỗng');
  });

  await test('clearLocalUserData không làm mất lớp khóa authOverlay', () => {
    AuthManager.showAuthGate();
    AuthManager.clearLocalUserData();
    ok(domClasses.authOverlay.has('active'), 'authOverlay vẫn phải active khi chưa có người dùng');
  });

  await test('updateAccountUI cập nhật đúng trạng thái header và profile card', () => {
    const user = { email: 'test@example.com', displayName: 'Tester' };
    AuthManager.updateAccountUI(user);

    const headerUserBtn = documentMock.getElementById('headerUserBtn');
    const headerLogoutBtn = documentMock.getElementById('headerLogoutBtn');
    const profileCard = documentMock.getElementById('userProfileCard');
    eq(headerUserBtn.style.display, 'inline-flex', 'headerUserBtn phải hiện khi có user');
    eq(headerLogoutBtn.style.display, 'inline-flex', 'headerLogoutBtn phải hiện khi có user');
    eq(profileCard.style.display, 'flex', 'userProfileCard phải hiện khi có user');

    AuthManager.updateAccountUI(null);
    eq(headerUserBtn.style.display, 'none', 'headerUserBtn phải ẩn khi không có user');
    eq(headerLogoutBtn.style.display, 'none', 'headerLogoutBtn phải ẩn khi không có user');
    eq(profileCard.style.display, 'none', 'userProfileCard phải ẩn khi không có user');
  });

  await test('signOut đăng xuất thành công không bị block và khóa lại app', async () => {
    localStorageMock.setItem('spendwise_uid', 'user123');
    AuthManager.currentUser = { uid: 'user123' };
    AuthManager.pushToCloud = async () => { throw new Error('Cloud sync failed'); };
    AuthManager.auth = { signOut: async () => {} };

    await AuthManager.signOut();

    eq(localStorageMock.getItem('spendwise_uid'), null, 'spendwise_uid phải bị xóa');
    eq(AuthManager.currentUser, null, 'currentUser phải null sau signOut');
    ok(domClasses.authOverlay.has('active'), 'authOverlay phải active sau khi đăng xuất');
    ok(domClasses.authOverlay.has('force-show'), 'authOverlay phải force-show sau khi đăng xuất');
  });

  await test('schedulePush tự động chạy ngầm không phát sinh toast làm phiền người dùng', async () => {
    let toastCalled = false;
    sandbox.Toast = {
      success: () => { toastCalled = true; },
      error: () => { toastCalled = true; },
      warning: () => { toastCalled = true; }
    };

    AuthManager.currentUser = { uid: 'user123' };
    AuthManager.pushToCloud = async () => true;

    AuthManager.schedulePush();
    await new Promise(r => setTimeout(r, 1600));

    eq(toastCalled, false, 'schedulePush không được gọi bất kỳ Toast nào');
  });

  await test('pullFromCloud({ silent: true }) đồng bộ khởi động trong im lặng', async () => {
    let toastCalled = false;
    sandbox.Toast = {
      success: () => { toastCalled = true; },
      error: () => { toastCalled = true; },
      warning: () => { toastCalled = true; }
    };

    AuthManager.currentUser = { uid: 'user123' };
    AuthManager.userRoot = () => ({
      collection: () => ({
        get: async () => ({ docs: [] }),
        doc: () => ({ get: async () => ({ exists: false }) })
      })
    });
    AuthManager.pushToCloud = async () => true;

    await AuthManager.pullFromCloud({ silent: true });
    eq(toastCalled, false, 'pullFromCloud silent không được gọi Toast.success');
  });

  await test('init: tải lại trang khi đã đăng nhập (spendwise_uid) lập tức mở khóa ứng dụng', () => {
    localStorageMock.setItem('spendwise_uid', 'user123');
    localStorageMock.removeItem('spendwise_local_mode');
    domClasses.authOverlay.add('active');
    domClasses.html.add('auth-pending');

    AuthManager.init();

    ok(!domClasses.html.has('auth-pending'), 'auth-pending phải bị gỡ khi có spendwise_uid');
    ok(!domClasses.authOverlay.has('active'), 'authOverlay active phải bị gỡ khi có spendwise_uid');
  });

  await test('init: tải lại trang ở chế độ trên máy (local mode) không bị khóa màn hình đăng nhập', () => {
    localStorageMock.removeItem('spendwise_uid');
    localStorageMock.setItem('spendwise_local_mode', '1');
    domClasses.authOverlay.add('active');
    domClasses.html.add('auth-pending');

    AuthManager.init();

    ok(!domClasses.html.has('auth-pending'), 'auth-pending phải bị gỡ ở local mode');
    ok(!domClasses.authOverlay.has('active'), 'authOverlay active phải bị gỡ ở local mode');
  });

  await test('onAuthStateChanged: user = null khi đang ở local mode không bị đẩy về màn hình đăng nhập', async () => {
    localStorageMock.removeItem('spendwise_uid');
    localStorageMock.setItem('spendwise_local_mode', '1');
    domClasses.authOverlay.clear();
    domClasses.html.clear();

    let authStateCallback = null;
    sandbox.firebase.auth = () => ({
      onAuthStateChanged: (cb) => { authStateCallback = cb; },
      setPersistence: async () => {},
      getRedirectResult: async () => null
    });

    AuthManager.init();
    ok(typeof authStateCallback === 'function', 'Phải đăng ký onAuthStateChanged');

    // Kích hoạt onAuthStateChanged với null
    await authStateCallback(null);

    ok(!domClasses.html.has('auth-pending'), 'auth-pending không được bật khi null ở local mode');
    ok(!domClasses.authOverlay.has('active'), 'authOverlay không được active khi null ở local mode');
    eq(localStorageMock.getItem('spendwise_local_mode'), '1', 'local mode phải được bảo lưu');
  });

  await test('onAuthStateChanged: user = null tạm thời trên mobile khi có spendwise_uid không lập tức xóa uid và khóa app', async () => {
    localStorageMock.setItem('spendwise_uid', 'user_mobile_123');
    localStorageMock.removeItem('spendwise_local_mode');
    domClasses.authOverlay.clear();
    domClasses.html.clear();

    let authStateCallback = null;
    sandbox.firebase.auth = () => ({
      onAuthStateChanged: (cb) => { authStateCallback = cb; },
      setPersistence: async () => {},
      getRedirectResult: async () => null
    });

    AuthManager.init();
    ok(typeof authStateCallback === 'function', 'Phải đăng ký onAuthStateChanged');

    // Giả lập Firebase phát ra null tạm thời lúc khởi động
    await authStateCallback(null);

    ok(!domClasses.html.has('auth-pending'), 'không được bật auth-pending trong thời gian chờ IndexedDB');
    ok(!domClasses.authOverlay.has('active'), 'không được bật active authOverlay trong thời gian chờ IndexedDB');
    eq(localStorageMock.getItem('spendwise_uid'), 'user_mobile_123', 'spendwise_uid không được bị xóa vội vã');

    // Sau đó Firebase hoàn tất nạp user từ IndexedDB
    await authStateCallback({ uid: 'user_mobile_123', email: 'user@spendwise.app' });
    eq(AuthManager.currentUser.uid, 'user_mobile_123', 'currentUser phải được thiết lập');
    ok(!domClasses.authOverlay.has('active'), 'authOverlay vẫn không bị active');
  });

  await test('isInAppBrowser nhận diện đúng Zalo và Facebook', () => {
    sandbox.navigator.userAgent = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) Mobile/15E148 [FBAN/FBIOS;FBAV/400.0]';
    ok(AuthManager.isInAppBrowser(), 'FB user agent phải là in-app browser');

    sandbox.navigator.userAgent = 'Mozilla/5.0 (Linux; U; Android 14; vi-vn; SM-G991B Build/TP1A.220624.014) Zalo/24.01.01';
    ok(AuthManager.isInAppBrowser(), 'Zalo user agent phải là in-app browser');

    sandbox.navigator.userAgent = 'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 Chrome/120.0 Mobile Safari/537.36';
    ok(!AuthManager.isInAppBrowser(), 'Chrome Android chuẩn không phải in-app browser');
  });

  await test('signInWithGoogle trên điện thoại ưu tiên signInWithPopup (tránh lỗi kết nối redirect)', async () => {
    let popupCalled = false;
    let redirectCalled = false;
    AuthManager.auth = {
      signInWithPopup: async () => {
        popupCalled = true;
        return { user: { uid: 'u_mobile_123', email: 'mobile@spendwise.app' } };
      },
      signInWithRedirect: async () => { redirectCalled = true; }
    };
    sandbox.navigator.userAgent = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148 Safari/604.1';
    sandbox.firebase.auth.GoogleAuthProvider = function() {
      this.addScope = () => {};
      this.setCustomParameters = () => {};
    };

    await AuthManager.signInWithGoogle();

    ok(popupCalled, 'signInWithGoogle trên mobile phải gọi signInWithPopup');
    ok(!redirectCalled, 'không được ép redirect khi popup chạy được');
    eq(localStorageMock.getItem('spendwise_uid'), 'u_mobile_123', 'phải lưu uid thành công');
  });

  console.log(`\nKết quả: ${passed} đạt, ${failed} không đạt\n`);
  if (failed > 0) process.exit(1);
})();
