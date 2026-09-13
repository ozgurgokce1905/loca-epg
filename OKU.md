# loca-epg

Ülke başına XMLTV yayın akışı üretir ve `guide` dalına yayınlar.
Günde iki kez çalışır (04:30 ve 16:30 TR saati) ve elle de başlatılabilir.

## Kaynaklar

Her ülke için sırayla üç yerden veri alınır, hepsi birleştirilir:

1. **epgshare01.online** — hazır günlük XMLTV dökümleri. Kazımayı başkası
   yapıyor; bir site HTML'ini değiştirdiğinde bizim iş kırılmıyor.
2. **iptv-org toplayıcısı** — yalnızca Türkiye için. Türkçe program
   açıklamaları daha dolu geliyor. Çalışmazsa iş durmuyor.
3. **Dünkü yayın** — iki kaynak da gelmezse kanallar listeden düşmesin diye.

Bir kanalın programları onu **ilk** veren kaynaktan alınır, böylece iki kaynak
aynı kanalı verdiğinde program listesi ikiye katlanmaz.

Biteli 6 saat olan programlar atılır, 10 günden ileri tarihliler kırpılır.

## Adresler

Uygulamada **Ayarlar → XMLTV kaynakları** bölümüne eklenecek adresler:

```
https://raw.githubusercontent.com/ozgurgokce1905/loca-epg/guide/tr.xml.gz
https://raw.githubusercontent.com/ozgurgokce1905/loca-epg/guide/de.xml.gz
https://raw.githubusercontent.com/ozgurgokce1905/loca-epg/guide/bg.xml.gz
```

Ülke kodları:

| kod | ülke | kod | ülke |
|---|---|---|---|
| `tr` | Türkiye | `pt` | Portekiz |
| `gb` | Birleşik Krallık | `nl` | Hollanda |
| `us` | ABD | `ru` | Rusya |
| `de` | Almanya | `gr` | Yunanistan |
| `fr` | Fransa | `bg` | Bulgaristan |
| `es` | İspanya | | |
| `it` | İtalya | | |

`turkiye.xml` ve `turkiye.xml.gz` de yayınlanmaya devam ediyor — eski
kurulumlardaki adres kırılmasın diye `tr` dosyasının kopyası.

Hangi ülkenin ne kadar veri verdiği:

```
https://raw.githubusercontent.com/ozgurgokce1905/loca-epg/guide/index.json
```

Uygulama `.gz` dosyalarını kendisi açıyor, sıkıştırılmış adresi vermek daha
hızlı.

## Ülke eklemek / çıkarmak

`derle.js` içindeki `ULKELER` dizisine tek satır eklemek yeterli:

```js
{ kod: 'pl', ad: 'Polonya', onekler: ['PL'] },
```

`onekler`, epgshare01'deki dosya adında geçen ülke kısaltması
(`epg_ripper_PL1.xml.gz` → `PL`). Bir ülke birden fazla kısaltmayla
geçebiliyor (Birleşik Krallık'ta `UK` ve `GB` gibi), ikisini de yazabilirsin.

## Denemek

```bash
node derle.js tr bg
```

Sadece verilen ülkeleri derler, `out/` klasörüne yazar.

## Eşikler

`derle.js` başındaki sabitler:

| sabit | ne işe yarar |
|---|---|
| `EN_AZ_PROGRAM` | Bir ülke bundan az program verirse yayınlanmaz, dünkü dosya korunur |
| `EN_COK_PROGRAM` | Tek ülkede bellek taşmasın diye üst sınır |
| `EN_BUYUK_XML` | Bundan büyük bir döküm indirilirse atlanır |

İş yalnızca **hiçbir** ülke veri vermediğinde kırmızıya düşer. Tek bir ülkenin
kaynağı ölürse diğerleri yayınlanmaya devam eder.
