/**
 * Kiem tra tinh hop le cua firestore.rules TRUOC KHI dan len Firebase Console.
 * Firebase Console KHONG cho Publish neu file co loi bien dich.
 * File nay phat hien cac loi thuong gap:
 *   1) Khong can bang dau { }
 *   2) Ham goi tinh khong ton tai
 *   3) match / {...} thieu allow
 *   4) Thieu rules_version
 *   5) Duong dan bi trung lap
 */
const fs = require('fs');
const path = require('path');
const file = path.join(__dirname, '..', 'firestore.rules');
const src = fs.readFileSync(file, 'utf8');
const loi = [];
const canhBao = [];

// 1) rules_version
if (!/^\s*rules_version\s*=\s*'2'\s*;/.test(src)) loi.push("Thieu dong 'rules_version = \\'2\\';");

// 2) Can bang dau ngoac
let depth = 0, line = 1;
for (const ch of src) {
  if (ch === '\n') line++;
  if (ch === '{') depth++;
  if (ch === '}') depth--;
}
if (depth !== 0) loi.push('Dau ngoac { } khong can bang (thieu ' + (-depth) + ')');

// 3) Cac ham dinh nghia
const funcs = new Set([...src.matchAll(/function\s+([A-Za-z_][A-Za-z0-9_]*)\s*\(/g)].map(m => m[1]));

// 4) Cac ham duoc goi trong dieu kien allow/return
const goi = new Set([...src.matchAll(/\b([A-Za-z_][A-Za-z0-9_]*)\s*\(/g)].map(m => m[1]));
const tapDung = ['validDate','validTs','validReceipt','validTransaction','validWallet','validGoal',
  'validRecurring','validBudgetDoc','validSettingsDoc','validDebt','validDebtItem','validBudgetLimitVal','isOwner'];
tapDung.forEach(f => {
  if (!funcs.has(f) && /match\s*\/|allow\s+create|allow\s+update|return\s/.test(src)) {
    // chi bao loi neu ham do that su duoc goi
    const dung = new RegExp('\\b' + f + '\\s*\\(').test(src);
    if (dung && !funcs.has(f)) loi.push('Ham "' + f + '" duoc goi nhung khong co dinh nghia');
  }
});

// 5) Moi match phai co it nhat mot allow
// Duong dan co the chua {bien} nen lay ca phan giua / va {
const matches = [...src.matchAll(/match\s+(\/[A-Za-z0-9_{}=*\-/]+)\s*\{([\s\S]*?)\n\s{4}\}/g)];
if (!matches.length) loi.push('Khong tim thay khong loi match /...');
matches.forEach(m => {
  // Khoi goc /databases/{database}/documents chi la khung, khong can allow
  if (/^\/databases\//.test(m[1])) return;
  if (!/allow\s+/.test(m[2])) loi.push('Duong dan ' + m[1] + ' khong co lenh allow nao');
});

// 5b) match /databases/ la khoi bao, khong can allow
const paths = matches.map(m => m[1]).filter(p => !/^\/databases\//.test(p));

// 6) Trung duong dan
const trung = paths.filter((p, i) => paths.indexOf(p) !== i);
if (trung.length) loi.push('Duong dan bi trung: ' + [...new Set(trung)].join(', '));

// 7) Co khoi catch-all chan mac dinh khong
if (!/match\s+\/\{document=\*\*\}/.test(src)) canhBao.push('Khong thay khoi chan mac dinh (match /{document=**})');

// 8) Moi ham co "return"
[...src.matchAll(/function\s+([A-Za-z_][A-Za-z0-9_]*)\s*\([^)]*\)\s*\{/g)].forEach(m => {
  const idx = src.indexOf(m[0]) + m[0].length;
  if (!/\breturn\b/.test(src.slice(idx, idx + 400))) loi.push('Ham ' + m[1] + ' khong co lenh return');
});

console.log('=== Kiem tra ' + file.replace(/.*\\/, '') + ' ===');
console.log('So dong: ' + src.split(/\r?\n/).length);
console.log('So ham dinh nghia: ' + funcs.size + ' -> ' + [...funcs].join(', '));
console.log('So duong dan match: ' + paths.length);
console.log('So allow: ' + (src.match(/allow\s+/g) || []).length);
console.log('');
if (loi.length) {
  console.log('LOI CAN SUA (' + loi.length + '):');
  loi.forEach(l => console.log('  [LOI] ' + l));
} else {
  console.log('KHONG TIM THAY LOI CU PHAP.');
}
if (canhBao.length) {
  console.log('');
  console.log('CANH BAO (' + canhBao.length + '):');
  canhBao.forEach(c => console.log('  [!] ' + c));
}
process.exit(loi.length ? 1 : 0);