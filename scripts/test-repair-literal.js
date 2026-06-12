const fs = require('fs');
global.window = global;
require('../lib/pizzip.min.js');
const z = new global.PizZip(fs.readFileSync('D:/oversight-desktop/templates/Lead Wipe Template.docx'));
const key = Object.keys(z.files).find(k => /document\.xml$/i.test(k));
let xml = z.file(key).asText();
console.log('start', xml.length);

const mergedRun = (tag) => `<w:r><w:rPr><w:rFonts w:ascii="Arial" w:hAnsi="Arial" w:cs="Arial"/></w:rPr><w:t>${tag}</w:t></w:r>`;

// Original-style literal regexes only
xml = xml.replace(
    /(<w:r[^>]*>(?:<w:rPr>[\s\S]*?<\/w:rPr>)?)<w:t(?:\s[^>]*)?>\{([#\/]?[\w.]+)\}([^<{}]+)<\/w:t><\/w:r>/g,
    (_m, rOpen, tag, trailing) => `${rOpen}<w:t>{${tag}}</w:t></w:r>${mergedRun(trailing)}`
);
console.log('after trailing', xml.length);

xml = xml.replace(
    /(<w:r[^>]*>(?:<w:rPr>[\s\S]*?<\/w:rPr>)?)<w:t(?:\s[^>]*)?>\} \{<\/w:t><\/w:r>/g,
    '$1<w:t>}</w:t></w:r><w:r><w:rPr><w:rFonts w:ascii="Arial" w:hAnsi="Arial" w:cs="Arial"/></w:rPr><w:t>{</w:t></w:r>'
);
console.log('after split', xml.length);

xml = xml.replace(
    /<w:r[^>]*>(?:<w:rPr>[\s\S]*?<\/w:rPr>)?<w:t(?:\s[^>]*)?>\{\/<\/w:t><\/w:r>\s*(?:<w:proofErr[^>]*\/?>\s*)*<w:r[^>]*>(?:<w:rPr>[\s\S]*?<\/w:rPr>)?<w:t(?:\s[^>]*)?>([^<{}]+)<\/w:t><\/w:r>\s*(?:<w:proofErr[^>]*\/?>\s*)*<w:r[^>]*>(?:<w:rPr>[\s\S]*?<\/w:rPr>)?<w:t(?:\s[^>]*)?>\}<\/w:t><\/w:r>/g,
    (_m, tagName) => mergedRun(`{/${tagName.trim()}}`)
);
console.log('after close-loop', xml.length);

xml = xml.replace(
    /<w:r[^>]*>(?:<w:rPr>[\s\S]*?<\/w:rPr>)?<w:t(?:\s[^>]*)?>\{<\/w:t><\/w:r>\s*(?:<w:proofErr[^>]*\/?>\s*)*<w:r[^>]*>(?:<w:rPr>[\s\S]*?<\/w:rPr>)?<w:t(?:\s[^>]*)?>([^<{}]+)<\/w:t><\/w:r>\s*(?:<w:proofErr[^>]*\/?>\s*)*<w:r[^>]*>(?:<w:rPr>[\s\S]*?<\/w:rPr>)?<w:t(?:\s[^>]*)?>([^<{}]+)<\/w:t><\/w:r>\s*(?:<w:proofErr[^>]*\/?>\s*)*<w:r[^>]*>(?:<w:rPr>[\s\S]*?<\/w:rPr>)?<w:t(?:\s[^>]*)?>\}<\/w:t><\/w:r>/g,
    (_m, p1, p2) => mergedRun(`{${(p1 + p2).trim()}}`)
);
console.log('after four-run', xml.length);

xml = xml.replace(
    /<w:r[^>]*>(?:<w:rPr>[\s\S]*?<\/w:rPr>)?<w:t(?:\s[^>]*)?>\{<\/w:t><\/w:r>\s*(?:<w:proofErr[^>]*\/?>\s*)*<w:r[^>]*>(?:<w:rPr>[\s\S]*?<\/w:rPr>)?<w:t(?:\s[^>]*)?>([^<{}]+)<\/w:t><\/w:r>\s*(?:<w:proofErr[^>]*\/?>\s*)*<w:r[^>]*>(?:<w:rPr>[\s\S]*?<\/w:rPr>)?<w:t(?:\s[^>]*)?>\}<\/w:t><\/w:r>/g,
    (_m, tagName) => {
        const name = tagName.trim();
        if (!/^[\w#/.]+$/.test(name)) return _m;
        return mergedRun(`{${name}}`);
    }
);
console.log('after three-run', xml.length);

const intact = (xml.match(/<w:t(?:\s[^>]*)?>\{[#/]?[^}<]+\}<\/w:t>/g) || []).map(t => t.replace(/<[^>]+>/g, ''));
console.log('intact', intact);
console.log('lone', (xml.match(/<w:t(?:\s[^>]*)?>\{<\/w:t>/g) || []).length);
