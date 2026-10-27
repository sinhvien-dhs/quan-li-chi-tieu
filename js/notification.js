/**
 * notification.js — Quản lý thông báo nhắc nhở ghi chép chi tiêu định kỳ
 */

const NotificationManager = {
  STORAGE_KEY: 'spendwise_reminder_time',

  init() {
    this.bindEvents();
    this.checkScheduledReminder();
  },

  bindEvents() {
    const btnEnable = document.getElementById('btnEnableNotification');
    const inputTime = document.getElementById('inputReminderTime');

    if (inputTime) {
      inputTime.value = Storage.get(this.STORAGE_KEY, '21:00');
      inputTime.addEventListener('change', (e) => {
        Storage.set(this.STORAGE_KEY, e.target.value);
        Toast.success(`Đã cập nhật giờ nhắc nhở lúc ${e.target.value}!`);
      });
    }

    if (btnEnable) {
      btnEnable.addEventListener('click', () => this.requestPermission());
    }

    // Nút thử nghiệm thông báo ngay
    const btnTest = document.getElementById('btnTestNotification');
    if (btnTest) {
      btnTest.addEventListener('click', () => this.sendTestNotification());
    }
  },

  /**
   * Yêu cầu quyền gửi thông báo từ trình duyệt
   */
  async requestPermission() {
    if (!('Notification' in window)) {
      Toast.error('Trình duyệt của bạn không hỗ trợ Web Notifications!');
      return;
    }

    try {
      const permission = await Notification.requestPermission();
      if (permission === 'granted') {
        Toast.success('Đã kích hoạt quyền thông báo!');
        this.updateStatusBadge();
        this.sendNotification('SpendWise - Nhắc nhở', {
          body: 'Tuyệt vời! Bạn sẽ nhận được nhắc nhở ghi chép chi tiêu mỗi ngày.',
          icon: 'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><text y=".9em" font-size="90">💰</text></svg>'
        });
      } else {
        Toast.warning('Bạn đã từ chối quyền gửi thông báo.');
        this.updateStatusBadge();
      }
    } catch (err) {
      console.error(err);
      Toast.error('Lỗi khi xin quyền thông báo!');
    }
  },

  sendTestNotification() {
    if (!('Notification' in window)) {
      Toast.error('Trình duyệt không hỗ trợ Web Notification');
      return;
    }

    if (Notification.permission === 'granted') {
      this.sendNotification('SpendWise: Thử nghiệm thông báo', {
        body: 'Đừng quên ghi lại các khoản cà phê và ăn uống hôm nay nhé! 🍜☕',
        icon: 'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><text y=".9em" font-size="90">🔔</text></svg>'
      });
      Toast.success('Đã gửi thông báo thử nghiệm!');
    } else {
      this.requestPermission();
    }
  },

  sendNotification(title, options) {
    if (Notification.permission === 'granted') {
      new Notification(title, options);
    }
  },

  updateStatusBadge() {
    const badge = document.getElementById('notificationStatusBadge');
    if (!badge) return;

    if (!('Notification' in window)) {
      badge.textContent = 'Không hỗ trợ';
      badge.className = 'status-tag status-tag--danger';
      return;
    }

    if (Notification.permission === 'granted') {
      badge.textContent = 'Đã bật';
      badge.className = 'status-tag status-tag--success';
    } else {
      badge.textContent = 'Chưa bật';
      badge.className = 'status-tag status-tag--warning';
    }
  },

  /**
   * Kiểm tra giờ để nhắc nhở nếu tab đang mở
   */
  checkScheduledReminder() {
    this.updateStatusBadge();

    // Kiểm tra mỗi phút một lần
    setInterval(() => {
      if (Notification.permission !== 'granted') return;

      const reminderTime = Storage.get(this.STORAGE_KEY, '21:00');
      const now = new Date();
      const currentHours = String(now.getHours()).padStart(2, '0');
      const currentMinutes = String(now.getMinutes()).padStart(2, '0');
      const currentTimeStr = `${currentHours}:${currentMinutes}`;

      if (currentTimeStr === reminderTime) {
        // Chỉ gửi nếu hôm nay chưa gửi trong phút này
        const lastSentDate = Storage.get('spendwise_last_reminder_date');
        const todayStr = Utils.getToday();

        if (lastSentDate !== todayStr) {
          this.sendNotification('SpendWise - Nhắc nhở buổi tối 🌙', {
            body: 'Hãy dành 1 phút cập nhật các khoản chi tiêu trong ngày của bạn nhé!',
            icon: 'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><text y=".9em" font-size="90">📝</text></svg>'
          });
          Storage.set('spendwise_last_reminder_date', todayStr);
        }
      }
    }, 30000);
  }
};
