const fs = require('fs');
global.window = global;
require('../lib/pizzip.min.js');
const z = new global.PizZip(fs.readFileSync('D:/oversight-desktop/templates/Lead Wipe Template.docx'));
const key = Object.keys(z.files).find(k => /document\.xml$/i.test(k));
let xml = z.file(key).asText();
console.log('start', xml.length);

const mergedRun = (tag) => `<w:r><w:rPr><w:rFonts w:ascii="Arial" w:hAnsi="Arial" w:cs="Arial"/></w:rPr><w:t>${tag}</w:t></w:r>`;
const wRun = String.raw`<w:r\b[^>]*>(?:<w:rPr>[\s\S]*?<\/w:rPr>)?`;
const wText = String.raw`<w:t(?:\s[^>]*)?>`;
const proof = String.raw`\s*(?:<w:proofErr[^>]*\/?>\s*)*`;

function step(name, fn) {
    const before = xml.length;
    xml = fn(xml);
    console.log(name, 'delta', xml.length - before, 'total', xml.length);
}

step('trailing', (x) => x.replace(
    /(<w:r\b[^>]*>(?:<w:rPr>[\s\S]*?<\/w:rPr>)?)<w:t(?:\s[^>]*)?>\{([#\/]?[\w.]+)\}([^<{}]+)<\/w:t><\/w:r>/g,
    (_m, rOpen, tag, trailing) => `${rOpen}<w:t>{${tag}}</w:t></w:r>${mergedRun(trailing)}`
));
step('split', (x) => x.replace(
    /(<w:r\b[^>]*>(?:<w:rPr>[\s\S]*?<\/w:rPr>)?)<w:t(?:\s[^>]*)?>\} \{<\/w:t><\/w:r>/g,
    '$1<w:t>}</w:t></w:r><w:r><w:rPr><w:rFonts w:ascii="Arial" w:hAnsi="Arial" w:cs="Arial"/></w:rPr><w:t>{</w:t></w:r>'
));
step('close-loop', (x) => x.replace(
    new RegExp(`${wRun}${wText}\\{\\/<\\/w:t><\\/w:r>${proof}${wRun}${wText}([^<{}]+)<\\/w:t><\\/w:r>${proof}${wRun}${wText}\\}<\\/w:t><\\/w:r>`, 'g'),
    (_m, tagName) => mergedRun(`{/${tagName.trim()}}`)
));
step('four-run', (x) => x.replace(
    new RegExp(`${wRun}${wText}\\{<\\/w:t><\\/w:r>${proof}${wRun}${wText}([^<{}]+)<\\/w:t><\\/w:r>${proof}${wRun}${wText}([^<{}]+)<\\/w:t><\\/w:r>${proof}${wRun}${wText}\\}<\\/w:t><\\/w:r>`, 'g'),
    (_m, p1, p2) => mergedRun(`{${(p1 + p2).trim()}}`)
));
step('three-run', (x) => x.replace(
    new RegExp(`${wRun}${wText}\\{<\\/w:t><\\/w:r>${proof}${wRun}${wText}([^<{}]+)<\\/w:t><\\/w:r>${proof}${wRun}${wText}\\}<\\/w:t><\\/w:r>`, 'g'),
    (_m, tagName) => {
        const name = tagName.trim();
        if (!/^[\w#/.]+$/.test(name)) return _m;
        return mergedRun(`{${name}}`);
    }
));

const intact = (xml.match(/<w:t(?:\s[^>]*)?>\{[#/]?[^}<]+\}<\/w:t>/g) || []).map(t => t.replace(/<[^>]+>/g, ''));
console.log('intact', intact);
console.log('lone', (xml.match(/<w:t(?:\s[^>]*)?>\{<\/w:t>/g) || []).length);
