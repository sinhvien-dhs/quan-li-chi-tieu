const fs = require('fs');
const path = require('path');
const file = path.join(__dirname, '..', 'js', 'transaction.js');
const lines = fs.readFileSync(file, 'utf8').split(/\r?\n/);

const start = lines.findIndex((l) => l.includes('renderTransactionItem(t) {'));
if (start < 0) throw new Error('khong tim thay renderTransactionItem');

let depth = 0;
let end = -1;
for (let i = start; i < lines.length; i++) {
  depth += (lines[i].match(/\{/g) || []).length;
  depth -= (lines[i].match(/\}/g) || []).length;
  if (depth === 0 && i > start) { end = i; break; }
}
if (end < 0) throw new Error('khong tim thay dong ket');

const insert = fs.readFileSync(process.argv[2], 'utf8').replace(/\r?\n$/, '').split(/\r?\n/);
const out = lines.slice(0, start).concat(insert, lines.slice(end + 1));
fs.writeFileSync(file, out.join('\n'), 'utf8');
console.log('da thay renderTransactionItem:', start + 1, '-', end + 1);
