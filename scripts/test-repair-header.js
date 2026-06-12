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
const header = fs.readFileSync('D:/oversight-desktop/templates/_dbg_unzip/word/header1.xml', 'utf8');
const fixed = repairXml(header);
const countBefore = (header.match(/<w:t>\{<\/w:t>/g) || []).length;
const countAfter = (fixed.match(/<w:t>\{<\/w:t>/g) || []).length;
const loneBraceBefore = (header.match(/<w:t>\{<\/w:t>/g) || []).length;
const loneBraceAfter = (fixed.match(/<w:t>\{<\/w:t>/g) || []).length;
const merged = (fixed.match(/<w:t>\{[a-zA-Z#][^}<]*\}<\/w:t>/g) || []);
console.log('lone { before', loneBraceBefore, 'after', loneBraceAfter);
console.log('merged tags', merged.length, merged.slice(0, 15));
