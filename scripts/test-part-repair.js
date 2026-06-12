const fs = require('fs');
const PizZip = require('pizzip');
const Docxtemplater = require('docxtemplater');

function repairDocxPlaceholderXml(xml) {
    const mergedRun = (tag) => `<w:r><w:rPr><w:rFonts w:ascii="Arial" w:hAnsi="Arial" w:cs="Arial"/></w:rPr><w:t>${tag}</w:t></w:r>`;
    const rPr = String.raw`(?:<w:rPr(?:\s[^>]*)?>(?:[^<]|<(?!\/w:rPr>))*<\/w:rPr>)?`;
    const run = String.raw`<w:r\b(?:\s[^>]*)?>${rPr}<w:t(?:\s[^>]*)?>`;
    const runEnd = String.raw`<\/w:t><\/w:r>`;
    const proof = String.raw`\s*(?:<w:proofErr[^>]*\/?>\s*)*`;
    xml = xml.replace(
        new RegExp(`${run}\\{\\{${runEnd}${proof}${run}([^<{}]+)${runEnd}${proof}${run}\\}\\}${runEnd}`, 'g'),
        (_m, tagName) => mergedRun(`{${tagName.trim()}}`)
    );
    xml = xml.replace(
        /(<w:r\b(?:\s[^>]*)?>(?:<w:rPr(?:\s[^>]*)?>(?:[^<]|<(?!\/w:rPr>))*<\/w:rPr>)?)<w:t(?:\s[^>]*)?>\{([#\/]?[\w.]+)\}([^<{}]+)<\/w:t><\/w:r>/g,
        (_m, rOpen, tag, trailing) => `${rOpen}<w:t>{${tag}}</w:t></w:r>${mergedRun(trailing)}`
    );
    xml = xml.replace(
        /(<w:r\b(?:\s[^>]*)?>(?:<w:rPr(?:\s[^>]*)?>(?:[^<]|<(?!\/w:rPr>))*<\/w:rPr>)?)<w:t(?:\s[^>]*)?>\} \{<\/w:t><\/w:r>/g,
        '$1<w:t>}</w:t></w:r><w:r><w:rPr><w:rFonts w:ascii="Arial" w:hAnsi="Arial" w:cs="Arial"/></w:rPr><w:t>{</w:t></w:r>'
    );
    xml = xml.replace(
        new RegExp(`${run}\\{\\/${runEnd}${proof}${run}([^<{}]+)${runEnd}${proof}${run}\\}${runEnd}`, 'g'),
        (_m, tagName) => mergedRun(`{/${tagName.trim()}}`)
    );
    xml = xml.replace(
        new RegExp(`${run}\\{${runEnd}${proof}${run}([^<{}]+)${runEnd}${proof}${run}([^<{}]+)${runEnd}${proof}${run}\\}${runEnd}`, 'g'),
        (_m, part1, part2) => mergedRun(`{${(part1 + part2).trim()}}`)
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

function repairZipParts(zip, parts) {
    Object.keys(zip.files).forEach(p => {
        if (!parts.some(part => new RegExp(`^word[\\\\/]${part}\\.xml$`, 'i').test(p))) return;
        const orig = zip.file(p).asText();
        const fixed = repairDocxPlaceholderXml(orig);
        if (fixed !== orig) zip.file(p, fixed);
    });
}

function test(label, parts, doRepair = true) {
    const zip = new PizZip(fs.readFileSync('D:/oversight-desktop/templates/Lead Wipe Template.docx'));
    if (doRepair && parts.length) repairZipParts(zip, parts);
    const doc = new Docxtemplater(zip, { paragraphLoop: true, linebreaks: true, nullGetter: () => '' });
    doc.render({
        projectNumber: 'TESTPROJ', clientName: 'Client', inspectorName: 'Insp', date: 'D', Bill2: 'B',
        dateCollected: 'DC', analysisType: 'A', laboratory: 'L', turnAroundTime: 'T', siteName: 'Site',
        spectialInstructions: 'I', inspectorEmail: 'E',
        samplesWipe: [{ sampleID: 'W01', substrate: 'S', component: 'C', quantity: '1', buildingName: 'B', spaceName: 'Sp', locationComment: 'Lc' }]
    });
    const all = Object.keys(doc.getZip().files).filter(k => /header1|document|footer1/.test(k)).map(k => doc.getZip().file(k).asText()).join('');
    const tags = all.match(/\{[#/]?[a-zA-Z][\w]*\}/g) || [];
    console.log(label, { leftover: tags.length, TESTPROJ: all.includes('TESTPROJ'), W01: all.includes('W01') });
}

test('no repair', [], false);
test('header only', ['header1']);
test('document only', ['document']);
test('footer only', ['footer1']);
test('all parts', ['header1', 'document', 'footer1']);
