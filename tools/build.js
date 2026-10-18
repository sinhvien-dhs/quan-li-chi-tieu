/**
 * tools/build.js — Đóng gói bản phát hành (không cần npm/Vite)
 *
 *   node tools/build.js
 *
 * Tạo thư mục dist/ gồm:
 *   - index.html : tham chiếu tới 1 file JS + 1 file CSS đã gộp & nén
 *   - app.min.js : toàn bộ module JS nối tiếp, tên biến/ngắt dòng thừa đã bỏ
 *   - style.min.css, manifest.json, sw.js, assets/
 *
 * Ghi chú: bản dùng hằng ngày vẫn là các file rời trong thư mục gốc
 * (dễ đọc, dễ sửa, phù hợp khi trình bày code cho ban giám khảo).
 * dist/ là bản tối ưu để dựng nếu cần tốc độ tải hoặc self-host.
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const DIST = path.join(ROOT, 'dist');

// Phiên bản lấy từ sw.js (nguồn sự thật) — tránh ghim số vào CI.
// Có thể ghi đè: node tools/build.js 84
const readBuildVersion = () => {
  const sw = fs.readFileSync(path.join(ROOT, 'sw.js'), 'utf8');
  const m = sw.match(/spendwise-cache-v(\d+)/);
  return m ? m[1] : '0';
};
const VERSION = process.argv[2] || readBuildVersion();

// Thứ tự nạp đúng như index.html
const JS_FILES = [
  'js/utils.js', 'js/business.js', 'js/storage.js', 'js/category.js',
  'js/transaction.js', 'js/chart.js', 'js/budget.js', 'js/export.js',
  'js/notification.js', 'js/pwa.js', 'js/features.js', 'js/sync.js',
  'js/config.js', 'js/auth.js', 'js/ai.js', 'js/lock.js', 'js/split.js',
  'js/demo.js', 'js/home.js', 'js/app.js'
];

const CSS_FILES = [
  'css/variables.css', 'css/style.css', 'css/stats.css', 'css/budget.css',
  'css/pwa.css', 'css/home.css', 'css/debts.css', 'css/lock.css',
  'css/responsive.css'
];

const copyDir = (from, to) => {
  fs.mkdirSync(to, { recursive: true });
  fs.readdirSync(from, { withFileTypes: true }).forEach((entry) => {
    const src = path.join(from, entry.name);
    const dst = path.join(to, entry.name);
    if (entry.isDirectory()) copyDir(src, dst);
    else fs.copyFileSync(src, dst);
  });
};

/** Nén CSS: bỏ comment, gọn khoảng trắng thừa */
const minifyCss = (css) => css
  .replace(/\/\*[\s\S]*?\*\//g, '')
  .replace(/\s+/g, ' ')
  .replace(/\s*([{}:;,>])\s*/g, '$1')
  .replace(/;}/g, '}')
  .trim();

/**
 * Nén JS ở mức an toàn:
 * - bỏ comment và khoảng trắng thừa
 * - KHÔNG đổi tên biến (giữ nguyên khả năng đọc & không vỡ stack trace)
 */
const minifyJs = (js) => js
  .replace(/\/\*[\s\S]*?\*\//g, '')
  .replace(/(^|[^:'"\\])\/\/.*$/gm, '$1')
  .split('\n')
  .map((line) => line.trim())
  .filter((line) => line.length > 0)
  .join('\n');

fs.rmSync(DIST, { recursive: true, force: true });
fs.mkdirSync(DIST, { recursive: true });

// 1) CSS
const css = CSS_FILES.map((f) => fs.readFileSync(path.join(ROOT, f), 'utf8')).join('\n');
fs.writeFileSync(path.join(DIST, 'style.min.css'), minifyCss(css), 'utf8');

// 2) JS
const js = JS_FILES.map((f) =>
  `/* ===== ${f} ===== */\n` + fs.readFileSync(path.join(ROOT, f), 'utf8')).join('\n');
fs.writeFileSync(path.join(DIST, 'app.min.js'), minifyJs(js), 'utf8');

// 3) index.html — thay toàn bộ link/script cục bộ
let html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
html = html.replace(/<link\s+rel="stylesheet"\s+href="css\/[^"]*"[^>]*>\s*/gi, '');
html = html.replace(/<script\s+src="js\/[^"]*"[^>]*><\/script>\s*/gi, '');
html = html.replace('</head>', `  <link rel="stylesheet" href="style.min.css?v=${VERSION}">\n</head>`);
html = html.replace(
  '<!-- ===== JavaScript Modules ===== -->',
  `  <script src="app.min.js?v=${VERSION}"></script>\n  <!-- ===== JavaScript Modules ===== -->`
);
fs.writeFileSync(path.join(DIST, 'index.html'), html, 'utf8');

// 4) File tĩnh
['sw.js', 'manifest.json', 'favicon.ico'].forEach((f) => {
  const src = path.join(ROOT, f);
  if (fs.existsSync(src)) fs.copyFileSync(src, path.join(DIST, f));
});
if (fs.existsSync(path.join(ROOT, 'assets'))) {
  copyDir(path.join(ROOT, 'assets'), path.join(DIST, 'assets'));
}

// 5) Báo cáo kết quả
const kb = (f) => (fs.statSync(path.join(DIST, f)).size / 1024).toFixed(1) + ' KB';
const rawJs = JS_FILES.reduce((s, f) => s + fs.statSync(path.join(ROOT, f)).size, 0);
const rawCss = CSS_FILES.reduce((s, f) => s + fs.statSync(path.join(ROOT, f)).size, 0);

console.log('=== Đã đóng gói bản phát hành (dist/) ===');
console.log('  app.min.js     :', kb('app.min.js'), '(gốc:', (rawJs / 1024).toFixed(1), 'KB)');
console.log('  style.min.css  :', kb('style.min.css'), '(gốc:', (rawCss / 1024).toFixed(1), 'KB)');
console.log('  index.html     :', kb('index.html'));
console.log('Mở thử: npx serve dist  hoặc  python -m http.server -d dist 8001');
