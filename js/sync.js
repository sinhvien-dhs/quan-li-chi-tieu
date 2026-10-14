/**
 * sync.js — Phát hiện online/offline, hàng đợi thay đổi khi offline,
 *           tự động đồng bộ khi có mạng trở lại
 */

const SyncManager = {
  QUEUE_KEY: 'spendwise_sync_queue',
  URL_KEY: 'spendwise_sync_url',
  LAST_SYNC_KEY: 'spendwise_last_sync',
  TOMBSTONE_KEY: 'spendwise_tombstones',

  getUrl() {
    return localStorage.getItem(this.URL_KEY) || '';
  },

  setUrl(url) {
    localStorage.setItem(this.URL_KEY, url);
  },

  getQueue() {
    try {
      return JSON.parse(localStorage.getItem(this.QUEUE_KEY)) || [];
    } catch {
      return [];
    }
  },

  pushQueue(entry) {
    const q = this.getQueue();
    q.push({ ...entry, at: Date.now() });
    localStorage.setItem(this.QUEUE_KEY, JSON.stringify(q));
    this.updateBadge();
  },

  clearQueue() {
    localStorage.removeItem(this.QUEUE_KEY);
    this.updateBadge();
  },

  /**
   * Ghi nhận "đã xóa" để không bị ghi đè khi đồng bộ (xóa offline)
   * @param {string} txId
   */
  markDeleted(txId) {
    const list = Storage.get(this.TOMBSTONE_KEY, []) || [];
    if (!list.includes(txId)) {
      list.push(txId);
      Storage.set(this.TOMBSTONE_KEY, list.slice(-2000));
    }
  },

  getTombstones() {
    return Storage.get(this.TOMBSTONE_KEY, []) || [];
  },

  clearTombstones() {
    Storage.remove(this.TOMBSTONE_KEY);
  },

  /**
   * Vá Storage.set để mọi thay đổi đều được đưa vào hàng đợi đồng bộ
   */
  patchStorage() {
    if (Storage.__syncPatched) return;
    Storage.__syncPatched = true;

    const origSet = Storage.set.bind(Storage);
    const origRemove = Storage.remove.bind(Storage);

    Storage.set = (key, data) => {
      const result = origSet(key, data);
      if (key !== this.QUEUE_KEY && key !== this.URL_KEY && key !== this.LAST_SYNC_KEY) {
        // Dữ liệu sẽ tự đồng bộ qua Firebase khi đã đăng nhập; chỉ lưu queue khi
        // đang dùng chế độ local / chưa đăng nhập để đồng bộ sau bằng nút
        const useFirebase = typeof AuthManager !== 'undefined' && AuthManager.currentUser;
        if (useFirebase) {
          AuthManager.schedulePush();
        } else {
          this.pushQueue({ op: 'set', key });
        }
      }
      return result;
    };

    Storage.remove = (key) => {
      origRemove(key);
      if (key !== this.QUEUE_KEY && key !== this.URL_KEY && key !== this.LAST_SYNC_KEY) {
        const useFirebase = typeof AuthManager !== 'undefined' && AuthManager.currentUser;
        if (useFirebase) {
          AuthManager.schedulePush();
        } else {
          this.pushQueue({ op: 'remove', key });
        }
      }
    };
  },

  /**
   * Đồng bộ hàng đợi: POST lên server nếu có URL, nếu không thì chỉ ghi nhận cục bộ
   */
  async syncNow() {
    const queue = this.getQueue();
    if (queue.length === 0) {
      Toast.success('Dữ liệu đã đồng bộ, không có thay đổi mới!');
      this.updateBadge();
      return;
    }

    const url = this.getUrl();
    if (url) {
      try {
        const res = await fetch(url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ syncedAt: new Date().toISOString(), changes: queue })
        });
        if (!res.ok) throw new Error('HTTP ' + res.status);
        this.clearQueue();
        localStorage.setItem(this.LAST_SYNC_KEY, new Date().toISOString());
        Toast.success(`Đã đồng bộ ${queue.length} thay đổi lên máy chủ!`);
      } catch (err) {
        Toast.error('Đồng bộ thất bại, sẽ thử lại khi có mạng!');
      }
    } else {
      // Không cấu hình server: xác nhận đồng bộ cục bộ
      this.clearQueue();
      localStorage.setItem(this.LAST_SYNC_KEY, new Date().toISOString());
      Toast.success(`Đã đồng bộ cục bộ ${queue.length} thay đổi (chưa cấu hình server).`);
    }
    this.updateBadge();
  },

  onOnline() {
    Toast.success('Đã có mạng — đang đồng bộ dữ liệu...');
    this.updateBadge();
    setTimeout(() => this.syncNow(), 800);
  },

  onOffline() {
    Toast.warning('Mất kết nối mạng — dữ liệu sẽ được lưu tạm và đồng bộ sau.');
    this.updateBadge();
  },

  updateBadge() {
    const badge = document.getElementById('syncStatusBadge');
    if (!badge) return;
    const pending = this.getQueue().length;
    if (!navigator.onLine) {
      badge.className = 'status-tag status-tag--danger';
      badge.textContent = `Offline • chờ đồng bộ ${pending}`;
    } else if (pending > 0) {
      badge.className = 'status-tag status-tag--warning';
      badge.textContent = `Chờ đồng bộ ${pending}`;
    } else {
      badge.className = 'status-tag status-tag--success';
      badge.textContent = 'Đã đồng bộ';
    }

    const lastSync = document.getElementById('syncLastTime');
    if (lastSync) {
      const t = localStorage.getItem(this.LAST_SYNC_KEY);
      lastSync.textContent = t ? 'Lần cuối: ' + new Date(t).toLocaleString('vi-VN') : 'Chưa đồng bộ lần nào';
    }
  },

  init() {
    this.patchStorage();

    window.addEventListener('online', () => this.onOnline());
    window.addEventListener('offline', () => this.onOffline());

    const urlInput = document.getElementById('inputSyncUrl');
    if (urlInput) {
      urlInput.value = this.getUrl();
      urlInput.addEventListener('change', () => this.setUrl(urlInput.value.trim()));
    }

    const btnSync = document.getElementById('btnSyncNow');
    if (btnSync) btnSync.addEventListener('click', () => this.syncNow());

    this.updateBadge();
  }
};
