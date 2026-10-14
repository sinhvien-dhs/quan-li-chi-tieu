// tools/patch-home.js — Viết lại trang chủ: 2 cột desktop + card AI + card demo
const fs = require('fs');
const path = require('path');

const file = path.join(__dirname, '..', 'index.html');
const text = fs.readFileSync(file, 'utf8');
const lines = text.split(/\r?\n/);

const start = lines.findIndex((l) => l.includes('id="pageHome"'));
if (start < 0) throw new Error('Khong tim thay pageHome');

let depth = 0;
let end = -1;
for (let i = start; i < lines.length; i++) {
  depth += (lines[i].match(/<div\b/g) || []).length;
  depth -= (lines[i].match(/<\/div>/g) || []).length;
  if (depth === 0) { end = i; break; }
}
if (end < 0) throw new Error('Khong tim thay dong dong pageHome');
console.log('pageHome:', start + 1, '->', end + 1);

const NEW = `    <div class="page page--home active" id="pageHome">
      <!-- Summary Cards -->
      <section class="summary">
        <div class="summary__balance">
          <div class="summary__balance-label">Số dư hiện tại</div>
          <div class="summary__balance-amount" id="totalBalance">0đ</div>
        </div>

        <div class="summary__cards">
          <div class="summary__card">
            <div class="summary__card-header">
              <div class="summary__card-icon summary__card-icon--income">
                <i class="fa-solid fa-arrow-trend-up"></i>
              </div>
              <span class="summary__card-label">Thu nhập</span>
            </div>
            <div class="summary__card-amount summary__card-amount--income" id="totalIncome">0đ</div>
          </div>
          <div class="summary__card">
            <div class="summary__card-header">
              <div class="summary__card-icon summary__card-icon--expense">
                <i class="fa-solid fa-arrow-trend-down"></i>
              </div>
              <span class="summary__card-label">Chi tiêu</span>
            </div>
            <div class="summary__card-amount summary__card-amount--expense" id="totalExpense">0đ</div>
          </div>
        </div>
      </section>

      <div class="home-grid">
        <!-- ============ Cot chinh: loc + danh sach ============ -->
        <div class="home-main">
          <!-- Tim kiem & loc nang cao -->
          <div class="search-bar">
            <div class="search-bar__box">
              <i class="fa-solid fa-magnifying-glass"></i>
              <input type="search" id="searchInput" class="search-bar__input" placeholder="Tìm theo tên, ghi chú, danh mục..." aria-label="Tìm kiếm giao dịch">
            </div>
            <select id="filterWallet" class="search-bar__select" aria-label="Lọc theo ví">
              <option value="">Tất cả ví</option>
            </select>
            <select id="filterCategory" class="search-bar__select" aria-label="Lọc theo danh mục">
              <option value="">Tất cả danh mục</option>
            </select>
          </div>

          <!-- Filter Tabs -->
          <div class="filter-tabs">
            <button class="filter-tab active" data-filter="all">Tất cả</button>
            <button class="filter-tab" data-filter="expense">Chi tiêu</button>
            <button class="filter-tab" data-filter="income">Thu nhập</button>
            <button class="filter-tab" data-filter="transfer">Chuyển ví</button>
          </div>

          <!-- Transaction List -->
          <section class="section">
            <div class="section__header">
              <h2 class="section__title">Giao dịch gần đây</h2>
              <span class="section__count" id="txCountLabel"></span>
            </div>
            <button type="button" class="btn-load-more" id="btnLoadMore" style="display:none;margin:var(--space-md) auto 0">
              <i class="fa-solid fa-chevron-down"></i> Xem thêm giao dịch
            </button>
            <div class="transactions" id="transactionList">
              <!-- Rendered by JS -->
            </div>
          </section>
        </div>

        <!-- ============ Cot phu: nhap nhanh + ngan sach + demo ============ -->
        <aside class="home-side">
          <!-- Nhap nhanh bang AI -->
          <section class="side-card" id="aiCard">
            <div class="side-card__title">
              <i class="fa-solid fa-wand-magic-sparkles"></i> Nhập nhanh bằng AI
            </div>
            <p class="side-card__desc">Gõ hoặc nói: <em>"Ăn bún bò 40k, đổ xăng 50k bằng ví MoMo"</em></p>
            <div class="ai-entry">
              <input type="text" id="aiInput" class="ai-entry__input"
                     placeholder="Ăn bún bò 40k" aria-label="Nhập nhanh bằng AI">
              <button type="button" id="btnAiMic" class="ai-entry__mic" title="Nhập bằng giọng nói" aria-label="Nhập bằng giọng nói">
                <i class="fa-solid fa-microphone"></i>
              </button>
              <button type="button" id="btnAiParse" class="ai-entry__go" title="Phân tích và thêm giao dịch">
                <i class="fa-solid fa-arrow-right"></i>
              </button>
            </div>
            <div id="aiPreview" class="ai-preview" hidden></div>
            <div class="ai-entry__hint" id="aiHint">AI chạy ngay trong máy — không cần mạng. Kết nối Gemini (tuỳ chọn) để hiểu câu phức tạp hơn.</div>
          </section>

          <!-- Ngan sach thang nay -->
          <section class="summary__card" id="homeBudgetBox" style="margin-bottom:var(--space-md);display:none">
            <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:var(--space-sm)">
              <span style="font-size:var(--font-size-sm);font-weight:600">
                <i class="fa-solid fa-bullseye" style="color:var(--primary-text)"></i> Ngân sách tháng này
              </span>
              <span style="font-size:var(--font-size-sm);font-weight:700" id="homeBudgetPercent">0%</span>
            </div>
            <div class="budget-summary__progress-bar" style="margin-bottom:var(--space-sm)">
              <div class="budget-summary__progress-fill budget-summary__progress-fill--safe" id="homeBudgetFill" style="width:0%"></div>
            </div>
            <div style="display:flex;justify-content:space-between;font-size:var(--font-size-sm)">
              <span>Đã chi <strong id="homeBudgetSpent">0đ</strong></span>
              <span>Còn <strong id="homeBudgetLeft">0đ</strong></span>
            </div>
            <div style="font-size:var(--font-size-xs);color:var(--text-muted);margin-top:4px">
              Hạn mức: <span id="homeBudgetLimit">0đ</span>
            </div>
            <div id="homeBudgetWarning" style="display:none;font-size:var(--font-size-xs);color:var(--danger-text);margin-top:6px"></div>
          </section>

          <!-- Moi xem ban demo khi chua co du lieu -->
          <section class="side-card side-card--demo" id="homeDemoCard" hidden>
            <div class="side-card__title">
              <i class="fa-solid fa-play"></i> Xem nhanh bản Demo
            </div>
            <p class="side-card__desc">10 giao dịch mẫu (lương, ăn uống, xăng...) để xem ngay biểu đồ và ngân sách. Dữ liệu mẫu không đồng bộ lên cloud.</p>
            <button type="button" id="btnDemoHome" class="side-card__btn">
              <i class="fa-solid fa-wand-magic-sparkles"></i> Bật dữ liệu mẫu
            </button>
            <button type="button" id="btnDemoHide" class="side-card__link">Ẩn lại</button>
          </section>
        </aside>
      </div>
    </div>`;

const out = lines.slice(0, start).concat(NEW.split('\n'), lines.slice(end + 1));
fs.writeFileSync(file, out.join('\n'), 'utf8');
console.log('Da viet lai trang chu:', NEW.split('\n').length, 'dong');
