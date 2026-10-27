/*
 * The 3D electron cloud, drawn on a 2D canvas with a small perspective camera.
 *
 * World units: the sphere that holds 99.9 % of the probability has radius 1, so the box is [-1, 1]^3.
 * Tick labels are written in Bohr radii a0 (sigma / Z), so changing Z relabels the axes.
 */
window.HydView3D = (canvas, plotEl) => {
  'use strict';
  const ctx = canvas.getContext('2d');
  const AXCOL = ['#ff6b6b', '#1dd1a1', '#54a0ff'];
  const AXN = ['x', 'y', 'z'];
  const BUCKETS = 6;                       // depth layers, drawn far to near

  const V0 = { az: -0.95, el: 0.42, zoom: 1 };
  const V = Object.assign({}, V0);
  const opts = { colour: 'sign', dot: 1, nodes: [], showNodes: true, showNucleus: true, z: 1 };

  let W = 800, H = 600, dpr = 1, dirty = true, cam = null;
  let cloud = null, px, py, pz, rad, sx, sy, dep, key, order, counts;
  let frame = null;                        // axes, ticks, box (rebuilt when extent or Z change)

  // ---------------------------------------------------------------- helpers
  function niceTicks(lo, hi, target) {
    const span = hi - lo;
    if (!(span > 0)) return [lo];
    const raw = span / target, p = Math.pow(10, Math.floor(Math.log10(raw))), f = raw / p;
    const step = (f < 1.5 ? 1 : f < 3.5 ? 2 : f < 7.5 ? 5 : 10) * p, out = [];
    for (let v = Math.ceil(lo / step - 1e-9) * step; v <= hi + 1e-9; v += step) out.push(Math.abs(v) < step * 1e-9 ? 0 : +v.toPrecision(12));
    return out;
  }
  function fmt(v) {
    if (v === 0) return '0';
    const a = Math.abs(v);
    return (a >= 1000 || a < 0.01) ? v.toExponential(1).replace('e+', 'e') : String(+v.toPrecision(3));
  }

  // ---------------------------------------------------------------- data in
  function setCloud(c) {
    cloud = c;
    const n = c.n, s = 1 / c.extent;
    px = new Float32Array(n); py = new Float32Array(n); pz = new Float32Array(n);
    rad = new Uint8Array(n);
    for (let i = 0; i < n; i++) {
      const x = c.xyz[3 * i] * s, y = c.xyz[3 * i + 1] * s, z = c.xyz[3 * i + 2] * s;
      px[i] = x; py[i] = y; pz[i] = z;
      rad[i] = Math.min(15, (Math.sqrt(x * x + y * y + z * z) * 16) | 0);
    }
    sx = new Float32Array(n); sy = new Float32Array(n); dep = new Float32Array(n);
    key = new Uint16Array(n); order = new Int32Array(n);
    counts = new Int32Array(BUCKETS * 16 + 1);
    buildFrame();
    dirty = true;
  }

  function setOptions(o) {
    const zChanged = o.z !== undefined && o.z !== opts.z;
    Object.assign(opts, o);
    if (zChanged || o.extent !== undefined) buildFrame();
    dirty = true;
  }

  function buildFrame() {
    if (!cloud) return;
    const segs = [], labels = [], arrows = [];
    const extA0 = cloud.extent / opts.z;            // radius of the cloud in a0
    const add = (p, q, col, w, a) => segs.push({ p, q, col, w, a });
    const vec = (w, v, off) => { const p = [0, 0, 0]; if (off) off.forEach(([k, x]) => (p[k] = x)); p[w] = v; return p; };
    const END = 1.15;
    for (let w = 0; w < 3; w++) {
      add(vec(w, -1), vec(w, END), AXCOL[w], 1.5, 0.9);
      arrows.push({ p: vec(w, END), q: vec(w, 1), col: AXCOL[w] });
      labels.push({ p: vec(w, END + 0.1), text: AXN[w], col: AXCOL[w], size: 14, bold: true });
      const u = (w + 1) % 3;
      niceTicks(-extA0, extA0, 4).forEach(val => {
        const pos = val / extA0;
        if (Math.abs(pos) > 1.0001) return;
        add(vec(w, pos, [[u, -0.025]]), vec(w, pos, [[u, 0.025]]), AXCOL[w], 1.1, 0.85);
        if (val === 0) return;
        labels.push({ p: vec(w, pos), text: fmt(val), col: '#a9a9a9', size: 10.5 });
      });
    }
    const c = [[-1, -1, -1], [1, -1, -1], [1, 1, -1], [-1, 1, -1], [-1, -1, 1], [1, -1, 1], [1, 1, 1], [-1, 1, 1]];
    [[0, 1], [1, 2], [2, 3], [3, 0], [4, 5], [5, 6], [6, 7], [7, 4], [0, 4], [1, 5], [2, 6], [3, 7]].forEach(([i, j]) => add(c[i], c[j], '#7f8fa6', 1, 0.28));
    labels.push({ p: [0, 0, 0], text: '0', col: '#a9a9a9', size: 10.5, origin: true });
    frame = { segs, labels, arrows };
  }

  // ---------------------------------------------------------------- camera
  const R0 = 1.75;
  function setCam() {
    const ce = Math.cos(V.el), se = Math.sin(V.el), ca = Math.cos(V.az), sa = Math.sin(V.az);
    cam = { e: [ce * ca, ce * sa, se], r: [-sa, ca, 0], u: [-se * ca, -se * sa, ce], k: V.zoom * Math.min(W, H) / (2.45 * R0), dist: 4 * R0 };
  }
  const P1 = [0, 0, 0, 0], P2 = [0, 0, 0, 0];
  function proj(x, y, z, o) {
    const s = x * cam.r[0] + y * cam.r[1] + z * cam.r[2];
    const t = x * cam.u[0] + y * cam.u[1] + z * cam.u[2];
    const d = x * cam.e[0] + y * cam.e[1] + z * cam.e[2];
    const f = cam.dist / (cam.dist - d);
    o[0] = W / 2 + s * f * cam.k; o[1] = H / 2 - t * f * cam.k; o[2] = d; o[3] = f;
  }

  function resize() {
    const r = plotEl.getBoundingClientRect();
    dpr = window.devicePixelRatio || 1;
    W = Math.max(50, r.width); H = Math.max(50, r.height);
    canvas.width = Math.round(W * dpr); canvas.height = Math.round(H * dpr);
    dirty = true;
  }
  new ResizeObserver(resize).observe(plotEl);

  // ---------------------------------------------------------------- drawing
  function drawSegs(list) {
    ctx.lineCap = 'round';
    for (const s of list) {
      ctx.globalAlpha = s.a; ctx.strokeStyle = s.col; ctx.lineWidth = s.w;
      ctx.beginPath(); ctx.moveTo(s.x1, s.y1); ctx.lineTo(s.x2, s.y2); ctx.stroke();
    }
    ctx.globalAlpha = 1;
  }

  function drawPoints() {
    const n = cloud.n, K = opts.colour === 'sign' ? 2 : 16, nk = BUCKETS * K;
    const e = cam.e, r = cam.r, u = cam.u, k = cam.k, dist = cam.dist, cx = W / 2, cy = H / 2;
    counts.fill(0, 0, nk + 1);
    for (let i = 0; i < n; i++) {
      const x = px[i], y = py[i], z = pz[i];
      const d = x * e[0] + y * e[1] + z * e[2], f = dist / (dist - d);
      sx[i] = cx + (x * r[0] + y * r[1] + z * r[2]) * f * k;
      sy[i] = cy - (x * u[0] + y * u[1] + z * u[2]) * f * k;
      dep[i] = d;
      let b = ((d + 1) * 0.5 * BUCKETS) | 0;
      b = b < 0 ? 0 : b >= BUCKETS ? BUCKETS - 1 : b;
      const col = K === 2 ? (cloud.sign[i] > 0 ? 0 : 1) : rad[i];
      const kk = b * K + col;
      key[i] = kk;
      counts[kk + 1]++;
    }
    for (let q = 0; q < nk; q++) counts[q + 1] += counts[q];
    const next = counts.slice(0, nk);
    for (let i = 0; i < n; i++) order[next[key[i]]++] = i;

    const base = opts.dot * (0.9 + 0.0016 * Math.min(W, H)) * Math.min(1.5, Math.max(0.65, Math.pow(40000 / n, 0.25)));
    const pos = HydColors.css(HydColors.POS), neg = HydColors.css(HydColors.NEG);
    for (let kk = 0; kk < nk; kk++) {
      const from = counts[kk], to = counts[kk + 1];
      if (to === from) continue;
      const b = (kk / K) | 0, t = b / (BUCKETS - 1), col = kk - b * K;
      const size = base * (0.8 + 0.55 * t);
      ctx.globalAlpha = 0.28 + 0.55 * t;
      ctx.fillStyle = K === 2 ? (col === 0 ? pos : neg) : HydColors.css(HydColors.ramp(col / 15));
      ctx.beginPath();
      const half = size / 2;
      for (let q = from; q < to; q++) {
        const i = order[q];
        ctx.rect(sx[i] - half, sy[i] - half, size, size);
      }
      ctx.fill();
    }
    ctx.globalAlpha = 1;
  }

  function drawNodes() {
    ctx.save();
    ctx.setLineDash([3, 4]); ctx.strokeStyle = '#d7e3ea'; ctx.lineWidth = 1; ctx.globalAlpha = 0.34;
    const steps = 96;
    for (const sigma of opts.nodes) {
      const rr = sigma / cloud.extent;
      for (let plane = 0; plane < 3; plane++) {
        ctx.beginPath();
        for (let i = 0; i <= steps; i++) {
          const a = 2 * Math.PI * i / steps, c = rr * Math.cos(a), s = rr * Math.sin(a);
          if (plane === 0) proj(c, s, 0, P1); else if (plane === 1) proj(c, 0, s, P1); else proj(0, c, s, P1);
          if (i === 0) ctx.moveTo(P1[0], P1[1]); else ctx.lineTo(P1[0], P1[1]);
        }
        ctx.stroke();
      }
    }
    ctx.restore();
  }

  function drawLegend() {
    ctx.font = '12px system-ui, sans-serif'; ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
    const rows = opts.colour === 'sign'
      ? [[HydColors.css(HydColors.POS), 'ψ > 0'], [HydColors.css(HydColors.NEG), 'ψ < 0']]
      : [['#d8e86a', 'colour = distance from the nucleus (dark = near)']];
    rows.forEach(([col, text], i) => {
      ctx.fillStyle = col; ctx.fillRect(12, 16 + i * 18 - 4, 8, 8);
      ctx.fillStyle = '#c9c9c9'; ctx.fillText(text, 28, 16 + i * 18);
    });
    ctx.fillStyle = '#8d8d8d';
    ctx.fillText(`axes in Bohr radii a₀ · box edge = ${fmt(cloud.extent / opts.z)} a₀ (99.9 % of the cloud)`, 12, H - 14);
  }

  function draw() {
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.fillStyle = '#14151a'; ctx.fillRect(0, 0, W, H);
    if (!cloud || !frame) return;
    setCam();
    const back = [], front = [];
    for (const s of frame.segs) {
      proj(s.p[0], s.p[1], s.p[2], P1); proj(s.q[0], s.q[1], s.q[2], P2);
      (((P1[2] + P2[2]) / 2 < 0) ? back : front).push({ x1: P1[0], y1: P1[1], x2: P2[0], y2: P2[1], col: s.col, w: s.w, a: s.a });
    }
    drawSegs(back);
    drawPoints();
    if (opts.showNodes && opts.nodes.length) drawNodes();
    drawSegs(front);

    if (opts.showNucleus) {
      proj(0, 0, 0, P1);
      ctx.fillStyle = '#ffffff'; ctx.beginPath(); ctx.arc(P1[0], P1[1], 2.6, 0, 6.2832); ctx.fill();
    }
    for (const ar of frame.arrows) {
      proj(ar.p[0], ar.p[1], ar.p[2], P1); proj(ar.q[0], ar.q[1], ar.q[2], P2);
      const dx = P1[0] - P2[0], dy = P1[1] - P2[1], len = Math.hypot(dx, dy) || 1, ux = dx / len, uy = dy / len;
      ctx.fillStyle = ar.col; ctx.beginPath();
      ctx.moveTo(P1[0] + ux * 4, P1[1] + uy * 4);
      ctx.lineTo(P1[0] - ux * 8 - uy * 4, P1[1] - uy * 8 + ux * 4);
      ctx.lineTo(P1[0] - ux * 8 + uy * 4, P1[1] - uy * 8 - ux * 4);
      ctx.closePath(); ctx.fill();
    }
    const C = [0, 0, 0, 0]; proj(0, 0, 0, C);
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    const placed = [];
    for (const l of frame.labels) {
      proj(l.p[0], l.p[1], l.p[2], P1);
      if (!l.bold) {                                   // skip tick labels that would overlap one already drawn
        if (placed.some(q => Math.abs(q[0] - P1[0]) < 26 && Math.abs(q[1] - P1[1]) < 13)) continue;
        placed.push([P1[0], P1[1]]);
      }
      const vx = P1[0] - C[0], vy = P1[1] - C[1], vl = Math.hypot(vx, vy) || 1, off = l.bold ? 6 : (l.origin ? 10 : 12);
      ctx.font = `${l.bold ? '600 ' : ''}${l.size}px system-ui, sans-serif`;
      ctx.fillStyle = l.col;
      ctx.fillText(l.text, P1[0] + (l.origin ? 8 : vx / vl * off), P1[1] + (l.origin ? 10 : vy / vl * off));
    }
    drawLegend();
  }

  // ---------------------------------------------------------------- interaction
  const clampEl = e => Math.max(-Math.PI / 2, Math.min(Math.PI / 2, e));
  let drag = null, spin = false, last = performance.now();
  canvas.addEventListener('pointerdown', e => { drag = { x: e.clientX, y: e.clientY }; canvas.setPointerCapture(e.pointerId); });
  canvas.addEventListener('pointermove', e => {
    if (!drag) return;
    V.az -= (e.clientX - drag.x) * 0.008;
    V.el = clampEl(V.el + (e.clientY - drag.y) * 0.008);
    drag.x = e.clientX; drag.y = e.clientY; dirty = true;
  });
  const end = () => { drag = null; };
  canvas.addEventListener('pointerup', end);
  canvas.addEventListener('pointercancel', end);
  canvas.addEventListener('wheel', e => { e.preventDefault(); V.zoom = Math.max(0.4, Math.min(5, V.zoom * Math.exp(-e.deltaY * 0.001))); dirty = true; }, { passive: false });
  canvas.addEventListener('dblclick', () => { Object.assign(V, V0); dirty = true; });
  canvas.addEventListener('keydown', e => {
    const m = { ArrowLeft: [0.08, 0], ArrowRight: [-0.08, 0], ArrowUp: [0, -0.08], ArrowDown: [0, 0.08] }[e.key];
    if (m) { V.az += m[0]; V.el = clampEl(V.el + m[1]); e.preventDefault(); dirty = true; }
    else if (e.key === '+' || e.key === '=') { V.zoom = Math.min(5, V.zoom * 1.1); dirty = true; }
    else if (e.key === '-') { V.zoom = Math.max(0.4, V.zoom / 1.1); dirty = true; }
  });
  const PRESETS = { iso: [V0.az, V0.el], xy: [-Math.PI / 2, Math.PI / 2], xz: [-Math.PI / 2, 0], yz: [0, 0] };

  function loop(now) {
    requestAnimationFrame(loop);
    const dt = Math.min(0.1, (now - last) / 1000); last = now;
    if (spin) { V.az -= dt * 0.45; dirty = true; }
    if (dirty) { dirty = false; draw(); }
  }

  resize();
  requestAnimationFrame(loop);

  return {
    setCloud, setOptions, resize,
    setSpin: on => { spin = on; },
    preset: name => { [V.az, V.el] = PRESETS[name]; dirty = true; },
    redraw: () => { dirty = true; },
    view: V,
    // for the automated browser tests: where a point of the cloud lands on screen
    stats: () => ({ n: cloud ? cloud.n : 0, W, H })
  };
};
