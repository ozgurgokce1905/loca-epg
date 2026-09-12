// XMLTV birlestirici.
//
//   node merge.js <klasor> <cikis.xml> [onceki.xml]
//
// Kurallar:
//  * Bir kanalin programlari, o kanali ILK veren kaynaktan alinir. Boylece iki
//    kaynak ayni kanali verdiginde program listesi cakisip ikiye katlanmaz.
//  * Kaynak sirasi PRIORITY ile belirlenir; en sonda "onceki.xml" gelir, yani
//    bugun cekilemeyen bir kanal dunku veriyle ayakta kalir.
//  * Bitmis programlar (6 saatten eski) atilir, dosya kucuk kalir.

const fs = require('fs');
const path = require('path');

const dir = process.argv[2] || 'out';
const outFile = process.argv[3] || 'turkiye.xml';
const prevFile = process.argv[4] || '';

// Kanal sayisi ve veri kalitesine gore siralama.
const PRIORITY = ['tvplus.xml', 'digiturk.xml', 'turksat.xml', 'dsmart.xml'];

function inputs() {
  const files = [];
  if (fs.existsSync(dir)) {
    const found = fs.readdirSync(dir).filter((f) => f.endsWith('.xml'));
    for (const name of PRIORITY) {
      if (found.includes(name)) files.push(path.join(dir, name));
    }
    for (const name of found.sort()) {
      const full = path.join(dir, name);
      if (!files.includes(full)) files.push(full);
    }
  }
  if (prevFile && fs.existsSync(prevFile)) files.push(prevFile);
  return files;
}

// "20260912200000 +0300" -> ms
function toMs(value) {
  const m = /^(\d{4})(\d{2})(\d{2})(\d{2})(\d{2})(\d{2})(?:\s*([+-])(\d{2})(\d{2}))?/.exec(
    value || ''
  );
  if (!m) return null;
  let ms = Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4], +m[5], +m[6]);
  if (m[7]) {
    const offset = (+m[8] * 60 + +m[9]) * 60000;
    ms -= m[7] === '-' ? -offset : offset;
  }
  return ms;
}

const cutoff = Date.now() - 6 * 60 * 60 * 1000;

const channelXml = new Map(); // id -> <channel> blogu
const owner = new Map(); // id -> programlari veren dosya
const programs = new Map(); // id -> Map(start -> <programme> blogu)

for (const file of inputs()) {
  let xml;
  try {
    xml = fs.readFileSync(file, 'utf8');
  } catch (e) {
    console.log(`! okunamadi: ${file} (${e.message})`);
    continue;
  }

  for (const m of xml.matchAll(/<channel\b[^>]*\bid="([^"]+)"[\s\S]*?<\/channel>/g)) {
    if (!channelXml.has(m[1])) channelXml.set(m[1], m[0]);
  }

  let added = 0;
  let claimed = 0;
  for (const m of xml.matchAll(/<programme\b[^>]*>[\s\S]*?<\/programme>/g)) {
    const block = m[0];
    const head = block.slice(0, block.indexOf('>') + 1);
    const id = (/\bchannel="([^"]+)"/.exec(head) || [])[1];
    const start = (/\bstart="([^"]+)"/.exec(head) || [])[1];
    const stop = (/\bstop="([^"]+)"/.exec(head) || [])[1];
    if (!id || !start) continue;

    const stopMs = toMs(stop) ?? toMs(start);
    if (stopMs !== null && stopMs < cutoff) continue;

    // Kanal baska bir kaynaga ait: karistirmayalim.
    const holder = owner.get(id);
    if (holder && holder !== file) continue;
    if (!holder) {
      owner.set(id, file);
      claimed++;
    }

    if (!programs.has(id)) programs.set(id, new Map());
    const slot = programs.get(id);
    if (!slot.has(start)) {
      slot.set(start, block);
      added++;
    }
  }
  console.log(`${file}: +${claimed} kanal, ${added} program`);
}

const ids = [...programs.keys()].filter((id) => programs.get(id).size > 0).sort();

const out = [];
out.push('<?xml version="1.0" encoding="UTF-8"?>');
out.push('<tv generator-info-name="loca-epg">');
for (const id of ids) {
  out.push(channelXml.get(id) || `<channel id="${id}"><display-name>${id}</display-name></channel>`);
}
let total = 0;
for (const id of ids) {
  const slot = [...programs.get(id).entries()].sort((a, b) => (a[0] < b[0] ? -1 : 1));
  for (const [, block] of slot) {
    out.push(block);
    total++;
  }
}
out.push('</tv>');

fs.writeFileSync(outFile, out.join('\n'), 'utf8');
console.log(`--- SONUC: ${ids.length} kanal, ${total} program -> ${outFile}`);

if (total < 500) {
  console.error('Program sayisi cok dusuk, yayinlamaya deger bir dosya degil.');
  process.exit(1);
}
