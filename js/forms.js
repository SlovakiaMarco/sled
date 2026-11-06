/*
 * sLED – formuláre: validácia, anti-spam (honeypot + čas vyplnenia), odoslanie
 * Spôsob odoslania sa nastavuje v js/config.js (php | web3forms | mock).
 */
(function () {
  'use strict';

  var cfg = window.SLED_CONFIG || { provider: 'mock', mailTo: 'sled@ascensio.sk' };

  var RX_EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
  var RX_PHONE = /^\+?[0-9][0-9\s\-()\/]{7,18}[0-9]$/;
  var MSG = {
    required: 'Toto pole je povinné.',
    email: 'Zadajte platný e-mail, napr. meno@firma.sk.',
    phone: 'Zadajte platné telefónne číslo, napr. +421 900 000 000.',
    consent: 'Na odoslanie potrebujeme váš súhlas.',
    short: 'Text je príliš krátky.'
  };

  function fieldWrap(input) { return input.closest('.field, .consent') || input.parentElement; }

  function validate(input) {
    var v = (input.type === 'checkbox') ? input.checked : input.value.trim();
    if (input.required && !v) return input.type === 'checkbox' ? MSG.consent : MSG.required;
    if (!v) return '';
    if (input.type === 'email' && !RX_EMAIL.test(v)) return MSG.email;
    if (input.type === 'tel' && !RX_PHONE.test(v)) return MSG.phone;
    if (input.minLength > 0 && typeof v === 'string' && v.length < input.minLength) return MSG.short;
    return '';
  }

  function show(input, msg) {
    var wrap = fieldWrap(input);
    var id = input.id + '-err';
    var err = document.getElementById(id);
    if (!err) {
      err = document.createElement('span');
      err.className = 'field__error';
      err.id = id;
      wrap.appendChild(err);
    }
    err.textContent = msg;
    wrap.classList.toggle('is-invalid', !!msg);
    if (msg) {
      input.setAttribute('aria-invalid', 'true');
      input.setAttribute('aria-describedby', id);
    } else {
      input.removeAttribute('aria-invalid');
    }
  }

  function validateForm(form) {
    var first = null;
    form.querySelectorAll('input, textarea').forEach(function (inp) {
      if (inp.type === 'hidden' || inp.closest('.hp')) return;
      var m = validate(inp);
      show(inp, m);
      if (m && !first) first = inp;
    });
    if (first) first.focus();
    return !first;
  }

  function delay(ms) { return new Promise(function (r) { setTimeout(r, ms); }); }

  function subjectFor(p) {
    if (p.form === 'kalkulacka') {
      return 'sLED – dopyt z kalkulačky (' + [p.durationLabel, p.spotLabel, p.double ? '2×' : ''].filter(Boolean).join(' · ') + ')';
    }
    return 'sLED – Collab dopyt' + (p.name ? ' (' + p.name + ')' : '');
  }

  function readable(p) {
    var r = {
      'Formulár': p.form === 'kalkulacka' ? 'Cenová kalkulačka' : 'Collab',
      'Meno': p.name,
      'Firma': p.company || '–',
      'Telefón': p.phone,
      'E-mail': p.email
    };
    if (p.form === 'kalkulacka') {
      r['Dĺžka prenájmu'] = p.durationLabel;
      r['Dĺžka spotu'] = p.spotLabel;
      r['Zaradiť spot 2× do playlistu'] = p.double ? 'Áno' : 'Nie';
      r['Cena (bez DPH)'] = p.priceText;
    } else {
      r['Typ spolupráce'] = p.coopType || '–';
      r['Preferovaný začiatok'] = p.start || '–';
    }
    r['Poznámka'] = p.message || '–';
    return r;
  }

  function send(payload) {
    var provider = cfg.provider;
    if (provider === 'php') {
      return fetch(cfg.phpEndpoint || 'api/mail.php', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
        body: JSON.stringify(payload)
      }).then(function (res) {
        return res.json().catch(function () { return {}; }).then(function (json) {
          if (!res.ok || !json.ok) throw new Error(json.error || 'Server vrátil chybu ' + res.status);
          return json;
        });
      });
    }
    if (provider === 'web3forms') {
      if (!cfg.web3formsKey) return Promise.reject(new Error('Chýba Web3Forms kľúč v js/config.js'));
      var body = Object.assign({
        access_key: cfg.web3formsKey,
        subject: subjectFor(payload),
        from_name: 'sLED web',
        replyto: payload.email,
        botcheck: ''
      }, readable(payload));
      return fetch('https://api.web3forms.com/submit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
        body: JSON.stringify(body)
      }).then(function (res) { return res.json(); }).then(function (json) {
        if (!json.success) throw new Error(json.message || 'Web3Forms chyba');
        return json;
      });
    }
    // mock
    console.info('[sLED mock] ' + subjectFor(payload), payload, readable(payload));
    window.__sledLastPayload = payload;
    return delay(900).then(function () { return { ok: true, mock: true }; });
  }

  function bind(form, opts) {
    if (!form) return;
    opts = opts || {};
    var started = Date.now();
    var wrap = form.parentElement;
    var success = wrap.querySelector('.success');
    var status = form.querySelector('.form-status');
    var btn = form.querySelector('[type="submit"]');
    var thanks = null;

    form.setAttribute('novalidate', '');

    form.querySelectorAll('input, textarea').forEach(function (inp) {
      if (inp.type === 'hidden' || inp.closest('.hp')) return;
      inp.addEventListener('blur', function () { if (inp.value || inp.dataset.touched) show(inp, validate(inp)); inp.dataset.touched = '1'; });
      inp.addEventListener('input', function () { if (fieldWrap(inp).classList.contains('is-invalid')) show(inp, validate(inp)); });
      inp.addEventListener('change', function () { if (inp.type === 'checkbox') show(inp, validate(inp)); });
    });

    function setLoading(v) {
      btn.classList.toggle('is-loading', v);
      btn.disabled = v;
      form.setAttribute('aria-busy', v ? 'true' : 'false');
    }

    function done() {
      form.hidden = true;
      if (!success) return;
      success.hidden = false;
      var cv = success.querySelector('canvas');
      if (cv && window.LEDMatrix) {
        if (!thanks) thanks = new LEDMatrix(cv, { pitch: 7, minRows: 18, color: '#ED1566', order: 'sweep', ease: 0.12 });
        thanks.setText('ĎAKUJEME', { fill: 0.7 });
        thanks.setProgress(0);
        requestAnimationFrame(function () { thanks.setProgress(1); });
      }
      if (window.gsap && !window.SLED_REDUCED) {
        gsap.fromTo(success.children, { y: 24, opacity: 0 }, {
          y: 0, opacity: 1, duration: 0.9, stagger: 0.08, ease: 'expo.out', overwrite: true, clearProps: 'opacity,transform'
        });
      }
      success.setAttribute('tabindex', '-1');
      success.focus({ preventScroll: true });
      if (window.ScrollTrigger) ScrollTrigger.refresh();
    }

    if (success) {
      var again = success.querySelector('[data-reset]');
      if (again) again.addEventListener('click', function () {
        success.hidden = true;
        form.hidden = false;
        form.reset();
        form.querySelectorAll('.is-invalid').forEach(function (w) { w.classList.remove('is-invalid'); });
        started = Date.now();
        if (opts.onReset) opts.onReset();
        if (window.ScrollTrigger) ScrollTrigger.refresh();
      });
    }

    form.addEventListener('submit', function (e) {
      e.preventDefault();
      status.textContent = '';
      status.classList.remove('is-error');
      if (opts.canSubmit && !opts.canSubmit()) {
        status.textContent = 'Najprv prepočítajte cenu.';
        status.classList.add('is-error');
        return;
      }
      if (!validateForm(form)) return;

      var fd = new FormData(form);
      var g = function (k) { return (fd.get(k) || '').toString().trim(); };
      var payload = {
        form: opts.type || 'collab',
        name: g('name'),
        company: g('company'),
        phone: g('phone'),
        email: g('email'),
        message: g('message'),
        coopType: fd.getAll('coopType').join(', '),
        start: g('start'),
        consent: true,
        website: g('website'),
        t: Date.now() - started
      };
      if (opts.extra) Object.assign(payload, opts.extra());

      // bot: honeypot vyplnený alebo formulár odoslaný za menej ako 3 s
      if (payload.website || payload.t < 3000) {
        setLoading(true);
        delay(800).then(function () { setLoading(false); done(); });
        return;
      }

      setLoading(true);
      send(payload).then(function () {
        setLoading(false);
        done();
      }).catch(function (err) {
        console.error('[sLED] odoslanie zlyhalo:', err);
        setLoading(false);
        status.classList.add('is-error');
        status.innerHTML = 'Správu sa nepodarilo odoslať. Skúste to prosím znova alebo nám napíšte priamo na ' +
          '<a href="mailto:' + (cfg.mailTo || 'sled@ascensio.sk') + '">' + (cfg.mailTo || 'sled@ascensio.sk') + '</a>.';
      });
    });
  }

  window.SLEDForms = { bind: bind, send: send, validate: validate };
})();
