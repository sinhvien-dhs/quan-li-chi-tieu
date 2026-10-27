/**
 * chart.js — Quản lý biểu đồ thống kê (Chart.js)
 */

const ChartManager = {
  pieChart: null,
  barChart: null,
  lineChart: null,
  currentPeriod: 'month', // 'week' | 'month' | 'year'

  /**
   * Khởi tạo
   */
  init() {
    this.bindEvents();
  },

  /**
   * Bind sự kiện cho period filter
   */
  bindEvents() {
    document.querySelectorAll('.stats-period-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        document.querySelectorAll('.stats-period-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        this.currentPeriod = btn.dataset.period;
        this.renderAllCharts();
      });
    });

    // Nut trong the loi
    const addBtn = document.getElementById('statsEmptyAddBtn');
    if (addBtn) {
      addBtn.addEventListener('click', () => TransactionManager.openAddModal());
    }
    const demoBtn = document.getElementById('statsEmptyDemoBtn');
    if (demoBtn) {
      demoBtn.addEventListener('click', () => {
        const added = DemoData.add();
        Storage.set('spendwise_demo_mode', true);
        Toast.success(added
          ? `Đã thêm ${added} giao dịch mẫu để xem biểu đồ.`
          : 'Dữ liệu mẫu đã có sẵn trên máy này.');
        this.renderAllCharts();
      });
    }
  },

  /**
   * Render tất cả biểu đồ
   */
  renderAllCharts() {
    const transactions = this.getTransactionsByPeriod();
    // Số liệu tổng quan vẫn hiển thị được dù không có thư viện biểu đồ
    this.renderSummaryStats(transactions);
    this.renderEmptyState(transactions.length === 0);

    // Gỡ thông báo thiếu thư viện (nếu có từ lần render trước)
    document.querySelectorAll('.chart-unavailable').forEach((n) => n.remove());
    ['pieChart', 'barChart', 'lineChart'].forEach((id) => {
      const canvas = document.getElementById(id);
      if (canvas) canvas.style.visibility = '';
    });

    // Chart.js là tài nguyên ngoài: nếu không tải được (offline lần đầu) thì
    // báo người dùng thay vì làm hỏng cả trang.
    if (typeof Chart === 'undefined') {
      this.showChartUnavailable();
      return;
    }
    this.renderPieChart(transactions);
    this.renderBarChart(transactions);
    this.renderLineChart(transactions);
  },

  /**
   * Hiển thị thông báo thay cho biểu đồ khi thiếu thư viện Chart.js
   */
  showChartUnavailable() {
    const message = 'Chưa tải được thư viện biểu đồ. Kết nối mạng rồi mở lại trang.';
    ['pieChart', 'barChart', 'lineChart'].forEach((id) => {
      const canvas = document.getElementById(id);
      if (!canvas) return;
      const holder = canvas.parentElement;
      let note = holder.querySelector('.chart-unavailable');
      if (!note) {
        note = document.createElement('p');
        note.className = 'chart-unavailable';
        holder.appendChild(note);
      }
      note.textContent = message;
      canvas.style.visibility = 'hidden';
    });
  },

  /**
   * Lấy giao dịch theo khoảng thời gian
   */
  /** Đổi Date thành chuỗi YYYY-MM-DD theo giờ địa phương */
  toDateStr(d) {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
  },

  /**
   * Lấy giao dịch theo khoảng thời gian (so sánh CHUỖI ngày YYYY-MM-DD
   * để không bị lệch múi giờ — giao dịch hôm nay phải luôn nằm trong kỳ)
   */
  getTransactionsByPeriod() {
    const all = Storage.getTransactions();
    const now = new Date();
    let startDate;

    switch (this.currentPeriod) {
      case 'week':
        startDate = new Date(now);
        startDate.setDate(now.getDate() - 6);
        break;
      case 'month':
        startDate = new Date(now.getFullYear(), now.getMonth(), 1);
        break;
      case 'year':
        startDate = new Date(now.getFullYear(), 0, 1);
        break;
      default:
        startDate = new Date(now.getFullYear(), now.getMonth(), 1);
    }

    const startStr = this.toDateStr(startDate);
    const endStr = Utils.getToday();

    return all.filter((t) => {
      const d = String(t.date || '');
      return d >= startStr && d <= endStr;
    });
  },

  /**
   * Render thẻ thống kê tổng hợp cho trang Stats
   */
  renderSummaryStats(transactions) {
    // Dùng lớp nghiệp vụ dùng chung để số liệu khớp với Trang chủ & Ngân sách
    const totalExpense = Business.totalExpense(transactions);
    const totalIncome = Business.totalIncome(transactions);
    const avgExpensePerDay = this.getAvgPerDay(transactions);
    const topCategory = this.getTopCategory(transactions);

    document.getElementById('statsTotalExpense').textContent = Utils.formatCurrency(totalExpense);
    document.getElementById('statsTotalIncome').textContent = Utils.formatCurrency(totalIncome);
    document.getElementById('statsAvgPerDay').textContent = Utils.formatCurrency(avgExpensePerDay);
    document.getElementById('statsTopCategory').textContent = topCategory;
    document.getElementById('statsTxCount').textContent = transactions.length + ' giao dịch';
  },

  /**
   * Khi khoang thoi gian da chon khong co giao dich:
   * an 3 bieu do rong va hien thi the loi -> trang nhin khong bi "trong".
   */
  renderEmptyState(isEmpty) {
    const page = document.getElementById('pageStats');
    const box = document.getElementById('statsEmpty');
    if (page) page.dataset.empty = isEmpty ? 'true' : 'false';
    if (box) box.hidden = !isEmpty;
  },

  /**
   * Tính trung bình chi tiêu mỗi ngày
   */
  getAvgPerDay(transactions) {
    const list = Array.isArray(transactions) ? transactions : [];
    if (list.length === 0) return 0;
    const total = Business.totalExpense(list);
    const now = new Date();
    let days;

    switch (this.currentPeriod) {
      case 'week': days = 7; break;
      case 'month': days = now.getDate(); break;
      case 'year':
        const start = new Date(now.getFullYear(), 0, 1);
        days = Math.ceil((now - start) / (1000 * 60 * 60 * 24)) + 1;
        break;
      default: days = now.getDate();
    }

    return days > 0 ? Math.round(total / days) : 0;
  },

  /**
   * Tìm danh mục chi nhiều nhất
   */
  getTopCategory(transactions) {
    const list = Array.isArray(transactions) ? transactions : [];
    const expenses = list.filter(t => t.type === 'expense');
    if (expenses.length === 0) return 'Chưa có';

    // Gộp theo danh mục, chỉ tính số tiền nguyên đồng
    const map = {};
    expenses.forEach(t => {
      map[t.category] = (map[t.category] || 0) + Math.round(Number(t.amount) || 0);
    });
    const topId = Object.entries(map).sort((a, b) => b[1] - a[1])[0][0];
    const cat = Categories.getById(topId);
    return cat ? cat.name : 'Khác';
  },

  // ===================================================================
  //  PIE CHART — Chi tiêu theo danh mục
  // ===================================================================
  renderPieChart(transactions) {
    const expenses = transactions.filter(t => t.type === 'expense');
    const categoryMap = {};

    expenses.forEach(t => {
      const cat = Categories.getById(t.category);
      const name = cat ? cat.name : 'Khác';
      categoryMap[name] = (categoryMap[name] || { total: 0, color: cat?.color || '#94A3B8' });
      categoryMap[name].total += t.amount;
    });

    const labels = Object.keys(categoryMap);
    const data = labels.map(l => categoryMap[l].total);
    const colors = labels.map(l => categoryMap[l].color);

    const ctx = document.getElementById('pieChart').getContext('2d');

    if (this.pieChart) this.pieChart.destroy();

    // Nếu không có dữ liệu
    if (labels.length === 0) {
      this.pieChart = new Chart(ctx, {
        type: 'doughnut',
        data: {
          labels: ['Chưa có dữ liệu'],
          datasets: [{ data: [1], backgroundColor: ['#E8ECF1'], borderWidth: 0 }]
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          plugins: { legend: { display: false }, tooltip: { enabled: false } },
          cutout: '65%'
        }
      });
      this.renderPieLegend([]);
      return;
    }

    this.pieChart = new Chart(ctx, {
      type: 'doughnut',
      data: {
        labels,
        datasets: [{
          data,
          backgroundColor: colors,
          borderWidth: 3,
          borderColor: this.getChartBgColor(),
          hoverBorderWidth: 0,
          hoverOffset: 8
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        cutout: '65%',
        plugins: {
          legend: { display: false },
          tooltip: {
            backgroundColor: 'rgba(45, 52, 54, 0.9)',
            padding: 12,
            titleFont: { family: 'Inter', size: 13, weight: '600' },
            bodyFont: { family: 'Inter', size: 12 },
            cornerRadius: 8,
            callbacks: {
              label: (ctx) => {
                const total = ctx.dataset.data.reduce((a, b) => a + b, 0);
                const pct = ((ctx.parsed / total) * 100).toFixed(1);
                return ` ${Utils.formatCurrency(ctx.parsed)} (${pct}%)`;
              }
            }
          }
        }
      }
    });

    // Render custom legend
    const total = data.reduce((a, b) => a + b, 0);
    const legendData = labels.map((label, i) => ({
      name: label,
      amount: data[i],
      color: colors[i],
      percent: ((data[i] / total) * 100).toFixed(1)
    })).sort((a, b) => b.amount - a.amount);

    this.renderPieLegend(legendData);
  },

  renderPieLegend(items) {
    const container = document.getElementById('pieLegend');
    if (items.length === 0) {
      container.innerHTML = '<p style="color: var(--text-muted); text-align: center; font-size: 0.875rem;">Chưa có dữ liệu chi tiêu</p>';
      return;
    }
    container.innerHTML = items.map(item => `
      <div class="legend-item">
        <div class="legend-item__left">
          <span class="legend-item__dot" style="background: ${item.color}"></span>
          <span class="legend-item__name">${item.name}</span>
        </div>
        <div class="legend-item__right">
          <span class="legend-item__amount">${Utils.formatCurrencyShort(item.amount)}</span>
          <span class="legend-item__percent">${item.percent}%</span>
        </div>
      </div>
    `).join('');
  },

  // ===================================================================
  //  BAR CHART — Chi tiêu theo ngày/tuần/tháng
  // ===================================================================
  renderBarChart(transactions) {
    const expenses = transactions.filter(t => t.type === 'expense');
    const incomes = transactions.filter(t => t.type === 'income');
    const { labels, expenseData, incomeData } = this.groupByTime(expenses, incomes);

    const ctx = document.getElementById('barChart').getContext('2d');
    if (this.barChart) this.barChart.destroy();

    const isDark = document.documentElement.getAttribute('data-theme') === 'dark';
    const gridColor = isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.04)';
    const tickColor = isDark ? '#A0A3BD' : '#636E72';

    this.barChart = new Chart(ctx, {
      type: 'bar',
      data: {
        labels,
        datasets: [
          {
            label: 'Chi tiêu',
            data: expenseData,
            backgroundColor: 'rgba(255, 107, 107, 0.8)',
            borderRadius: 6,
            borderSkipped: false,
            barPercentage: 0.6,
            categoryPercentage: 0.7
          },
          {
            label: 'Thu nhập',
            data: incomeData,
            backgroundColor: 'rgba(0, 200, 151, 0.8)',
            borderRadius: 6,
            borderSkipped: false,
            barPercentage: 0.6,
            categoryPercentage: 0.7
          }
        ]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: {
            display: true,
            position: 'top',
            align: 'end',
            labels: {
              font: { family: 'Inter', size: 11 },
              boxWidth: 10,
              boxHeight: 10,
              borderRadius: 3,
              useBorderRadius: true,
              padding: 16,
              color: tickColor
            }
          },
          tooltip: {
            backgroundColor: 'rgba(45, 52, 54, 0.9)',
            padding: 12,
            titleFont: { family: 'Inter', size: 13, weight: '600' },
            bodyFont: { family: 'Inter', size: 12 },
            cornerRadius: 8,
            callbacks: {
              label: (ctx) => ` ${ctx.dataset.label}: ${Utils.formatCurrency(ctx.parsed.y)}`
            }
          }
        },
        scales: {
          x: {
            grid: { display: false },
            ticks: { font: { family: 'Inter', size: 11 }, color: tickColor }
          },
          y: {
            grid: { color: gridColor },
            ticks: {
              font: { family: 'Inter', size: 11 },
              color: tickColor,
              callback: (val) => Utils.formatCurrencyShort(val)
            },
            beginAtZero: true
          }
        }
      }
    });
  },

  /**
   * Nhóm giao dịch theo ngày/tuần/tháng
   */
  groupByTime(expenses, incomes) {
    const now = new Date();
    let labels = [];
    let expenseMap = {};
    let incomeMap = {};

    if (this.currentPeriod === 'week') {
      // 7 ngày gần nhất
      for (let i = 6; i >= 0; i--) {
        const d = new Date(now);
        d.setDate(now.getDate() - i);
        const key = `${d.getDate()}/${d.getMonth() + 1}`;
        labels.push(key);
        expenseMap[key] = 0;
        incomeMap[key] = 0;
      }
      expenses.forEach(t => {
        const d = Utils.parseDateLocal(t.date);
        const key = `${d.getDate()}/${d.getMonth() + 1}`;
        if (expenseMap[key] !== undefined) expenseMap[key] += t.amount;
      });
      incomes.forEach(t => {
        const d = Utils.parseDateLocal(t.date);
        const key = `${d.getDate()}/${d.getMonth() + 1}`;
        if (incomeMap[key] !== undefined) incomeMap[key] += t.amount;
      });
    } else if (this.currentPeriod === 'month') {
      // Tuần trong tháng
      const daysInMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
      const weeks = [
        { label: 'Tuần 1', start: 1, end: 7 },
        { label: 'Tuần 2', start: 8, end: 14 },
        { label: 'Tuần 3', start: 15, end: 21 },
        { label: 'Tuần 4', start: 22, end: daysInMonth }
      ];
      weeks.forEach(w => {
        labels.push(w.label);
        expenseMap[w.label] = 0;
        incomeMap[w.label] = 0;
      });
      expenses.forEach(t => {
        const day = Utils.parseDateLocal(t.date).getDate();
        const week = weeks.find(w => day >= w.start && day <= w.end);
        if (week) expenseMap[week.label] += t.amount;
      });
      incomes.forEach(t => {
        const day = Utils.parseDateLocal(t.date).getDate();
        const week = weeks.find(w => day >= w.start && day <= w.end);
        if (week) incomeMap[week.label] += t.amount;
      });
    } else {
      // 12 tháng trong năm
      const monthNames = ['T1', 'T2', 'T3', 'T4', 'T5', 'T6', 'T7', 'T8', 'T9', 'T10', 'T11', 'T12'];
      monthNames.forEach(m => {
        labels.push(m);
        expenseMap[m] = 0;
        incomeMap[m] = 0;
      });
      expenses.forEach(t => {
        const month = Utils.parseDateLocal(t.date).getMonth();
        expenseMap[monthNames[month]] += t.amount;
      });
      incomes.forEach(t => {
        const month = Utils.parseDateLocal(t.date).getMonth();
        incomeMap[monthNames[month]] += t.amount;
      });
    }

    return {
      labels,
      expenseData: labels.map(l => expenseMap[l]),
      incomeData: labels.map(l => incomeMap[l])
    };
  },

  // ===================================================================
  //  LINE CHART — Xu hướng chi tiêu theo thời gian
  // ===================================================================
  renderLineChart(transactions) {
    const expenses = transactions.filter(t => t.type === 'expense');
    const { labels, cumulativeData } = this.getCumulativeData(expenses);

    const ctx = document.getElementById('lineChart').getContext('2d');
    if (this.lineChart) this.lineChart.destroy();

    const isDark = document.documentElement.getAttribute('data-theme') === 'dark';
    const gridColor = isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.04)';
    const tickColor = isDark ? '#A0A3BD' : '#636E72';

    // Gradient fill
    const gradient = ctx.createLinearGradient(0, 0, 0, 250);
    gradient.addColorStop(0, 'rgba(108, 99, 255, 0.3)');
    gradient.addColorStop(1, 'rgba(108, 99, 255, 0.01)');

    this.lineChart = new Chart(ctx, {
      type: 'line',
      data: {
        labels,
        datasets: [{
          label: 'Tổng chi lũy kế',
          data: cumulativeData,
          borderColor: '#6C63FF',
          backgroundColor: gradient,
          borderWidth: 3,
          fill: true,
          tension: 0.4,
          pointBackgroundColor: '#6C63FF',
          pointBorderColor: '#fff',
          pointBorderWidth: 2,
          pointRadius: 4,
          pointHoverRadius: 7
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { display: false },
          tooltip: {
            backgroundColor: 'rgba(45, 52, 54, 0.9)',
            padding: 12,
            titleFont: { family: 'Inter', size: 13, weight: '600' },
            bodyFont: { family: 'Inter', size: 12 },
            cornerRadius: 8,
            callbacks: {
              label: (ctx) => ` Tổng chi: ${Utils.formatCurrency(ctx.parsed.y)}`
            }
          }
        },
        scales: {
          x: {
            grid: { display: false },
            ticks: { font: { family: 'Inter', size: 11 }, color: tickColor }
          },
          y: {
            grid: { color: gridColor },
            ticks: {
              font: { family: 'Inter', size: 11 },
              color: tickColor,
              callback: (val) => Utils.formatCurrencyShort(val)
            },
            beginAtZero: true
          }
        }
      }
    });
  },

  /**
   * Tính dữ liệu lũy kế (cumulative)
   */
  getCumulativeData(expenses) {
    const now = new Date();
    let dateMap = {};
    let labels = [];

    if (this.currentPeriod === 'week') {
      for (let i = 6; i >= 0; i--) {
        const d = new Date(now);
        d.setDate(now.getDate() - i);
        const key = `${d.getDate()}/${d.getMonth() + 1}`;
        labels.push(key);
        dateMap[key] = 0;
      }
      expenses.forEach(t => {
        const d = Utils.parseDateLocal(t.date);
        const key = `${d.getDate()}/${d.getMonth() + 1}`;
        if (dateMap[key] !== undefined) dateMap[key] += t.amount;
      });
    } else if (this.currentPeriod === 'month') {
      const daysInMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
      const currentDay = now.getDate();
      for (let i = 1; i <= currentDay; i++) {
        const key = `${i}`;
        labels.push(key);
        dateMap[key] = 0;
      }
      expenses.forEach(t => {
        const d = Utils.parseDateLocal(t.date);
        const key = `${d.getDate()}`;
        if (dateMap[key] !== undefined) dateMap[key] += t.amount;
      });
    } else {
      const monthNames = ['T1', 'T2', 'T3', 'T4', 'T5', 'T6', 'T7', 'T8', 'T9', 'T10', 'T11', 'T12'];
      const currentMonth = now.getMonth();
      for (let i = 0; i <= currentMonth; i++) {
        labels.push(monthNames[i]);
        dateMap[monthNames[i]] = 0;
      }
      expenses.forEach(t => {
        const month = Utils.parseDateLocal(t.date).getMonth();
        if (month <= currentMonth) {
          dateMap[monthNames[month]] += t.amount;
        }
      });
    }

    // Tính lũy kế
    let cumulative = 0;
    const cumulativeData = labels.map(l => {
      cumulative += dateMap[l];
      return cumulative;
    });

    return { labels, cumulativeData };
  },

  /**
   * Lấy background color hiện tại cho chart borders
   */
  getChartBgColor() {
    const isDark = document.documentElement.getAttribute('data-theme') === 'dark';
    return isDark ? '#2A2B4A' : '#FFFFFF';
  }
};
