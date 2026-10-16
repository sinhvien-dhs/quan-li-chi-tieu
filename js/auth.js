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

  init() {
    const overlay = document.getElementById('authOverlay');

    if (!this.isConfigured() || typeof firebase === 'undefined') {
      if (overlay) overlay.classList.remove('active');
      return;
    }

    firebase.initializeApp(FIREBASE_CONFIG);
    this.auth = firebase.auth();
    this.db = firebase.firestore();

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
        if (overlay) overlay.classList.remove('active');
        this.updateAccountUI(user);

        // Đổi tài khoản trên cùng thiết bị → xóa dữ liệu của tài khoản trước
        const storedUid = localStorage.getItem('spendwise_uid');
        if (storedUid && storedUid !== user.uid) {
          this.DATA_KEYS.forEach(key => localStorage.removeItem(key));
        }
        localStorage.setItem('spendwise_uid', user.uid);

        await this.pullFromCloud();
      } else {
        this.updateAccountUI(null);
      }
    });

    this.bindUI();
  },

  bindUI() {
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
    });
    on('registerCloseBtn', () => {
      document.getElementById('authRegisterOverlay').classList.remove('active');
    });
    on('authGoogleBtn', () => this.signInWithGoogle());
    on('btnLogout', () => this.signOut());
    on('btnOpenAuth', () => this.openAuthOverlay());
    on('btnForgotPassword', () => this.sendPasswordReset());

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

    // Bấm nền xám để đóng form đăng ký
    const regOverlay = document.getElementById('authRegisterOverlay');
    if (regOverlay) {
      regOverlay.addEventListener('click', (e) => {
        if (e.target === regOverlay) regOverlay.classList.remove('active');
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

  async signInWithGoogle() {
    try {
      const provider = new firebase.auth.GoogleAuthProvider();
      provider.setCustomParameters({ prompt: 'select_account' });
      await this.auth.signInWithPopup(provider);
    } catch (e) {
      // Người dùng đóng popup
      if (e && e.code === 'auth/popup-closed-by-user') return;
      Toast.error('Đăng nhập Google thất bại: ' + this.friendlyError(e));
    }
  },

  /**
   * Gửi email đặt lại mật khẩu (luồng quên mật khẩu)
   */
  async sendPasswordReset() {
    const email = document.getElementById('authEmail').value.trim();
    if (!email.includes('@')) {
      Toast.error('Vui lòng nhập email đã đăng ký để đặt lại mật khẩu!');
      return;
    }
    try {
      await this.auth.sendPasswordResetEmail(email);
      Toast.success('Đã gửi email đặt lại mật khẩu. Vui lòng kiểm tra hộp thư!');
    } catch (e) {
      Toast.error('Không gửi được email: ' + this.friendlyError(e));
    }
  },

  /**
   * Đăng xuất: đẩy nốt thay đổi chưa đồng bộ TRƯỚC, rồi mới xóa dữ liệu cục bộ
   */
  async signOut() {
    const doSignOut = async () => {
      if (this.currentUser) {
        // Chờ đẩy hết dữ liệu lên máy chủ; nếu thất bại thì KHÔNG xóa cục bộ
        try {
          await this.pushToCloud();
        } catch (e) {
          console.error(e);
          Toast.error('Chưa đồng bộ được dữ liệu lên máy chủ. Hãy kiểm tra mạng rồi thử lại!');
          return; // giữ nguyên dữ liệu cục bộ
        }
      }
      this.clearLocalUserData();
      await this.auth.signOut();
      Toast.success('Đã đăng xuất và xóa dữ liệu cục bộ!');
    };

    // Cảnh báo nếu còn thay đổi chưa đồng bộ
    if (typeof SyncManager !== 'undefined' && SyncManager.getQueue().length > 0) {
      ConfirmDialog.show({
        title: 'Còn thay đổi chưa đồng bộ',
        message: 'Bạn có ' + SyncManager.getQueue().length +
          ' thay đổi chưa được đồng bộ lên máy chủ. Tiếp tục đăng xuất?',
        confirmText: 'Đồng bộ rồi đăng xuất',
        onConfirm: doSignOut
      });
      return;
    }

    doSignOut();
  },

  /**
   * Xóa tài khoản + toàn bộ dữ liệu trên cloud
   */
  async deleteAccount() {
    if (!this.currentUser) { Toast.error('Bạn chưa đăng nhập!'); return; }

    ConfirmDialog.show({
      title: 'Xóa tài khoản?',
      message: 'Toàn bộ dữ liệu trên máy chủ (giao dịch, ví, mục tiêu, ngân sách) sẽ bị xóa vĩnh viễn. Thao tác này không thể hoàn tác!',
      confirmText: 'Xóa tài khoản',
      onConfirm: async () => {
        try {
          const root = this.userRoot();
          // Xóa từng bộ sưu tập con
          for (const colName of Object.values(this.COLLECTIONS)) {
            const snap = await root.collection(colName).get();
            await Promise.all(snap.docs.map(d => d.ref.delete()));
          }
          await root.collection('budgets').doc('main').delete().catch(() => {});
          await root.collection('settings').doc('main').delete().catch(() => {});
          await root.delete().catch(() => {});

          this.clearLocalUserData();
          await this.currentUser.delete().catch(() => {});
          await this.auth.signOut();
          Toast.success('Đã xóa tài khoản và toàn bộ dữ liệu.');
        } catch (e) {
          console.error(e);
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

    ['authOverlay', 'authRegisterOverlay', 'modalOverlay', 'budgetModal', 'confirmOverlay']
      .forEach(id => {
        const el = document.getElementById(id);
        if (el) el.classList.remove('active');
      });
    document.body.style.overflow = '';

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
    const map = {
      'auth/user-not-found': 'Tên đăng nhập không tồn tại!',
      'auth/wrong-password': 'Sai mật khẩu!',
      'auth/email-already-in-use': 'Tên đăng nhập đã được đăng ký!',
      'auth/invalid-email': 'Email không hợp lệ!',
      'auth/weak-password': 'Mật khẩu quá yếu (tối thiểu 8 ký tự, có chữ và số)!',
      'auth/invalid-credential': 'Tên đăng nhập không tồn tại hoặc sai mật khẩu!',
      'auth/too-many-requests': 'Thử quá nhiều lần, vui lòng thử lại sau!',
      'auth/network-request-failed': 'Không có kết nối mạng. Dữ liệu vẫn được lưu trên máy này.',
      'auth/requires-recent-login': 'Vui lòng đăng nhập lại trước khi thực hiện thao tác này.'
    };
    return (e && map[e.code]) || (e && e.message) || 'Lỗi không xác định';
  },

  updateAccountUI(user) {
    const emailEl = document.getElementById('accountEmail');
    if (emailEl) {
      emailEl.textContent = user
        ? (user.displayName ? `${user.displayName} — ${user.email}` : user.email)
        : 'Chưa đăng nhập — dữ liệu chỉ lưu trên máy này';
    }
    const logoutBtn = document.getElementById('btnLogout');
    if (logoutBtn) logoutBtn.style.display = user ? '' : 'none';
    const openAuthBtn = document.getElementById('btnOpenAuth');
    if (openAuthBtn) openAuthBtn.style.display = user ? 'none' : '';
    const deleteBtn = document.getElementById('btnDeleteAccount');
    if (deleteBtn) deleteBtn.style.display = user ? '' : 'none';
  },

  openAuthOverlay() {
    const overlay = document.getElementById('authOverlay');
    if (overlay) overlay.classList.add('active');
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
  async pullFromCloud() {
    if (!this.currentUser) return;

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
        // Tài khoản mới → đẩy dữ liệu cục bộ (nếu có) lên cloud
        await this.pushToCloud();
        this.rerender();
        Toast.success('Đã tạo kho dữ liệu trên máy chủ!');
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
      Toast.success('Đã đồng bộ dữ liệu từ máy chủ!');
      await this.pushToCloud();
    } catch (e) {
      console.error(e);
      Toast.error('Không tải được dữ liệu từ máy chủ (có thể đang offline).');
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
    if (this._pushing) { this.schedulePush(); return false; }
    this._pushing = true;

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

        const existingSnap = await root.collection(colName).get();
        const existingIds = new Set(existingSnap.docs.map(d => d.id));

        const ops = [];
        toPush.forEach(item => {
          if (!item || !item.id) return;
          const payload = Object.assign({}, item);
          delete payload.syncState;      // trạng thái chỉ có ý nghĩa cục bộ
          ops.push({ path: colName + '/' + item.id, payload: payload });
          existingIds.delete(item.id);
        });

        // Xóa trên server các bản ghi không còn ở máy này (xóa thật, không tombstone)
        existingIds.forEach(id => {
          ops.push({ path: colName + '/' + id, payload: null }); // null = delete
        });

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

      // Ngân sách & cài đặt (1 tài liệu mỗi loại)
      await root.collection('budgets').doc('main').set({
        limits: Storage.get('spendwise_budgets', {}) || {},
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
      }
      return true;
    } catch (e) {
      console.error('pushToCloud:', e);
      throw e;
    } finally {
      this._pushing = false;
    }
  },

  /**
   * Debounce push mỗi khi dữ liệu đổi
   */
  schedulePush() {
    if (!this.currentUser) return;
    clearTimeout(this._pushTimer);
    this._pushTimer = setTimeout(() => {
      this.pushToCloud()
        .then(ok => { if (ok) Toast.success('Đã lưu lên máy chủ!'); })
        .catch(() => {
          // Giữ hàng đợi để thử lại khi có mạng
          Toast.warning('Chưa đồng bộ được — sẽ thử lại khi có mạng.');
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