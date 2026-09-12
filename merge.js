// Birden çok XMLTV dosyasını tek dosyaya birleştirir.
// Amaç basitlik: <channel> ve <programme> düğümlerini olduğu gibi taşıyoruz,
// aynı kanal iki kaynakta varsa ilk gelen kalır.

const fs = require('fs');
const path = require('path');

const [inputDir, outputPath] = process.argv.slice(2);
if (!inputDir || !outputPath) {
  console.error('kullanım: node merge.js <girdi-klasörü> <çıktı.xml>');
  process.exit(1);
}

if (!fs.existsSync(inputDir)) {
  console.error(`girdi klasörü yok: ${inputDir} — hiçbir kaynak veri üretmemiş`);
  process.exit(1);
}

const files = fs
  .readdirSync(inputDir)
  .filter((f) => f.endsWith('.xml'))
  .map((f) => path.join(inputDir, f));

if (files.length === 0) {
  console.error('birleştirilecek .xml bulunamadı');
  process.exit(1);
}

const seenChannels = new Set();
const channels = [];
const programmes = [];

for (const file of files) {
  const xml = fs.readFileSync(file, 'utf8');

  for (const match of xml.matchAll(/<channel\b[\s\S]*?<\/channel>/g)) {
    const block = match[0];
    const id = (block.match(/id="([^"]*)"/) || [])[1] || '';
    if (!id || seenChannels.has(id)) continue;
    seenChannels.add(id);
    channels.push(block);
  }

  for (const match of xml.matchAll(/<programme\b[\s\S]*?<\/programme>/g)) {
    programmes.push(match[0]);
  }

  console.log(`${path.basename(file)}: okundu`);
}

const out = [
  '<?xml version="1.0" encoding="UTF-8"?>',
  '<tv generator-info-name="loca-epg">',
  ...channels,
  ...programmes,
  '</tv>',
  '',
].join('\n');

fs.writeFileSync(outputPath, out, 'utf8');
console.log(`\n${outputPath}: ${channels.length} kanal, ${programmes.length} program`);
