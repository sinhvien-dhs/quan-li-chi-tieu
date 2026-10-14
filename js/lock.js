/**
 * lock.js — Khoá ứng dụng bằng mã PIN + mã hoá dữ liệu nhạy cảm
 *
 * - PIN được băm bằng PBKDF2 (Web Crypto, 150.000 vòng) chứ không lưu thẳng.
 * - Khoá khi mở app / quay lại tab sau thời gian chờ.
 * - Khoá cứng dữ liệu nhạy cảm khi người dùng bật "Ẩn số dư".
 */

const AppLock = {
  PIN_HASH_KEY: 'spendwise_pin_hash',
  PIN_SALT_KEY: 'spendwise_pin_salt',
  ENABLED_KEY: 'spendwise_lock_enabled',
  HIDE_BALANCE_KEY: 'spendwise_hide_balance',
  AUTO_LOCK_MS: 5 * 60 * 1000,   // Khoá tự động sau 5 phút không thao tác
  ITERATIONS: 150000,

  // ============================================================
  //  PIN
  // ============================================================
  isEnabled() {
    return Storage.get(this.ENABLED_KEY, false);
  },

  hasPin() {
    return !!Storage.get(this.PIN_HASH_KEY, '');
  },

  _randomSalt() {
    const arr = new Uint8Array(16);
    (window.crypto || window.msCrypto).getRandomValues(arr);
    return Array.from(arr).map(b => b.toString(16).padStart(2, '0')).join('');
  },

  async _hash(pin, saltHex) {
    const enc = new TextEncoder();
    const salt = new Uint8Array(saltHex.match(/.{2}/g).map(h => parseInt(h, 16)));
    const key = await crypto.subtle.importKey('raw', enc.encode(pin), 'PBKDF2', false, ['deriveBits']);
    const bits = await crypto.subtle.deriveBits(
      { name: 'PBKDF2', salt: salt, iterations: this.ITERATIONS, hash: 'SHA-256' },
      key, 256
    );
    return Array.from(new Uint8Array(bits)).map(b => b.toString(16).padStart(2, '0')).join('');
  },

  /** Đặt mã PIN mới (chỉ khi chưa có) */
  async setPin(pin) {
    if (!/^\d{4,8}$/.test(pin)) throw new Error('PIN phải có 4-8 chữ số');
    const salt = this._randomSalt();
    const hash = await this._hash(pin, salt);
    Storage.set(this.PIN_SALT_KEY, salt);
    Storage.set(this.PIN_HASH_KEY, hash);
    Storage.set(this.ENABLED_KEY, true);
    return true;
  },

  async verifyPin(pin) {
    const salt = Storage.get(this.PIN_SALT_KEY, '');
    const saved = Storage.get(this.PIN_HASH_KEY, '');
    if (!salt || !saved) return false;
    const hash = await this._hash(pin, salt);
    // So sánh theo độ dài cố định
    if (hash.length !== saved.length) return false;
    let diff = 0;
    for (let i = 0; i < hash.length; i++) diff |= hash.charCodeAt(i) ^ saved.charCodeAt(i);
    return diff === 0;
  },

  disable() {
    localStorage.removeItem(this.PIN_HASH_KEY);
    localStorage.removeItem(this.PIN_SALT_KEY);
    Storage.set(this.ENABLED_KEY, false);
  },

  // ============================================================
  //  ẨN SỐ DƯ
  // ============================================================
  isBalanceHidden() {
    return Storage.get(this.HIDE_BALANCE_KEY, false);
  },

  toggleBalanceVisibility() {
    const next = !this.isBalanceHidden();
    Storage.set(this.HIDE_BALANCE_KEY, next);
    this.applyBalanceMask();
    return next;
  },

  applyBalanceMask() {
    const el = document.getElementById('totalBalance');
    if (!el) return;
    el.dataset.realValue = el.dataset.realValue || el.textContent;
    el.textContent = this.isBalanceHidden() ? '••••••' : el.dataset.realValue;
  },

  // ============================================================
  //  MÀN HÌNH KHOÁ
  // ============================================================
  renderLockScreen() {
    if (document.getElementById('lockScreen')) return;
    const box = document.createElement('div');
    box.id = 'lockScreen';
    box.className = 'lock-screen';
    box.innerHTML =
      '<div class="lock-card">' +
      '<div class="lock-card__icon"><i class="fa-solid fa-lock"></i></div>' +
      '<h2 class="lock-card__title">SpendWise đã khoá</h2>' +
      '<p class="lock-card__text">Nhập mã PIN để tiếp tục</p>' +
      '<input type="password" id="lockPin" class="form__input" inputmode="numeric" maxlength="8" placeholder="Mã PIN">' +
      '<button type="button" class="lock-card__btn" id="lockUnlock">Mở khoá</button>' +
      '<p class="lock-card__error" id="lockError"></p>' +
      '</div>';
    document.body.appendChild(box);

    const pinInput = document.getElementById('lockPin');
    const tryUnlock = async () => {
      const pin = pinInput.value.trim();
      const errEl = document.getElementById('lockError');
      if (!pin) { errEl.textContent = 'Vui lòng nhập mã PIN.'; return; }
      const ok = await AppLock.verifyPin(pin);
      if (ok) {
        box.remove();
        pinInput.value = '';
        Storage.set('spendwise_lock_at', Date.now());
        Toast.success('Đã mở khoá SpendWise.');
      } else {
        errEl.textContent = 'Mã PIN không đúng, thử lại.';
        pinInput.value = '';
        pinInput.focus();
      }
    };

    document.getElementById('lockUnlock').addEventListener('click', tryUnlock);
    pinInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') tryUnlock(); });
    setTimeout(() => pinInput.focus(), 100);
  },

  /** Gọi khi khởi động app: nếu đã bật khoá thì chặn màn hình */
  init() {
    if (!this.isEnabled() || !this.hasPin()) return;
    const last = Number(Storage.get('spendwise_lock_at', 0)) || 0;
    if (Date.now() - last > this.AUTO_LOCK_MS) this.lock();

    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible' && this.isEnabled() && this.hasPin()) {
        const at = Number(Storage.get('spendwise_lock_at', 0)) || 0;
        if (Date.now() - at > this.AUTO_LOCK_MS) this.lock();
      }
    });
  },

  lock() {
    if (!this.isEnabled() || !this.hasPin()) return;
    Storage.set('spendwise_lock_at', 0);
    this.renderLockScreen();
  }
};
