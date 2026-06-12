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

function normalizeDocxZipPaths(zip) {
    Object.keys(zip.files).forEach(path => {
        if (!path.includes('\\')) return;
        const normalized = path.replace(/\\/g, '/');
        const file = zip.file(path);
        if (file) {
            zip.file(normalized, file.asText());
            delete zip.files[path];
        }
    });
}

function repairZip(zip) {
    normalizeDocxZipPaths(zip);
    Object.keys(zip.files).forEach(p => {
        if (!/^word[\\/](document|header\d+|footer\d+)\.xml$/i.test(p)) return;
        const orig = zip.file(p).asText();
        const fixed = repairDocxPlaceholderXml(orig);
        if (fixed !== orig) zip.file(p, fixed);
    });
}

function test(label, path, data) {
    const zip = new PizZip(fs.readFileSync(path));
    repairZip(zip);
    const doc = new Docxtemplater(zip, { paragraphLoop: true, linebreaks: true, nullGetter: () => '' });
    doc.render(data);
    const out = doc.getZip();
    const all = Object.keys(out.files).filter(k => /word[\\/](header1|document|footer1)\.xml$/i.test(k)).map(k => out.file(k).asText()).join('');
    const tags = all.match(/\{[#/]?[a-zA-Z][\w]*\}/g) || [];
    console.log(label, { leftover: tags.length, TESTPROJ: all.includes('TESTPROJ'), W01: all.includes('W01') });
}

test('WIPE npm', 'D:/oversight-desktop/templates/Lead Wipe Template.docx', {
    date: '06/09/2026', projectNumber: 'TESTPROJ', clientName: 'Test Client', client: 'Test Client', inspectorName: 'Inspector', Bill2: '123',
    dateCollected: '06/09/2026', analysisType: 'Lead', laboratory: 'Lab', turnAroundTime: '24h', siteName: 'Site',
    spectialInstructions: 'none', inspectorEmail: 'a@b.com',
    samplesWipe: [{ sampleID: 'W01', substrate: 'Floor', component: 'Tile', quantity: '1', buildingName: 'B1', spaceName: 'R1', locationComment: 'c' }]
});
test('BULK npm', 'D:/oversight-desktop/templates/Bulk Sample Template.docx', {
    date: '06/09/2026', projectNumber: 'TESTPROJ', inspectorName: 'Inspector', datesCollected: '06/09/2026',
    analysisType: 'PLM', siteName: 'Site', materialName: 'VAT', samplesBulk: [{ sampleID: 'B01', sampleDescription: 'd' }], samples: [{ sampleID: 'B01', sampleDescription: 'd' }]
});
