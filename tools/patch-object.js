const fs = require('fs');
const path = require('path');
const file = path.join(__dirname, '..', 'js', 'pwa.js');
const lines = fs.readFileSync(file, 'utf8').split(/\r?\n/);

let end = lines.length - 1;
while (end >= 0 && lines[end].trim() === '') end--;
// Them dau phay cho method cuoi truoc khi chen thanh vien moi
const prev = end - 1;
if (lines[prev].trim().endsWith('}')) {
  lines[prev] = lines[prev].replace(/}$/, '},');
}

if (lines[end] !== '};') throw new Error('dong cuoi khong phai }; -> ' + JSON.stringify(lines[end]));

const insert = fs.readFileSync(process.argv[2], 'utf8').replace(/\r?\n$/, '').split(/\r?\n/);
const out = lines.slice(0, end).concat(insert);
fs.writeFileSync(file, out.join('\n'), 'utf8');
console.log('da chen methods truoc dong ket object');
