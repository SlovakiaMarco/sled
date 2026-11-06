/*
 * sLED – konfigurácia odosielania formulárov
 * ------------------------------------------------------------
 * provider:
 *   'php'       – formuláre sa odošlú cez api/mail.php (hosting s PHP, napr. Websupport).
 *                 E-mail príde na adresu nastavenú v api/mail.php (MAIL_TO).
 *   'web3forms' – formuláre sa odošlú cez službu Web3Forms (statický hosting: Netlify, Vercel…).
 *                 1. Na https://web3forms.com zadajte e-mail sled@ascensio.sk a získate Access Key.
 *                 2. Vložte ho nižšie do web3formsKey a nastavte provider: 'web3forms'.
 *   'mock'      – iba na lokálny vývoj: nič sa neodošle, payload sa vypíše do konzoly.
 *
 * Na localhost sa automaticky použije 'mock', aby sa pri vývoji neposielali e-maily.
 *
 * Test po nasadení:
 *   PHP:       vyplňte formulár Collab aj kalkulačku na živom webe a skontrolujte schránku
 *              sled@ascensio.sk (aj spam). Ak e-mail nepríde, hosting pravdepodobne blokuje
 *              funkciu mail() alebo adresu odosielateľa – upravte MAIL_FROM v api/mail.php
 *              na existujúcu schránku na doméne sled.sk.
 *   Web3Forms: po vložení kľúča odošlite testovací dopyt; prvý e-mail môže skončiť v spame.
 */
(function () {
  var isLocal = /^(localhost|127\.0\.0\.1|\[::1\])$/.test(location.hostname) || location.protocol === 'file:';

  window.SLED_CONFIG = {
    provider: isLocal ? 'mock' : 'php',
    mailTo: 'sled@ascensio.sk',
    phpEndpoint: 'api/mail.php',
    web3formsKey: '' // napr. 'a1b2c3d4-....'
  };
})();
