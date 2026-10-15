/**
 * Gom cac khoi @media (min-width: 900px) tu moi file CSS thanh mot file,
 * dung de mo phong bo cuc desktop trong trinh duyet.
 */
const fs = require('fs');
const path = require('path');
const dir = path.join(__dirname, '..', 'css');
let out = '/* AUTO-GENERATED: mo phong desktop */\n';
for (const f of fs.readdirSync(dir)) {
  if (!f.endsWith('.css')) continue;
  const src = fs.readFileSync(path.join(dir, f), 'utf8');
  const re = /@media\s*\(min-width:\s*900px\)\s*\{/g;
  let m;
  while ((m = re.exec(src))) {
    // Tim dau ket thuoc ngoac dac theo do sau
    let depth = 1, i = re.lastIndex;
    while (i < src.length && depth > 0) {
      if (src[i] === '{') depth++;
      else if (src[i] === '}') depth--;
      i++;
    }
    out += `/* tu ${f} */\n` + src.slice(re.lastIndex, i - 1) + '\n';
  }
}
fs.writeFileSync(path.join(__dirname, 'desktop-sim.css'), out, 'utf8');
console.log('da tao tools/desktop-sim.css (' + Math.round(out.length / 1024) + ' KB)');