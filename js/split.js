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

  /**
   * BIN VietQR của từng ngân hàng / ví điện tử.
   * QUY TẮC: khoá phải viết thường toàn bộ, vì buildQrUrl() luôn tra cứu
   * bằng khoá đã hạ chữ thường. Trước đây "BIDV" viết hoa khiến tra cứu
   * 'bidv' không trúng và rơi về mã mặc định → tạo QR nhầm ngân hàng.
   */
  BANKS: {
    vcb: '970436', techcombank: '970408', vietinbank: '971422',
    mb: '970422', bidv: '970437', acb: '970508', agribank: '970225',
    vpbank: '970432', tpb: '970345', sacombank: '970403',
    vib: '970406', mbbank: '970422', shb: '970443', tpbank: '970345',
    momo: '970432', zalopay: '970422'
  },

  /** Tên hiển thị của từng mã ngân hàng (để người dùng tự kiểm tra trước khi quét) */
  BANK_NAMES: {
    vcb: 'Vietcombank', techcombank: 'Techcombank', vietinbank: 'VietinBank',
    mb: 'MB Bank', bidv: 'BIDV', acb: 'ACB', agribank: 'Agribank',
    vpbank: 'VPBank', tpb: 'TPBank', sacombank: 'Sacombank',
    vib: 'VIB', mbbank: 'MB Bank', shb: 'SHB', tpbank: 'TPBank',
    momo: 'MoMo (qua VPBank)', zalopay: 'ZaloPay (qua MB Bank)'
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
   * @returns {{url:string, bin:string, bank:string, error:string}}
   */
  buildQr({ bank, account, amount, addInfo, accountName }) {
    const key = String(bank || '').trim().toLowerCase();
    const acc = String(account || '').replace(/\s/g, '');

    if (!acc) return { url: '', bin: '', bank: '', error: 'Chưa nhập số tài khoản người thu tiền.' };
    if (!/^\d{6,20}$/.test(acc)) {
      return { url: '', bin: '', bank: '', error: 'Số tài khoản không hợp lệ (cần 6–20 chữ số, không có khoảng trắng).' };
    }
    if (!this.BANKS[key]) {
      return { url: '', bin: '', bank: '', error: 'Chưa hỗ trợ mã ngân hàng này — vui lòng chọn từ danh sách.' };
    }

    const bin = this.BANKS[key];
    const params = new URLSearchParams();
    params.set('amount', String(Math.max(0, Math.round(Number(amount) || 0))));
    if (addInfo) params.set('addInfo', String(addInfo).slice(0, 50));
    if (accountName) params.set('accountName', String(accountName).slice(0, 50));

    return {
      url: `https://img.vietqr.io/image/${bin}-${acc}-compact2.jpg?${params.toString()}`,
      bin: bin,
      bank: this.BANK_NAMES[key] || key,
      error: ''
    };
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
    // Cap nhat luon tong "con phai thu / da thu hoi" o phia tren
    if (typeof PWAManager !== 'undefined') PWAManager.renderDebtSummary();
  },

  /**
   * Tạo (hoặc cập nhật) phiếu nợ của một bữa ăn.
   *
   * QUY TẮC TIỀN: mỗi người nợ đúng PHẦN CỦA MÌNH (amounts[i]),
   * và tổng các khoản nợ + phần của tôi luôn bằng đúng tổng hoá đơn.
   * Trước đây code chia nhỏ perPerson theo (số người - 1) nên mỗi người
   * bị ghi nợ ít hơn thực tế.
   *
   * @param {Object} o {id, title, total, members:[string], myIndex:number, amounts:number[], date}
   */
  upsertDebt(o) {
    const list = this.getDebts();
    const members = (o.members || []).map(m => String(m).trim()).filter(Boolean).slice(0, 30);
    const n = Math.max(1, members.length);
    const total = Math.max(0, Math.round(Number(o.total) || 0));

    // Chia chính xác theo danh sách tham gia (lấy từ Business.splitBill)
    let amounts = Array.isArray(o.amounts) && o.amounts.length === n
      ? o.amounts.map(a => Math.max(0, Math.round(Number(a) || 0)))
      : Business.splitBill(total, n).amounts;

    // Ép tổng khớp tổng hoá đơn (chống sai số do dữ liệu cũ)
    const diff = total - amounts.reduce((s, a) => s + a, 0);
    if (diff !== 0) {
      amounts = Business.splitBill(total, n).amounts;
    }

    const myIndex = Math.min(n - 1, Math.max(0, Number(o.myIndex) || 0));
    const myName = members[myIndex] || '';
    const id = o.id || ('debt_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 6));
    const existing = list.find(d => d.id === id);

    const debts = members
      .map((name, i) => ({ name: name, amount: amounts[i], index: i }))
      .filter(x => x.index !== myIndex)   // của tôi thì không phải nợ tôi
      .map(x => ({
        name: x.name,
        amount: x.amount,
        paid: existing ? ((existing.debts.find(y => y.name === x.name) || {}).paid || false) : false
      }));

    const record = {
      id: id,
      title: String(o.title || 'Bữa ăn').slice(0, 60),
      total: total,
      // Số tiền mỗi người trả (phần nguyên) — dùng để hiển thị
      perPerson: amounts.length ? amounts[0] : 0,
      // Phần của chủ phiếu (người đã trả trước)
      myAmount: amounts[myIndex] || 0,
      myName: myName,
      memberCount: n,
      date: o.date || Utils.getToday(),
      createdAt: existing ? existing.createdAt : new Date().toISOString(),
      debts: debts
    };

    const idx = list.findIndex(d => d.id === id);
    if (idx > -1) list[idx] = record; else list.unshift(record);
    this.saveDebts(list.slice(0, 100));
    return record;
  },

  /**
   * Kiểm tra tính đúng đắn của một phiếu nợ:
   * tổng các khoản nợ + phần của chủ phiếu có bằng tổng hoá đơn không.
   */
  verifyDebt(record) {
    if (!record) return { ok: false, sum: 0, total: 0 };
    const sum = (record.debts || []).reduce((s, x) => s + (Number(x.amount) || 0), 0)
      + (Number(record.myAmount) || 0);
    return { ok: sum === record.total, sum: sum, total: record.total };
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
    if (typeof SyncManager !== 'undefined') SyncManager.markDeleted(debtId);
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
      const myAmount = Number(d.myAmount) || 0;
      const perPerson = Number(d.perPerson) || 0;
      const check = this.verifyDebt(d);

      return `
        <div class="debt-card">
          <div class="debt-card__head">
            <div>
              <strong>${Utils.escapeHtml(d.title)}</strong>
              <small>${Utils.formatDate(d.date)} • tổng ${Utils.formatCurrency(d.total)} • ${d.memberCount || d.debts.length + 1} người • ${Utils.formatCurrency(perPerson)}/người</small>
            </div>
            <button type="button" class="debt-card__del" data-debt-del="${Utils.escapeAttr(d.id)}" aria-label="Xóa phiếu nợ">
              <i class="fa-solid fa-trash"></i>
            </button>
          </div>
          ${myAmount > 0 ? `<div class="debt-card__me"><i class="fa-solid fa-user-check"></i> ${Utils.escapeHtml(d.myName || 'Bạn')} đã trả trước ${Utils.formatCurrency(myAmount)}</div>` : ''}
          <div class="debt-card__members">${rows || '<small>Không có ai nợ bạn phiếu này.</small>'}</div>
          <div class="debt-card__foot">
            ${totalOwed > 0
              ? '<span class="debt-card__pending">Còn phải thu <strong>' + Utils.formatCurrency(totalOwed) + '</strong></span>'
              : '<span class="debt-card__done"><i class="fa-solid fa-circle-check"></i> Đã thu hồi đủ</span>'}
            ${check.ok ? '' : '<span class="debt-card__warn" title="Tổng các khoản nợ chưa khớp tổng hóa đơn">Số liệu không khớp — hãy lập lại phiếu</span>'}
          </div>
        </div>`;
    }).join('');

    box.querySelectorAll('[data-debt-id]').forEach(btn => {
      btn.addEventListener('click', () => this.togglePaid(btn.dataset.debtId, btn.dataset.member));
    });
    box.querySelectorAll('[data-debt-del]').forEach(btn => {
      btn.addEventListener('click', () => {
        ConfirmDialog.show({
          title: 'Xóa phiếu nợ?',
          message: 'Phiếu nợ này sẽ bị xóa khỏi sổ nợ nhóm.',
          onConfirm: () => {
            this.deleteDebt(btn.dataset.debtDel);
            Toast.success('Đã xóa phiếu nợ.');
          }
        });
      });
    });
  }
};
