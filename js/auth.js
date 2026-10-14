/**
 * auth.js — Đăng ký / Đăng nhập / Đăng xuất tài khoản (Firebase Auth)
 *           và đồng bộ dữ liệu lên Firestore
 */

const AuthManager = {
  currentUser: null,
  auth: null,
  db: null,
  _pushTimer: null,

  DATA_KEYS: [
    'spendwise_transactions',
    'spendwise_budgets',
    'spendwise_wallets',
    'spendwise_goals',
    'spendwise_recurring',
    'spendwise_currency',
    'spendwise_theme',
    'spendwise_reminder_time'
  ],

  isConfigured() {
    return typeof FIREBASE_CONFIG !== 'undefined' && !!FIREBASE_CONFIG.apiKey;
  },

  init() {
    const overlay = document.getElementById('authOverlay');

    if (!this.isConfigured() || typeof firebase === 'undefined') {
      // Chưa cấu hình Firebase → chạy ở chế độ local như cũ
      if (overlay) overlay.classList.remove('active');
      return;
    }

    firebase.initializeApp(FIREBASE_CONFIG);
    this.auth = firebase.auth();
    this.db = firebase.firestore();

    // Cho phép Firestore chạy offline & tự đồng bộ khi online
    try {
      this.db.enablePersistence({ synchronizeTabs: true });
    } catch (e) {
      // Tab này có thể đang ở nhiều tab cùng lúc — bỏ qua
      console.warn('Firestore persistence:', e.code);
    }

    this.auth.onAuthStateChanged(async user => {
      this.currentUser = user;
      if (user) {
        if (overlay) overlay.classList.remove('active');
        this.updateAccountUI(user);

        // Đổi tài khoản → xóa dữ liệu cũ của tài khoản trước trên máy này
        const storedUid = localStorage.getItem('spendwise_uid');
        if (storedUid && storedUid !== user.uid) {
          this.DATA_KEYS.forEach(key => localStorage.removeItem(key));
        }
        localStorage.setItem('spendwise_uid', user.uid);

        await this.pullFromCloud();
        Toast.success(`Chào mừng ${user.email}!`);
      } else {
        this.updateAccountUI(null);
      }
    });

    const loginBtn = document.getElementById('authLoginBtn');
    const registerBtn = document.getElementById('authRegisterBtn');
    const logoutBtn = document.getElementById('btnLogout');

    if (loginBtn) {
      loginBtn.addEventListener('click', () => this.signIn());
    }
    if (logoutBtn) {
      logoutBtn.addEventListener('click', () => this.signOut());
    }

    const openAuthBtn = document.getElementById('btnOpenAuth');
    if (openAuthBtn) {
      openAuthBtn.addEventListener('click', () => this.openAuthOverlay());
    }

    const googleBtn = document.getElementById('authGoogleBtn');
    if (googleBtn) {
      googleBtn.addEventListener('click', () => this.signInWithGoogle());
    }

    // Nhấn Enter trong ô tài khoản/mật khẩu = đăng nhập
    ['authEmail', 'authPassword'].forEach(id => {
      const el = document.getElementById(id);
      if (el) {
        el.addEventListener('keydown', (e) => {
          if (e.key === 'Enter') {
            e.preventDefault();
            this.signIn();
          }
        });
      }
    });

    // Nhấn Enter trong form đăng ký = tạo tài khoản
    ['registerName', 'registerPassword', 'registerPassword2'].forEach(id => {
      const el = document.getElementById(id);
      if (el) {
        el.addEventListener('keydown', (e) => {
          if (e.key === 'Enter') {
            e.preventDefault();
            this.signUp();
          }
        });
      }
    });

    // Chuyển sang giao diện đăng ký
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

    const regBtn = document.getElementById('authRegisterBtn');
    if (regBtn) {
      regBtn.addEventListener('click', () => {
        document.getElementById('authRegisterOverlay').classList.add('active');
      });
    }
    const backBtn = document.getElementById('registerBackBtn');
    if (backBtn) {
      backBtn.addEventListener('click', () => {
        document.getElementById('authRegisterOverlay').classList.remove('active');
      });
    }

    const closeBtn = document.getElementById('registerCloseBtn');
    if (closeBtn) {
      closeBtn.addEventListener('click', () => {
        document.getElementById('authRegisterOverlay').classList.remove('active');
      });
    }

    // Bấm vùng nền xám cũng tắt form đăng ký
    const regOverlay = document.getElementById('authRegisterOverlay');
    if (regOverlay) {
      regOverlay.addEventListener('click', (e) => {
        if (e.target === regOverlay) regOverlay.classList.remove('active');
      });
    }
    const regSubmit = document.getElementById('registerSubmitBtn');
    if (regSubmit) {
      regSubmit.addEventListener('click', () => this.signUp());
    }
  },

  async signUp() {
    const username = document.getElementById('registerName').value.trim();
    const email = username.includes('@') ? username : username + '@spendwise.app';
    const password = document.getElementById('registerPassword').value;
    const password2 = document.getElementById('registerPassword2').value;

    if (!username) { Toast.error('Vui lòng nhập tên đăng nhập!'); return; }
    if (!/^[a-zA-Z0-9_.-]+$/.test(username)) { Toast.error('Tên đăng nhập không được có dấu/khoảng trắng!'); return; }
    if (!password || password.length < 6) { Toast.error('Mật khẩu tối thiểu 6 ký tự!'); return; }
    if (password !== password2) { Toast.error('Hai mật khẩu không khớp!'); return; }

    try {
      const cred = await this.auth.createUserWithEmailAndPassword(email, password);
      await cred.user.updateProfile({ displayName: username });
      Toast.success(`Tạo tài khoản "${username}" thành công!`);
      document.getElementById('authRegisterOverlay').classList.remove('active');
    } catch (e) {
      if (e.code === 'auth/email-already-in-use') {
        document.getElementById('registerNameError').style.display = 'block';
        Toast.error('Đăng ký thất bại: Tên đăng nhập đã được đăng ký!');
      } else {
        Toast.error('Đăng ký thất bại: ' + this.friendlyError(e));
      }
    }
  },

  /**
   * Đăng nhập bằng tài khoản Google
   */
  async signInWithGoogle() {
    try {
      const provider = new firebase.auth.GoogleAuthProvider();
      await this.auth.signInWithPopup(provider);
    } catch (e) {
      Toast.error('Đăng nhập Google thất bại: ' + this.friendlyError(e));
    }
  },

  getCredentials() {
    const email = document.getElementById('authEmail').value.trim();
    const password = document.getElementById('authPassword').value;
    if (!email || !email.includes('@')) { Toast.error('Email không hợp lệ!'); return null; }
    if (!password || password.length < 6) { Toast.error('Mật khẩu tối thiểu 6 ký tự!'); return null; }
    return { email, password };
  },

  async signIn() {
    const rawId = document.getElementById('authEmail').value.trim();
    const email = rawId.includes('@') ? rawId : rawId + '@spendwise.app';
    const password = document.getElementById('authPassword').value;
    if (!rawId) { Toast.error('Vui lòng nhập tên tài khoản!'); return null; }
    if (!password || password.length < 6) { Toast.error('Mật khẩu tối thiểu 6 ký tự!'); return null; }
    try {
      await this.auth.signInWithEmailAndPassword(email, password);
    } catch (e) {
      Toast.error('Đăng nhập thất bại: ' + this.friendlyError(e));
    }
  },

  async signOut() {
    // Xóa dữ liệu tài chính cục bộ để không ai thấy dữ liệu tài khoản cũ trên cùng máy
    this.clearLocalUserData();
    await this.auth.signOut();
    Toast.success('Đã đăng xuất và xóa dữ liệu cụbộ!');
    Toast.success('Đã đăng xuất!');
  },

  /**
   * Xóa toàn bộ dữ liệu người dùng khỏi bộ nhớ cục bộ
   * (tránh rò rỉ dữ liệu tài chính khi dùng chung máy)
   */
  clearLocalUserData() {
    this.DATA_KEYS.forEach(key => localStorage.removeItem(key));
    localStorage.removeItem('spendwise_uid');
    localStorage.removeItem('spendwise_sync_queue');
    localStorage.removeItem('spendwise_rates');

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
      'auth/weak-password': 'Mật khẩu quá yếu (tối thiểu 6 ký tự)!',
      'auth/invalid-credential': 'Tên đăng nhập không tồn tại hoặc sai mật khẩu!',
      'auth/too-many-requests': 'Thử quá nhiều lần, vui lòng thử lại sau!'
    };
    return map[e.code] || e.message;
  },

  updateAccountUI(user) {
    const emailEl = document.getElementById('accountEmail');
    if (emailEl) {
      emailEl.textContent = user
        ? (user.displayName ? `${user.displayName} — ${user.email}` : user.email)
        : 'Chưa đăng nhập';
    }
    const logoutBtn = document.getElementById('btnLogout');
    if (logoutBtn) logoutBtn.style.display = user ? '' : 'none';
    const openAuthBtn = document.getElementById('btnOpenAuth');
    if (openAuthBtn) openAuthBtn.style.display = user ? 'none' : '';
  },

  openAuthOverlay() {
    const overlay = document.getElementById('authOverlay');
    if (overlay) overlay.classList.add('active');
  },

  userDoc() {
    return this.db.collection('users').doc(this.currentUser.uid).collection('data').doc('main');
  },

  /**
   * Tải dữ liệu từ cloud về ghi đè localStorage rồi render lại UI
   */
  async pullFromCloud() {
    if (!this.currentUser) return;
    try {
      // Giữ một bản dữ liệu local trước khi đọc từ cloud (để gộp nếu cần)
      const local = {};
      this.DATA_KEYS.forEach(key => {
        const raw = localStorage.getItem(key);
        if (raw !== null) {
          try { local[key] = JSON.parse(raw); } catch { local[key] = raw; }
        }
      });

      const doc = await this.userDoc().get();
      if (doc.exists) {
        const data = doc.data();

        // === Kiểm tra & làm sạch dữ liệu từ cloud (phòng dữ liệu bị hỏng/lạm dụng) ===
        const cloudTx = Array.isArray(data['spendwise_transactions']) ? data['spendwise_transactions'] : [];
        const localTx = Array.isArray(local['spendwise_transactions']) ? local['spendwise_transactions'] : [];

        // Gộp dữ liệu: giữ cả local (khi chưa đăng nhập) và cloud
        const mergedTxs = this.mergeById(localTx, cloudTx, 'id');
        // Lọc bỏ bản ghi không hợp lệ (sai kiểu/giá trị) trước khi lưu
        const safeTxs = (typeof ExportManager !== 'undefined')
          ? ExportManager.sanitizeTransactions(mergedTxs)
          : mergedTxs;
        localStorage.setItem('spendwise_transactions', JSON.stringify(safeTxs));

        const mergedWallets = this.mergeById(local['spendwise_wallets'] || [], data['spendwise_wallets'] || [], 'id');
        if (mergedWallets.length) localStorage.setItem('spendwise_wallets', JSON.stringify(mergedWallets));

        const mergedGoals = this.mergeById(local['spendwise_goals'] || [], data['spendwise_goals'] || [], 'id');
        localStorage.setItem('spendwise_goals', JSON.stringify(mergedGoals));

        const mergedRec = this.mergeById(local['spendwise_recurring'] || [], data['spendwise_recurring'] || [], 'id');
        localStorage.setItem('spendwise_recurring', JSON.stringify(mergedRec));

        const lb = local['spendwise_budgets'] || {};
        const cb = data['spendwise_budgets'] || {};
        const mergedBudgets = { ...cb };
        Object.keys(lb).forEach(k => {
          mergedBudgets[k] = Math.max(cb[k] || 0, lb[k] || 0);
        });
        localStorage.setItem('spendwise_budgets', JSON.stringify(mergedBudgets));

        // Giữ lại lựa chọn tiền tệ/theme/settings ở local; chỉ nhận các key còn thiếu từ cloud
        ['spendwise_currency', 'spendwise_theme', 'spendwise_settings', 'spendwise_reminder_time'].forEach(key => {
          if (local[key] === undefined && data[key] !== undefined) {
            localStorage.setItem(key, typeof data[key] === 'string' ? data[key] : JSON.stringify(data[key]));
          }
        });

        this.rerender();
        Toast.success('Đã tải dữ liệu từ đám mây và gộp dữ liệu trên máy!');

        // Đẩy bản gộp lên cloud để hai bên khớp nhau
        await this.pushToCloud();
      } else {
        // Tài khoản mới → đẩy dữ liệu local hiện có lên cloud
        await this.pushToCloud();
      }
    } catch (e) {
      console.error(e);
      Toast.error('Không tải được dữ liệu đám mây (có thể đang offline).');
    }
  },

  /**
   * Gộp hai mảng theo khóa id, giữ bản ghi mới nhất (nếu có updatedAt/lastRun)
   */
  mergeById(localArr, cloudArr, idKey) {
    const map = new Map();
    const add = (item, source) => {
      const k = item && item[idKey];
      if (!k) return;
      if (!map.has(k)) {
        map.set(k, item);
      } else {
        const cur = map.get(k);
        const a = cur.updatedAt || cur.lastRun || '';
        const b = item.updatedAt || item.lastRun || '';
        if (b > a) map.set(k, item);
      }
    };
    cloudArr.forEach(item => add(item, 'cloud'));
    localArr.forEach(item => add(item, 'local'));
    return Array.from(map.values());
  },

  /**
   * Đẩy toàn bộ dữ liệu local lên Firestore
   */
  async pushToCloud() {
    if (!this.currentUser) return;
    const payload = {};
    this.DATA_KEYS.forEach(key => {
      const raw = localStorage.getItem(key);
      if (raw !== null) {
        try { payload[key] = JSON.parse(raw); } catch { payload[key] = raw; }
      }
    });
    payload.updatedAt = new Date().toISOString();
    // Áp dụng tombstone: loại bỏ bản ghi đã xóa ở máy này (xóa offline không bị ghi đè)
    const tombs = (typeof SyncManager !== 'undefined') ? SyncManager.getTombstones() : [];
    if (tombs.length && Array.isArray(payload.spendwise_transactions)) {
      payload.spendwise_transactions = payload.spendwise_transactions.filter(t => !tombs.includes(t.id));
    }

    // merge:true => gửi lại nhiều lần không tạo bản ghi trùng (idempotent)
    await this.userDoc().set(payload, { merge: true });

    // Chỉ coi là thành công khi server đã xác nhận
    if (typeof SyncManager !== 'undefined') {
      SyncManager.clearTombstones();
      SyncManager.clearQueue();
    }
    return true;
  },

  /**
   * Debounce push mỗi khi dữ liệu đổi
   */
  schedulePush() {
    if (!this.currentUser) return;
    clearTimeout(this._pushTimer);
    this._pushTimer = setTimeout(() => {
      this.pushToCloud().then(() => {
        Toast.success('Đã lưu lên đám mây!');
      }).catch(() => {});
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
    if (typeof ChartManager !== 'undefined' && typeof PageManager !== 'undefined' && PageManager.currentPage === 'pageStats') {
      ChartManager.renderAllCharts();
    }
  }
};

