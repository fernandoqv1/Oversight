const fs = require('fs');
global.window = global;
require('../lib/pizzip.min.js');
const z = new global.PizZip(fs.readFileSync('D:/oversight-desktop/templates/Lead Wipe Template.docx'));
const xml = z.file(Object.keys(z.files).find(k => /document\.xml$/i.test(k))).asText();

const rPr = String.raw`(?:<w:rPr(?:\s[^>]*)?>(?:[^<]|<(?!\/w:rPr>))*<\/w:rPr>)?`;
const run = String.raw`<w:r\b(?:\s[^>]*)?>${rPr}<w:t(?:\s[^>]*)?>`;
const runEnd = String.raw`<\/w:t><\/w:r>`;

const tests = [
    `${run}\\{\\/${runEnd}`,
    `${run}\\{${runEnd}`,
];
tests.forEach((src, i) => {
    const re = new RegExp(src, 'g');
    let m, n = 0;
    while ((m = re.exec(xml))) {
        console.log('test', i, 'match', ++n, 'at', m.index, 'len', m[0].length);
    }
});
