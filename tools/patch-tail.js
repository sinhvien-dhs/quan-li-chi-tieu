const fs = require('fs');
const path = require('path');
const file = path.join(__dirname, '..', 'js', 'pwa.js');
const lines = fs.readFileSync(file, 'utf8').split(/\r?\n/);

// Thay 2 dong cuoi "  }\n};" bằng khối logic mới
let end = lines.length - 1;
while (end >= 0 && lines[end].trim() === '') end--;
if (lines[end] !== '};') throw new Error('khong phai dong ket object: ' + lines[end]);
if (lines[end - 1].trim() !== '}') throw new Error('khong phai dong ket method');

const insert = fs.readFileSync(process.argv[2], 'utf8').replace(/\r?\n$/, '').split(/\r?\n/);
const out = lines.slice(0, end - 1).concat(insert);
fs.writeFileSync(file, out.join('\n'), 'utf8');
console.log('da ghep logic vao pwa.js');
