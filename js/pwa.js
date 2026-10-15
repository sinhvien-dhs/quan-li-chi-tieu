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

    this.bindVietQR();
    this.bindDebtLedger();
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
          Toast.success('Đã sao chép tin nhắn chia tiền — dán gửi Zalo/Messenger ngay nhé.');
        }).catch(() => {
          Toast.show('Không thể tự động copy, bạn vui lòng copy thủ công', 'warning');
        });
      });
    }
  },
  /**
   * Sinh mã VietQR theo số tiền mỗi người phải trả (chuẩn VietQR)
   */
  bindVietQR() {
    const bank = document.getElementById('vietqrBank');
    const account = document.getElementById('vietqrAccount');
    const holder = document.getElementById('vietqrHolder');
    const box = document.getElementById('vietqrBox');
    const img = document.getElementById('vietqrImg');
    const amountEl = document.getElementById('vietqrAmount');
    const contentEl = document.getElementById('vietqrContent');
    if (!account || !box || !img) return;

    const noteInput = document.getElementById('splitterMealNote');
    const totalInput = document.getElementById('splitterTotalAmount');
    const peopleInput = document.getElementById('splitterPeopleCount');

    const render = () => {
      const acc = account.value.replace(/\s/g, '');
      const amountEl2 = document.getElementById('vietqrBankName');

      if (!acc) { box.hidden = true; return; }

      const total = Business.parseAmount(totalInput.value) || 0;
      const typed = this.readSplitMembers().length;
      // Nếu đã nhập danh sách người thì lấy số người từ danh sách cho khớp với sổ nợ
      const count = typed >= 2 ? typed : (parseInt(peopleInput.value, 10) || 1);
      const split = Business.splitBill(total, count);
      // QR chỉ chứa được MỘT số tiền → dùng phần nguyên (base).
      // Phần dư được nói rõ bên dưới để không thu phí oan cho người trả.
      const perPerson = split.base;
      const note = (noteInput && noteInput.value.trim()) || 'Bua an';

      const content = SplitManager.buildTransferContent(note, perPerson);
      const qr = SplitManager.buildQr({
        bank: bank ? bank.value : '',
        account: acc,
        amount: perPerson,
        addInfo: content,
        accountName: holder ? holder.value.trim() : ''
      });

      if (amountEl2) {
        amountEl2.textContent = qr.bank ? 'Ngân hàng nhận: ' + qr.bank + ' (BIN ' + qr.bin + ')' : '';
      }

      if (qr.error) {
        box.hidden = true;
        if (holder && !holder.querySelector('.vietqr__fallback')) {
          const p = document.createElement('p');
          p.className = 'vietqr__fallback vietqr__fallback--warn';
          p.textContent = qr.error;
          holder.appendChild(p);
        } else if (holder) {
          const p = holder.querySelector('.vietqr__fallback');
          if (p) p.textContent = qr.error;
        }
        return;
      }

      img.src = qr.url;
      img.alt = 'Ma QR VietQR ' + Utils.formatCurrency(perPerson);
      img.onerror = () => {
        const wrap = document.getElementById('vietqrImgWrap');
        if (wrap && !wrap.querySelector('.vietqr__fallback')) {
          const p = document.createElement('p');
          p.className = 'vietqr__fallback';
          p.textContent = 'Không tải được ảnh QR (mất mạng?). Vẫn có thể gửi số tiền & nội dung bên dưới.';
          wrap.appendChild(p);
        }
      };
      if (amountEl) amountEl.textContent = Utils.formatCurrency(perPerson);
      if (contentEl) contentEl.textContent = content;
      box.hidden = false;
    };

    [account, bank, holder, totalInput, peopleInput, noteInput].forEach((el) => {
      if (el) {
        el.addEventListener('input', render);
        el.addEventListener('change', render);
      }
    });
  },

  /** Đọc danh sách người tham gia từ ô nhập tên (phân tách bằng dấu phẩy) */
  readSplitMembers() {
    const input = document.getElementById('splitMemberNames');
    if (!input) return [];
    return input.value.split(/[,;\n]/).map((s) => s.trim()).filter(Boolean).slice(0, 30);
  },

  /** Sổ nợ nhóm: lập phiếu nợ, đánh dấu đã trả, ghi nhanh vào chi tiêu */
  bindDebtLedger() {
    const tags = document.getElementById('splitMemberTags');
    const membersInput = document.getElementById('splitMemberNames');
    const totalInput = document.getElementById('splitterTotalAmount');
    const peopleInput = document.getElementById('splitterPeopleCount');
    const noteInput = document.getElementById('splitterMealNote');
    const mySelect = document.getElementById('splitMyName');
    const myHint = document.getElementById('splitMyHint');

    /** Đồng bộ ô chọn "Tôi là ai" với danh sách người tham gia */
    const syncMyName = (members) => {
      if (!mySelect) return 0;
      const current = mySelect.value;
      mySelect.innerHTML = members.length
        ? members.map((m, i) => '<option value="' + Utils.escapeAttr(m) + '">' + Utils.escapeHtml(m) + ' (người ' + (i + 1) + ')</option>').join('')
        : '<option value="">— chưa có ai —</option>';
      if (members.length && members.indexOf(current) > -1) mySelect.value = current;
      return members.indexOf(mySelect.value);
    };

    const renderTags = () => {
      if (tags) {
        const members = this.readSplitMembers();
        tags.innerHTML = members.map((m, i) =>
          '<span class="split-tag">' + Utils.escapeHtml(m) +
          '<button type="button" data-idx="' + i + '" aria-label="Bỏ ' + Utils.escapeAttr(m) + '">×</button></span>'
        ).join('');
        tags.querySelectorAll('[data-idx]').forEach((btn) => {
          btn.addEventListener('click', () => {
            const arr = this.readSplitMembers();
            arr.splice(Number(btn.dataset.idx), 1);
            if (membersInput) membersInput.value = arr.join(', ');
            renderTags();
          });
        });
      }
      syncMyName(this.readSplitMembers());
      // Đồng bộ ô "Số người" theo danh sách để QR và sổ nợ luôn khớp
      if (peopleInput && tags) {
        const n = this.readSplitMembers().length;
        if (n >= 2) peopleInput.value = String(n);
      }
      renderMyHint();
    };

    if (membersInput) membersInput.addEventListener('input', renderTags);

    /** Phần chia chính xác cho danh sách người vừa nhập */
    const calcShares = () => {
      const members = this.readSplitMembers();
      const total = Business.parseAmount(totalInput ? totalInput.value : '') || 0;
      const split = Business.splitBill(total, members.length || 1);
      return { members: members, total: total, split: split };
    };

    /** Cập nhật gợi ý phần dư (đồng tiền tuyệt đối phải khớp tổng hoá đơn) */
    const renderMyHint = () => {
      if (!myHint) return;
      const c = calcShares();
      if (c.members.length < 2 || c.total <= 0) { myHint.hidden = true; return; }
      const myIndex = syncMyName(c.members);
      const mine = c.split.amounts[myIndex] || 0;
      let extra = '';
      if (c.split.remainder > 0) {
        const payers = c.split.remainder;
        extra = ` Phần dư ${c.split.remainder}đ chia thêm cho ${payers} người đầu (mỗi người +1đ).`;
      }
      myHint.hidden = false;
      myHint.innerHTML = 'Phần của <strong>' + Utils.escapeHtml(c.members[myIndex] || '') +
        '</strong> là <strong>' + Utils.formatCurrency(mine) + '</strong>.' + extra;
    };

    if (mySelect) mySelect.addEventListener('change', renderMyHint);
    // Đổi tổng tiền / số người cũng phải cập nhật lại gợi ý phần dư
    [totalInput, peopleInput].forEach((el) => {
      if (el) el.addEventListener('input', renderMyHint);
    });

    const btnSave = document.getElementById('btnSaveDebt');
    if (btnSave) {
      btnSave.addEventListener('click', () => {
        const { members, total, split } = calcShares();
        if (members.length < 2) {
          Toast.error('Nhập ít nhất 2 người (VD: An, Bình, tôi) để lập sổ nợ.');
          return;
        }
        if (total <= 0) {
          Toast.error('Nhập tổng số tiền hợp lệ trước nhé!');
          return;
        }
        const myIndex = syncMyName(members);
        const record = SplitManager.upsertDebt({
          title: (noteInput && noteInput.value.trim()) || 'Bữa ăn',
          total: total,
          members: members,
          myIndex: myIndex,
          amounts: split.amounts,
          date: Utils.getToday()
        });

        const check = SplitManager.verifyDebt(record);
        if (!check.ok) {
          Toast.error('Không lập được phiếu: tổng các khoản nợ không khớp tổng hoá đơn.');
          return;
        }
        PWAManager.renderDebtSummary();
        Toast.success('Đã lập phiếu nợ — bấm vào tên để đánh dấu đã trả.');
      });
    }

    const btnExpense = document.getElementById('btnSplitToExpense');
    if (btnExpense) {
      btnExpense.addEventListener('click', () => {
        const { members, total, split } = calcShares();
        const myIndex = members.length ? syncMyName(members) : 0;
        const myShare = members.length ? (split.amounts[myIndex] || 0) : (split.base || 0);
        if (myShare <= 0) { Toast.error('Nhập tổng số tiền hợp lệ trước nhé!'); return; }

        const wallets = (typeof Features !== 'undefined') ? Features.getWallets() : [];
        const wallet = wallets.length ? wallets[0].id : null;

        Storage.addTransaction({
          name: (noteInput && noteInput.value.trim()) || 'Bữa ăn',
          amount: myShare,
          type: 'expense',
          category: 'food',
          wallet: wallet,
          date: Utils.getToday(),
          note: 'Phần của ' + (members[myIndex] || 'tôi') + ' trong phiếu chia ' + (members.length || split.amounts.length) + ' người'
        });

        TransactionManager.renderTransactions();
        TransactionManager.updateSummary();
        if (typeof BudgetManager !== 'undefined') BudgetManager.updateBudgetSummary();
        Toast.success('Đã ghi ' + Utils.formatCurrency(myShare) + ' vào chi tiêu của bạn.');
      });
    }

    renderTags();
    renderMyHint();
    SplitManager.renderDebts();
    PWAManager.renderDebtSummary();
  },

  renderDebtSummary() {
    const box = document.getElementById('debtSummary');
    if (!box) return;
    const s = SplitManager.summary();
    box.innerHTML =
      '<div class="debt-summary__pending">Còn phải thu <b>' + Utils.formatCurrency(s.pending) + '</b></div>' +
      '<div class="debt-summary__collected">Đã thu hồi <b>' + Utils.formatCurrency(s.collected) + '</b></div>';
  }
};