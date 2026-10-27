/**
 * Tang phien ban cua SpendWise.
 *
 *   node tools/bump.js          -> tu tang len 1 so cao nhat da tung dung
 *   node tools/bump.js 84       -> ep dung so cu the (duoc kiem tra khong lui)
 *
 * VI SAO PHAI CHO PHEP KHONG LUI?
 *   index.html dung "?v=NN" de pha bo dem trong trinh duyet, sw.js dung
 *   "spendwise-cache-vNN" de ten cache. Neu so moi < so cu, trinh duyet co
 *   the tra ve ban CU da cache -> nguoi dung thay giao dien khac hoac to.
 *   Da xay ra: du an o v83 nhung mot lan sua dat nhung lai ve v81.
 *
 * Cach xac dinh so lon nhat da tung dung:
 *   - so dang co trong index.html va sw.js
 *   - so lon nhat xuat hien trong lich su Git (de khong bo sot ban da deploy)
 */
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const ROOT = path.join(__dirname, '..');
const HP = path.join(ROOT, 'index.html');
const SP = path.join(ROOT, 'sw.js');

const read = (p) => fs.readFileSync(p, 'utf8');

/** So lon nhat xuat hien trong lich su Git (khong loi thi bo qua) */
function maxFromGit() {
  try {
    const out = execFileSync('git', ['log', '--format=%H', '-40', '--', 'index.html', 'sw.js'],
      { cwd: ROOT, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });
    const commits = out.split(/\s+/).filter(Boolean);
    let max = 0;
    for (const c of commits) {
      for (const file of ['index.html', 'sw.js']) {
        try {
          const content = execFileSync('git', ['show', `${c}:${file}`],
            { cwd: ROOT, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });
          for (const m of content.matchAll(/(?:cache-v|\?v=)(\d+)/g)) {
            const n = Number(m[1]);
            if (n > max) max = n;
          }
        } catch (e) { /* file chua ton tai o commit do */ }
      }
    }
    return max;
  } catch (e) {
    return 0;
  }
}

/** So phien ban hien tai (tu file) */
function currentVersion() {
  const html = read(HP);
  const sw = read(SP);
  let max = 0;
  for (const m of html.matchAll(/\?v=(\d+)/g)) max = Math.max(max, Number(m[1]));
  const mm = sw.match(/spendwise-cache-v(\d+)/);
  if (mm) max = Math.max(max, Number(mm[1]));
  return max;
}

const hienTai = currentVersion();
const maxDaDung = Math.max(hienTai, maxFromGit());

let phienBan;
if (!process.argv[2]) {
  phienBan = maxDaDung + 1;
  console.log('Tu dong tang phien ban: ' + hienTai + ' -> ' + phienBan +
    ' (so lon nhat da tung dung: ' + maxDaDung + ')');
} else {
  phienBan = Number(process.argv[2]);
  if (!Number.isFinite(phienBan)) {
    console.error('So phien ban khong hop le: ' + process.argv[2]);
    process.exit(1);
  }
  if (phienBan <= maxDaDung) {
    console.error('TU CHOI: phien ban ' + phienBan + ' khong lớn hơn ' + maxDaDung +
      ' (ban da tung dung).\n' +
      '   Giam so phien ban se lam trinh duyet tra ve ban CACHE CU.\n' +
      '   Hay chay:  node tools\\bump.js          (tu tang len ' + (maxDaDung + 1) + ')');
    process.exit(1);
  }
  console.log('Tang phien ban: ' + hienTai + ' -> ' + phienBan);
}

// 1) index.html
let html = read(HP);
const soDuongDan = (html.match(/\?v=\d+/g) || []).length;
html = html.replace(/\?v=\d+/g, '?v=' + phienBan);
fs.writeFileSync(HP, html, 'utf8');

// 2) sw.js
let sw = read(SP);
sw = sw.replace(/spendwise-cache-v\d+/g, 'spendwise-cache-v' + phienBan);
fs.writeFileSync(SP, sw, 'utf8');

console.log('  index.html : ' + soDuongDan + ' duong dan -> ?v=' + phienBan);
console.log('  sw.js      : spendwise-cache-v' + phienBan);