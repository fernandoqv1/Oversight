const fs = require('fs');
const { DOMParser, XMLSerializer } = require('@xmldom/xmldom');
global.window = global;
global.DOMParser = DOMParser;
global.XMLSerializer = XMLSerializer;
require('../lib/pizzip.min.js');
require('../lib/docxtemplater.js');
const PizZip = global.PizZip;
const Docxtemplater = global.Docxtemplater || global.docxtemplater;

function repairDocOnly(xml) {
    const mergedRun = (tag) => `<w:r><w:rPr><w:rFonts w:ascii="Arial" w:hAnsi="Arial" w:cs="Arial"/></w:rPr><w:t>${tag}</w:t></w:r>`;
    const rPr = String.raw`(?:<w:rPr(?:\s[^>]*)?>(?:[^<]|<(?!\/w:rPr>))*<\/w:rPr>)?`;
    const run = String.raw`<w:r\b(?:\s[^>]*)?>${rPr}<w:t(?:\s[^>]*)?>`;
    const runEnd = String.raw`<\/w:t><\/w:r>`;
    const proof = String.raw`\s*(?:<w:proofErr[^>]*\/?>\s*)*`;
    xml = xml.replace(
        /(<w:r\b(?:\s[^>]*)?>(?:<w:rPr(?:\s[^>]*)?>(?:[^<]|<(?!\/w:rPr>))*<\/w:rPr>)?)<w:t(?:\s[^>]*)?>\{([#\/]?[\w.]+)\}([^<{}]+)<\/w:t><\/w:r>/g,
        (_m, rOpen, tag, trailing) => `${rOpen}<w:t>{${tag}}</w:t></w:r>${mergedRun(trailing)}`
    );
    xml = xml.replace(
        new RegExp(`${run}\\{${runEnd}${proof}${run}([^<{}]+)${runEnd}${proof}${run}\\}${runEnd}`, 'g'),
        (_m, tagName) => {
            const name = tagName.trim();
            if (!/^[\w#/.]+$/.test(name)) return _m;
            return mergedRun(`{${name}}`);
        }
    );
    return xml;
}

function runTest(label, repairHeader) {
    const z = new PizZip(fs.readFileSync('D:/oversight-desktop/templates/Lead Wipe Template.docx'));
    Object.keys(z.files).forEach(p => {
        if (!/^word[\\/](document|header\d+|footer\d+)\.xml$/i.test(p)) return;
        if (!repairHeader && /header|footer/i.test(p)) return;
        const orig = z.file(p).asText();
        const fixed = repairDocOnly(orig);
        if (fixed !== orig) z.file(p, fixed);
    });
    const doc = new Docxtemplater(z, { paragraphLoop: true, linebreaks: true, delimiters: { start: '{', end: '}' }, nullGetter: () => '' });
    doc.render({
        projectNumber: 'TESTPROJ', clientName: 'Client', inspectorName: 'Insp', date: 'D', Bill2: 'B',
        dateCollected: 'DC', analysisType: 'A', laboratory: 'L', turnAroundTime: 'T', siteName: 'Site',
        spectialInstructions: 'I', inspectorEmail: 'E',
        samplesWipe: [{ sampleID: 'W01', substrate: 'S', component: 'C', quantity: '1', buildingName: 'B', spaceName: 'Sp', locationComment: 'Lc' }]
    });
    const all = Object.keys(doc.getZip().files).filter(k => /header1|document|footer1/.test(k)).map(k => doc.getZip().file(k).asText()).join('');
    const tags = all.match(/\{[#/]?[a-zA-Z][\w]*\}/g) || [];
    console.log(label, { leftover: tags.length, TESTPROJ: all.includes('TESTPROJ'), W01: all.includes('W01'), tags: tags.slice(0, 8) });
}

runTest('doc-only repair', false);
runTest('doc+header repair', true);
