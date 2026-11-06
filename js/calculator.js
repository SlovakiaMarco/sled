/*
 * sLED – cenová kalkulačka
 *  SLEDPricing: čistá logika (načítanie cenníka, výpočet v centoch, formátovanie) – testovaná v tests/
 *  SLEDCalc:    UI kalkulačky (chipy, LED displej, krok „Mám záujem“)
 */
(function () {
  'use strict';

  var currency = new Intl.NumberFormat('sk-SK', { style: 'currency', currency: 'EUR', minimumFractionDigits: 2, maximumFractionDigits: 2 });

  var Pricing = {
    url: 'data/pricing.json',
    load: function (url) {
      return fetch(url || Pricing.url, { cache: 'no-cache' }).then(function (r) {
        if (!r.ok) throw new Error('Cenník sa nepodarilo načítať (' + r.status + ')');
        return r.json();
      });
    },
    find: function (list, id) {
      for (var i = 0; i < list.length; i++) if (list[i].id === id) return list[i];
      return null;
    },
    calc: function (data, durationId, spotId, double) {
      var row = data.prices[durationId];
      if (!row || !row[spotId]) throw new Error('Neznáma kombinácia: ' + durationId + ' / ' + spotId);
      var base = row[spotId].cents;
      var mult = double ? (data.doubleMultiplier || 2) : 1;
      var cents = base * mult;
      var dur = Pricing.find(data.durations, durationId);
      return {
        durationId: durationId,
        spotId: spotId,
        double: !!double,
        baseCents: base,
        cents: cents,
        perDayCents: dur && dur.days ? Math.round(cents / dur.days) : null,
        confirmed: !!row[spotId].confirmed
      };
    },
    format: function (cents) {
      return currency.format(cents / 100);
    }
  };
  window.SLEDPricing = Pricing;

  // ---------------------------------------------------------------- UI
  function el(tag, attrs, html) {
    var n = document.createElement(tag);
    if (attrs) Object.keys(attrs).forEach(function (k) { n.setAttribute(k, attrs[k]); });
    if (html != null) n.innerHTML = html;
    return n;
  }

  function init(root) {
    if (!root) return null;
    var form = root.querySelector('#calc-form');
    var durWrap = root.querySelector('[data-durations]');
    var spotWrap = root.querySelector('[data-spots]');
    var dbl = root.querySelector('#calc-double');
    var btnCalc = root.querySelector('[data-calc]');
    var btnWant = root.querySelector('[data-want]');
    var display = root.querySelector('.display');
    var canvas = root.querySelector('.display canvas');
    var live = root.querySelector('[data-price-live]');
    var perDayEl = root.querySelector('[data-per-day]');
    var hint = root.querySelector('[data-hint]');
    var sumDur = root.querySelector('[data-sum="duration"]');
    var sumSpot = root.querySelector('[data-sum="spot"]');
    var sumPlay = root.querySelector('[data-sum="playlist"]');
    var panel = root.querySelector('.panel');
    var request = root.querySelector('.request');
    var requestForm = root.querySelector('#calc-request');
    var requestSummary = root.querySelector('[data-request-summary]');
    var requestClose = root.querySelector('[data-request-close]');
    var errorBox = root.querySelector('[data-calc-error]');

    var data = null;
    var result = null;
    var stale = false;
    var shown = { v: 0 };

    var matrix = window.LEDMatrix ? new LEDMatrix(canvas, {
      pitch: 9, minCols: 58, minRows: 11, color: '#ED1566', offAlpha: 0.06, ease: 0.3
    }) : null;
    if (matrix) matrix.setBitmap('--,-- €');

    function selection() {
      var d = form.querySelector('input[name="duration"]:checked');
      var s = form.querySelector('input[name="spot"]:checked');
      return { duration: d && d.value, spot: s && s.value, double: dbl.checked };
    }

    function labels(sel) {
      var d = Pricing.find(data.durations, sel.duration);
      var s = Pricing.find(data.spots, sel.spot);
      return { duration: d ? d.label : '', spot: s ? s.label : '', playlist: sel.double ? '2× (dvojnásobná frekvencia)' : '1×' };
    }

    function updateSummary() {
      if (!data) return;
      var l = labels(selection());
      sumDur.textContent = l.duration;
      sumSpot.textContent = l.spot;
      sumPlay.textContent = l.playlist;
    }

    function build() {
      durWrap.innerHTML = '';
      spotWrap.innerHTML = '';
      data.durations.forEach(function (d, i) {
        var lab = el('label', { class: 'chip' });
        var inp = el('input', { type: 'radio', name: 'duration', value: d.id });
        if (i === 0) inp.checked = true;
        lab.appendChild(inp);
        lab.appendChild(el('span', null, d.label));
        durWrap.appendChild(lab);
      });
      var maxSec = data.spots.reduce(function (m, s) { return Math.max(m, s.seconds); }, 1);
      data.spots.forEach(function (s, i) {
        var lab = el('label', { class: 'chip chip--spot' });
        var inp = el('input', { type: 'radio', name: 'spot', value: s.id });
        if (i === 0) inp.checked = true;
        lab.appendChild(inp);
        var span = el('span', { style: '--len:' + (s.seconds / maxSec).toFixed(3) });
        span.innerHTML = '<b>' + s.seconds + '</b><em>sekúnd</em><i aria-hidden="true"></i>';
        lab.appendChild(span);
        spotWrap.appendChild(lab);
      });
      updateSummary();
      root.classList.add('is-ready');
      if (window.ScrollTrigger) ScrollTrigger.refresh();
    }

    function setStale(v) {
      stale = v;
      display.classList.toggle('is-stale', v);
      btnCalc.classList.toggle('is-attention', v);
      btnWant.disabled = v || !result;
      hint.textContent = v ? 'Zmenili ste voľby – prepočítajte cenu.' : (result ? 'Cena bez DPH' : 'Zvoľte parametre a kliknite na Vypočítať cenu.');
      var submit = requestForm.querySelector('[type="submit"]');
      if (submit) submit.disabled = v;
    }

    function animatePrice(to) {
      if (!matrix) return;
      if (window.gsap && !window.SLED_REDUCED) {
        gsap.killTweensOf(shown);
        gsap.to(shown, {
          v: to, duration: 1.1, ease: 'expo.out',
          onUpdate: function () { matrix.setBitmap(Pricing.format(Math.round(shown.v))); }
        });
        display.classList.remove('is-flash');
        void display.offsetWidth;
        display.classList.add('is-flash');
      } else {
        shown.v = to;
        matrix.setBitmap(Pricing.format(to));
      }
    }

    function calculate() {
      if (!data) return;
      var sel = selection();
      if (!sel.duration || !sel.spot) return;
      result = Pricing.calc(data, sel.duration, sel.spot, sel.double);
      var text = Pricing.format(result.cents);
      animatePrice(result.cents);
      live.textContent = 'Vypočítaná cena: ' + text + ' bez DPH.';
      perDayEl.textContent = result.perDayCents != null ? '≈ ' + Pricing.format(result.perDayCents) + ' / deň' : '';
      root.classList.add('is-calculated');
      setStale(false);
      updateRequestSummary();
    }

    function updateRequestSummary() {
      if (!result) return;
      var l = labels(selection());
      requestSummary.innerHTML =
        '<span>' + l.duration + '</span><span>' + l.spot + '</span><span>' + (result.double ? '2× playlist' : '1× playlist') +
        '</span><strong>' + Pricing.format(result.cents) + ' <small>bez DPH</small></strong>';
    }

    function openRequest() {
      if (!result || stale) return;
      request.hidden = false;
      panel.classList.add('is-expanded');
      btnWant.hidden = true;
      if (window.gsap && !window.SLED_REDUCED) {
        gsap.fromTo(request, { height: 0, opacity: 0 }, {
          height: 'auto', opacity: 1, duration: 0.8, ease: 'expo.out',
          onComplete: function () { request.style.height = ''; if (window.ScrollTrigger) ScrollTrigger.refresh(); }
        });
      }
      var first = request.querySelector('input:not([type="hidden"]):not([tabindex="-1"])');
      if (first) setTimeout(function () { first.focus({ preventScroll: true }); }, 350);
      if (window.SLED && window.SLED.scrollTo && window.innerWidth < 960) window.SLED.scrollTo(request, -120);
    }

    function closeRequest() {
      var done = function () {
        request.hidden = true;
        panel.classList.remove('is-expanded');
        btnWant.hidden = false;
        btnWant.focus({ preventScroll: true });
        if (window.ScrollTrigger) ScrollTrigger.refresh();
      };
      if (window.gsap && !window.SLED_REDUCED) {
        gsap.to(request, { height: 0, opacity: 0, duration: 0.5, ease: 'expo.inOut', onComplete: function () { request.style.height = ''; request.style.opacity = ''; done(); } });
      } else done();
    }

    form.addEventListener('change', function () {
      updateSummary();
      if (result) setStale(true);
    });
    form.addEventListener('submit', function (e) { e.preventDefault(); calculate(); });
    btnWant.addEventListener('click', openRequest);
    if (requestClose) requestClose.addEventListener('click', closeRequest);

    if (window.SLEDForms) {
      SLEDForms.bind(requestForm, {
        type: 'kalkulacka',
        extra: function () {
          var sel = selection();
          var l = labels(sel);
          return {
            duration: sel.duration, durationLabel: l.duration,
            spot: sel.spot, spotLabel: l.spot,
            double: sel.double,
            priceCents: result ? result.cents : null,
            priceText: result ? Pricing.format(result.cents) : ''
          };
        },
        canSubmit: function () { return !!result && !stale; },
        onReset: function () {
          request.hidden = true;
          panel.classList.remove('is-expanded');
          btnWant.hidden = false;
        }
      });
    }

    Pricing.load().then(function (d) {
      data = d;
      build();
      setStale(false);
    }).catch(function (err) {
      console.error(err);
      errorBox.hidden = false;
      btnCalc.disabled = true;
    });

    return { calculate: calculate };
  }

  window.SLEDCalc = { init: init };
})();
