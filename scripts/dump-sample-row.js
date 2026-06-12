const fs = require('fs');
global.window = global;
require('../lib/pizzip.min.js');
const z = new global.PizZip(fs.readFileSync('D:/oversight-desktop/templates/Lead Wipe Template.docx'));
const key = Object.keys(z.files).find(k => /document\.xml$/i.test(k));
const xml = z.file(key).asText();
['buildingName', 'spaceName', 'sampleID', '} {'].forEach(needle => {
    const i = xml.indexOf(needle);
    console.log('\n===', needle, 'at', i, '===');
    if (i >= 0) console.log(xml.substring(i - 120, i + 200));
});
