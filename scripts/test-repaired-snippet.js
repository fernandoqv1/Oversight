const fs = require('fs');
global.window = global;
require('../lib/pizzip.min.js');
// copy repair function inline (abbreviated - require from test-wipe-render by reading file)

function repairDocxPlaceholderXml(xml) {
    const mergedRun = (tag) => `<w:r><w:rPr><w:rFonts w:ascii="Arial" w:hAnsi="Arial" w:cs="Arial"/></w:rPr><w:t>${tag}</w:t></w:r>`;
    const rPr = String.raw`(?:<w:rPr(?:\s[^>]*)?>(?:[^<]|<(?!\/w:rPr>))*<\/w:rPr>)?`;
    const run = String.raw`<w:r\b(?:\s[^>]*)?>${rPr}<w:t(?:\s[^>]*)?>`;
    const runEnd = String.raw`<\/w:t><\/w:r>`;
    const proof = String.raw`\s*(?:<w:proofErr[^>]*\/?>\s*)*`;
    xml = xml.replace(new RegExp(`${run}\\{\\{${runEnd}${proof}${run}([^<{}]+)${runEnd}${proof}${run}\\}\\}${runEnd}`, 'g'), (_m, tagName) => mergedRun(`{${tagName.trim()}}`));
    xml = xml.replace(/(<w:r\b(?:\s[^>]*)?>(?:<w:rPr(?:\s[^>]*)?>(?:[^<]|<(?!\/w:rPr>))*<\/w:rPr>)?)<w:t(?:\s[^>]*)?>\{([#\/]?[\w.]+)\}([^<{}]+)<\/w:t><\/w:r>/g, (_m, rOpen, tag, trailing) => `${rOpen}<w:t>{${tag}}</w:t></w:r>${mergedRun(trailing)}`);
    xml = xml.replace(/(<w:r\b(?:\s[^>]*)?>(?:<w:rPr(?:\s[^>]*)?>(?:[^<]|<(?!\/w:rPr>))*<\/w:rPr>)?)<w:t(?:\s[^>]*)?>\} \{<\/w:t><\/w:r>/g, '$1<w:t>}</w:t></w:r><w:r><w:rPr><w:rFonts w:ascii="Arial" w:hAnsi="Arial" w:cs="Arial"/></w:rPr><w:t>{</w:t></w:r>');
    xml = xml.replace(new RegExp(`${run}\\{\\/${runEnd}${proof}${run}([^<{}]+)${runEnd}${proof}${run}\\}${runEnd}`, 'g'), (_m, tagName) => mergedRun(`{/${tagName.trim()}}`));
    xml = xml.replace(new RegExp(`${run}\\{${runEnd}${proof}${run}([^<{}]+)${runEnd}${proof}${run}([^<{}]+)${runEnd}${proof}${run}\\}${runEnd}`, 'g'), (_m, p1, p2) => mergedRun(`{${(p1 + p2).trim()}}`));
    xml = xml.replace(new RegExp(`${run}\\{${runEnd}${proof}${run}([^<{}]+)${runEnd}${proof}${run}\\}${runEnd}`, 'g'), (_m, tagName) => { const name = tagName.trim(); if (!/^[\w#/.]+$/.test(name)) return _m; return mergedRun(`{${name}}`); });
    return xml;
}

const z = new global.PizZip(fs.readFileSync('D:/oversight-desktop/templates/Lead Wipe Template.docx'));
const hkey = Object.keys(z.files).find(k => /header1\.xml$/i.test(k));
const header = repairDocxPlaceholderXml(z.file(hkey).asText());
const i = header.indexOf('projectNumber');
console.log(header.substring(i - 150, i + 150));

const dkey = Object.keys(z.files).find(k => /document\.xml$/i.test(k));
const doc = repairDocxPlaceholderXml(z.file(dkey).asText());
const j = doc.indexOf('{#samplesWipe}');
console.log('loop tag context', doc.substring(j - 80, j + 120));
