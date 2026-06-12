const fs = require('fs');
global.window = global;
require('../lib/pizzip.min.js');
const z = new global.PizZip(fs.readFileSync('D:/oversight-desktop/templates/Lead Wipe Template.docx'));
const key = Object.keys(z.files).find(k => /document\.xml$/i.test(k));
const xml = z.file(key).asText();
const proof = String.raw`\s*(?:<w:proofErr[^>]*\/?>\s*)*`;
const runOpen = String.raw`<w:r[^>]*>(?:<w:rPr>[\s\S]*?<\/w:rPr>)?<w:t(?:\s[^>]*)?>`;
const runClose = String.raw`<\/w:t><\/w:r>`;
const re = new RegExp(`${runOpen}\\{${runClose}${proof}${runOpen}([^<{}]+)${runClose}${proof}${runOpen}\\} \\{${runClose}${proof}${runOpen}([^<{}]+)${runClose}${proof}${runOpen}\\}${runClose}`, 'g');
const m = re.exec(xml);
if (m) {
    console.log('index', m.index, 'len', m[0].length);
    console.log('tag1', JSON.stringify(m[1]), 'tag2', JSON.stringify(m[2]));
    console.log('start snippet:', m[0].slice(0, 300));
    console.log('...end snippet:', m[0].slice(-300));
}
