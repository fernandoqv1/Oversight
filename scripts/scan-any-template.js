const fs = require('fs');
const path = require('path');
const base = process.argv[2];
function scan(file) {
  const t = fs.readFileSync(path.join(base, 'word', file), 'utf8');
  const tags = [];
  const re = /<w:t[^>]*>([^<]*)<\/w:t>/g;
  let m;
  while ((m = re.exec(t))) {
    if (m[1].includes('{') || m[1].includes('}')) tags.push(m[1]);
  }
  const lone = (t.match(/<w:t[^>]*>\{<\/w:t>/g) || []).length;
  const intact = (t.match(/<w:t[^>]*>\{[#/]?[^}<]+\}<\/w:t>/g) || []).map(x => x.replace(/<[^>]+>/g, ''));
  return { file, lone, intact, brokenRuns: tags.filter(x => x === '{' || x === '}' || x === '{/' || x.startsWith('} ')) };
}
console.log('TEMPLATE', base);
['header1.xml', 'document.xml', 'footer1.xml'].forEach(f => {
  try { console.log(JSON.stringify(scan(f))); } catch (e) { console.log(f, e.message); }
});
