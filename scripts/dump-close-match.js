const fs = require('fs');
global.window = global;
require('../lib/pizzip.min.js');
const z = new global.PizZip(fs.readFileSync('D:/oversight-desktop/templates/Lead Wipe Template.docx'));
const key = Object.keys(z.files).find(k => /document\.xml$/i.test(k));
const xml = z.file(key).asText();
const wRun = String.raw`<w:r\b[^>]*>(?:<w:rPr>[\s\S]*?<\/w:rPr>)?`;
const wText = String.raw`<w:t(?:\s[^>]*)?>`;
const proof = String.raw`\s*(?:<w:proofErr[^>]*\/?>\s*)*`;
const re = new RegExp(`${wRun}${wText}\\{\\/<\\/w:t><\\/w:r>${proof}${wRun}${wText}([^<{}]+)<\\/w:t><\\/w:r>${proof}${wRun}${wText}\\}<\\/w:t><\\/w:r>`, 'g');
const m = re.exec(xml);
if (m) {
    console.log('index', m.index, 'len', m[0].length, 'tag', m[1]);
    console.log('start:', m[0].slice(0, 250));
} else {
    console.log('no match');
}
