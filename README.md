# loca-epg

Türk kanalları için günlük XMLTV yayın akışı. GitHub Actions her gün
sabaha karşı [iptv-org/epg](https://github.com/iptv-org/epg) toplayıcısını
çalıştırıp Digiturk, TV+, D-Smart ve Türksat Kablo verilerini tek dosyada
birleştiriyor.

Sonuç `guide` dalında yayınlanıyor:

```
https://raw.githubusercontent.com/KULLANICI_ADI/loca-epg/guide/turkiye.xml
https://raw.githubusercontent.com/KULLANICI_ADI/loca-epg/guide/turkiye.xml.gz
```

Bu adresi LocaIPTV Player'da **Ayarlar → EPG kaynakları → Adres ekle**
bölümüne yapıştırmak yeterli.

## Elle çalıştırma

Actions sekmesi → **Türkiye EPG** → **Run workflow**.

## Notlar

- `guide` dalı her çalıştırmada sıfırlanır, depo geçmişi şişmez.
- Bir kaynak bozulursa diğerleri devam eder (`continue-on-error`).
- Kaynak siteler yapı değiştirirse toplayıcının güncellenmesi gerekebilir;
  iş akışı her seferinde iptv-org/epg'nin son hâlini çekiyor.
