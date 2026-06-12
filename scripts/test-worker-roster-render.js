const fs = require('fs');
const AdmZip = require('adm-zip');
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
    Object.keys(zip.files).forEach((filePath) => {
        if (!/^word[\\/](document|header\d+|footer\d+)\.xml$/i.test(filePath)) return;
        const file = zip.file(filePath);
        if (!file) return;
        const original = file.asText();
        const xml = repairDocxPlaceholderXml(original);
        if (xml !== original) zip.file(filePath, xml);
    });
}

const WORKER_ROSTER_EXPIRED_DATE_FIELDS = [
    'aheraExpired', 'medicalExpired', 'respiratorExpired', 'leadExpired', 'leadMedExpired'
];

function collectWorkerRosterExpiredDates(rosterRows) {
    const dates = new Set();
    (rosterRows || []).forEach(row => {
        WORKER_ROSTER_EXPIRED_DATE_FIELDS.forEach(field => {
            const value = row && row[field];
            if (value && String(value).trim()) dates.add(String(value).trim());
        });
    });
    return dates;
}

function colorDocxRunTextRed(xml, text) {
    if (!xml || !text) return xml;
    const escaped = text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const textTag = `<w:t(?:\\s[^>]*)?>${escaped}</w:t>`;
    xml = xml.replace(
        new RegExp(`(<w:r(?:\\s[^>]*)?>\\s*<w:rPr(?:\\s[^>]*)?>)([\\s\\S]*?)(</w:rPr>\\s*${textTag}</w:r>)`, 'g'),
        (match, open, inner, close) => {
            if (/w:color w:val="(?:EE0000|FF0000)"/.test(inner)) return match;
            return `${open}${inner}<w:color w:val="EE0000"/>${close}`;
        }
    );
    xml = xml.replace(
        new RegExp(`(<w:r(?:\\s[^>]*)?>)\\s*${textTag}</w:r>`, 'g'),
        `<w:r><w:rPr><w:color w:val="EE0000"/></w:rPr><w:t>${text}</w:t></w:r>`
    );
    return xml;
}

function applyWorkerRosterExpiredRed(zip, rosterRows) {
    if (!zip || typeof zip.file !== 'function') return;
    const expiredDates = collectWorkerRosterExpiredDates(rosterRows);
    if (expiredDates.size === 0) return;
    Object.keys(zip.files).forEach(path => {
        if (!/^word[\\/](document|header\d+|footer\d+)\.xml$/i.test(path)) return;
        const file = zip.file(path);
        if (!file) return;
        let xml = file.asText();
        let changed = false;
        expiredDates.forEach(dateStr => {
            const next = colorDocxRunTextRed(xml, dateStr);
            if (next !== xml) {
                xml = next;
                changed = true;
            }
        });
        if (changed) zip.file(path, xml);
    });
}

function isDateExpired(dateStr) {
    if (!dateStr) return false;
    return new Date(dateStr + 'T23:59:59') < new Date();
}

function formatCertDate(dateValue) {
    if (!dateValue) return '';
    const date = new Date(dateValue + (String(dateValue).includes('T') ? '' : 'T00:00:00'));
    if (isNaN(date.getTime())) return '';
    const mm = String(date.getMonth() + 1).padStart(2, '0');
    const dd = String(date.getDate()).padStart(2, '0');
    const yy = String(date.getFullYear()).slice(-2);
    return `${mm}/${dd}/${yy}`;
}

function buildRow(w) {
    const dateOrBlank = (dateVal, exp) => (exp ? formatCertDate(dateVal) : '');
    const dateOrBlankRed = (dateVal, exp) => (exp ? '' : formatCertDate(dateVal));
    const aheraExpired = isDateExpired(w.aheraExpiration);
    const medicalExpired = isDateExpired(w.medicalExpiration);
    return {
        workerName: w.name || '',
        mark1: '', mark2: '', mark3: '', mark4: '', mark5: '',
        mark6: '', mark7: '', mark8: '', mark9: '', mark10: '',
        aheraExp: dateOrBlankRed(w.aheraExpiration, aheraExpired),
        aheraExpired: dateOrBlank(w.aheraExpiration, aheraExpired),
        sOrW: 'W',
        medicalExp: dateOrBlankRed(w.medicalExpiration, medicalExpired),
        medicalExpired: dateOrBlank(w.medicalExpiration, medicalExpired),
        respiratorExp: '', respiratorExpired: '', leadExp: '', leadExpired: '',
        leadMedExp: '', leadMedExpired: ''
    };
}

const past = new Date();
past.setFullYear(past.getFullYear() - 1);
const future = new Date();
future.setFullYear(future.getFullYear() + 1);

const workers = [
    { name: 'Never Worked', aheraExpiration: past.toISOString().slice(0, 10), medicalExpiration: future.toISOString().slice(0, 10) },
    { name: 'Worked Daily', aheraExpiration: future.toISOString().slice(0, 10), medicalExpiration: past.toISOString().slice(0, 10) }
];

const roster = workers.map(buildRow);
const buf = fs.readFileSync('templates/Worker Roster Template.docx');
const zip = new PizZip(buf);
repairDocxPlaceholderTags(zip);
const doc = new Docxtemplater(zip, {
    paragraphLoop: true,
    linebreaks: true,
    delimiters: { start: '{', end: '}' }
});
doc.render({
    client: 'Test Client',
    pjNumber: 'PJ-001',
    date1: '', date2: '', date3: '', date4: '', date5: '',
    date6: '', date7: '', date8: '', date9: '', date10: '',
    roster,
    dailyRoster: []
});
applyWorkerRosterExpiredRed(doc.getZip(), roster);
const out = doc.getZip().generate({ type: 'nodebuffer' });
fs.writeFileSync('test-roster-out.docx', out);

const outDoc = new AdmZip(out).readAsText('word/document.xml');
const expiredAhera = formatCertDate(workers[0].aheraExpiration);
const expiredMedical = formatCertDate(workers[1].medicalExpiration);
const validAhera = formatCertDate(workers[1].aheraExpiration);

function colorNearDate(docXml, dateStr) {
    const idx = docXml.indexOf(dateStr);
    if (idx < 0) return 'date not found';
    const chunk = docXml.slice(Math.max(0, idx - 400), idx + 100);
    return chunk.includes('EE0000') || chunk.includes('FF0000') ? 'RED' : 'NOT RED';
}

console.log('Workers in output:', workers.map(w => w.name).map(n => outDoc.includes(n)));
console.log('Expired ahera color:', colorNearDate(outDoc, expiredAhera));
console.log('Expired medical color:', colorNearDate(outDoc, expiredMedical));
console.log('Valid ahera color:', colorNearDate(outDoc, validAhera));
console.log('Red color tags (EE0000):', (outDoc.match(/w:color w:val="EE0000"/g) || []).length);
