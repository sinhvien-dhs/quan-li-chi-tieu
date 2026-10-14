/**
 * split.js — Công cụ "Chia tiền nhóm" nâng cao cho sinh viên Việt Nam
 *
 * 1. Chia tiền chính xác (dùng Business.splitBill — tổng luôn khớp)
 * 2. Sinh mã VietQR để người khác quét là chuyển đúng số tiền
 * 3. Sổ nợ nhóm: lưu khoản nợ, đánh dấu ai đã trả / chưa trả
 * 4. Ghi nhanh phần của tôi vào giao dịch chi tiêu thật
 */

const SplitManager = {
  KEY: 'spendwise_debts',
  BANKS: {
    vcb: '970436', techcombank: '970408', vietinbank: '971422',
    mb: '970422',BIDV: '970437', acb: '970508', agribank: '970225',
    vpbank: '970432', tpb: '970345', sacombank: '970403',
    vib: '970406', mbbank: '970432', shb: '970443', tpbank: '970345',
    momo: '970408', zalopay: '970403', default: '970436'
  },

  init() {
    this.cache = { total: 0, people: 4, note: '' };
  },

  // ============================================================
  //  VietQR
  // ============================================================
  /**
   * Dựng ảnh mã VietQR chứa sẵn số tiền + nội dung
   * (dùng dịch vụ img.vietqr.io — không cần máy chủ riêng)
   */
  buildQrUrl({ bank, account, amount, addInfo, accountName }) {
    const bin = this.BANKS[String(bank || '').toLowerCase()] || this.BANKS.default;
    const acc = String(account || '').replace(/\s/g, '');
    if (!acc) return '';
    const params = new URLSearchParams();
    params.set('amount', String(Math.max(0, Math.round(Number(amount) || 0))));
    if (addInfo) params.set('addInfo', String(addInfo).slice(0, 50));
    if (accountName) params.set('accountName', String(accountName).slice(0, 50));
    return `https://img.vietqr.io/image/${bin}-${acc}-compact2.jpg?${params.toString()}`;
  },

  /** Chuẩn hoá nội dung chuyển khoản ngắn gọn, không dấu (chuẩn VietQR) */
  buildTransferContent(note, amount) {
    const clean = Utils.normalizeText(note || 'Chia tien')
      .replace(/[^a-z0-9]/g, '')
      .slice(0, 25);
    return `${clean || 'chiatien'}${amount ? ' ' + Math.round(amount) : ''}`.trim().slice(0, 40);
  },

  // ============================================================
  //  SỔ NỢ NHÓM
  // ============================================================
  getDebts() {
    return Storage.get(this.KEY, []) || [];
  },

  saveDebts(list) {
    Storage.set(this.KEY, list);
    this.renderDebts();
  },

  /**
   * Tạo (hoặc cập nhật) phiếu nợ của một bữa ăn
   * @param {Object} o {title, total, perPerson, members:[string], myName, date}
   */
  upsertDebt(o) {
    const id = o.id || ('debt_' + Date.now().toString(36));
    const list = this.getDebts();
    const total = Math.max(0, Math.round(Number(o.total) || 0));
    const members = (o.members || []).map(m => String(m).trim()).filter(Boolean).slice(0, 30);
    const existing = list.find(d => d.id === id);

    const debts = members
      .filter(name => Utils.normalizeText(name) !== Utils.normalizeText(o.myName || ''))
      .map(name => ({
        name: name,
        amount: Math.round((Number(o.perPerson) || 0) / Math.max(1, members.length - 1)) ||
               Math.round(total / Math.max(1, members.length - 1)),
        paid: existing ? ((existing.debts.find(x => x.name === name) || {}).paid || false) : false
      }));

    const record = {
      id: id,
      title: String(o.title || 'Bữa ăn').slice(0, 60),
      total: total,
      perPerson: Math.round(Number(o.perPerson) || 0),
      myName: String(o.myName || '').slice(0, 30),
      date: o.date || Utils.getToday(),
      createdAt: existing ? existing.createdAt : new Date().toISOString(),
      debts: debts
    };

    const idx = list.findIndex(d => d.id === id);
    if (idx > -1) list[idx] = record; else list.unshift(record);
    this.saveDebts(list.slice(0, 100));
    return record;
  },

  togglePaid(debtId, memberName) {
    const list = this.getDebts();
    const record = list.find(d => d.id === debtId);
    if (!record) return;
    const item = record.debts.find(x => x.name === memberName);
    if (!item) return;
    item.paid = !item.paid;
    this.saveDebts(list);
  },

  deleteDebt(debtId) {
    this.saveDebts(this.getDebts().filter(d => d.id !== debtId));
  },

  /** Tổng đang nợ và đã thu hồi */
  summary() {
    let pending = 0, collected = 0;
    this.getDebts().forEach(d => d.debts.forEach(x => {
      if (x.paid) collected += x.amount; else pending += x.amount;
    }));
    return { pending: pending, collected: collected, count: this.getDebts().length };
  },

  renderDebts() {
    const box = document.getElementById('debtList');
    if (!box) return;
    const list = this.getDebts();

    if (!list.length) {
      box.innerHTML = '<p class="debt-empty">Chưa có phiếu nợ nào. Chia tiền xong, bấm <strong>Lưu sổ nợ</strong> để ghi lại ai còn nợ bạn.</p>';
      return;
    }

    box.innerHTML = list.map(d => {
      const rows = d.debts.map(x => `
        <button type="button" class="debt-member ${x.paid ? 'is-paid' : ''}" data-debt-id="${Utils.escapeAttr(d.id)}" data-member="${Utils.escapeAttr(x.name)}">
          <span class="debt-member__name">${Utils.escapeHtml(x.name)}</span>
          <span class="debt-member__amount">${Utils.formatCurrency(x.amount)}</span>
          <span class="debt-member__flag">${x.paid ? 'Đã trả' : 'Chưa trả'}</span>
        </button>`).join('');
      const totalOwed = d.debts.filter(x => !x.paid).reduce((s, x) => s + x.amount, 0);
      return `
        <div class="debt-card">
          <div class="debt-card__head">
            <div>
              <strong>${Utils.escapeHtml(d.title)}</strong>
              <small>${Utils.formatDate(d.date)} • tổng ${Utils.formatCurrency(d.total)}</small>
            </div>
            <button type="button" class="debt-card__del" data-debt-del="${Utils.escapeAttr(d.id)}" aria-label="Xoá phiếu nợ">
              <i class="fa-solid fa-trash"></i>
            </button>
          </div>
          <div class="debt-card__members">${rows || '<small>Không có ai nợ bạn phiếu này.</small>'}</div>
          <div class="debt-card__foot">
            ${totalOwed > 0
              ? '<span class="debt-card__pending">Còn phải thu <strong>' + Utils.formatCurrency(totalOwed) + '</strong></span>'
              : '<span class="debt-card__done"><i class="fa-solid fa-circle-check"></i> Đã thu hồi đủ</span>'}
          </div>
        </div>`;
    }).join('');

    box.querySelectorAll('[data-debt-id]').forEach(btn => {
      btn.addEventListener('click', () => this.togglePaid(btn.dataset.debtId, btn.dataset.member));
    });
    box.querySelectorAll('[data-debt-del]').forEach(btn => {
      btn.addEventListener('click', () => {
        ConfirmDialog.show({
          title: 'Xoá phiếu nợ?',
          message: 'Phiếu nợ này sẽ bị xoá khỏi sổ nợ nhóm.',
          onConfirm: () => {
            this.deleteDebt(btn.dataset.debtDel);
            Toast.success('Đã xoá phiếu nợ.');
          }
        });
      });
    });
  }
};
