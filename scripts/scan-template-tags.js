const fs = require('fs');
const path = require('path');
const base = 'D:/oversight-desktop/templates/_dbg_unzip/word';
function scan(file) {
  const t = fs.readFileSync(path.join(base, file), 'utf8');
  const tags = [];
  const re = /<w:t[^>]*>([^<]*)<\/w:t>/g;
  let m;
  while ((m = re.exec(t))) {
    if (m[1].includes('{') || m[1].includes('}')) tags.push(m[1]);
  }
  const joined = t.replace(/<w:proofErr[^>]*\/>/g, '').replace(/<[^>]+>/g, '');
  const loop = joined.match(/\{[#/]?[\w.]+\}/g) || [];
  return { file, runs: tags, joinedLoops: [...new Set(loop)] };
}
['header1.xml', 'document.xml', 'footer1.xml'].forEach(f => {
  try { console.log(JSON.stringify(scan(f), null, 2)); } catch (e) { console.log(f, e.message); }
});
