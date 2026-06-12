const fs = require('fs');
const PizZip = require('pizzip');
const Docxtemplater = require('docxtemplater');

function repairOriginal(xml) {
    const rPr = String.raw`(?:<w:rPr(?:\s[^>]*)?>(?:[^<]|<(?!\/w:rPr>))*<\/w:rPr>)?`;
    const run = String.raw`<w:r\b(?:\s[^>]*)?>${rPr}<w:t(?:\s[^>]*)?>`;
    const runEnd = String.raw`<\/w:t><\/w:r>`;
    const proof = String.raw`\s*(?:<w:proofErr[^>]*\/?>\s*)*`;
    return xml.replace(
        new RegExp(`${run}\\{${runEnd}${proof}${run}([^<{}]+)${runEnd}${proof}${run}\\}${runEnd}`, 'g'),
        (_m, tagName) => {
            const name = tagName.trim();
            if (!/^[\w#/.]+$/.test(name)) return _m;
            return `<w:r><w:rPr><w:rFonts w:ascii="Arial" w:hAnsi="Arial" w:cs="Arial"/></w:rPr><w:t>{${name}}</w:t></w:r>`;
        }
    );
}

function run(label, repairFn) {
    const zip = new PizZip(fs.readFileSync('D:/oversight-desktop/templates/Lead Wipe Template.docx'));
    Object.keys(zip.files).forEach(p => {
        if (!/^word[\\/](document|header\d+|footer\d+)\.xml$/i.test(p)) return;
        const orig = zip.file(p).asText();
        const fixed = repairFn(orig);
        if (fixed !== orig) zip.file(p, fixed);
    });
    const doc = new Docxtemplater(zip, { paragraphLoop: true, linebreaks: true, nullGetter: () => '' });
    doc.render({
        projectNumber: 'TESTPROJ', clientName: 'Client', inspectorName: 'Insp', date: 'D', Bill2: 'B',
        dateCollected: 'DC', analysisType: 'A', laboratory: 'L', turnAroundTime: 'T', siteName: 'Site',
        spectialInstructions: 'I', inspectorEmail: 'E',
        samplesWipe: [{ sampleID: 'W01', substrate: 'S', component: 'C', quantity: '1', buildingName: 'B', spaceName: 'Sp', locationComment: 'Lc' }]
    });
    const all = Object.keys(doc.getZip().files).filter(k => /header1|document|footer1/.test(k)).map(k => doc.getZip().file(k).asText()).join('');
    const tags = all.match(/\{[#/]?[a-zA-Z][\w]*\}/g) || [];
    console.log(label, { leftover: tags.length, TESTPROJ: all.includes('TESTPROJ'), W01: all.includes('W01'), lone: (all.match(/<w:t(?:\s[^>]*)?>\{<\/w:t>/g)||[]).length });
}

run('no repair', (x) => x);
run('original 3-run only', repairOriginal);
