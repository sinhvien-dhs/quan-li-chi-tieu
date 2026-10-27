/**
 * auth.js — Tài khoản (Firebase Auth) + tầng đồng bộ dữ liệu Firestore
 *
 * Kiến trúc dữ liệu trên cloud (mỗi bản ghi = 1 tài liệu riêng,
 * tránh vượt giới hạn 1 MiB/tài liệu của Firestore):
 *
 *   users/{uid}/transactions/{txId}
 *   users/{uid}/wallets/{walletId}
 *   users/{uid}/goals/{goalId}
 *   users/{uid}/recurring/{ruleId}
 *   users/{uid}/budgets/main
 *   users/{uid}/settings/main
 */

const AuthManager = {
  currentUser: null,
  auth: null,
  db: null,
  _pushTimer: null,
  _pushing: false,

  DATA_KEYS: [
    'spendwise_transactions',
    'spendwise_budgets',
    'spendwise_wallets',
    'spendwise_goals',
    'spendwise_recurring',
    'spendwise_debts',
    'spendwise_currency',
    'spendwise_theme',
    'spendwise_reminder_time',
    'spendwise_demo_ids',
    'spendwise_demo_mode'
  ],

  COLLECTIONS: {
    spendwise_transactions: 'transactions',
    spendwise_wallets: 'wallets',
    spendwise_goals: 'goals',
    spendwise_recurring: 'recurring',
    // Sổ nợ nhóm cũng đồng bộ lên tài khoản để không mất khi đổi máy
    spendwise_debts: 'debts'
  },

  // Phiên bản build — hiển thị ở Cài đặt để xác nhận đang chạy bản mới nhất
  APP_VERSION: '1.0.0',

  isConfigured() {
    return typeof FIREBASE_CONFIG !== 'undefined' &&
      !!FIREBASE_CONFIG.apiKey &&
      !FIREBASE_CONFIG.apiKey.startsWith('__FIREBASE_') &&
      !FIREBASE_CONFIG.apiKey.startsWith('YOUR_');
  },

  /**
   * Hiển thị màn hình khóa đăng nhập (Auth Wall) — chặn toàn bộ tương tác cho đến khi đăng nhập
   */
  showAuthGate() {
    const overlay = document.getElementById('authOverlay');
    if (overlay) {
      overlay.style.display = 'flex';
      overlay.classList.add('active');
      overlay.classList.add('force-show');
    }
    document.documentElement.classList.remove('auth-authenticated');
    document.documentElement.classList.add('auth-pending');
    document.body.classList.add('auth-locked');
    document.body.style.overflow = 'hidden';
  },

  /**
   * Mở khóa ứng dụng sau khi đăng nhập thành công
   */
  hideAuthGate() {
    const overlay = document.getElementById('authOverlay');
    const regOverlay = document.getElementById('authRegisterOverlay');
    if (overlay) {
      overlay.classList.remove('active');
      overlay.classList.remove('force-show');
      overlay.style.display = 'none';
    }
    if (regOverlay) {
      regOverlay.classList.remove('active');
      regOverlay.style.display = 'none';
    }
    document.documentElement.classList.add('auth-authenticated');
    document.documentElement.classList.remove('auth-pending');
    document.body.classList.remove('auth-locked');
    document.body.style.overflow = '';
  },

  _uiBound: false,

  /**
   * Dùng ứng dụng KHÔNG cần tài khoản.
   *
   * Trước đây màn hình đăng nhập là "tường chặn" không lối ra: mở app mà
   * chưa có tài khoản thì bị chặn hoàn toàn, kể cả khi chỉ muốn thử nhanh
   * các tính năng cơ bản. Nay người dùng có thể bỏ qua; dữ liệu chỉ nằm trên
   * máy này và vẫn đăng nhập được bất cứ lúc nào ở Cài đặt → Tài khoản.
   */
  skipAuth() {
    localStorage.setItem('spendwise_local_mode', '1');
    this.hideAuthGate();
    Toast.success('Đã bật chế độ dùng trên máy này. Vào Cài đặt → Tài khoản để đồng bộ lên mây.');
    if (typeof App !== 'undefined' && typeof App.init === 'function') {
      // Bảo đảm phần giao diện vẽ lại sau khi tháo khóa
      Promise.resolve().then(() => App.render && App.render());
    }
  },

  /**
   * Người dùng có đang ở chế độ chỉ dùng trên máy này không?
   */
  isLocalMode() {
    return localStorage.getItem('spendwise_local_mode') === '1';
  },

  init() {
    this.bindUI();
    this.checkEnvironment();

    // Nếu trên máy đã có phiên đăng nhập hoặc đang ở chế độ dùng trên máy (local mode)
    // thì lập tức mở khóa ứng dụng, tránh bị chớp hoặc kẹt ở màn hình đăng nhập khi tải lại trang
    if (this.isLocalMode() || localStorage.getItem('spendwise_uid')) {
      this.hideAuthGate();
    } else {
      this.showAuthGate();
    }

    if (!this.isConfigured() || typeof firebase === 'undefined') {
      console.warn('Firebase chưa sẵn sàng hoặc chưa được cấu hình.');
      // Không có Firebase thì các nút đăng nhập vô dụng — cho dùng trên máy
      // này thay vì khóa app ở một màn hình không lối thoát.
      this.hideAuthGate();
      return;
    }

    if (!firebase.apps || !firebase.apps.length) {
      firebase.initializeApp(FIREBASE_CONFIG);
    }
    this.auth = firebase.auth();
    this.db = firebase.firestore();

    if (this.auth && typeof this.auth.setPersistence === 'function' && typeof firebase !== 'undefined' && firebase.auth && firebase.auth.Auth && firebase.auth.Auth.Persistence) {
      this.auth.setPersistence(firebase.auth.Auth.Persistence.LOCAL).catch(e => {
        console.warn('Firebase setPersistence LOCAL:', e && e.message);
      });
    }

    // Xử lý kết quả đăng nhập nếu chuyển hướng (Redirect) từ Google
    if (this.auth && typeof this.auth.getRedirectResult === 'function') {
      this.auth.getRedirectResult().then(result => {
        const wasRedirect = typeof sessionStorage !== 'undefined' && sessionStorage.getItem('spendwise_pending_redirect') === '1';
        if (typeof sessionStorage !== 'undefined') sessionStorage.removeItem('spendwise_pending_redirect');

        if (result && result.user) {
          this.currentUser = result.user;
          localStorage.setItem('spendwise_uid', result.user.uid);
          localStorage.removeItem('spendwise_local_mode');
          this.hideAuthGate();
          this.updateAccountUI(result.user);
          Toast.success(`Đăng nhập Google thành công! Chào ${result.user.displayName || result.user.email}`);
        }
      }).catch(err => {
        const wasRedirect = typeof sessionStorage !== 'undefined' && sessionStorage.getItem('spendwise_pending_redirect') === '1';
        if (typeof sessionStorage !== 'undefined') sessionStorage.removeItem('spendwise_pending_redirect');

        // Chỉ hiện thông báo nếu người dùng thực sự vừa từ luồng redirect trở về
        if (wasRedirect && err && err.code) {
          console.warn('Lỗi Redirect Google Auth:', err);
          if (err.code === 'auth/network-request-failed' || err.code === 'auth/internal-error') {
            Toast.error('Không thể kết nối xác thực chuyển hướng (do trình duyệt chặn cookie bên thứ 3). Vui lòng bấm trực tiếp "Tiếp tục với Google".');
          } else {
            Toast.error('Đăng nhập Google thất bại: ' + this.friendlyError(err));
          }
        }
      });
    }

    // Bật cache cục bộ để dùng offline.
    // Khi mở bằng file://, trình duyệt chặn IndexedDB nên promise bị từ chối —
    // bắt lỗi riêng để không làm app ngừng chạy.
    try {
      const p = this.db.enablePersistence({ synchronizeTabs: true });
      if (p && typeof p.catch === 'function') {
        p.catch(e => console.warn('Firestore cache cục bộ không bật được:', e && e.code));
      }
    } catch (e) {
      console.warn('Firestore persistence:', e.code);
    }

    let authCheckTimer = null;
    this.auth.onAuthStateChanged(async user => {
      if (authCheckTimer) {
        clearTimeout(authCheckTimer);
        authCheckTimer = null;
      }

      if (user) {
        this.currentUser = user;
        this.hideAuthGate();
        this.updateAccountUI(user);

        // Đổi tài khoản trên cùng thiết bị → dọn dẹp sạch toàn bộ dữ liệu, cache và tombstone của tài khoản trước tránh rò rỉ chéo
        const storedUid = localStorage.getItem('spendwise_uid');
        if (storedUid && storedUid !== user.uid) {
          this.clearLocalUserData();
        }
        localStorage.setItem('spendwise_uid', user.uid);
        localStorage.removeItem('spendwise_local_mode');

        await this.pullFromCloud({ silent: true }).catch(err => console.warn('Lỗi kéo dữ liệu ban đầu:', err));

        // Chạy hướng dẫn người dùng mới nếu chưa từng xem
        if (typeof PWAManager !== 'undefined' && typeof PWAManager.initOnboarding === 'function') {
          PWAManager.initOnboarding();
        }
      } else {
        // Nếu người dùng đang ở chế độ dùng trên máy (local mode), không khóa app khi auth = null
        if (this.isLocalMode()) {
          this.currentUser = null;
          this.updateAccountUI(null);
          this.hideAuthGate();
        } else if (localStorage.getItem('spendwise_uid')) {
          // Trên điện thoại (mobile), Firebase Auth phát ra null tạm thời khi khởi động
          // hoặc sau khi chuyển tab/popup Google trong khi chờ nạp lại phiên từ IndexedDB.
          // Cho Firebase một khoảng chờ ngắn (1.5s) trước khi xác nhận người dùng đã thực sự mất phiên.
          authCheckTimer = setTimeout(() => {
            if ((!this.auth || !this.auth.currentUser) && !this.isLocalMode()) {
              this.currentUser = null;
              localStorage.removeItem('spendwise_uid');
              this.updateAccountUI(null);
              this.showAuthGate();
            }
          }, 1500);
        } else {
          this.currentUser = null;
          this.updateAccountUI(null);
          this.showAuthGate();
        }
      }
    });
  },

  bindUI() {
    if (this._uiBound) return;
    this._uiBound = true;

    const on = (id, fn) => {
      const el = document.getElementById(id);
      if (el) el.addEventListener('click', fn);
      return el;
    };

    on('authLoginBtn', () => this.signIn());
    on('authRegisterBtn', () => {
      document.getElementById('authRegisterOverlay').classList.add('active');
    });
    on('registerSubmitBtn', () => this.signUp());
    on('registerBackBtn', () => {
      document.getElementById('authRegisterOverlay').classList.remove('active');
      document.getElementById('authOverlay').classList.add('active');
    });
    on('registerCloseBtn', () => {
      document.getElementById('authRegisterOverlay').classList.remove('active');
      document.getElementById('authOverlay').classList.add('active');
    });
    on('authGoogleBtn', () => this.signInWithGoogle());
    on('authGoogleRedirectBtn', () => this.signInWithGoogleRedirect());
    on('btnLogout', () => this.signOut());
    on('headerLogoutBtn', () => this.signOut());
    on('btnTopLogout', () => this.signOut());
    on('headerUserBtn', () => {
      if (typeof PageManager !== 'undefined') {
        PageManager.switchTo('pageSettings');
        if (typeof SettingsTabs !== 'undefined') {
          SettingsTabs.switchTo('taikhoan');
        }
      }
    });
    on('btnOpenAuth', () => this.openAuthOverlay());
    on('btnForgotPassword', () => this.sendPasswordReset());
    on('btnDeleteAccount', () => this.deleteAccount());
    on('btnSkipAuth', () => this.skipAuth());

    // Hiện nút "quên mật khẩu" chỉ khi nhập email
    const emailEl = document.getElementById('authEmail');
    const forgotBtn = document.getElementById('btnForgotPassword');
    if (emailEl && forgotBtn) {
      emailEl.addEventListener('input', () => {
        forgotBtn.style.display = emailEl.value.includes('@') ? '' : 'none';
      });
      forgotBtn.style.display = 'none';
    }

    // Enter để đăng nhập / đăng ký
    ['authEmail', 'authPassword'].forEach(id => {
      const el = document.getElementById(id);
      if (el) el.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') { e.preventDefault(); this.signIn(); }
      });
    });
    const regNameEl = document.getElementById('registerName');
    if (regNameEl) {
      regNameEl.addEventListener('input', () => {
        const err = document.getElementById('registerNameError');
        if (err) err.style.display = 'none';
      });
    }

    ['registerName', 'registerPassword', 'registerPassword2'].forEach(id => {
      const el = document.getElementById(id);
      if (el) el.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') { e.preventDefault(); this.signUp(); }
      });
    });

    // Con mắt hiện/ẩn mật khẩu
    document.querySelectorAll('.pw-eye').forEach(btn => {
      btn.addEventListener('click', () => {
        const target = document.getElementById(btn.dataset.target);
        if (!target) return;
        const isHidden = target.type === 'password';
        target.type = isHidden ? 'text' : 'password';
        btn.innerHTML = isHidden
          ? '<i class="fa-solid fa-eye-slash"></i>'
          : '<i class="fa-solid fa-eye"></i>';
      });
    });

    // Bấm nền xám để quay lại màn hình đăng nhập chính
    const regOverlay = document.getElementById('authRegisterOverlay');
    if (regOverlay) {
      regOverlay.addEventListener('click', (e) => {
        if (e.target === regOverlay) {
          regOverlay.classList.remove('active');
          document.getElementById('authOverlay').classList.add('active');
        }
      });
    }
  },

  // ==========================================================
  //  ĐĂNG KÝ / ĐĂNG NHẬP
  // ==========================================================
  async signUp() {
    const emailRaw = document.getElementById('registerName').value.trim();
    const email = emailRaw.toLowerCase();
    const password = document.getElementById('registerPassword').value;
    const password2 = document.getElementById('registerPassword2').value;

    if (!emailRaw) { Toast.error('Vui lòng nhập email để đăng ký!'); return; }

    /**
     * Bắt buộc EMAIL THẬT.
     * Trước đây tự ghép "tên đăng nhập@spendwise.app" — địa chỉ giả lập này
     * không có hộp thư nên "Quên mật khẩu" không bao giờ dùng được.
     */
    if (!/^[^@\s]+@[^@\s]+\.[a-zA-Z]{2,}$/.test(email)) {
      Toast.error('Email không hợp lệ. Cần địa chỉ email thật để khôi phục mật khẩu.');
      return;
    }
    const domain = email.split('@')[1];
    if (/spendwise\.app$/i.test(domain)) {
      Toast.error('Vui lòng dùng email của bạn (gmail, outlook...) thay vì email tự tạo.');
      return;
    }

    const username = email.split('@')[0].replace(/[^a-zA-Z0-9_.-]/g, '').slice(0, 24) || 'nguoidung';

    if (!password || password.length < 8) { Toast.error('Mật khẩu tối thiểu 8 ký tự!'); return; }
    if (!/[a-zA-Z]/.test(password) || !/\d/.test(password)) {
      Toast.error('Mật khẩu cần có cả chữ và số!');
      return;
    }
    if (/^(123456|password|qwerty|abc123|111111)/i.test(password)) {
      Toast.error('Mật khẩu quá dễ đoán, hãy chọn mật khẩu khác!');
      return;
    }
    if (password !== password2) { Toast.error('Hai mật khẩu không khớp!'); return; }

    try {
      const cred = await this.auth.createUserWithEmailAndPassword(email, password);
      await cred.user.updateProfile({ displayName: username });
      localStorage.setItem('spendwise_display_name', username);
      Toast.success(`Tạo tài khoản "${username}" thành công!`);
      document.getElementById('authRegisterOverlay').classList.remove('active');
    } catch (e) {
      if (e.code === 'auth/email-already-in-use') {
        const err = document.getElementById('registerNameError');
        if (err) { err.style.display = 'block'; err.textContent = 'Email này đã được đăng ký!'; }
        Toast.error('Đăng ký thất bại: Email đã được đăng ký!');
      } else {
        Toast.error('Đăng ký thất bại: ' + this.friendlyError(e));
      }
    }
  },

  async signIn() {
    const rawId = document.getElementById('authEmail').value.trim().toLowerCase();
    const password = document.getElementById('authPassword').value;
    if (!rawId) { Toast.error('Vui lòng nhập email tài khoản!'); return; }
    if (!password || password.length < 6) { Toast.error('Mật khẩu tối thiểu 6 ký tự!'); return; }

    /**
     * Chỉ nhận EMAIL thậT. Không còn tự ghép "tên@spendwise.app" vì
     * địa chỉ giả lập không tồn tại trên hệ thống Firebase.
     */
    if (!/^[^@\s]+@[^@\s]+\.[a-zA-Z]{2,}$/.test(rawId)) {
      Toast.error('Hãy nhập email bạn đã đăng ký (VD: an123@gmail.com).');
      return;
    }

    try {
      await this.auth.signInWithEmailAndPassword(rawId, password);
    } catch (e) {
      Toast.error('Đăng nhập thất bại: ' + this.friendlyError(e));
    }
  },

  isInAppBrowser() {
    if (typeof navigator === 'undefined') return false;
    const ua = navigator.userAgent || '';
    return /FBAN|FBAV|Instagram|Line|MicroMessenger|musical_ly|Snapchat|TikTok|Twitter|WeChat|Zalo/i.test(ua) ||
      (/\bwv\b/i.test(ua) && /Android/i.test(ua));
  },

  checkEnvironment() {
    if (typeof window === 'undefined' || !window.location) return;
    const hint = document.getElementById('authEnvironmentHint');
    if (!hint) return;

    if (window.location.protocol === 'file:') {
      hint.style.display = 'block';
      hint.innerHTML = '<i class="fa-solid fa-circle-info"></i> Đang mở file:// trực tiếp. Hãy đăng nhập Email/Mật khẩu hoặc chạy qua máy chủ (localhost) để dùng Google.';
    } else if (window.location.hostname === '127.0.0.1') {
      hint.style.display = 'block';
      const targetUrl = window.location.href.replace('127.0.0.1', 'localhost');
      hint.innerHTML = '<i class="fa-solid fa-triangle-exclamation" style="color:var(--warning)"></i> Đang mở bằng 127.0.0.1. Hãy <a href="' + targetUrl + '" style="color:var(--primary);font-weight:600;text-decoration:underline">chuyển sang localhost</a> để đăng nhập Google.';
    } else if (this.isInAppBrowser()) {
      hint.style.display = 'block';
      hint.innerHTML = '<i class="fa-solid fa-triangle-exclamation" style="color:var(--warning)"></i> Đang mở trong ứng dụng (Zalo/Facebook). Google sẽ chặn đăng nhập. Hãy bấm <b>•••</b> hoặc <b>⋮</b> ở góc trên và chọn <b>"Mở bằng trình duyệt"</b> (Chrome/Safari).';
    }
  },

  async signInWithGoogle() {
    const btn = document.getElementById('authGoogleBtn');
    const originalHtml = btn ? btn.innerHTML : '';

    // 1. Kiểm tra môi trường file://
    if (typeof window !== 'undefined' && window.location && window.location.protocol === 'file:') {
      Toast.error('Google không hỗ trợ đăng nhập qua file:// trực tiếp. Hãy chạy localhost hoặc truy cập qua web (GitHub Pages).');
      return;
    }

    // 2. Tự động cảnh báo & hỗ trợ chuyển sang localhost nếu đang mở 127.0.0.1
    if (typeof window !== 'undefined' && window.location && window.location.hostname === '127.0.0.1') {
      const targetUrl = window.location.href.replace('127.0.0.1', 'localhost');
      Toast.warning('Firebase chỉ cho phép "localhost" thay vì "127.0.0.1". Đang chuyển sang localhost...');
      setTimeout(() => {
        window.location.href = targetUrl;
      }, 1200);
      return;
    }

    // 3. Cảnh báo nếu mở trong Webview/In-App browser (Zalo, Facebook)
    if (this.isInAppBrowser()) {
      Toast.warning('Trình duyệt trong ứng dụng (Zalo/Facebook) chặn Google. Vui lòng bấm dấu 3 chấm góc trên và chọn "Mở bằng trình duyệt" (Chrome/Safari)!');
    }

    if (!this.auth) {
      Toast.error('Hệ thống xác thực chưa sẵn sàng. Vui lòng tải lại trang.');
      return;
    }

    const setBtnLoading = (loading) => {
      if (!btn) return;
      if (loading) {
        btn.disabled = true;
        btn.style.opacity = '0.75';
        btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin" style="color:#EA4335"></i> Đang mở đăng nhập Google...';
      } else {
        btn.disabled = false;
        btn.style.opacity = '1';
        btn.innerHTML = originalHtml;
      }
    };

    setBtnLoading(true);

    try {
      const provider = new firebase.auth.GoogleAuthProvider();
      provider.addScope('profile');
      provider.addScope('email');
      provider.setCustomParameters({ prompt: 'select_account' });

      // Ưu tiên signInWithPopup cho TẤT CẢ thiết bị (kể cả di động).
      // Trên điện thoại, popup mở tab Google trực tiếp và truyền token qua postMessage,
      // hoàn toàn tránh được lỗi chặn cookie bên thứ ba / partitioned storage / không thể kết nối của signInWithRedirect.
      const result = await this.auth.signInWithPopup(provider);
      if (result && result.user) {
        this.currentUser = result.user;
        localStorage.setItem('spendwise_uid', result.user.uid);
        localStorage.removeItem('spendwise_local_mode');
        this.hideAuthGate();
        this.updateAccountUI(result.user);
        Toast.success('Đăng nhập Google thành công!');
      }
    } catch (e) {
      console.warn('Lỗi đăng nhập Google:', e);

      // Nếu popup bị chặn hoặc bị hủy bởi trình duyệt, tự động fallback sang signInWithRedirect
      if (e && (e.code === 'auth/popup-blocked' || e.code === 'auth/cancelled-popup-request' || e.code === 'auth/internal-error')) {
        try {
          if (typeof sessionStorage !== 'undefined') sessionStorage.setItem('spendwise_pending_redirect', '1');
          Toast.warning('Cửa sổ đăng nhập bị chặn, đang chuyển hướng sang trang Google...');
          const provider = new firebase.auth.GoogleAuthProvider();
          provider.addScope('profile');
          provider.addScope('email');
          provider.setCustomParameters({ prompt: 'select_account' });
          await this.auth.signInWithRedirect(provider);
          return;
        } catch (redirectErr) {
          if (typeof sessionStorage !== 'undefined') sessionStorage.removeItem('spendwise_pending_redirect');
          Toast.error('Đăng nhập Google thất bại: ' + this.friendlyError(redirectErr));
        }
      } else if (e && e.code === 'auth/popup-closed-by-user') {
        Toast.warning('Bạn đã đóng cửa sổ Google. Nếu gặp lỗi, hãy bấm nút "Chuyển hướng Google" bên dưới hoặc thử lại.');
      } else {
        Toast.error('Đăng nhập Google thất bại: ' + this.friendlyError(e));
      }
    } finally {
      setBtnLoading(false);
    }
  },

  async signInWithGoogleRedirect() {
    if (typeof window !== 'undefined' && window.location && window.location.protocol === 'file:') {
      Toast.error('Google không hỗ trợ đăng nhập qua file:// trực tiếp. Hãy chạy localhost (dùng file chay-web.bat) hoặc mở qua link web GitHub Pages.');
      return;
    }
    if (!this.auth) {
      Toast.error('Hệ thống xác thực chưa sẵn sàng. Vui lòng tải lại trang.');
      return;
    }
    try {
      if (typeof sessionStorage !== 'undefined') sessionStorage.setItem('spendwise_pending_redirect', '1');
      const provider = new firebase.auth.GoogleAuthProvider();
      provider.addScope('profile');
      provider.addScope('email');
      provider.setCustomParameters({ prompt: 'select_account' });
      Toast.info('Đang chuyển hướng sang Google...');
      await this.auth.signInWithRedirect(provider);
    } catch (e) {
      if (typeof sessionStorage !== 'undefined') sessionStorage.removeItem('spendwise_pending_redirect');
      Toast.error('Lỗi chuyển hướng Google: ' + this.friendlyError(e));
    }
  },

  /**
   * Gửi email đặt lại mật khẩu (luồng quên mật khẩu)
   */
  async sendPasswordReset() {
    const email = document.getElementById('authEmail').value.trim().toLowerCase();
    if (!email) {
      Toast.error('Vui lòng nhập email tài khoản của bạn vào ô bên trên!');
      return;
    }
    if (!/^[^@\s]+@[^@\s]+\.[a-zA-Z]{2,}$/.test(email)) {
      Toast.error('Vui lòng nhập đúng định dạng email (VD: an123@gmail.com)!');
      return;
    }
    try {
      await this.auth.sendPasswordResetEmail(email);
      Toast.success('Đã gửi link đặt lại mật khẩu tới email. Vui lòng kiểm tra Hộp thư đến hoặc thư rác (Spam)!');
    } catch (e) {
      Toast.error('Không gửi được email: ' + this.friendlyError(e));
    }
  },

  /**
   * Đăng xuất: đồng bộ dữ liệu mới nhất lên đám mây trước khi thoát.
   * - Chỉ tải file sao lưu JSON khi người dùng chủ động bấm "Tải file sao lưu (JSON)" trong Cài đặt.
   * - Khi đăng xuất: tự động lưu dữ liệu lên cloud; không tự động/bắt buộc tải file backup JSON.
   * - Khi đăng nhập lại hoặc vào web: dữ liệu mới từ đám mây sẽ tiếp tục được sử dụng liền mạch.
   */
  async signOut() {
    let syncOk = true;

    const doFinalSignOut = async () => {
      // Trước khi dọn dữ liệu bộ nhớ của phiên đăng nhập, tạo bản sao lưu offline dạng spendwise_backup_<uid>
      // để nếu người dùng đăng xuất trong lúc mất mạng hoặc lỗi đồng bộ thì dữ liệu vẫn phục hồi được
      if (this.currentUser && this.currentUser.uid) {
        try {
          if (!syncOk) {
            const backupObj = {
            backedUpAt: new Date().toISOString(),
            uid: this.currentUser.uid,
            email: this.currentUser.email,
            transactions: (typeof Storage !== 'undefined' && typeof Storage.getTransactions === 'function')
              ? Storage.getTransactions()
              : (typeof Storage !== 'undefined' && typeof Storage.get === 'function' ? Storage.get('spendwise_transactions', []) : []),
            wallets: typeof Storage !== 'undefined' && typeof Storage.get === 'function' ? Storage.get('spendwise_wallets', []) : [],
            goals: typeof Storage !== 'undefined' && typeof Storage.get === 'function' ? Storage.get('spendwise_goals', []) : [],
            recurring: typeof Storage !== 'undefined' && typeof Storage.get === 'function' ? Storage.get('spendwise_recurring', []) : [],
            debts: typeof Storage !== 'undefined' && typeof Storage.get === 'function' ? Storage.get('spendwise_debts', []) : [],
            budgets: typeof Storage !== 'undefined' && typeof Storage.get === 'function' ? Storage.get('spendwise_budgets', {}) : {}
          };
            localStorage.setItem('spendwise_backup_' + this.currentUser.uid, JSON.stringify(backupObj));
          } else {
            localStorage.removeItem('spendwise_backup_' + this.currentUser.uid);
          }
        } catch (e) {
          console.warn('Không thể lưu bản sao lưu offline trước khi đăng xuất:', e);
        }
      }

      this.clearLocalUserData();
      localStorage.removeItem('spendwise_uid');

      if (this.auth) {
        try {
          await this.auth.signOut();
        } catch (e) {
          console.warn('Firebase auth signOut error:', e);
        }
      }

      this.currentUser = null;
      this.updateAccountUI(null);

      if (typeof PageManager !== 'undefined') {
        PageManager.switchTo('pageHome');
      }

      // Đã chọn "Tiếp tục không cần tài khoản" thì đăng xuất xong vẫn dùng được,
      // không khóa lại ứng dụng.
      if (this.isLocalMode()) {
        this.hideAuthGate();
      } else {
        this.showAuthGate();
      }
      Toast.success(syncOk ? 'Đã lưu dữ liệu lên đám mây và đăng xuất thành công!' : 'Đã đăng xuất thành công!');
    };

    if (this.currentUser) {
      // Cố gắng đồng bộ lên cloud trước khi đăng xuất
      try {
        const syncPromise = this.pushToCloud();
        const timeoutPromise = new Promise((_, reject) => setTimeout(() => reject(new Error('Sync timeout')), 6000));
        const res = await Promise.race([syncPromise, timeoutPromise]);
        if (res !== true) syncOk = false;
      } catch (e) {
        console.warn('Lỗi hoặc timeout khi đồng bộ trước đăng xuất:', e);
        syncOk = false;
      }
    }

    // Nếu không kết nối được đám mây và còn thay đổi chưa được đồng bộ
    if (!syncOk) {
      const localTxs = (typeof Storage !== 'undefined' && typeof Storage.getTransactions === 'function')
        ? (Storage.getTransactions() || [])
        : (typeof Storage !== 'undefined' && typeof Storage.get === 'function' ? (Storage.get('spendwise_transactions', []) || []) : []);
      const hasUnsyncedTxs = localTxs.some(t => t && t.syncState !== 'synced');
      const hasPendingChanges = (typeof SyncManager !== 'undefined') &&
        (SyncManager.getQueue().length > 0 || SyncManager.getTombstones().length > 0);

      if (hasUnsyncedTxs || hasPendingChanges) {
        ConfirmDialog.show({
          title: 'Chưa thể lưu lên đám mây',
          message: 'Hiện không có kết nối mạng để lưu lên đám mây. Dữ liệu trên thiết bị này vẫn được lưu an toàn và sẽ tự động đồng bộ khi bạn đăng nhập lại. Bạn có chắc muốn đăng xuất?',
          confirmText: 'Vẫn đăng xuất',
          onConfirm: doFinalSignOut
        });
        return;
      }
    }

    await doFinalSignOut();
  },

  /**
   * Xóa tài khoản + toàn bộ dữ liệu trên cloud (Tuân thủ nguyên tắc Fail-Closed):
   * 1. Xác thực lại danh tính trước (re-auth) để tránh lỗi requires-recent-login
   *    Nếu thất bại (kể cả đóng popup hoặc lỗi mạng) → DỪNG NGAY, không chạm vào Firestore.
   * 2. Chỉ khi xác thực thành công mới dọn dẹp Firestore (cả collection mới + legacy 'data')
   *    Nếu xóa bất kỳ collection nào gặp lỗi → DỪNG NGAY, không xóa Auth user và không xóa local.
   * 3. Xóa user trên Firebase Auth.
   * 4. Cuối cùng mới xóa local storage sau khi cloud đã xóa hoàn toàn thành công.
   */
  async deleteAccount() {
    if (!this.currentUser) { Toast.error('Bạn chưa đăng nhập!'); return; }

    ConfirmDialog.show({
      title: 'Xóa tài khoản và dữ liệu?',
      message: 'Toàn bộ dữ liệu trên máy chủ (giao dịch, ví, mục tiêu, ngân sách, nợ) sẽ bị xóa vĩnh viễn. Thao tác này không thể hoàn tác!',
      confirmText: 'Xóa tài khoản',
      onConfirm: async () => {
        try {
          const user = this.currentUser;
          const providerId = (user.providerData && user.providerData[0]) ? user.providerData[0].providerId : '';

          // BƯỚC 1: Xác thực lại trước nếu môi trường hỗ trợ
          if (typeof firebase !== 'undefined' && firebase.auth) {
            if (providerId === 'google.com' && typeof user.reauthenticateWithPopup === 'function') {
              try {
                await user.reauthenticateWithPopup(new firebase.auth.GoogleAuthProvider());
              } catch (reauthErr) {
                if (reauthErr.code === 'auth/popup-closed-by-user') {
                  Toast.warning('Đã hủy xác thực — dữ liệu tài khoản được giữ an toàn.');
                } else {
                  console.warn('Re-auth error:', reauthErr);
                  Toast.error('Không thể xác thực lại danh tính: ' + this.friendlyError(reauthErr));
                }
                return; // Fail-Closed: Dừng toàn bộ, tuyệt đối không xóa Firestore
              }
            } else if (providerId === 'password' && typeof user.reauthenticateWithCredential === 'function') {
              const pass = (typeof window !== 'undefined' && typeof window.prompt === 'function')
                ? window.prompt('Nhập mật khẩu tài khoản để xác nhận xóa vĩnh viễn:')
                : null;
              if (pass === null) {
                Toast.info('Đã hủy thao tác xóa tài khoản.');
                return;
              }
              if (!pass) {
                Toast.error('Vui lòng nhập mật khẩu để xác nhận xóa tài khoản!');
                return;
              }
              try {
                const cred = firebase.auth.EmailAuthProvider.credential(user.email, pass);
                await user.reauthenticateWithCredential(cred);
              } catch (credErr) {
                Toast.error('Mật khẩu không chính xác — đã hủy thao tác để bảo vệ dữ liệu.');
                return; // Fail-Closed: Dừng toàn bộ
              }
            }
          }

          // BƯỚC 2: Dọn sạch dữ liệu Firestore (bao gồm cả collection cũ 'data' tránh rác tài liệu con)
          const root = this.userRoot();
          const targetCollections = Object.values(this.COLLECTIONS).concat(['data']);
          for (const colName of targetCollections) {
            const snap = await root.collection(colName).get();
            if (snap && snap.docs && snap.docs.length > 0) {
              await Promise.all(snap.docs.map(d => d.ref.delete()));
            }
          }
          const budgetsDoc = root.collection('budgets').doc('main');
          const budgetsSnap = await budgetsDoc.get();
          if (budgetsSnap && budgetsSnap.exists) await budgetsDoc.delete();

          const settingsDoc = root.collection('settings').doc('main');
          const settingsSnap = await settingsDoc.get();
          if (settingsSnap && settingsSnap.exists) await settingsDoc.delete();

          const rootSnap = await root.get();
          if (rootSnap && rootSnap.exists) await root.delete();

          // BƯỚC 3: Xóa tài khoản Firebase Auth
          try {
            await this.currentUser.delete();
          } catch (delErr) {
            if (delErr && delErr.code === 'auth/requires-recent-login') {
              Toast.warning('Vì lý do bảo mật, vui lòng đăng nhập lại ngay trước khi thực hiện xóa tài khoản!');
              return;
            }
            throw delErr;
          }

          // BƯỚC 4: Hoàn tất xóa local storage sau khi cloud đã xóa thành công
          this.clearLocalUserData();
          localStorage.removeItem('spendwise_uid');
          if (user && user.uid) {
            localStorage.removeItem('spendwise_backup_' + user.uid);
          }

          if (this.auth) {
            await this.auth.signOut().catch(() => {});
          }
          this.currentUser = null;
          this.updateAccountUI(null);

          if (typeof PageManager !== 'undefined') {
            PageManager.switchTo('pageHome');
          }
          this.showAuthGate();
          Toast.success('Đã xóa tài khoản và toàn bộ dữ liệu.');
        } catch (e) {
          console.error('Lỗi xóa tài khoản:', e);
          Toast.error('Không xóa được tài khoản: ' + this.friendlyError(e));
        }
      }
    });
  },

  /**
   * Xóa toàn bộ dữ liệu người dùng khỏi bộ nhớ cục bộ
   */
  clearLocalUserData() {
    this.DATA_KEYS.forEach(key => localStorage.removeItem(key));
    localStorage.removeItem('spendwise_uid');
    localStorage.removeItem('spendwise_sync_queue');
    localStorage.removeItem('spendwise_rates');
    localStorage.removeItem('spendwise_tombstones');
    if (typeof Storage !== 'undefined' && Storage.invalidateTxCache) {
      Storage.invalidateTxCache();
    }

    ['modalOverlay', 'budgetModal', 'confirmOverlay', 'splitterModal', 'authRegisterOverlay']
      .forEach(id => {
        const el = document.getElementById(id);
        if (el) el.classList.remove('active');
      });

    if (typeof TransactionManager !== 'undefined') {
      TransactionManager.renderTransactions();
      TransactionManager.updateSummary();
    }
    if (typeof BudgetManager !== 'undefined') {
      BudgetManager.renderBudgetList();
      BudgetManager.updateBudgetSummary();
    }
    if (typeof Features !== 'undefined') {
      Features.renderWalletList();
      Features.renderWalletOptions();
      Features.renderGoals();
      Features.renderRecurringList();
    }
  },

  friendlyError(e) {
    const currentDomain = (typeof window !== 'undefined' && window.location && window.location.hostname) || '';
    const map = {
      'auth/user-not-found': 'Tên đăng nhập không tồn tại!',
      'auth/wrong-password': 'Sai mật khẩu!',
      'auth/email-already-in-use': 'Tên đăng nhập đã được đăng ký!',
      'auth/invalid-email': 'Email không hợp lệ!',
      'auth/weak-password': 'Mật khẩu quá yếu (tối thiểu 8 ký tự, có chữ và số)!',
      'auth/invalid-credential': 'Tên đăng nhập không tồn tại hoặc sai mật khẩu!',
      'auth/too-many-requests': 'Thử quá nhiều lần, vui lòng thử lại sau!',
      'auth/network-request-failed': 'Không có kết nối mạng. Dữ liệu vẫn được lưu trên máy này.',
      'auth/requires-recent-login': 'Vui lòng đăng nhập lại trước khi thực hiện thao tác này.',
      'auth/operation-not-allowed': 'Phương thức đăng nhập này chưa được kích hoạt trong Firebase Console (Authentication > Sign-in method).',
      'auth/unauthorized-domain': `Tên miền (${currentDomain || 'domain'}) chưa được thêm vào Authorized Domains trong Firebase Console. Nếu dùng 127.0.0.1, hãy chuyển sang http://localhost.`,
      'auth/popup-blocked': 'Cửa sổ đăng nhập Google bị trình duyệt chặn. Hãy cho phép popup hoặc thử lại.',
      'auth/popup-closed-by-user': 'Bạn đã đóng cửa sổ đăng nhập Google trước khi hoàn tất.',
      'auth/cancelled-popup-request': 'Yêu cầu đăng nhập đã bị hủy do có thao tác mới.',
      'auth/operation-not-supported-in-this-environment': 'Không hỗ trợ đăng nhập Google khi mở trực tiếp file://. Vui lòng chạy qua localhost hoặc đưa lên web.',
      'auth/account-exists-with-different-credential': 'Email này đã được sử dụng với phương thức đăng nhập khác.'
    };
    return (e && map[e.code]) || (e && e.message) || 'Lỗi không xác định';
  },

  updateAccountUI(user) {
    const emailEl = document.getElementById('accountEmail');
    const descEl = emailEl && emailEl.parentElement ? emailEl.parentElement.querySelector('.settings-item__desc') : null;
    const emailText = user
      ? (user.displayName ? `${user.displayName} — ${user.email}` : user.email)
      : 'Chưa đăng nhập';

    if (emailEl) {
      emailEl.textContent = emailText;
    }
    if (descEl) {
      descEl.textContent = user
        ? 'Dữ liệu được đồng bộ đám mây và bảo vệ theo tài khoản của bạn.'
        : (this.isLocalMode()
            ? 'Chế độ dùng trên máy này: dữ liệu chỉ lưu trên máy, không đồng bộ. Đăng nhập để dùng trên nhiều thiết bị.'
            : 'Chưa đăng nhập: dữ liệu chỉ lưu trên máy này. Đăng nhập để đồng bộ lên máy chủ và dùng trên nhiều thiết bị.');
    }

    const logoutBtn = document.getElementById('btnLogout');
    if (logoutBtn) logoutBtn.style.display = user ? '' : 'none';

    const openAuthBtn = document.getElementById('btnOpenAuth');
    if (openAuthBtn) openAuthBtn.style.display = user ? 'none' : '';

    const deleteBtn = document.getElementById('btnDeleteAccount');
    if (deleteBtn) deleteBtn.style.display = user ? '' : 'none';

    // Nút tài khoản & đăng xuất trên thanh tiêu đề (Header)
    const headerUserBtn = document.getElementById('headerUserBtn');
    const headerUserEmail = document.getElementById('headerUserEmail');
    const headerLogoutBtn = document.getElementById('headerLogoutBtn');

    if (headerUserBtn) headerUserBtn.style.display = user ? 'inline-flex' : 'none';
    if (headerLogoutBtn) headerLogoutBtn.style.display = user ? 'inline-flex' : 'none';
    if (headerUserEmail && user) {
      headerUserEmail.textContent = user.displayName || (user.email ? user.email.split('@')[0] : 'Tài khoản');
    }

    // Thẻ hồ sơ người dùng nổi bật ở đầu trang Cài đặt
    const profileCard = document.getElementById('userProfileCard');
    const accountEmailTitle = document.getElementById('accountEmailTitle');

    if (profileCard) profileCard.style.display = user ? 'flex' : 'none';
    if (accountEmailTitle && user) {
      accountEmailTitle.textContent = user.email || user.displayName || 'Tài khoản';
    }
  },

  openAuthOverlay() {
    this.showAuthGate();
  },

  // ==========================================================
  //  TẦNG DỮ LIỆU ĐÁM MÂY
  // ==========================================================
  userRoot() {
    return this.db.collection('users').doc(this.currentUser.uid);
  },

  /**
   * Tải dữ liệu từ cloud và gộp với dữ liệu cục bộ
   */
  async pullFromCloud(options = {}) {
    if (!this.currentUser) return;
    const silent = Boolean(options && options.silent);

    // Giữ bản local (dùng khi chưa đăng nhập) để gộp
    const local = {};
    this.DATA_KEYS.forEach(key => {
      const raw = localStorage.getItem(key);
      if (raw !== null) {
        try { local[key] = JSON.parse(raw); } catch { local[key] = raw; }
      }
    });

    // Nếu có snapshot dự phòng từ lần đăng xuất trước (chưa kịp đồng bộ lên cloud), nạp vào local để gộp
    if (this.currentUser && this.currentUser.uid) {
      const backupRaw = localStorage.getItem('spendwise_backup_' + this.currentUser.uid);
      if (backupRaw) {
        try {
          const backup = JSON.parse(backupRaw);
          if (backup && typeof backup === 'object') {
            const keysMap = [
              ['spendwise_transactions', 'transactions'],
              ['spendwise_wallets', 'wallets'],
              ['spendwise_goals', 'goals'],
              ['spendwise_recurring', 'recurring'],
              ['spendwise_debts', 'debts']
            ];
            keysMap.forEach(([storeKey, backupKey]) => {
              if ((!local[storeKey] || !local[storeKey].length) && Array.isArray(backup[backupKey])) {
                local[storeKey] = backup[backupKey];
                localStorage.setItem(storeKey, JSON.stringify(backup[backupKey]));
              }
            });
            if (!local.spendwise_budgets && backup.budgets && typeof backup.budgets === 'object') {
              local.spendwise_budgets = backup.budgets;
              localStorage.setItem('spendwise_budgets', JSON.stringify(backup.budgets));
            }
          }
        } catch (bErr) { console.warn('Lỗi đọc bản sao lưu dự phòng:', bErr); }
      }
    }

    try {
      const root = this.userRoot();
      const cloud = {};

      for (const key of Object.keys(this.COLLECTIONS)) {
        const colName = this.COLLECTIONS[key];
        const snap = await root.collection(colName).get();
        cloud[key] = snap.docs.map(d => {
          const data = Object.assign({}, d.data());
          if (!data.id) data.id = d.id;
          data.syncState = 'synced';
          return data;
        });
      }

      const budgetsSnap = await root.collection('budgets').doc('main').get();
      cloud.spendwise_budgets = budgetsSnap.exists ? (budgetsSnap.data().limits || {}) : {};
      cloud.budgetsUpdatedAt = budgetsSnap.exists ? (budgetsSnap.data().updatedAt || '') : '';

      const settingsSnap = await root.collection('settings').doc('main').get();
      cloud.settings = settingsSnap.exists ? settingsSnap.data() : {};

      const userDocSnap = (typeof root.get === 'function') ? await root.get().catch(() => null) : null;
      const isAccountInitialized = Boolean((userDocSnap && userDocSnap.exists) || budgetsSnap.exists || settingsSnap.exists);

      const hasCloudData =
        cloud.spendwise_transactions.length > 0 ||
        cloud.spendwise_wallets.length > 0 ||
        cloud.spendwise_goals.length > 0 ||
        cloud.spendwise_recurring.length > 0 ||
        cloud.spendwise_debts.length > 0 ||
        Object.keys(cloud.spendwise_budgets).length > 0;

      if (!isAccountInitialized && !hasCloudData) {
        // Đánh dấu tài khoản đã khởi tạo trên Firestore
        if (typeof root.set === 'function') {
          await root.set({ initializedAt: new Date().toISOString(), email: this.currentUser.email || '' }, { merge: true });
        }
        await this.pushToCloud();
        if (this.currentUser && this.currentUser.uid) {
          localStorage.removeItem('spendwise_backup_' + this.currentUser.uid);
        }
        this.rerender();
        if (!silent) Toast.success('Đã tạo kho dữ liệu trên máy chủ!');
        return;
      }

      // Bản ghi đã xoá trên máy này (tombstone) không được "hồi sinh" từ cloud
      const tombs = (typeof SyncManager !== 'undefined') ? SyncManager.getTombstones() : [];

      // Gộp danh sách: giữ bản local chưa kịp đồng bộ + bản cloud, ưu tiên bản mới hơn
      // Truyền isAccountInitialized để không hồi sinh bản ghi đã bị xóa trên cloud khi cloud rỗng
      const mergedTxs = this.mergeById(
        Array.isArray(local.spendwise_transactions) ? local.spendwise_transactions : [],
        cloud.spendwise_transactions,
        tombs,
        isAccountInitialized
      );
      const safeTxs = (typeof ExportManager !== 'undefined')
        ? ExportManager.sanitizeTransactions(mergedTxs)
        : mergedTxs;
      localStorage.setItem('spendwise_transactions', JSON.stringify(safeTxs));

      localStorage.setItem('spendwise_wallets', JSON.stringify(
        this.mergeById(local.spendwise_wallets || [], cloud.spendwise_wallets, tombs, isAccountInitialized)));
      localStorage.setItem('spendwise_goals', JSON.stringify(
        this.mergeById(local.spendwise_goals || [], cloud.spendwise_goals, tombs, isAccountInitialized)));
      localStorage.setItem('spendwise_recurring', JSON.stringify(
        this.mergeById(local.spendwise_recurring || [], cloud.spendwise_recurring, tombs, isAccountInitialized)));

      // Sổ nợ nhóm: gộp như các danh sách khác rồi kiểm tra tổng khớp trước khi lưu
      const mergedDebts = this.mergeById(local.spendwise_debts || [], cloud.spendwise_debts, tombs, isAccountInitialized);
      const safeDebts = (typeof ExportManager !== 'undefined')
        ? ExportManager.sanitizeDebts(mergedDebts)
        : mergedDebts;
      localStorage.setItem('spendwise_debts', JSON.stringify(safeDebts));

      // Ngân sách: "thay đổi mới nhất thắng" (KHÔNG dùng "số lớn hơn thắng",
      // vì sẽ tự khôi phục hạn mức cũ khi người dùng chủ động giảm hạn mức)
      const cloudBudgets = cloud.spendwise_budgets || {};
      const localBudgets = local.spendwise_budgets || {};
      const mergedBudgets = Object.assign({}, localBudgets, cloudBudgets);

      const localTs = localStorage.getItem('spendwise_budgets_updated_at') || '';
      const cloudTs = cloud.budgetsUpdatedAt || '';

      Object.keys(mergedBudgets).forEach(k => {
        const inLocal = localBudgets[k] !== undefined;
        const inCloud = cloudBudgets[k] !== undefined;
        if (inLocal && !inCloud) return;
        if (!inLocal && inCloud) return;
        mergedBudgets[k] = Business.mergeBudgetValue(
          localBudgets[k], cloudBudgets[k],
          localTs, cloudTs
        );
      });
      localStorage.setItem('spendwise_budgets', JSON.stringify(mergedBudgets));
      if (cloudTs) localStorage.setItem('spendwise_budgets_updated_at', cloudTs);

      // Cài đặt: ưu tiên lựa chọn trên máy
      if (local.spendwise_currency === undefined && cloud.settings.currency) {
        localStorage.setItem('spendwise_currency', cloud.settings.currency);
      }
      if (localStorage.getItem(Storage.KEYS.THEME) === null && cloud.settings.theme) {
        localStorage.setItem(Storage.KEYS.THEME, cloud.settings.theme);
      }
      if (localStorage.getItem('spendwise_reminder_time') === null && cloud.settings.reminderTime) {
        localStorage.setItem('spendwise_reminder_time', cloud.settings.reminderTime);
      }

      this.rerender();
      if (!silent) {
        Toast.success('Đã đồng bộ dữ liệu từ máy chủ!');
      }
      await this.pushToCloud();
      if (this.currentUser && this.currentUser.uid) {
        localStorage.removeItem('spendwise_backup_' + this.currentUser.uid);
      }
    } catch (e) {
      console.error(e);
      if (!silent) {
        Toast.error('Không tải được dữ liệu từ máy chủ (có thể đang offline).');
      }
      throw e;
    }
  },

  /**
   * Gộp hai mảng theo id (dùng Business.mergeById để có thể kiểm thử)
   */
  mergeById(localArr, cloudArr, tombstones = [], isAccountInitialized = false) {
    return Business.mergeById(localArr, cloudArr, tombstones, isAccountInitialized);
  },

  /**
   * Đẩy dữ liệu lên cloud.
   * - Mỗi bản ghi 1 tài liệu (tránh giới hạn 1MiB)
   * - Xóa thật trên server khi bản ghi bị xóa ở máy (không "hồi sinh")
   * - Ghi theo lô (batch) tối đa 400 op/lần
   */
  async pushToCloud() {
    if (!this.currentUser) return false;
    if (this._pushing && this._currentPushPromise) {
      this.schedulePush();
      return this._currentPushPromise;
    }
    this._pushing = true;
    this._currentPushPromise = (async () => {
      try {
        const root = this.userRoot();
        const now = new Date().toISOString();

        // Chụp ảnh snapshot của tombstones và queue tại thời điểm bắt đầu push (chống race condition)
        const pushedTombsSnapshot = (typeof SyncManager !== 'undefined') ? [...SyncManager.getTombstones()] : [];
        const pushedQueueSnapshot = (typeof SyncManager !== 'undefined') ? [...SyncManager.getQueue()] : [];

        for (const key of Object.keys(this.COLLECTIONS)) {
          const colName = this.COLLECTIONS[key];
          const list = Storage.get(key, []) || [];
          const tombs = pushedTombsSnapshot;
          // Dữ liệu demo chỉ có ở máy này, tuyệt đối không đẩy lên tài khoản thật
          const real = (typeof DemoData !== 'undefined') ? DemoData.filterForCloud(list) : list;
          const toPush = tombs.length ? real.filter(t => !tombs.includes(t.id)) : real;

        const ops = [];
        toPush.forEach(item => {
          if (!item || !item.id) return;
          const payload = Object.assign({}, item);
          delete payload.syncState;      // trạng thái chỉ có ý nghĩa cục bộ
          ops.push({ path: colName + '/' + item.id, payload: payload });
        });

        // Chỉ xóa trên server những tài liệu NẰM TRONG TOMBSTONES (người dùng máy này chủ động xóa).
        // Tuyệt đối KHÔNG xóa các tài liệu cloud chỉ vì máy này chưa tải về (bảo vệ đa thiết bị).
        if (tombs.length > 0) {
          const existingSnap = await root.collection(colName).get();
          existingSnap.docs.forEach(d => {
            if (tombs.includes(d.id)) {
              ops.push({ path: colName + '/' + d.id, payload: null });
            }
          });
        }

        // Ghi theo lô 300 op
        for (let i = 0; i < ops.length; i += 300) {
          const chunk = ops.slice(i, i + 300);
          const batch = this.db.batch();
          chunk.forEach(op => {
            const parts = op.path.split('/');
            const ref = root.collection(parts[0]).doc(parts[1]);
            if (op.payload === null) {
              batch.delete(ref);           // xóa thật trên server
            } else {
              batch.set(ref, op.payload, { merge: false });
            }
          });
          await batch.commit();
        }
      }

      // Ngân sách & cài đặt (1 tài liệu mỗi loại, làm sạch limits theo schema Firestore)
      const rawLimits = Storage.get('spendwise_budgets', {}) || {};
      const cleanLimits = {};
      if (rawLimits && typeof rawLimits === 'object') {
        Object.keys(rawLimits).slice(0, 50).forEach(cat => {
          const val = Number(rawLimits[cat]);
          if (typeof cat === 'string' && cat.trim() && !isNaN(val) && val >= 0 && val <= 1000000000000) {
            cleanLimits[cat.trim().slice(0, 40)] = Math.round(val);
          }
        });
      }
      await root.collection('budgets').doc('main').set({
        limits: cleanLimits,
        updatedAt: now
      }, { merge: true });

      // LƯU Ý: không gửi reminderTime = null — rules chỉ nhận chuỗi.
      // Gửi null sẽ khiến toàn bộ lần đồng bộ bị Firestore từ chối.
      const settingsPayload = {
        currency: Storage.get('spendwise_currency', 'VND'),
        theme: Storage.getTheme(),
        updatedAt: now
      };
      const reminderTime = localStorage.getItem('spendwise_reminder_time');
      if (reminderTime) settingsPayload.reminderTime = reminderTime;

      await root.collection('settings').doc('main').set(settingsPayload, { merge: true });
      if (typeof root.set === 'function') {
        await root.set({ initializedAt: now }, { merge: true });
      }

      // Server đã xác nhận → chỉ dọn đúng những tombstone & queue entry trong snapshot đã xử lý
      // Tuyệt đối không xóa các tombstone/queue mới phát sinh trong lúc push đang chạy (bảo vệ race condition)
      if (typeof SyncManager !== 'undefined') {
        if (typeof SyncManager.removeTombstones === 'function') {
          SyncManager.removeTombstones(pushedTombsSnapshot);
        } else {
          SyncManager.clearTombstones();
        }
        if (typeof SyncManager.removeQueueEntries === 'function') {
          SyncManager.removeQueueEntries(pushedQueueSnapshot);
        } else {
          SyncManager.clearQueue();
        }
        localStorage.setItem(SyncManager.LAST_SYNC_KEY, now);
        SyncManager.updateBadge();
      }

      // Đánh dấu toàn bộ giao dịch địa phương đã được đồng bộ an toàn (synced)
      try {
        const txs = (typeof Storage !== 'undefined' && typeof Storage.getTransactions === 'function')
          ? (Storage.getTransactions() || [])
          : (typeof Storage !== 'undefined' && typeof Storage.get === 'function' ? (Storage.get('spendwise_transactions', []) || []) : []);
        let txsChanged = false;
        const updatedTxs = txs.map(t => {
          if (t && t.syncState !== 'synced') {
            txsChanged = true;
            return Object.assign({}, t, { syncState: 'synced' });
          }
          return t;
        });
        if (txsChanged) {
          localStorage.setItem('spendwise_transactions', JSON.stringify(updatedTxs));
        }
      } catch (err) {
        console.warn('Cập nhật syncState thất bại:', err);
      }

      return true;
    } catch (e) {
      console.error('pushToCloud:', e);
      throw e;
    } finally {
      this._pushing = false;
      this._currentPushPromise = null;
    }
    })();
    return this._currentPushPromise;
  },

  /**
   * Debounce push mỗi khi dữ liệu đổi (tự động chạy ngầm, không hiện toast làm phiền)
   */
  schedulePush() {
    if (!this.currentUser) return;
    clearTimeout(this._pushTimer);
    this._pushTimer = setTimeout(() => {
      this.pushToCloud()
        .then(ok => {
          if (ok && typeof SyncManager !== 'undefined') {
            SyncManager.updateBadge();
          }
        })
        .catch(err => {
          // Lưu ngầm thất bại (offline/mạng yếu) → chỉ ghi log, không hiện toast spam đè thông báo khác
          console.warn('Tự động lưu ngầm chưa thành công (sẽ tự thử lại khi có mạng):', err);
          if (typeof SyncManager !== 'undefined') {
            SyncManager.updateBadge();
          }
        });
    }, 1500);
  },

  rerender() {
    if (typeof TransactionManager !== 'undefined') {
      TransactionManager.renderTransactions();
      TransactionManager.updateSummary();
    }
    if (typeof BudgetManager !== 'undefined') {
      BudgetManager.renderBudgetList();
      BudgetManager.updateBudgetSummary();
    }
    if (typeof Features !== 'undefined') {
      Features.renderWalletList();
      Features.renderWalletOptions();
      Features.renderGoals();
      Features.renderRecurringList();
    }
    if (typeof ChartManager !== 'undefined' && typeof PageManager !== 'undefined' &&
        PageManager.currentPage === 'pageStats') {
      ChartManager.renderAllCharts();
    }
  }
};