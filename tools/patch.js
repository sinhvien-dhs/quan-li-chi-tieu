/**
 * tools/patch.js — Tiện ích vá file bằng Node (dùng khi khối chèn quá lớn)
 *
 * Cách dùng:
 *   node tools/patch.js <đường-dẫn-file> <file-anchor> <file-chèn> [--mode after|before|replace]
 *
 * Ví dụ:
 *   node tools/patch.js js/business.js anchor.txt insert.txt
 */
const fs = require('fs');
const path = require('path');

const [, , targetArg, anchorFile, insertFile, ...rest] = process.argv;
if (!targetArg || !anchorFile || !insertFile) {
  console.error('Thieu tham so');
  process.exit(1);
}

const modeArg = rest.find((a) => a.startsWith('--mode='));
const mode = modeArg ? modeArg.split('=')[1] : 'after';

const target = path.resolve(targetArg);
const anchor = fs.readFileSync(anchorFile, 'utf8').replace(/\r?\n$/, '');
const insert = fs.readFileSync(insertFile, 'utf8').replace(/\r?\n$/, '');

let text = fs.readFileSync(target, 'utf8');
if (!text.includes(anchor)) {
  console.error('KHONG TIM THAY ANCHOR trong ' + targetArg);
  process.exit(2);
}

if (mode === 'replace') {
  text = text.replace(anchor, insert);
} else if (mode === 'before') {
  text = text.replace(anchor, insert + '\n' + anchor);
} else {
  text = text.replace(anchor, anchor + '\n' + insert);
}

fs.writeFileSync(target, text, 'utf8');
console.log('Da chèn (' + mode + ') vao ' + targetArg);
