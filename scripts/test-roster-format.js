// Verifies the placeholder-repair logic preserves the template's run
// formatting (font size etc.) instead of replacing it with a bare Arial run —
// the Worker Roster regression where repaired placeholders printed larger
// than the template's 8pt (w:sz 16).
const fs = require('fs');
const { DOMParser, XMLSerializer } = require('@xmldom/xmldom');
global.window = global;
global.DOMParser = DOMParser;
global.XMLSerializer = XMLSerializer;
require('../lib/pizzip.min.js');
require('../lib/docxtemplater.js');
const PizZip = global.PizZip;
const Docxtemplater = global.Docxtemplater || global.docxtemplater;

// Mirrors repairDocxPlaceholderXml in js/main.js + js/project.js (rPr-preserving version)
function repairDocxPlaceholderXml(xml) {
    const fallbackRPr = '<w:rPr><w:rFonts w:ascii="Arial" w:hAnsi="Arial" w:cs="Arial"/></w:rPr>';
    const mergedRun = (tag, rPrXml) => `<w:r>${rPrXml || fallbackRPr}<w:t>${tag}</w:t></w:r>`;
    const rPr = String.raw`(?:<w:rPr(?:\s[^>]*)?>(?:[^<]|<(?!\/w:rPr>))*<\/w:rPr>)?`;
    const run = String.raw`<w:r\b(?:\s[^>]*)?>` + rPr + String.raw`<w:t(?:\s[^>]*)?>`;
    const runCap = String.raw`<w:r\b(?:\s[^>]*)?>` + `(${rPr})` + String.raw`<w:t(?:\s[^>]*)?>`;
    const runEnd = String.raw`<\/w:t><\/w:r>`;
    const proof = String.raw`\s*(?:<w:proofErr[^>]*\/?>\s*)*`;
    xml = xml.replace(new RegExp(runCap + String.raw`\{\{` + runEnd + proof + run + `([^<{}]+)` + runEnd + proof + run + String.raw`\}\}` + runEnd, 'g'), (_m, rPr1, tagName) => mergedRun(`{${tagName.trim()}}`, rPr1));
    xml = xml.replace(/(<w:r\b(?:\s[^>]*)?>)((?:<w:rPr(?:\s[^>]*)?>(?:[^<]|<(?!\/w:rPr>))*<\/w:rPr>)?)<w:t(?:\s[^>]*)?>\{([#\/]?[\w.]+)\}([^<{}]+)<\/w:t><\/w:r>/g, (_m, rOpen, rPr1, tag, trailing) => `${rOpen}${rPr1}<w:t>{${tag}}</w:t></w:r>${mergedRun(trailing, rPr1)}`);
    xml = xml.replace(/(<w:r\b(?:\s[^>]*)?>)((?:<w:rPr(?:\s[^>]*)?>(?:[^<]|<(?!\/w:rPr>))*<\/w:rPr>)?)<w:t(?:\s[^>]*)?>\} \{<\/w:t><\/w:r>/g, (_m, rOpen, rPr1) => `${rOpen}${rPr1}<w:t>}</w:t></w:r>${mergedRun('{', rPr1)}`);
    xml = xml.replace(new RegExp(runCap + String.raw`\{\/` + runEnd + proof + run + `([^<{}]+)` + runEnd + proof + run + String.raw`\}` + runEnd, 'g'), (_m, rPr1, tagName) => mergedRun(`{/${tagName.trim()}}`, rPr1));
    xml = xml.replace(new RegExp(runCap + String.raw`\{` + runEnd + proof + run + `([^<{}]+)` + runEnd + proof + run + `([^<{}]+)` + runEnd + proof + run + String.raw`\}` + runEnd, 'g'), (_m, rPr1, p1, p2) => {
        const name = (p1 + p2).trim();
        if (!/^[\w#/.]+$/.test(name)) return _m;
        return mergedRun(`{${name}}`, rPr1);
    });
    xml = xml.replace(new RegExp(runCap + String.raw`\{` + runEnd + proof + run + `([^<{}]+)` + runEnd + proof + run + String.raw`\}` + runEnd, 'g'), (_m, rPr1, tagName) => {
        const name = tagName.trim();
        if (!/^[\w#/.]+$/.test(name)) return _m;
        return mergedRun(`{${name}}`, rPr1);
    });
    return xml;
}

function repairZip(zip) {
    Object.keys(zip.files).forEach(path => {
        if (!path.includes('\\')) return;
        const fileObj = zip.files[path];
        if (!fileObj) return;
        zip.file(path.replace(/\\/g, '/'), fileObj.asText());
        delete zip.files[path];
    });
    Object.keys(zip.files).forEach(p => {
        if (!/^word[\\/](document|header\d+|footer\d+)\.xml$/i.test(p)) return;
        const f = zip.file(p);
        if (!f) return;
        const orig = f.asText();
        const fixed = repairDocxPlaceholderXml(orig);
        if (fixed !== orig) zip.file(p, fixed);
    });
}

const zip = new PizZip(fs.readFileSync('D:/oversight-desktop/templates/Worker Roster Template.docx'));
repairZip(zip);

// 1. After repair: every placeholder run must carry an explicit font size.
const xml = zip.file('word/document.xml').asText();
const tagRuns = xml.match(/<w:r\b[^>]*>(?:<w:rPr(?:\s[^>]*)?>(?:[^<]|<(?!\/w:rPr>))*<\/w:rPr>)?<w:t[^>]*>\{[^}<]+\}<\/w:t><\/w:r>/g) || [];
const missingSz = tagRuns.filter(r => !/<w:sz\b/.test(r));
console.log('placeholder runs:', tagRuns.length, '| missing font size:', missingSz.length);
missingSz.slice(0, 3).forEach(r => console.log('  NO-SIZE RUN:', r.substring(0, 160)));

// 2. Render end-to-end and confirm no leftover tags and values inherit sz 16.
const doc = new Docxtemplater(zip, { paragraphLoop: true, linebreaks: true, delimiters: { start: '{', end: '}' }, nullGetter: () => '' });
doc.render({
    client: 'Test Client', pjNumber: 'TESTPROJ',
    date1: '06/11', date2: '06/12', date3: '06/13', date4: '06/14',
    roster: [{
        workerName: 'WORKERX', sOrW: 'W',
        aheraExp: '07/01/2026', aheraExpired: '',
        medicalExp: '08/01/2026', medicalExpired: '',
        respiratorExp: '09/01/2026', respiratorExpired: '',
        leadExp: '', leadExpired: '', leadMedExp: '', leadMedExpired: ''
    }],
    dailyRoster: []
});
const out = doc.getZip().file('word/document.xml').asText();
const leftover = out.match(/\{[#/]?[a-zA-Z][a-zA-Z0-9]*\}/g) || [];
console.log('after render: leftoverTags =', leftover.length, '| hasWORKERX =', out.includes('WORKERX'));
const workerRun = out.match(/<w:r\b[^>]*>(?:<w:rPr(?:\s[^>]*)?>(?:[^<]|<(?!\/w:rPr>))*<\/w:rPr>)?<w:t[^>]*>[^<]*WORKERX[^<]*<\/w:t><\/w:r>/);
console.log('rendered WORKERX run keeps sz:', workerRun ? /<w:sz\b/.test(workerRun[0]) : 'run not found');
