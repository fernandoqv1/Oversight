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
        (_m, part1, part2) => {
            const name = (part1 + part2).trim();
            if (!/^[\w#/.]+$/.test(name)) return _m;
            return mergedRun(`{${name}}`);
        }
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

function repairDocxPlaceholderTags(zip) {
    Object.keys(zip.files).forEach(filePath => {
        if (!/^word[\\/](document|header\d+|footer\d+)\.xml$/i.test(filePath)) return;
        const file = zip.file(filePath);
        if (!file) return;
        const original = file.asText();
        const xml = repairDocxPlaceholderXml(original);
        if (xml !== original) zip.file(filePath, xml);
    });
}

function normalizeDocxZipPaths(zip) {
    if (!zip || typeof zip.file !== 'function' || !zip.files) return;
    Object.keys(zip.files).forEach(path => {
        if (!path.includes('\\')) return;
        const normalized = path.replace(/\\/g, '/');
        if (normalized === path) return;
        const fileObj = zip.files[path];
        if (!fileObj) return;
        if (!zip.files[normalized]) {
            const content = typeof fileObj.asUint8Array === 'function'
                ? fileObj.asUint8Array()
                : fileObj.asBinary();
            zip.file(normalized, content, { binary: true });
        }
        delete zip.files[path];
    });
}

function repairDocxPlaceholderTagsWithNormalize(zip) {
    normalizeDocxZipPaths(zip);
    repairDocxPlaceholderTags(zip);
}

function getPart(zip, name) {
    return zip.file(`word/${name}`) || zip.file(`word\\${name}`);
}

function countPlaceholders(zip) {
    let n = 0;
    const found = [];
    ['header1.xml', 'document.xml', 'footer1.xml'].forEach(name => {
        const f = getPart(zip, name);
        if (!f) return;
        const t = f.asText();
        const lone = (t.match(/<w:t(?:\s[^>]*)?>\{<\/w:t>/g) || []).length;
        const splitClose = (t.match(/<w:t(?:\s[^>]*)?>\{\/<\/w:t>/g) || []).length;
        n += lone + splitClose;
        const tags = t.match(/\{[#/]?[a-zA-Z][a-zA-Z0-9]*\}/g) || [];
        found.push(...tags);
    });
    return { n, found };
}

function testTemplate(docxPath, templateData, label) {
    const buf = fs.readFileSync(docxPath);
    const zip = new PizZip(buf);
    const docBefore = getPart(zip, 'document.xml')?.asText() || '';
    repairDocxPlaceholderTagsWithNormalize(zip);
    const docAfterRepair = getPart(zip, 'document.xml')?.asText() || '';
    const loneAfterRepair = (docAfterRepair.match(/<w:t(?:\s[^>]*)?>\{<\/w:t>/g) || []).length;
    const intactAfterRepair = (docAfterRepair.match(/<w:t(?:\s[^>]*)?>\{[#/]?[^}<]+\}<\/w:t>/g) || []).map(t => t.replace(/<[^>]+>/g, ''));
    let doc;
    try {
        doc = new Docxtemplater(zip, {
            paragraphLoop: true,
            linebreaks: true,
            delimiters: { start: '{', end: '}' },
            nullGetter: () => ''
        });
        doc.render(templateData);
    } catch (e) {
        console.log(label, 'RENDER ERROR', e.message, e.properties?.errors?.slice?.(0, 2));
        return;
    }
    const out = doc.getZip();
    const docAfter = getPart(out, 'document.xml')?.asText() || '';
    const { n, found } = countPlaceholders(out);
    const outText = ['header1.xml', 'document.xml', 'footer1.xml']
        .map(name => getPart(out, name)?.asText() || '').join('\n');
    const plain = outText.replace(/<[^>]+>/g, '');
    console.log(label, {
        docLenBefore: docBefore.length,
        docLenAfterRepair: docAfterRepair.length,
        docLenAfterRender: docAfter.length,
        loneAfterRepair,
        intactAfterRepair,
        remainingSplitBraces: n,
        leftoverTags: found,
        hasProjectNumber: outText.includes('{projectNumber}'),
        plainIncludesTestProj: plain.includes('TESTPROJ'),
        plainIncludesW01: plain.includes('W01'),
        plainIncludesTestClient: plain.includes('Test Client'),
        plainSnippet: plain.replace(/\s+/g, ' ').slice(0, 500)
    });
}

const wipeData = {
    date: '06/09/2026', projectNumber: 'TESTPROJ', siteName: 'Test Site', clientName: 'Test Client',
    client: 'Test Client', inspectorName: 'Inspector', dateCollected: '06/09/2026',
    analysisType: 'Lead by NIOSH 7300 (ICP)', turnAroundTime: '24h', spectialInstructions: 'none',
    inspectorEmail: 'a@b.com', laboratory: 'Lab', Bill2: '123',
    samplesWipe: [{ sampleID: 'W01', substrate: 'Floor', component: 'Tile', quantity: '1', buildingName: 'B1', spaceName: 'R1', locationComment: 'c' }]
};

const bulkData = {
    date: '06/09/2026', projectNumber: 'TESTPROJ', inspectorName: 'Inspector', datesCollected: '06/09/2026',
    analysisType: 'PLM', siteName: 'Site', materialName: 'VAT', samplesBulk: [{ sampleID: 'B01', sampleDescription: 'd' }],
    samples: [{ sampleID: 'B01', sampleDescription: 'd' }]
};

testTemplate('D:/oversight-desktop/templates/Lead Wipe Template.docx', wipeData, 'WIPE');
try {
    testTemplate('D:/oversight-desktop/templates/Bulk Sample Template.docx', bulkData, 'BULK');
} catch (e) {
    console.log('BULK skipped or failed:', e.message || e);
}
