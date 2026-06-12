const fs = require('fs');
global.window = global;
require('../lib/pizzip.min.js');
const { repairDocxPlaceholderXml } = (() => {
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
    return { repairDocxPlaceholderXml };
})();

const z = new global.PizZip(fs.readFileSync('D:/oversight-desktop/templates/Lead Wipe Template.docx'));
const key = Object.keys(z.files).find(k => /header1\.xml$/i.test(k));
const before = z.file(key).asText();
const after = repairDocxPlaceholderXml(before);
console.log('header len before', before.length, 'after', after.length);
console.log('lone before', (before.match(/<w:t(?:\s[^>]*)?>\{<\/w:t>/g)||[]).length, 'after', (after.match(/<w:t(?:\s[^>]*)?>\{<\/w:t>/g)||[]).length);
const intact = (after.match(/<w:t(?:\s[^>]*)?>\{[#/]?[^}<]+\}<\/w:t>/g)||[]).map(t=>t.replace(/<[^>]+>/g,''));
console.log('intact after repair', intact);
