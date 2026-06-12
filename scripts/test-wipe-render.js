const fs = require('fs');
const { DOMParser, XMLSerializer } = require('@xmldom/xmldom');
global.window = global;
global.DOMParser = DOMParser;
global.XMLSerializer = XMLSerializer;
require('../lib/pizzip.min.js');
require('../lib/docxtemplater.js');
const PizZip = global.PizZip;
const Docxtemplater = global.Docxtemplater || global.docxtemplater;

function repairDocxPlaceholderXml(xml) {
    // Mirrors js/main.js + js/project.js: merged runs keep the first original
    // run's properties so repaired placeholders render with template formatting.
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
    // Normalize backslash paths first — zip.files[path] bypasses any path normalization
    // that zip.file() may apply, ensuring backslash-keyed entries are found.
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

function test(label, path, data) {
    const zip = new PizZip(fs.readFileSync(path));
    repairZip(zip);
    const doc = new Docxtemplater(zip, { paragraphLoop: true, linebreaks: true, delimiters: { start: '{', end: '}' }, nullGetter: () => '' });
    doc.render(data);
    const out = doc.getZip();
    const all = Object.keys(out.files).filter(k => /header1|document|footer1/.test(k)).map(k => out.file(k).asText()).join('');
    const plain = all.replace(/<[^>]+>/g, '');
    const tags = all.match(/\{[#/]?[a-zA-Z][a-zA-Z0-9]*\}/g) || [];
    console.log(label, { leftoverTags: tags.length, hasTESTPROJ: plain.includes('TESTPROJ'), hasW01: plain.includes('W01') });
}

test('WIPE', 'D:/oversight-desktop/templates/Lead Wipe Template.docx', {
    date: '06/09/2026', projectNumber: 'TESTPROJ', clientName: 'Test Client', inspectorName: 'Inspector', Bill2: '123',
    dateCollected: '06/09/2026', analysisType: 'Lead', laboratory: 'Lab', turnAroundTime: '24h', siteName: 'Site',
    spectialInstructions: 'none', inspectorEmail: 'a@b.com',
    samplesWipe: [{ sampleID: 'W01', sampleType: 'Pre-Start', containmentName: 'Room 101 Containment', substrate: 'Floor', component: 'Tile', quantity: '1', buildingName: 'B1', spaceName: 'R1', locationComment: 'c' }]
});
test('BULK', 'D:/oversight-desktop/templates/Bulk Sample Template.docx', {
    date: '06/09/2026', projectNumber: 'TESTPROJ', inspectorName: 'Inspector', datesCollected: '06/09/2026',
    analysisType: 'PLM', siteName: 'Site', materialName: 'VAT', samplesBulk: [{ sampleID: 'B01', sampleDescription: 'd' }], samples: [{ sampleID: 'B01', sampleDescription: 'd' }]
});
