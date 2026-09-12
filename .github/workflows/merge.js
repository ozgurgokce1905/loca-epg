const fs = require('fs');
const path = require('path');

const [inputDir, outputPath] = process.argv.slice(2);
if (!inputDir || !outputPath) {
  console.error('kullanim: node merge.js <girdi-klasoru> <cikti.xml>');
  process.exit(1);
}
if (!fs.existsSync(inputDir)) {
  console.error('girdi klasoru yok: ' + inputDir);
  process.exit(1);
}

const files = fs.readdirSync(inputDir)
  .filter((f) => f.endsWith('.xml'))
  .map((f) => path.join(inputDir, f));

if (files.length === 0) {
  console.error('birlestirilecek .xml bulunamadi');
  process.exit(1);
}

const seen = new Set();
const channels = [];
const programmes = [];

for (const file of files) {
  const xml = fs.readFileSync(file, 'utf8');
  for (const m of xml.matchAll(/<channel\b[\s\S]*?<\/channel>/g)) {
    const id = (m[0].match(/id="([^"]*)"/) || [])[1] || '';
    if (!id || seen.has(id)) continue;
    seen.add(id);
    channels.push(m[0]);
  }
  for (const m of xml.matchAll(/<programme\b[\s\S]*?<\/programme>/g)) {
    programmes.push(m[0]);
  }
  console.log(path.basename(file) + ': okundu');
}

fs.writeFileSync(outputPath, [
  '<?xml version="1.0" encoding="UTF-8"?>',
  '<tv generator-info-name="loca-epg">',
  ...channels,
  ...programmes,
  '</tv>',
  '',
].join('\n'), 'utf8');

console.log(outputPath + ': ' + channels.length + ' kanal, ' + programmes.length + ' program');
