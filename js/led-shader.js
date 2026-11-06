/*
 * SLEDShader – WebGL LED efekt nad hero videom.
 *  - intro:  obraz sa poskladá z rozsvecujúcich sa LED bodov, ktoré sa zmenšujú do ostrého videa
 *  - lens:   okolo kurzora „lupa“ odhaľuje LED štruktúru obrazovky
 *  - out:    pri odchode zo sekcie sa obraz rozpadá do väčších pixelov
 * Ak WebGL nie je dostupné, vráti null a zostane obyčajné video.
 */
(function () {
  'use strict';

  var VERT = [
    'attribute vec2 aPos;',
    'void main(){ gl_Position = vec4(aPos, 0.0, 1.0); }'
  ].join('\n');

  var FRAG = [
    'precision highp float;',
    'uniform sampler2D uTex;',
    'uniform vec2 uRes;',
    'uniform vec2 uVid;',
    'uniform vec2 uMouse;',
    'uniform float uLens;',
    'uniform float uIntro;',
    'uniform float uOut;',
    'uniform float uDpr;',
    'uniform float uTime;',

    'vec2 coverUv(vec2 frag){',
    '  vec2 uv = frag / uRes;',
    '  float sr = uRes.x / uRes.y;',
    '  float vr = uVid.x / uVid.y;',
    '  vec2 s = sr > vr ? vec2(1.0, vr / sr) : vec2(sr / vr, 1.0);',
    '  uv = (uv - 0.5) * s + 0.5;',
    '  return vec2(uv.x, 1.0 - uv.y);',
    '}',
    'vec3 vid(vec2 frag){ return texture2D(uTex, clamp(coverUv(frag), 0.001, 0.999)).rgb; }',
    'float hash(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }',

    'vec3 led(vec2 frag, float cell, float on){',
    '  vec2 id = floor(frag / cell);',
    '  vec2 c = (id + 0.5) * cell;',
    '  vec3 col = vid(c);',
    '  vec2 f = fract(frag / cell) - 0.5;',
    '  float d = length(f);',
    '  float core = smoothstep(0.44, 0.28, d);',
    '  float halo = exp(-d * d * 10.0) * 0.32;',
    '  col = pow(col, vec3(0.88)) * 1.3;',
    '  return col * (core + halo) * on;',
    '}',

    'void main(){',
    '  vec2 frag = gl_FragCoord.xy;',
    '  vec3 sharp = vid(frag);',

    // intro
    '  float introMask = 1.0 - smoothstep(0.72, 1.0, uIntro);',
    '  float cellI = mix(34.0, 7.0, smoothstep(0.2, 0.85, uIntro)) * uDpr;',
    '  vec2 idI = floor(frag / cellI);',
    '  vec2 uvN = (idI * cellI) / uRes;',
    '  float th = hash(idI) * 0.55 + length(uvN - vec2(0.5, 0.45)) * 0.75;',
    '  float on = smoothstep(th, th + 0.1, uIntro * 1.55);',
    '  vec3 ledIntro = led(frag, cellI, on);',

    // scroll out
    '  float cellO = mix(6.0, 46.0, uOut) * uDpr;',
    '  vec3 ledOut = led(frag, cellO, 1.0) * (1.0 - uOut * 0.55);',
    '  float outMask = smoothstep(0.0, 0.18, uOut);',

    // lens
    '  vec2 dm = frag - uMouse;',
    '  float R = 170.0 * uDpr;',
    '  float dist = length(dm);',
    '  float lensMask = (1.0 - smoothstep(R * 0.62, R, dist)) * uLens;',
    '  vec3 ledLens = led(uMouse + dm * 0.8, 8.0 * uDpr, 1.0);',
    '  float ring = smoothstep(R * 1.0, R * 0.95, dist) * smoothstep(R * 0.88, R * 0.95, dist) * uLens;',

    '  vec3 col = sharp;',
    '  col = mix(col, ledLens, lensMask);',
    '  col += vec3(0.93, 0.08, 0.40) * ring * 0.55;',
    '  col = mix(col, ledOut, outMask);',
    '  col = mix(col, ledIntro, introMask);',
    '  gl_FragColor = vec4(col, 1.0);',
    '}'
  ].join('\n');

  function compile(gl, type, src) {
    var s = gl.createShader(type);
    gl.shaderSource(s, src);
    gl.compileShader(s);
    if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) {
      console.warn('[sLED] shader:', gl.getShaderInfoLog(s));
      return null;
    }
    return s;
  }

  function init(canvas, video, opts) {
    opts = opts || {};
    var gl;
    try {
      gl = canvas.getContext('webgl', { antialias: false, alpha: false, depth: false, stencil: false, powerPreference: 'high-performance' });
    } catch (e) { gl = null; }
    if (!gl) return null;

    var vs = compile(gl, gl.VERTEX_SHADER, VERT);
    var fs = compile(gl, gl.FRAGMENT_SHADER, FRAG);
    if (!vs || !fs) return null;
    var prog = gl.createProgram();
    gl.attachShader(prog, vs);
    gl.attachShader(prog, fs);
    gl.linkProgram(prog);
    if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) return null;
    gl.useProgram(prog);

    var buf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
    var aPos = gl.getAttribLocation(prog, 'aPos');
    gl.enableVertexAttribArray(aPos);
    gl.vertexAttribPointer(aPos, 2, gl.FLOAT, false, 0, 0);

    var tex = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGB, 1, 1, 0, gl.RGB, gl.UNSIGNED_BYTE, new Uint8Array([5, 5, 6]));

    var U = {};
    ['uTex', 'uRes', 'uVid', 'uMouse', 'uLens', 'uIntro', 'uOut', 'uDpr', 'uTime'].forEach(function (n) {
      U[n] = gl.getUniformLocation(prog, n);
    });
    gl.uniform1i(U.uTex, 0);

    var maxDpr = opts.maxDpr || 1.5;
    var state = {
      intro: 0, out: 0,
      lens: 0, lensTarget: 0,
      mx: 0, my: 0, tx: 0, ty: 0,
      dpr: 1, w: 1, h: 1,
      visible: true, running: false, failed: false, hasFrame: false,
      vw: 1920, vh: 1080
    };

    function resize() {
      state.dpr = Math.min(window.devicePixelRatio || 1, maxDpr);
      state.w = canvas.clientWidth || window.innerWidth;
      state.h = canvas.clientHeight || window.innerHeight;
      canvas.width = Math.round(state.w * state.dpr);
      canvas.height = Math.round(state.h * state.dpr);
      gl.viewport(0, 0, canvas.width, canvas.height);
    }
    resize();
    var ro = 'ResizeObserver' in window ? new ResizeObserver(resize) : null;
    if (ro) ro.observe(canvas); else window.addEventListener('resize', resize);

    var target = opts.pointerTarget;
    if (target && opts.lens !== false) {
      target.addEventListener('pointermove', function (e) {
        if (e.pointerType !== 'mouse') return;
        var r = canvas.getBoundingClientRect();
        state.tx = (e.clientX - r.left) * state.dpr;
        state.ty = (r.height - (e.clientY - r.top)) * state.dpr;
        if (state.lensTarget === 0) { state.mx = state.tx; state.my = state.ty; }
        state.lensTarget = 1;
      });
      target.addEventListener('pointerleave', function () { state.lensTarget = 0; });
    }

    function upload() {
      if (video.readyState < 2) return;
      try {
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGB, gl.RGB, gl.UNSIGNED_BYTE, video);
        state.vw = video.videoWidth || state.vw;
        state.vh = video.videoHeight || state.vh;
        state.hasFrame = true;
      } catch (err) {
        state.failed = true;
        if (opts.onFail) opts.onFail(err);
      }
    }

    var t0 = performance.now();
    function frame(now) {
      if (!state.visible || state.failed) { state.running = false; return; }
      upload();
      state.mx += (state.tx - state.mx) * 0.14;
      state.my += (state.ty - state.my) * 0.14;
      state.lens += (state.lensTarget * (1 - state.out) - state.lens) * 0.08;
      gl.uniform2f(U.uRes, canvas.width, canvas.height);
      gl.uniform2f(U.uVid, state.vw, state.vh);
      gl.uniform2f(U.uMouse, state.mx, state.my);
      gl.uniform1f(U.uLens, state.lens);
      gl.uniform1f(U.uIntro, state.hasFrame ? state.intro : 0);
      gl.uniform1f(U.uOut, state.out);
      gl.uniform1f(U.uDpr, state.dpr);
      gl.uniform1f(U.uTime, (now - t0) / 1000);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
      requestAnimationFrame(frame);
    }
    function start() {
      if (state.running || !state.visible) return;
      state.running = true;
      requestAnimationFrame(frame);
    }

    if ('IntersectionObserver' in window) {
      new IntersectionObserver(function (entries) {
        state.visible = entries[0].isIntersecting && !document.hidden;
        if (state.visible) start();
      }).observe(canvas);
    }
    document.addEventListener('visibilitychange', function () {
      state.visible = !document.hidden;
      if (state.visible) start();
    });

    canvas.addEventListener('webglcontextlost', function (e) {
      e.preventDefault();
      state.failed = true;
      if (opts.onFail) opts.onFail(new Error('context lost'));
    });

    start();

    return {
      state: state,
      setIntro: function (v) { state.intro = v; },
      setOut: function (v) { state.out = v; }
    };
  }

  window.SLEDShader = { init: init };
})();
