/*
 * LEDMatrix – canvas komponent bodkovej LED matice.
 *  - setText(text, opts)     text vykreslený fontom a navzorkovaný do bodov (podporuje diakritiku)
 *  - setBitmap(text)         bitmapový 5×7 font pre čísla a cenu (autentický LED vzhľad)
 *  - setMarquee(text, opts)  bežiaci text (billboard)
 *  - setProgress(0..1)       postupné rozsvietenie bodov (random / sweep)
 */
(function () {
  'use strict';

  // 5×7 bitmap font (iba znaky potrebné pre cenový displej)
  var GLYPHS = {
    '0': ['01110', '10001', '10011', '10101', '11001', '10001', '01110'],
    '1': ['00100', '01100', '00100', '00100', '00100', '00100', '01110'],
    '2': ['01110', '10001', '00001', '00010', '00100', '01000', '11111'],
    '3': ['11111', '00010', '00100', '00010', '00001', '10001', '01110'],
    '4': ['00010', '00110', '01010', '10010', '11111', '00010', '00010'],
    '5': ['11111', '10000', '11110', '00001', '00001', '10001', '01110'],
    '6': ['00110', '01000', '10000', '11110', '10001', '10001', '01110'],
    '7': ['11111', '00001', '00010', '00100', '01000', '01000', '01000'],
    '8': ['01110', '10001', '10001', '01110', '10001', '10001', '01110'],
    '9': ['01110', '10001', '10001', '01111', '00001', '00010', '01100'],
    ',': ['00', '00', '00', '00', '11', '01', '10'],
    '.': ['00', '00', '00', '00', '00', '11', '11'],
    '-': ['000', '000', '000', '111', '000', '000', '000'],
    '€': ['00111', '01000', '11110', '01000', '11110', '01000', '00111'],
    '×': ['00000', '10001', '01010', '00100', '01010', '10001', '00000'],
    ' ': ['00', '00', '00', '00', '00', '00', '00']
  };

  function parseColor(c) {
    if (Array.isArray(c)) return c;
    var m = /^#?([0-9a-f]{6})$/i.exec(c);
    if (m) {
      var n = parseInt(m[1], 16);
      return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
    }
    return [255, 255, 255];
  }

  function LEDMatrix(canvas, opts) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.o = Object.assign({
      pitch: 8,          // vzdialenosť stredov bodov v CSS px
      minCols: 0,        // minimálny počet stĺpcov (zmenší pitch)
      minRows: 0,        // minimálny počet riadkov (zmenší pitch)
      dot: 0.74,         // priemer bodu relatívne k pitch
      color: '#ED1566',
      offAlpha: 0.07,
      gradient: null,    // (ctx, w, h, time) => CanvasGradient – zafarbí rozsvietené body
      order: 'random',   // 'random' | 'sweep'
      ease: 0.16,
      interactive: false,
      flicker: 0
    }, opts || {});
    this.rgb = parseColor(this.o.color);
    this.progress = 1;
    this.source = null;
    this.marquee = null;
    this.pointer = null;
    this.running = false;
    this.visible = true;
    this.time = 0;
    this._raf = this._raf.bind(this);
    this.resize();

    var self = this;
    if ('ResizeObserver' in window) {
      var last = 0;
      this.ro = new ResizeObserver(function () {
        var w = canvas.clientWidth;
        if (Math.abs(w - last) > 1) { last = w; self.resize(); }
      });
      this.ro.observe(canvas);
    }
    if ('IntersectionObserver' in window) {
      this.io = new IntersectionObserver(function (entries) {
        self.visible = entries[0].isIntersecting;
        if (self.visible) self.wake();
      });
      this.io.observe(canvas);
    }
    if (this.o.interactive) {
      canvas.addEventListener('pointermove', function (e) {
        var r = canvas.getBoundingClientRect();
        self.pointer = { x: e.clientX - r.left, y: e.clientY - r.top };
        self.wake();
      });
      canvas.addEventListener('pointerleave', function () { self.pointer = null; self.wake(); });
    }
  }

  LEDMatrix.prototype.resize = function () {
    var c = this.canvas;
    var w = c.clientWidth || 300;
    var h = c.clientHeight || 100;
    var pitch = this.o.pitch;
    if (this.o.minCols) pitch = Math.min(pitch, w / this.o.minCols);
    if (this.o.minRows) pitch = Math.min(pitch, h / this.o.minRows);
    this.pitch = Math.max(2, pitch);
    this.cols = Math.max(1, Math.floor(w / this.pitch));
    this.rows = Math.max(1, Math.floor(h / this.pitch));
    this.offX = (w - this.cols * this.pitch) / 2 + this.pitch / 2;
    this.offY = (h - this.rows * this.pitch) / 2 + this.pitch / 2;
    this.dpr = Math.min(window.devicePixelRatio || 1, 2);
    c.width = Math.round(w * this.dpr);
    c.height = Math.round(h * this.dpr);
    this.w = w; this.h = h;

    var n = this.cols * this.rows;
    var prevLevel = this.level;
    this.mask = new Float32Array(n);
    this.level = new Float32Array(n);
    if (prevLevel && prevLevel.length === n) this.level.set(prevLevel);
    this.rank = new Float32Array(n);
    for (var y = 0; y < this.rows; y++) {
      for (var x = 0; x < this.cols; x++) {
        var r = Math.random();
        this.rank[y * this.cols + x] = this.o.order === 'sweep'
          ? Math.min(1, (x / this.cols) * 0.82 + r * 0.18)
          : r;
      }
    }
    this._buildOffLayer();
    if (this.marquee) this._sampleMarquee();
    this.render();
  };

  LEDMatrix.prototype._buildOffLayer = function () {
    var off = document.createElement('canvas');
    off.width = this.canvas.width; off.height = this.canvas.height;
    var ctx = off.getContext('2d');
    ctx.scale(this.dpr, this.dpr);
    ctx.fillStyle = 'rgba(255,255,255,' + this.o.offAlpha + ')';
    var r = (this.pitch * this.o.dot) / 2;
    ctx.beginPath();
    for (var y = 0; y < this.rows; y++) {
      for (var x = 0; x < this.cols; x++) {
        var cx = this.offX + x * this.pitch, cy = this.offY + y * this.pitch;
        ctx.moveTo(cx + r, cy);
        ctx.arc(cx, cy, r, 0, Math.PI * 2);
      }
    }
    ctx.fill();
    this.offLayer = off;
  };

  // ---------- zdroje ----------
  LEDMatrix.prototype.setText = function (text, opts) {
    this.marquee = null;
    this.source = { type: 'text', text: text, o: Object.assign({ weight: 800, stretch: '125%', fill: 0.78, align: 'center' }, opts || {}) };
    this.render();
    return this;
  };

  LEDMatrix.prototype.setBitmap = function (text, opts) {
    this.marquee = null;
    this.source = { type: 'bitmap', text: String(text), o: Object.assign({ align: 'center' }, opts || {}) };
    this.render();
    return this;
  };

  LEDMatrix.prototype.setMarquee = function (text, opts) {
    this.source = null;
    this.marquee = { text: text, o: Object.assign({ speed: 14, weight: 800, stretch: '125%', fill: 0.62 }, opts || {}), offset: 0 };
    this._sampleMarquee();
    this.wake();
    return this;
  };

  LEDMatrix.prototype.setProgress = function (p) {
    this.progress = p;
    this.wake();
  };

  LEDMatrix.prototype.render = function () {
    if (!this.mask) return;
    this.mask.fill(0);
    var s = this.source;
    if (s && s.type === 'text') this._sampleText(s.text, s.o, this.mask, this.cols);
    if (s && s.type === 'bitmap') this._drawBitmap(s.text, s.o);
    this.wake();
  };

  function setFont(ctx, o, size) {
    ctx.font = (o.weight || 800) + ' ' + size + 'px "Archivo Variable", "Archivo", system-ui, sans-serif';
    if ('fontStretch' in ctx) {
      var map = { '62%': 'extra-condensed', '75%': 'condensed', '100%': 'normal', '112%': 'semi-expanded', '125%': 'expanded' };
      try { ctx.fontStretch = map[o.stretch] || 'expanded'; } catch (e) { /* noop */ }
    }
  }

  // Vzorkovanie textu: 4× supersampling, pokrytie bunky => jas
  LEDMatrix.prototype._sampleText = function (text, o, target, targetCols) {
    var SS = 4, cols = this.cols, rows = this.rows;
    var cw = cols * SS, ch = rows * SS;
    var cv = document.createElement('canvas');
    cv.width = cw; cv.height = ch;
    var ctx = cv.getContext('2d', { willReadFrequently: true });
    var size = ch * o.fill;
    setFont(ctx, o, size);
    var mw = ctx.measureText(text).width;
    var maxW = cw * 0.94;
    if (mw > maxW) { size *= maxW / mw; setFont(ctx, o, size); mw = ctx.measureText(text).width; }
    ctx.fillStyle = '#fff';
    ctx.textBaseline = 'alphabetic';
    var m = ctx.measureText(text);
    var asc = m.actualBoundingBoxAscent || size * 0.72;
    var desc = m.actualBoundingBoxDescent || 0;
    var y = (ch + asc - desc) / 2;
    var x = o.align === 'left' ? cw * 0.03 : (cw - mw) / 2;
    ctx.fillText(text, x, y);
    var data = ctx.getImageData(0, 0, cw, ch).data;
    for (var r = 0; r < rows; r++) {
      for (var c = 0; c < cols; c++) {
        var sum = 0;
        for (var sy = 0; sy < SS; sy++) {
          var row = (r * SS + sy) * cw;
          for (var sx = 0; sx < SS; sx++) sum += data[(row + c * SS + sx) * 4 + 3];
        }
        var cov = sum / (SS * SS * 255);
        target[r * targetCols + c] = cov > 0.42 ? 1 : 0;
      }
    }
  };

  LEDMatrix.prototype._drawBitmap = function (text, o) {
    var chars = Array.from(text.replace(/[   ]/g, ' '));
    var glyphs = chars.map(function (ch) { return GLYPHS[ch] || GLYPHS[' ']; });
    var total = 0;
    glyphs.forEach(function (g, i) { total += g[0].length + (i < glyphs.length - 1 ? 1 : 0); });
    var x0 = o.align === 'left' ? 2 : Math.max(0, Math.floor((this.cols - total) / 2));
    var y0 = Math.max(0, Math.floor((this.rows - 7) / 2));
    var x = x0, cols = this.cols, rows = this.rows, mask = this.mask;
    glyphs.forEach(function (g) {
      for (var gy = 0; gy < 7; gy++) {
        for (var gx = 0; gx < g[gy].length; gx++) {
          if (g[gy][gx] === '1') {
            var cx = x + gx, cy = y0 + gy;
            if (cx >= 0 && cx < cols && cy < rows) mask[cy * cols + cx] = 1;
          }
        }
      }
      x += g[0].length + 1;
    });
  };

  LEDMatrix.prototype._sampleMarquee = function () {
    var mq = this.marquee;
    var rows = this.rows;
    // šírka textu v bunkách
    var probe = document.createElement('canvas').getContext('2d');
    setFont(probe, mq.o, rows * mq.o.fill);
    var wCells = Math.ceil(probe.measureText(mq.text).width * 1.1) + 4;
    var saveCols = this.cols;
    this.cols = wCells;
    var buf = new Float32Array(wCells * rows);
    this._sampleText(mq.text, Object.assign({}, mq.o, { align: 'left' }), buf, wCells);
    this.cols = saveCols;
    mq.buf = buf; mq.w = wCells;
  };

  // ---------- slučka ----------
  LEDMatrix.prototype.wake = function () {
    if (!this.running) {
      this.running = true;
      this._last = performance.now();
      requestAnimationFrame(this._raf);
    }
  };

  LEDMatrix.prototype._raf = function (now) {
    var dt = Math.min(0.05, (now - this._last) / 1000);
    this._last = now;
    this.time += dt;
    var active = this.draw(dt);
    if ((active || this.marquee || this.pointer) && this.visible) {
      requestAnimationFrame(this._raf);
    } else {
      this.running = false;
    }
  };

  LEDMatrix.prototype.draw = function (dt) {
    var ctx = this.ctx, o = this.o;
    var cols = this.cols, rows = this.rows, pitch = this.pitch;
    var mask = this.mask, level = this.level, rank = this.rank;
    var mq = this.marquee;
    if (mq) {
      mq.offset += mq.o.speed * dt;
      if (mq.offset >= mq.w) mq.offset -= mq.w;
    }
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.globalCompositeOperation = 'source-over';
    ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);

    var r = (pitch * o.dot) / 2;
    var k = 1 - Math.pow(1 - o.ease, dt * 60);
    var active = false;
    var p = this.progress;
    var ptr = this.pointer, pr = pitch * 7;
    var rgb = o.gradient ? [255, 255, 255] : this.rgb;
    var mOff = mq ? Math.floor(mq.offset) : 0;

    // rozsvietené body, zoskupené podľa jasu (menej draw callov)
    var BUCKETS = 6;
    var paths = [];
    for (var b = 0; b < BUCKETS; b++) paths.push(new Path2D());
    for (var y = 0; y < rows; y++) {
      for (var x = 0; x < cols; x++) {
        var i = y * cols + x;
        var target;
        if (mq) {
          var mx = (x + mOff) % mq.w;
          target = mq.buf[y * mq.w + mx];
        } else {
          target = mask[i] * (rank[i] <= p ? 1 : 0);
        }
        if (o.flicker && target > 0 && Math.random() < o.flicker) target *= 0.4;
        var lv = level[i];
        if (mq) {
          lv = target > lv ? target : lv + (target - lv) * Math.min(1, k * 2.4);
        } else {
          lv += (target - lv) * k;
        }
        if (Math.abs(target - lv) > 0.004) active = true; else lv = target;
        level[i] = lv;
        if (lv < 0.02) continue;
        var cx = this.offX + x * pitch, cy = this.offY + y * pitch;
        var bi = Math.min(BUCKETS - 1, Math.floor(lv * BUCKETS));
        paths[bi].moveTo(cx + r, cy);
        paths[bi].arc(cx, cy, r, 0, Math.PI * 2);
      }
    }
    for (var bb = 0; bb < BUCKETS; bb++) {
      ctx.fillStyle = 'rgba(' + rgb[0] + ',' + rgb[1] + ',' + rgb[2] + ',' + ((bb + 1) / BUCKETS).toFixed(3) + ')';
      ctx.fill(paths[bb]);
    }

    // farebný prechod (napr. billboard): zafarbí iba rozsvietené body
    if (o.gradient) {
      ctx.globalCompositeOperation = 'source-atop';
      ctx.fillStyle = o.gradient(ctx, this.w, this.h, this.time);
      ctx.fillRect(0, 0, this.w, this.h);
    }

    // zhasnuté body pod rozsvietenými
    ctx.globalCompositeOperation = 'destination-over';
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.drawImage(this.offLayer, 0, 0);
    ctx.globalCompositeOperation = 'source-over';
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);

    // svetelný kruh okolo kurzora
    if (ptr) {
      ctx.fillStyle = 'rgba(255,255,255,0.2)';
      ctx.beginPath();
      var x0 = Math.max(0, Math.floor((ptr.x - pr - this.offX) / pitch)), x1 = Math.min(cols - 1, Math.ceil((ptr.x + pr - this.offX) / pitch));
      var y0 = Math.max(0, Math.floor((ptr.y - pr - this.offY) / pitch)), y1 = Math.min(rows - 1, Math.ceil((ptr.y + pr - this.offY) / pitch));
      for (var yy = y0; yy <= y1; yy++) {
        for (var xx = x0; xx <= x1; xx++) {
          if (level[yy * cols + xx] > 0.5) continue;
          var px = this.offX + xx * pitch, py = this.offY + yy * pitch;
          var d = Math.hypot(px - ptr.x, py - ptr.y);
          if (d < pr) {
            var rr = r * (0.55 + 0.45 * (1 - d / pr));
            ctx.moveTo(px + rr, py);
            ctx.arc(px, py, rr, 0, Math.PI * 2);
          }
        }
      }
      ctx.fill();
    }
    return active;
  };

  LEDMatrix.prototype.destroy = function () {
    if (this.ro) this.ro.disconnect();
    if (this.io) this.io.disconnect();
    this.running = false;
    this.marquee = null;
  };

  window.LEDMatrix = LEDMatrix;
})();
