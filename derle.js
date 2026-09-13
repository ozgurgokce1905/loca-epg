// XMLTV derleyici — ulke basina rehber uretir.
//
//   node derle.js            hepsini derler
//   node derle.js tr bg      yalnizca verilen ulkeleri derler (deneme icin)
//
// Akis:
//   1. epgshare01 dizin listesini okur, secili ulkelerin hazir XMLTV
//      dokumlerini indirir. Bunlari baskasi topluyor; site HTML'i degisince
//      bizim is kirilmiyor.
//   2. Turkiye icin ayrica iptv-org toplayicisinin ciktilarini ekler
//      (grabber/out/*.xml) — Turkce program aciklamalari daha iyi.
//   3. Dunku yayini en sona koyar: bugun hicbir kaynaktan gelmeyen bir kanal
//      listeden dusmez.
//   4. Biten programlari atar, cok ileri tarihlileri kirpar.
//   5. out/<kod>.xml ve out/<kod>.xml.gz yazar, ozeti index.json'a koyar.
//
// Bagimlilik yok: yalnizca Node 18+ (global fetch) ve dahili modiller.

const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

const BASE = 'https://epgshare01.online/epgshare01/';
const OUT = 'out';
const ONCEKI = 'onceki';
const GRABBER = 'grabber/out';

// epgshare ustundeki dosya adlari  epg_ripper_<ONEK><sayi>.xml.gz  seklinde.
// Bir ulke birden fazla onekle gecebiliyor (UK / GB gibi), hepsini deniyoruz.
//
// Kalibin disinda kalan dosyalar icin "ekDosyalar" var: Rusya'nin ulke
// dosyasi yok, yerine adi tamamen farkli olan tek bir dosya duruyor.
const ULKELER = [
  { kod: 'tr', ad: 'Türkiye', onekler: ['TR'] },
  { kod: 'gb', ad: 'Birleşik Krallık', onekler: ['UK', 'GB'] },
  { kod: 'us', ad: 'Amerika Birleşik Devletleri', onekler: ['US'] },
  { kod: 'de', ad: 'Almanya', onekler: ['DE'] },
  { kod: 'fr', ad: 'Fransa', onekler: ['FR'] },
  { kod: 'es', ad: 'İspanya', onekler: ['ES'] },
  { kod: 'it', ad: 'İtalya', onekler: ['IT'] },
  { kod: 'pt', ad: 'Portekiz', onekler: ['PT'] },
  { kod: 'nl', ad: 'Hollanda', onekler: ['NL'] },
  {
    kod: 'ru',
    ad: 'Rusya',
    onekler: ['RU'],
    ekDosyalar: ['epg_ripper_viva-russia.ru.xml.gz'],
  },
  { kod: 'gr', ad: 'Yunanistan', onekler: ['GR'] },
  { kod: 'bg', ad: 'Bulgaristan', onekler: ['BG'] },
];

// Bir ulke bu sayidan az program veriyorsa yayinlamiyoruz; onun yerine dunku
// dosya oldugu gibi kaliyor. Bozuk rehber, eski rehberden kotudur.
const EN_AZ_PROGRAM = 200;

// Tek ulkede bellegi tasirmamak icin ust sinir.
const EN_COK_PROGRAM = 400000;

// Indirilen bir dokum acildiginda bundan buyukse atlaniyor (bayt).
const EN_BUYUK_XML = 300 * 1024 * 1024;

const ALT_SINIR = Date.now() - 6 * 60 * 60 * 1000; // biteli 6 saat olanlar
const UST_SINIR = Date.now() + 10 * 24 * 60 * 60 * 1000; // 10 gunden ilerisi

// --------------------------------------------------------------- yardimci ----

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

function mb(bayt) {
  return `${(bayt / 1024 / 1024).toFixed(1)} MB`;
}

async function dizinListesi() {
  try {
    const res = await fetch(BASE, { headers: { 'User-Agent': 'loca-epg' } });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const html = await res.text();
    const adlar = new Set();
    for (const m of html.matchAll(/(epg_ripper_[A-Za-z0-9_]+\.xml\.gz)/g)) {
      adlar.add(m[1]);
    }
    return [...adlar];
  } catch (e) {
    console.log(`! dizin listesi alinamadi: ${e.message}`);
    return [];
  }
}

function ulkeDosyalari(liste, ulke) {
  const bulunan = [];
  for (const onek of ulke.onekler) {
    const kalip = new RegExp(`^epg_ripper_${onek}\\d*\\.xml\\.gz$`, 'i');
    for (const ad of liste) {
      if (kalip.test(ad) && !bulunan.includes(ad)) bulunan.push(ad);
    }
  }
  for (const ad of ulke.ekDosyalar || []) {
    if (liste.includes(ad) && !bulunan.includes(ad)) bulunan.push(ad);
  }
  return bulunan.sort();
}

// Bir ulke icin hicbir dosya bulunamadiginda, adinda onek gecen dosyalari
// yaz. Boyle bir gun gelirse hangi ada tasindigini log'dan gorebiliyoruz.
function benzerleriYaz(liste, ulke) {
  const adaylar = liste.filter((ad) =>
    ulke.onekler.some((o) => ad.toUpperCase().includes(o.toUpperCase()))
  );
  if (adaylar.length) console.log(`  benzer dosyalar: ${adaylar.join(', ')}`);
}

async function indirVeAc(ad) {
  try {
    const res = await fetch(BASE + ad, { headers: { 'User-Agent': 'loca-epg' } });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const gz = Buffer.from(await res.arrayBuffer());
    const xml = zlib.gunzipSync(gz);
    if (xml.length > EN_BUYUK_XML) {
      console.log(`  ! ${ad} cok buyuk (${mb(xml.length)}), atlandi`);
      return null;
    }
    console.log(`  ${ad}  ${mb(gz.length)} -> ${mb(xml.length)}`);
    return xml.toString('utf8');
  } catch (e) {
    console.log(`  ! ${ad} alinamadi: ${e.message}`);
    return null;
  }
}

function oncekiniOku(kod) {
  const yol = path.join(ONCEKI, `${kod}.xml.gz`);
  if (!fs.existsSync(yol)) return null;
  try {
    return zlib.gunzipSync(fs.readFileSync(yol)).toString('utf8');
  } catch (e) {
    console.log(`  ! onceki ${kod} okunamadi: ${e.message}`);
    return null;
  }
}

function grabberCiktilari() {
  if (!fs.existsSync(GRABBER)) return [];
  return fs
    .readdirSync(GRABBER)
    .filter((f) => f.endsWith('.xml'))
    .sort()
    .map((f) => path.join(GRABBER, f));
}

// ------------------------------------------------------------- birlestirme ----

// Kaynaklar sirayla isleniyor. Bir kanalin programlari onu ILK veren kaynaga
// ait; ikinci kaynak ayni kanali verdiginde program listesi cakisip ikiye
// katlanmiyor.
function birlestir(kaynaklar) {
  const channelXml = new Map(); // id -> <channel> blogu
  const sahip = new Map(); // id -> kanali veren kaynak
  const programlar = new Map(); // id -> Map(start -> <programme> blogu)
  let toplam = 0;
  let doldu = false;

  for (const kaynak of kaynaklar) {
    const xml = kaynak.xml;
    if (!xml) continue;

    for (const m of xml.matchAll(/<channel\b[^>]*\bid="([^"]+)"[\s\S]*?<\/channel>/g)) {
      if (!channelXml.has(m[1])) channelXml.set(m[1], m[0]);
    }

    let eklenen = 0;
    let yeniKanal = 0;

    for (const m of xml.matchAll(/<programme\b[^>]*>[\s\S]*?<\/programme>/g)) {
      if (toplam >= EN_COK_PROGRAM) {
        doldu = true;
        break;
      }

      const blok = m[0];
      const bas = blok.slice(0, blok.indexOf('>') + 1);
      const id = (/\bchannel="([^"]+)"/.exec(bas) || [])[1];
      const start = (/\bstart="([^"]+)"/.exec(bas) || [])[1];
      const stop = (/\bstop="([^"]+)"/.exec(bas) || [])[1];
      if (!id || !start) continue;

      const basMs = toMs(start);
      const bitMs = toMs(stop) ?? basMs;
      if (bitMs !== null && bitMs < ALT_SINIR) continue;
      if (basMs !== null && basMs > UST_SINIR) continue;

      const kim = sahip.get(id);
      if (kim && kim !== kaynak.ad) continue;
      if (!kim) {
        sahip.set(id, kaynak.ad);
        yeniKanal++;
      }

      if (!programlar.has(id)) programlar.set(id, new Map());
      const yuva = programlar.get(id);
      if (!yuva.has(start)) {
        yuva.set(start, blok);
        eklenen++;
        toplam++;
      }
    }

    console.log(`  ${kaynak.ad}: +${yeniKanal} kanal, ${eklenen} program`);
    if (doldu) {
      console.log('  ! ust sinira ulasildi, kalan kaynaklar atlandi');
      break;
    }
  }

  return { channelXml, programlar, toplam };
}

function yaz(kod, sonuc) {
  const idler = [...sonuc.programlar.keys()]
    .filter((id) => sonuc.programlar.get(id).size > 0)
    .sort();

  const yol = path.join(OUT, `${kod}.xml`);
  const akis = fs.createWriteStream(yol, { encoding: 'utf8' });

  akis.write('<?xml version="1.0" encoding="UTF-8"?>\n');
  akis.write('<tv generator-info-name="loca-epg">\n');

  for (const id of idler) {
    const blok =
      sonuc.channelXml.get(id) ||
      `<channel id="${id}"><display-name>${id}</display-name></channel>`;
    akis.write(blok + '\n');
  }

  let program = 0;
  for (const id of idler) {
    const yuva = [...sonuc.programlar.get(id).entries()].sort((a, b) =>
      a[0] < b[0] ? -1 : 1
    );
    for (const [, blok] of yuva) {
      akis.write(blok + '\n');
      program++;
    }
  }

  akis.write('</tv>\n');

  return new Promise((cozul, hata) => {
    akis.on('error', hata);
    akis.end(() => {
      const gz = zlib.gzipSync(fs.readFileSync(yol), { level: 9 });
      fs.writeFileSync(path.join(OUT, `${kod}.xml.gz`), gz);
      cozul({ kanal: idler.length, program, boyut: gz.length });
    });
  });
}

// Dunku dosyayi oldugu gibi tasi: bugun yeterli veri gelmedi.
function oncekiniTasi(kod) {
  const kaynak = path.join(ONCEKI, `${kod}.xml.gz`);
  if (!fs.existsSync(kaynak)) return null;
  const gz = fs.readFileSync(kaynak);
  const xml = zlib.gunzipSync(gz);
  fs.writeFileSync(path.join(OUT, `${kod}.xml`), xml);
  fs.writeFileSync(path.join(OUT, `${kod}.xml.gz`), gz);
  const kanal = (xml.toString('utf8').match(/<channel id/g) || []).length;
  const program = (xml.toString('utf8').match(/<programme /g) || []).length;
  return { kanal, program, boyut: gz.length };
}

// ------------------------------------------------------------------- ana ----

async function ana() {
  const istenen = process.argv.slice(2).map((s) => s.toLowerCase());
  const hedefler = istenen.length
    ? ULKELER.filter((u) => istenen.includes(u.kod))
    : ULKELER;

  if (!hedefler.length) {
    console.error('Bilinen bir ulke kodu verilmedi.');
    process.exit(1);
  }

  fs.mkdirSync(OUT, { recursive: true });

  const liste = await dizinListesi();
  console.log(`epgshare01 dizininde ${liste.length} dosya goruldu\n`);

  const grabber = grabberCiktilari();
  if (grabber.length) console.log(`iptv-org ciktilari: ${grabber.join(', ')}\n`);

  const ozet = [];
  let basarili = 0;

  for (const ulke of hedefler) {
    console.log(`== ${ulke.ad} (${ulke.kod})`);

    const kaynaklar = [];
    const kullanilan = [];

    // TR'de iptv-org ciktilari once: Turkce aciklamalar daha dolu.
    if (ulke.kod === 'tr') {
      for (const yol of grabber) {
        try {
          kaynaklar.push({ ad: path.basename(yol), xml: fs.readFileSync(yol, 'utf8') });
          kullanilan.push(path.basename(yol));
        } catch (e) {
          console.log(`  ! ${yol} okunamadi: ${e.message}`);
        }
      }
    }

    for (const ad of ulkeDosyalari(liste, ulke)) {
      const xml = await indirVeAc(ad);
      if (xml) {
        kaynaklar.push({ ad, xml });
        kullanilan.push(ad);
      }
    }

    const onceki = oncekiniOku(ulke.kod);
    if (onceki) kaynaklar.push({ ad: 'onceki', xml: onceki });

    if (!kaynaklar.length) {
      benzerleriYaz(liste, ulke);
      console.log('  hicbir kaynak yok, atlandi\n');
      ozet.push({ kod: ulke.kod, ad: ulke.ad, durum: 'kaynak yok', kanal: 0, program: 0 });
      continue;
    }

    const sonuc = birlestir(kaynaklar);

    if (sonuc.toplam < EN_AZ_PROGRAM) {
      const eski = oncekiniTasi(ulke.kod);
      if (eski) {
        console.log(`  az veri (${sonuc.toplam}), dunku dosya korundu\n`);
        ozet.push({
          kod: ulke.kod,
          ad: ulke.ad,
          durum: 'dunku korundu',
          kanal: eski.kanal,
          program: eski.program,
          boyut: eski.boyut,
          kaynaklar: kullanilan,
        });
        basarili++;
      } else {
        console.log(`  az veri (${sonuc.toplam}) ve dunku dosya yok, atlandi\n`);
        ozet.push({ kod: ulke.kod, ad: ulke.ad, durum: 'yetersiz', kanal: 0, program: 0 });
      }
      continue;
    }

    const yazilan = await yaz(ulke.kod, sonuc);
    console.log(
      `  -> ${yazilan.kanal} kanal, ${yazilan.program} program, ${mb(yazilan.boyut)} (gz)\n`
    );
    ozet.push({
      kod: ulke.kod,
      ad: ulke.ad,
      durum: 'tamam',
      kanal: yazilan.kanal,
      program: yazilan.program,
      boyut: yazilan.boyut,
      kaynaklar: kullanilan,
    });
    basarili++;
  }

  // Eski adres calismaya devam etsin: turkiye.xml = tr.xml
  for (const uzanti of ['xml', 'xml.gz']) {
    const tr = path.join(OUT, `tr.${uzanti}`);
    if (fs.existsSync(tr)) fs.copyFileSync(tr, path.join(OUT, `turkiye.${uzanti}`));
  }

  fs.writeFileSync(
    path.join(OUT, 'index.json'),
    JSON.stringify({ guncelleme: new Date().toISOString(), ulkeler: ozet }, null, 2)
  );

  // GitHub Actions ozet tablosu
  const satirlar = [
    '| ülke | durum | kanal | program | boyut |',
    '|---|---|---:|---:|---:|',
    ...ozet.map(
      (o) =>
        `| ${o.ad} (${o.kod}) | ${o.durum} | ${o.kanal} | ${o.program} | ${
          o.boyut ? mb(o.boyut) : '-'
        } |`
    ),
  ];
  console.log(satirlar.join('\n'));
  if (process.env.GITHUB_STEP_SUMMARY) {
    fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY, satirlar.join('\n') + '\n');
  }

  if (basarili === 0) {
    console.error('\nHicbir ulke yayinlanabilir veri vermedi.');
    process.exit(1);
  }
  console.log(`\n${basarili}/${hedefler.length} ulke hazir.`);
}

ana().catch((e) => {
  console.error(e);
  process.exit(1);
});
