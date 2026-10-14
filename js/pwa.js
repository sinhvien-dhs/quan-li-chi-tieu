/**
 * pwa.js — Quản lý PWA (Cài đặt app, Service Worker), Tour hướng dẫn & Chia tiền nhóm
 */

const PWAManager = {
  deferredPrompt: null,

  init() {
    this.registerServiceWorker();
    this.handleInstallPrompt();
    this.initOnboarding();
    this.initBillSplitter();
  },

  /**
   * Đăng ký Service Worker
   */
  registerServiceWorker() {
    if ('serviceWorker' in navigator) {
      window.addEventListener('load', () => {
        navigator.serviceWorker.register('./sw.js')
          .then((reg) => {
            console.log('✅ Service Worker đăng ký thành công:', reg.scope);

            // Khi có bản mới → tự reload trang (một lần)
            let refreshing = false;
            navigator.serviceWorker.addEventListener('controllerchange', () => {
              if (refreshing) return;
              refreshing = true;
              // Không tải lại khi người dùng đang nhập liệu → chờ họ xong
              this.reloadWhenIdle();
            });

            reg.addEventListener('updatefound', () => {
              const newWorker = reg.installing;
              if (!newWorker) return;
              newWorker.addEventListener('statechange', () => {
                if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
                  console.log('🔄 Có bản mới, đang cập nhật...');
                  newWorker.postMessage({ type: 'SKIP_WAITING' });
                }
              });
            });
          })
          .catch((err) => {
            console.log('ℹ️ Service Worker (bỏ qua khi chạy qua file:// local):', err.message);
          });
      });
    }
  },

  /**
   * Tải lại trang khi người dùng không còn đang nhập liệu.
   * Tránh mất dữ liệu form đang gõ khi có bản cập nhật mới.
   */
  reloadWhenIdle() {
    const isBusy = () => {
      const modalOpen = document.querySelector('.modal-overlay.active, .confirm-overlay.active, .onboarding-overlay.active');
      if (modalOpen) return true;
      const active = document.activeElement;
      if (active && /^(INPUT|TEXTAREA|SELECT)$/.test(active.tagName) &&
          String(active.value || '').trim() !== '') return true;
      return false;
    };

    if (!isBusy()) {
      window.location.reload();
      return;
    }

    console.log('⏳ Có bản cập nhật mới — chờ bạn hoàn tất đang nhập để tải lại.');
    if (typeof Toast !== 'undefined') {
      Toast.show('Có bản cập nhật mới. Trang sẽ tải lại ngay khi bạn xong thao tác nhập.', 'info');
    }

    let waited = 0;
    const timer = setInterval(() => {
      waited += 2000;
      if (!isBusy() || waited >= 120000) {
        clearInterval(timer);
        window.location.reload();
      }
    }, 2000);
  },

  /**
   * Bắt sự kiện cài đặt PWA
   */
  handleInstallPrompt() {
    const banner = document.getElementById('pwaInstallBanner');
    const installBtn = document.getElementById('pwaInstallBtn');
    const closeBtn = document.getElementById('pwaCloseBtn');

    window.addEventListener('beforeinstallprompt', (e) => {
      e.preventDefault();
      this.deferredPrompt = e;

      // Kiểm tra nếu người dùng chưa từng tắt banner
      const dismissed = sessionStorage.getItem('spendwise_pwa_dismissed');
      if (!dismissed && banner) {
        banner.style.display = 'flex';
      }
    });

    if (installBtn) {
      installBtn.addEventListener('click', async () => {
        if (!this.deferredPrompt) {
          Toast.show('Để cài đặt: Bấm dấu 3 chấm trên trình duyệt và chọn "Cài đặt ứng dụng"', 'warning');
          return;
        }
        this.deferredPrompt.prompt();
        const { outcome } = await this.deferredPrompt.userChoice;
        if (outcome === 'accepted') {
          Toast.success('Cảm ơn bạn đã cài đặt SpendWise!');
        }
        this.deferredPrompt = null;
        if (banner) banner.style.display = 'none';
      });
    }

    if (closeBtn && banner) {
      closeBtn.addEventListener('click', () => {
        banner.style.display = 'none';
        sessionStorage.setItem('spendwise_pwa_dismissed', 'true');
      });
    }
  },

  /**
   * Tour giới thiệu ứng dụng cho người dùng mới
   */
  initOnboarding() {
    const overlay = document.getElementById('onboardingOverlay');
    const btn = document.getElementById('onboardingNextBtn');
    const dots = document.querySelectorAll('.onboarding-dot');
    const steps = document.querySelectorAll('.onboarding-step');

    if (!overlay || !btn) return;

    // Kiểm tra xem đã từng xem tour chưa
    const seen = Storage.get('spendwise_onboarded', false);
    if (!seen) {
      setTimeout(() => {
        overlay.classList.add('active');
      }, 500);
    }

    let currentStep = 0;
    const totalSteps = steps.length;

    btn.addEventListener('click', () => {
      currentStep++;
      if (currentStep < totalSteps) {
        steps.forEach((s, idx) => s.classList.toggle('active', idx === currentStep));
        dots.forEach((d, idx) => d.classList.toggle('active', idx === currentStep));

        if (currentStep === totalSteps - 1) {
          btn.textContent = 'Bắt đầu sử dụng ngay 🚀';
        }
      } else {
        // Hoàn tất
        overlay.classList.remove('active');
        Storage.set('spendwise_onboarded', true);
        Toast.success('Chào mừng bạn đến với SpendWise!');
      }
    });
  },

  /**
   * Công cụ Chia tiền nhóm (Bill Splitter)
   */
  initBillSplitter() {
    const modal = document.getElementById('splitterModal');
    const openBtn = document.getElementById('btnOpenSplitter');
    const closeBtn = document.getElementById('splitterCloseBtn');
    const inputTotal = document.getElementById('splitterTotalAmount');
    const inputPeople = document.getElementById('splitterPeopleCount');
    const inputNote = document.getElementById('splitterMealNote');
    const perPersonEl = document.getElementById('splitterPerPerson');
    const copyBtn = document.getElementById('splitterCopyBtn');

    if (openBtn && modal) {
      openBtn.addEventListener('click', () => {
        modal.classList.add('active');
        document.body.style.overflow = 'hidden';
      });
    }

    if (closeBtn && modal) {
      closeBtn.addEventListener('click', () => {
        modal.classList.remove('active');
        document.body.style.overflow = '';
      });
    }

    if (modal) {
      modal.addEventListener('click', (e) => {
        if (e.target === modal) {
          modal.classList.remove('active');
          document.body.style.overflow = '';
        }
      });
    }

    // Hàm chia tiền nằm ở Business.splitBill (dùng chung với toàn app)

    const calculate = () => {
      // Dùng chung bộ phân tích số tiền: nhận 300000, 1.500.000 hoặc 1,2tr
      const total = Business.parseAmount(inputTotal.value) || 0;
      const count = parseInt(inputPeople.value) || 1;
      const result = Business.splitBill(total, count);
      perPersonEl.textContent = Utils.formatCurrency(result.base);
      if (result.remainder > 0) {
        perPersonEl.textContent += ` (+${result.remainder}đ chia thêm cho ${result.remainder} người)`;
      }
    };

    if (inputTotal && inputPeople) {
      inputTotal.addEventListener('input', calculate);
      inputPeople.addEventListener('input', calculate);
    }

    if (copyBtn) {
      copyBtn.addEventListener('click', () => {
        const total = Business.parseAmount(inputTotal.value) || 0;
        const count = parseInt(inputPeople.value) || 1;
        const note = inputNote.value.trim() || 'Bữa ăn';
        const split = Business.splitBill(total, count);
        const perPersonText = split.remainder > 0
          ? `${split.remainder} người trả ${Utils.formatCurrency(split.base + 1)}, ${count - split.remainder} người trả ${Utils.formatCurrency(split.base)}`
          : `Mỗi người chuyển ${Utils.formatCurrency(split.base)}`;

        const text = `💸 TIN NHẮN CHIA TIỀN: ${note}\n━━━━━━━━━━━━━━\n• Tổng tiền: ${Utils.formatCurrency(total)}\n• Số người: ${count} người\n👉 ${perPersonText}\n━━━━━━━━━━━━━━\n(Tính tự động bằng SpendWise 💰)`;

        navigator.clipboard.writeText(text).then(() => {
          Toast.success('Đã copy tin nhắn chia tiền vào clipboard! Dán gửi Zalo/Messenger ngay nhé.');
        }).catch(() => {
          Toast.show('Không thể tự động copy, bạn vui lòng copy thủ công', 'warning');
        });
      });
    }
  }
};
