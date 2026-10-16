/**
 * Tang phien ban: doi ?v=NN trong index.html va CACHE_NAME trong sw.js
 * Cach dung: node tools/bump.js 80
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const V = process.argv[2];
if (!V) { console.error('Thieu so phien ban. Vi du: node tools/bump.js 80'); process.exit(1); }

// 1) index.html — moi duong dan ?v=<so> trong <link>/<script> cua chinh file nay
const hp = path.join(ROOT, 'index.html');
let html = fs.readFileSync(hp, 'utf8');
const truoc = (html.match(/\?v=\d+/g) || []).length;
html = html.replace(/\?v=\d+/g, '?v=' + V);
fs.writeFileSync(hp, html, 'utf8');

// 2) sw.js — CACHE_NAME
const sp = path.join(ROOT, 'sw.js');
let sw = fs.readFileSync(sp, 'utf8');
sw = sw.replace(/spendwise-cache-v\d+/g, 'spendwise-cache-v' + V);
fs.writeFileSync(sp, sw, 'utf8');

console.log('Da tang phien ban len v' + V);
console.log('  index.html : ' + truoc + ' duong dan -> ?v=' + V);
console.log('  sw.js      : ' + (sw.match(/spendwise-cache-v\d+/) || ['?'])[0]);