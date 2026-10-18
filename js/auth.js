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
    }
    if (regOverlay) regOverlay.classList.remove('active');
    document.documentElement.classList.add('auth-authenticated');
    document.documentElement.classList.remove('auth-pending');
    document.body.classList.remove('auth-locked');
    document.body.style.overflow = '';
  },

  _uiBound: false,

  init() {
    this.bindUI();
    this.checkEnvironment();

    // Nếu trên máy chưa có phiên đăng nhập, lập tức khóa ứng dụng bằng màn hình đăng nhập
    if (!localStorage.getItem('spendwise_uid')) {
      this.showAuthGate();
    }

    if (!this.isConfigured() || typeof firebase === 'undefined') {
      console.warn('Firebase chưa sẵn sàng hoặc chưa được cấu hình.');
      this.showAuthGate();
      return;
    }

    if (!firebase.apps || !firebase.apps.length) {
      firebase.initializeApp(FIREBASE_CONFIG);
    }
    this.auth = firebase.auth();
    this.db = firebase.firestore();

    // Xử lý kết quả đăng nhập nếu chuyển hướng (Redirect) từ Google
    if (this.auth && typeof this.auth.getRedirectResult === 'function') {
      this.auth.getRedirectResult().then(result => {
        if (result && result.user) {
          this.currentUser = result.user;
          localStorage.setItem('spendwise_uid', result.user.uid);
          this.hideAuthGate();
          this.updateAccountUI(result.user);
          Toast.success(`Đăng nhập Google thành công! Chào ${result.user.displayName || result.user.email}`);
        }
      }).catch(err => {
        if (err && err.code) {
          console.warn('Lỗi Redirect Google Auth:', err);
          Toast.error('Đăng nhập Google thất bại: ' + this.friendlyError(err));
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

    this.auth.onAuthStateChanged(async user => {
      this.currentUser = user;
      if (user) {
        this.hideAuthGate();
        this.updateAccountUI(user);

        // Đổi tài khoản trên cùng thiết bị → dọn dẹp sạch toàn bộ dữ liệu, cache và tombstone của tài khoản trước tránh rò rỉ chéo
        const storedUid = localStorage.getItem('spendwise_uid');
        if (storedUid && storedUid !== user.uid) {
          this.clearLocalUserData();
        }
        localStorage.setItem('spendwise_uid', user.uid);

        await this.pullFromCloud({ silent: true }).catch(err => console.warn('Lỗi kéo dữ liệu ban đầu:', err));

        // Chạy hướng dẫn người dùng mới nếu chưa từng xem
        if (typeof PWAManager !== 'undefined' && typeof PWAManager.initOnboarding === 'function') {
          PWAManager.initOnboarding();
        }
      } else {
        localStorage.removeItem('spendwise_uid');
        this.updateAccountUI(null);
        this.showAuthGate();
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

      // Thiết bị di động hoặc PWA standalone dùng redirect để tránh bị chặn popup
      const isMobile = typeof navigator !== 'undefined' && /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
      const isStandalone = typeof window !== 'undefined' && window.matchMedia && window.matchMedia('(display-mode: standalone)').matches;

      if (isMobile || isStandalone) {
        await this.auth.signInWithRedirect(provider);
        return;
      }

      // Trên desktop, dùng signInWithPopup
      const result = await this.auth.signInWithPopup(provider);
      if (result && result.user) {
        this.currentUser = result.user;
        localStorage.setItem('spendwise_uid', result.user.uid);
        this.hideAuthGate();
        this.updateAccountUI(result.user);
        Toast.success('Đăng nhập Google thành công!');
      }
    } catch (e) {
      console.warn('Lỗi đăng nhập Google:', e);

      // Nếu popup bị chặn, bị hủy hoặc lỗi internal/network do partitioned storage, tự động fallback sang signInWithRedirect
      if (e && (e.code === 'auth/popup-blocked' || e.code === 'auth/cancelled-popup-request' || e.code === 'auth/internal-error' || e.code === 'auth/network-request-failed')) {
        try {
          Toast.warning('Đang tự động chuyển hướng sang trang Google...');
          const provider = new firebase.auth.GoogleAuthProvider();
          provider.addScope('profile');
          provider.addScope('email');
          provider.setCustomParameters({ prompt: 'select_account' });
          await this.auth.signInWithRedirect(provider);
          return;
        } catch (redirectErr) {
          Toast.error('Đăng nhập Google thất bại: ' + this.friendlyError(redirectErr));
        }
      } else if (e && e.code === 'auth/popup-closed-by-user') {
        Toast.warning('Bạn đã đóng cửa sổ Google. Nếu popup bị đơ hoặc trắng trang, hãy bấm nút "Không mở được popup?" bên dưới.');
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
      const provider = new firebase.auth.GoogleAuthProvider();
      provider.addScope('profile');
      provider.addScope('email');
      provider.setCustomParameters({ prompt: 'select_account' });
      Toast.info('Đang chuyển hướng sang Google...');
      await this.auth.signInWithRedirect(provider);
    } catch (e) {
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
   * Đăng xuất: đồng bộ dữ liệu nhanh với timeout 1.5s, sau đó luôn hoàn tất đăng xuất
   */
  /**
   * Đăng xuất: đồng bộ dữ liệu nhanh và bảo vệ dữ liệu chưa kịp lên server
   */
  async signOut() {
    const doFinalSignOut = async () => {
      // Trước khi dọn dữ liệu bộ nhớ của phiên đăng nhập, tạo bản sao lưu offline dạng spendwise_backup_<uid>
      // để nếu người dùng đăng xuất trong lúc mất mạng hoặc lỗi đồng bộ thì dữ liệu vẫn phục hồi được
      if (this.currentUser && this.currentUser.uid) {
        try {
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

      this.showAuthGate();
      Toast.success('Đã đăng xuất thành công!');
    };

    let syncOk = true;
    if (this.currentUser) {
      // Cố gắng đồng bộ lên cloud trước khi đăng xuất
      try {
        const syncPromise = this.pushToCloud();
        const timeoutPromise = new Promise((_, reject) => setTimeout(() => reject(new Error('Sync timeout')), 1500));
        const res = await Promise.race([syncPromise, timeoutPromise]);
        if (res !== true) syncOk = false;
      } catch (e) {
        console.warn('Lỗi hoặc timeout khi đồng bộ trước đăng xuất:', e);
        syncOk = false;
      }
    }

    // Kiểm tra còn dữ liệu địa phương hoặc thay đổi chưa được đẩy lên cloud
    const localTxs = (typeof Storage !== 'undefined' && typeof Storage.getTransactions === 'function')
      ? (Storage.getTransactions() || [])
      : (typeof Storage !== 'undefined' && typeof Storage.get === 'function' ? (Storage.get('spendwise_transactions', []) || []) : []);
    const hasUnsyncedTxs = localTxs.some(t => t && t.syncState !== 'synced');
    const hasPendingChanges = (typeof SyncManager !== 'undefined') &&
      (SyncManager.getQueue().length > 0 || SyncManager.getTombstones().length > 0);
    const hasAnyLocalData = localTxs.length > 0 ||
      (typeof Features !== 'undefined' && Features.getWallets().length > 0) ||
      (typeof Features !== 'undefined' && Features.getGoals().length > 0) ||
      (typeof Features !== 'undefined' && Features.getRecurring().length > 0);

    // Nếu đồng bộ thất bại/timeout VÀ máy có dữ liệu cần bảo vệ
    if (!syncOk && (hasUnsyncedTxs || hasPendingChanges || hasAnyLocalData)) {
      ConfirmDialog.show({
        title: 'Chưa đồng bộ xong dữ liệu',
        message: 'Dữ liệu mới nhất chưa được xác nhận lưu lên máy chủ (có thể do mất mạng hoặc quá thời gian chờ). Nếu đăng xuất lúc này, các thay đổi trên máy có thể bị mất. Bạn có muốn tải file sao lưu trước khi đăng xuất?',
        confirmText: 'Sao lưu & Đăng xuất',
        onConfirm: async () => {
          if (typeof ExportManager !== 'undefined' && typeof ExportManager.exportJSON === 'function') {
            try { ExportManager.exportJSON(); } catch (err) { console.warn(err); }
          }
          await doFinalSignOut();
        }
      });
      return;
    }

    if (hasUnsyncedTxs || hasPendingChanges) {
      ConfirmDialog.show({
        title: 'Còn thay đổi chưa đồng bộ',
        message: 'Bạn có thay đổi chưa được xác nhận đồng bộ lên máy chủ. Bạn có chắc chắn muốn đăng xuất?',
        confirmText: 'Vẫn đăng xuất',
        onConfirm: doFinalSignOut
      });
      return;
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
          await root.collection('budgets').doc('main').delete().catch(() => {});
          await root.collection('settings').doc('main').delete().catch(() => {});
          await root.delete().catch(() => {});

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
        : 'Vui lòng đăng nhập để sử dụng SpendWise và đồng bộ đám mây.';
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

      const hasCloudData =
        cloud.spendwise_transactions.length > 0 ||
        cloud.spendwise_wallets.length > 0 ||
        cloud.spendwise_goals.length > 0 ||
        cloud.spendwise_recurring.length > 0 ||
        cloud.spendwise_debts.length > 0 ||
        Object.keys(cloud.spendwise_budgets).length > 0;

      if (!hasCloudData) {
        // Nếu trên cloud chưa có dữ liệu, kiểm tra xem có bản sao lưu offline của tài khoản này không
        const backupRaw = localStorage.getItem('spendwise_backup_' + this.currentUser.uid);
        if (backupRaw && (!local.spendwise_transactions || local.spendwise_transactions.length === 0)) {
          try {
            const backup = JSON.parse(backupRaw);
            if (backup && Array.isArray(backup.transactions) && backup.transactions.length > 0) {
              local.spendwise_transactions = backup.transactions;
              localStorage.setItem('spendwise_transactions', JSON.stringify(backup.transactions));
              if (Array.isArray(backup.wallets)) localStorage.setItem('spendwise_wallets', JSON.stringify(backup.wallets));
              if (Array.isArray(backup.goals)) localStorage.setItem('spendwise_goals', JSON.stringify(backup.goals));
              if (Array.isArray(backup.recurring)) localStorage.setItem('spendwise_recurring', JSON.stringify(backup.recurring));
              if (Array.isArray(backup.debts)) localStorage.setItem('spendwise_debts', JSON.stringify(backup.debts));
              if (backup.budgets && typeof backup.budgets === 'object') localStorage.setItem('spendwise_budgets', JSON.stringify(backup.budgets));
            }
          } catch (bErr) { console.warn('Lỗi đọc bản sao lưu dự phòng:', bErr); }
        }
        // Tài khoản mới → đẩy dữ liệu cục bộ (nếu có) lên cloud
        await this.pushToCloud();
        this.rerender();
        if (!silent) Toast.success('Đã tạo kho dữ liệu trên máy chủ!');
        return;
      }

      // Bản ghi đã xoá trên máy này (tombstone) không được "hồi sinh" từ cloud
      const tombs = (typeof SyncManager !== 'undefined') ? SyncManager.getTombstones() : [];

      // Gộp danh sách: giữ bản local chưa kịp đồng bộ + bản cloud, ưu tiên bản mới hơn
      const mergedTxs = this.mergeById(
        Array.isArray(local.spendwise_transactions) ? local.spendwise_transactions : [],
        cloud.spendwise_transactions,
        tombs
      );
      const safeTxs = (typeof ExportManager !== 'undefined')
        ? ExportManager.sanitizeTransactions(mergedTxs)
        : mergedTxs;
      localStorage.setItem('spendwise_transactions', JSON.stringify(safeTxs));

      localStorage.setItem('spendwise_wallets', JSON.stringify(
        this.mergeById(local.spendwise_wallets || [], cloud.spendwise_wallets, tombs)));
      localStorage.setItem('spendwise_goals', JSON.stringify(
        this.mergeById(local.spendwise_goals || [], cloud.spendwise_goals, tombs)));
      localStorage.setItem('spendwise_recurring', JSON.stringify(
        this.mergeById(local.spendwise_recurring || [], cloud.spendwise_recurring, tombs)));

      // Sổ nợ nhóm: gộp như các danh sách khác rồi kiểm tra tổng khớp trước khi lưu
      const mergedDebts = this.mergeById(local.spendwise_debts || [], cloud.spendwise_debts, tombs);
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
  mergeById(localArr, cloudArr, tombstones = []) {
    return Business.mergeById(localArr, cloudArr, tombstones);
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

      for (const key of Object.keys(this.COLLECTIONS)) {
        const colName = this.COLLECTIONS[key];
        const list = Storage.get(key, []) || [];

        // Loại bản ghi đã bị xóa trên máy (theo tombstone) trước khi đẩy
        const tombs = (typeof SyncManager !== 'undefined') ? SyncManager.getTombstones() : [];
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

      // Server đã xác nhận → mới coi là đồng bộ xong
      if (typeof SyncManager !== 'undefined') {
        SyncManager.clearTombstones();
        SyncManager.clearQueue();
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