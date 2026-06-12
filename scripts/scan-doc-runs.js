const fs = require('fs');
const t = fs.readFileSync('D:/oversight-desktop/templates/_dbg_unzip/word/document.xml', 'utf8');
const re = /<w:t>([^<]*)<\/w:t>/g;
let m;
while ((m = re.exec(t))) {
  if (m[1].includes('/') || m[1].includes('samples') || m[1].includes('quantity') || m[1].includes('space'))
    console.log(JSON.stringify(m[1]));
}
