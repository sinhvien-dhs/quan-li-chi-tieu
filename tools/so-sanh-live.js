/**
 * So sanh ban local voi ban dang deploy tren GitHub Pages.
 *   node tools/so-sanh-live.js
 *
 * Bao cao: file nao khac nhau, file nao chi co o mot ben.
 */
const fs = require('fs');
const path = require('path');
const https = require('https');
const crypto = require('crypto');

const ROOT = path.join(__dirname, '..');
const BASE = 'https://sinhvien-dhs.github.io/quan-li-chi-tieu/';

const sha = (buf) => crypto.createHash('sha1').update(buf).digest('hex').slice(0, 10);

function tai(url) {
  return new Promise((resolve) => {
    https.get(url, { headers: { 'Cache-Control': 'no-cache' } }, (res) => {
      const bufs = [];
      res.on('data', (d) => bufs.push(d));
      res.on('end', () => resolve({ status: res.statusCode, body: Buffer.concat(bufs) }));
    }).on('error', (e) => resolve({ status: 0, body: Buffer.alloc(0), error: e.message }));
  });
}

// Lay danh sach file ma index.html tham chieu
const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
const refs = new Set();
for (const m of html.matchAll(/(?:href|src)="((?:js|css|assets)\/[^"?]+)(?:\?[^"]*)?"/g)) refs.add(m[1]);
for (const f of ['js/config.js', 'sw.js', 'manifest.json']) refs.add(f);

(async () => {
  const khac = [], khongCoLive = [], giong = [];
  for (const rel of [...refs].sort()) {
    const localPath = path.join(ROOT, rel);
    if (!fs.existsSync(localPath)) { khac.push(rel + '  (KHONG co file local)'); continue; }
    const local = fs.readFileSync(localPath);
    const r = await tai(BASE + rel + '?t=' + Date.now());
    if (r.status !== 200) { khongCoLive.push(rel + '  (HTTP ' + r.status + ')'); continue; }
    if (sha(local) === sha(r.body)) giong.push(rel);
    else khac.push(rel + '  local ' + local.length + 'B / live ' + r.body.length + 'B');
  }

  console.log('=== SO SANH LOCAL vs GITHUB PAGES ===');
  console.log('Tong so file kiem tra: ' + refs.size);
  console.log('');
  console.log('GIONG (' + giong.length + '):');
  giong.forEach(f => console.log('  = ' + f));
  if (khac.length) {
    console.log('');
    console.log('KHAC NHAU (' + khac.length + '):');
    khac.forEach(f => console.log('  ! ' + f));
  }
  if (khongCoLive.length) {
    console.log('');
    console.log('KHONG TIM THAY TREN LIVE (' + khongCoLive.length + '):');
    khongCoLive.forEach(f => console.log('  x ' + f));
  }
})();