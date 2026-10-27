/**
 * Tai ban live tu GitHub Pages va so sanh dong biet voi file local.
 *   node tools/diff-live.js
 */
const fs = require('fs');
const path = require('path');
const https = require('https');

const ROOT = path.join(__dirname, '..');
const BASE = 'https://sinhvien-dhs.github.io/quan-li-chi-tieu/';
const FILES = process.argv.slice(2).length ? process.argv.slice(2)
  : ['js/auth.js', 'js/ai.js', 'js/sync.js', 'css/budget.css'];

function tai(rel) {
  return new Promise((resolve, reject) => {
    const url = BASE + rel + '?t=' + Date.now();
    https.get(url, { headers: { 'Cache-Control': 'no-cache', 'Accept-Encoding': 'identity' } }, (res) => {
      const bufs = [];
      res.on('data', (d) => bufs.push(d));
      res.on('end', () => resolve({ status: res.statusCode, body: Buffer.concat(bufs).toString('utf8') }));
    }).on('error', reject);
  });
}

(async () => {
  for (const rel of FILES) {
    const r = await tai(rel);
    console.log('\n########## ' + rel + '  (HTTP ' + r.status + ') ##########');
    if (r.status !== 200) { console.log('  khong tai duoc'); continue; }
    const local = fs.readFileSync(path.join(ROOT, rel), 'utf8');
    const L = local.split(/\r?\n/);
    const R = r.body.split(/\r?\n/);
    console.log('  local: ' + L.length + ' dong / ' + local.length + ' byte');
    console.log('  live : ' + R.length + ' dong / ' + r.body.length + ' byte');

    // So dong bang thuat toan LCS don gian (du cho file vua)
    const n = L.length, m = R.length;
    const dp = Array.from({ length: n + 1 }, () => new Int32Array(m + 1));
    for (let i = n - 1; i >= 0; i--) {
      for (let j = m - 1; j >= 0; j--) {
        dp[i][j] = L[i] === R[j] ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1]);
      }
    }
    let i = 0, j = 0, hien = 0, tong = 0;
    while (i < n && j < m && hien < 40) {
      if (L[i] === R[j]) { i++; j++; }
      else {
        tong++;
        if (tong <= 25) console.log('  dong ' + (i + 1) + ':\n    LOCAL: ' + L[i].trim().slice(0, 110) + '\n    LIVE : ' + R[j].trim().slice(0, 110));
        i++; j++;
      }
    }
    tong += (n - i) + (m - j);
    console.log('  -> tong so dong khac nhau (uoc luong): ' + tong);
  }
})();