# sLED – web sled.sk

Statický one-page web pre prenájom LED billboardu v Starej Ľubovni. Je to čisté HTML, CSS a JS bez build kroku. Knižnice (GSAP 3.13, Lenis 1.3.23) a fonty sú uložené lokálne, takže web nesťahuje nič z cudzích serverov.

## Štruktúra

| Cesta | Obsah |
|---|---|
| `index.html` | celý web (hero, info, lokalita, obrazovka, postup, cenník, collab, pätička) |
| `ochrana-osobnych-udajov.html` | GDPR – **doplniť polia označené [DOPLNIŤ]** |
| `data/pricing.json` | **cenník** (centy, bez DPH) – používa ho kalkulačka aj `api/mail.php` |
| `js/config.js` | spôsob odosielania formulárov (`php` / `web3forms` / `mock`) |
| `api/mail.php` | odoslanie e-mailu na sled@ascensio.sk (hosting s PHP) |
| `js/main.js` | animácie, smooth scroll, kurzor, preloader |
| `js/led-shader.js` | WebGL LED efekt hero videa |
| `js/led-matrix.js` | LED bodová matica (preloader, cena, billboard, pätička) |
| `js/calculator.js`, `js/forms.js` | kalkulačka a formuláre |
| `.htaccess` / `_redirects` | presmerovanie starých URL z Wixu (Apache / Netlify) |
| `tests/calculator.test.html` | test cien – otvoriť cez lokálny server |
| `_src/` | originálne videá z Wixu a šablóna OG obrázka – **nenahrávať na hosting** |

## Úprava cien

V `data/pricing.json` sú ceny v centoch (`4999` = 49,99 €), vždy bez DPH a pre spot zaradený 1× do playlistu. Voľba 2× cenu zdvojnásobí. Položky s `"confirmed": false` sú zástupné hodnoty, ktoré treba potvrdiť. Po úprave ich prepíšte na `true`.

## Lokálny náhľad

```
python -m http.server 8000
```

Potom otvorte http://localhost:8000. Na localhoste sa formuláre neodosielajú, payload sa iba vypíše do konzoly prehliadača.

## Nasadenie

1. Nahrajte všetko okrem `_src/` (a voliteľne `tests/`).
2. **Hosting s PHP** (napr. Websupport): v `js/config.js` nechajte `provider: 'php'`. V `api/mail.php` skontrolujte `MAIL_FROM`, musí to byť adresa na doméne webu.
3. **Statický hosting** (Netlify, Vercel): na https://web3forms.com si zaregistrujte kľúč pre sled@ascensio.sk, vložte ho do `web3formsKey` a nastavte `provider: 'web3forms'`.
4. Pošlite testovací dopyt z kalkulačky aj z formulára Collab a skontrolujte schránku (aj spam).
