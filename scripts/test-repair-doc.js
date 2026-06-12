const fs = require('fs');
function repairXml(xml) {
  xml = xml.replace(
    /<w:r[^>]*>(?:<w:rPr>[\s\S]*?<\/w:rPr>)?<w:t(?:\s[^>]*)?>\{\{<\/w:t><\/w:r>\s*(?:<w:proofErr[^>]*\/?>\s*)*<w:r[^>]*>(?:<w:rPr>[\s\S]*?<\/w:rPr>)?<w:t(?:\s[^>]*)?>([^<{}]+)<\/w:t><\/w:r>\s*(?:<w:proofErr[^>]*\/?>\s*)*<w:r[^>]*>(?:<w:rPr>[\s\S]*?<\/w:rPr>)?<w:t(?:\s[^>]*)?>\}\}<\/w:t><\/w:r>/g,
    (_m, tagName) => `<w:r><w:rPr><w:rFonts w:ascii="Arial" w:hAnsi="Arial" w:cs="Arial"/></w:rPr><w:t>{${tagName.trim()}}</w:t></w:r>`
  );
  xml = xml.replace(
    /<w:r[^>]*>(?:<w:rPr>[\s\S]*?<\/w:rPr>)?<w:t(?:\s[^>]*)?>\{<\/w:t><\/w:r>\s*(?:<w:proofErr[^>]*\/?>\s*)*<w:r[^>]*>(?:<w:rPr>[\s\S]*?<\/w:rPr>)?<w:t(?:\s[^>]*)?>([^<{}]+)<\/w:t><\/w:r>\s*(?:<w:proofErr[^>]*\/?>\s*)*<w:r[^>]*>(?:<w:rPr>[\s\S]*?<\/w:rPr>)?<w:t(?:\s[^>]*)?>\}<\/w:t><\/w:r>/g,
    (_m, tagName) => {
      const name = tagName.trim();
      if (!/^[\w#/.]+$/.test(name)) return _m;
      return `<w:r><w:rPr><w:rFonts w:ascii="Arial" w:hAnsi="Arial" w:cs="Arial"/></w:rPr><w:t>{${name}}</w:t></w:r>`;
    }
  );
  return xml;
}
const doc = fs.readFileSync('D:/oversight-desktop/templates/_dbg_unzip/word/document.xml', 'utf8');
const fixed = repairXml(doc);
const lone = (s) => (s.match(/<w:t>\{<\/w:t>/g) || []).length;
const merged = (fixed.match(/<w:t>\{[#/]?[^}<]+\}<\/w:t>/g) || []);
console.log('lone { before', lone(doc), 'after', lone(fixed));
console.log('merged', merged);
const i = doc.indexOf('client');
if (i >= 0) console.log('client ctx', doc.substring(i-80, i+80));
