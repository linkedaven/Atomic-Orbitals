/* The two small plots: radial probability and the cross-section through the nucleus. */
window.HydPlots = (() => {
  'use strict';

  function prep(canvas) {
    const r = canvas.parentElement.getBoundingClientRect(), dpr = window.devicePixelRatio || 1;
    const W = Math.max(40, r.width), H = Math.max(40, r.height);
    if (canvas.width !== Math.round(W * dpr) || canvas.height !== Math.round(H * dpr)) {
      canvas.width = Math.round(W * dpr); canvas.height = Math.round(H * dpr);
    }
    const ctx = canvas.getContext('2d');
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.fillStyle = '#14151a'; ctx.fillRect(0, 0, W, H);
    return { ctx, W, H };
  }

  function niceTicks(lo, hi, target) {
    const span = hi - lo;
    if (!(span > 0)) return [lo];
    const raw = span / target, p = Math.pow(10, Math.floor(Math.log10(raw))), f = raw / p;
    const step = (f < 1.5 ? 1 : f < 3.5 ? 2 : f < 7.5 ? 5 : 10) * p, out = [];
    for (let v = Math.ceil(lo / step - 1e-9) * step; v <= hi + 1e-9; v += step) out.push(Math.abs(v) < step * 1e-9 ? 0 : +v.toPrecision(12));
    return out;
  }
  const fmt = v => (v === 0 ? '0' : String(+v.toPrecision(3)));

  /** Radial probability density r^2 R^2 against r in Bohr radii, with the nodes and the mean marked. */
  function drawRadial(canvas, info) {
    const { ctx, W, H } = prep(canvas);
    if (!info) return;
    const rr = info.radial.r, P = info.radial.P;
    const L = 12, R = 10, T = 22, B = 28, pw = W - L - R, ph = H - T - B;
    const xmax = rr[rr.length - 1];
    let ymax = 0;
    for (const v of P) ymax = Math.max(ymax, v);
    ymax *= 1.12;
    const X = r => L + (r / xmax) * pw, Y = p => T + ph - (p / ymax) * ph;

    // axis and ticks
    ctx.strokeStyle = '#555'; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(L, T + ph); ctx.lineTo(L + pw, T + ph); ctx.stroke();
    ctx.font = '10.5px system-ui, sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'top'; ctx.fillStyle = '#a9a9a9';
    niceTicks(0, xmax, 5).forEach(v => {
      ctx.beginPath(); ctx.moveTo(X(v), T + ph); ctx.lineTo(X(v), T + ph + 4); ctx.stroke();
      ctx.fillText(fmt(v), X(v), T + ph + 6);
    });
    ctx.textAlign = 'right'; ctx.fillText('r (a₀)', W - R, H - 12);

    // nodes (behind the curve)
    ctx.setLineDash([3, 3]);
    ctx.strokeStyle = 'rgba(215,227,234,.55)';
    info.nodesA0.forEach(v => { ctx.beginPath(); ctx.moveTo(X(v), T); ctx.lineTo(X(v), T + ph); ctx.stroke(); });
    ctx.strokeStyle = HydColors.css(HydColors.NEG);
    ctx.beginPath(); ctx.moveTo(X(info.meanA0), T); ctx.lineTo(X(info.meanA0), T + ph); ctx.stroke();
    ctx.setLineDash([]);

    // curve
    const grad = ctx.createLinearGradient(0, T, 0, T + ph);
    grad.addColorStop(0, 'rgba(29,209,161,.35)'); grad.addColorStop(1, 'rgba(29,209,161,.03)');
    ctx.beginPath(); ctx.moveTo(X(rr[0]), Y(0));
    for (let i = 0; i < rr.length; i++) ctx.lineTo(X(rr[i]), Y(P[i]));
    ctx.lineTo(X(rr[rr.length - 1]), Y(0)); ctx.closePath(); ctx.fillStyle = grad; ctx.fill();
    ctx.beginPath();
    for (let i = 0; i < rr.length; i++) { if (i === 0) ctx.moveTo(X(rr[i]), Y(P[i])); else ctx.lineTo(X(rr[i]), Y(P[i])); }
    ctx.strokeStyle = '#1dd1a1'; ctx.lineWidth = 2; ctx.stroke();

    // most probable radius
    let pk = 0;
    for (let i = 1; i < P.length; i++) if (P[i] > P[pk]) pk = i;
    ctx.fillStyle = '#ff9f43'; ctx.beginPath(); ctx.arc(X(info.peakA0), Y(P[pk]), 3.5, 0, 6.2832); ctx.fill();

    // legend
    ctx.font = '11px system-ui, sans-serif'; ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
    let lx = L + 2;
    const item = (col, text, dot) => {
      ctx.fillStyle = col;
      if (dot) { ctx.beginPath(); ctx.arc(lx + 4, 10, 3.5, 0, 6.2832); ctx.fill(); } else ctx.fillRect(lx, 8.5, 9, 3);
      ctx.fillStyle = '#bdbdbd'; ctx.fillText(text, lx + 13, 10);
      lx += 13 + ctx.measureText(text).width + 12;
    };
    item('#ff9f43', 'most probable', true);
    item(HydColors.css(HydColors.NEG), '⟨r⟩', false);
    if (info.nodesA0.length) item('rgba(215,227,234,.8)', 'radial nodes', false);
  }

  /**
   * Cross-section through the nucleus. mode 'psi' shows the signed wave function, 'density' shows psi^2.
   * Axis labels are in a0 (sigma / Z). plane tells which two axes are shown.
   */
  function drawSlice(canvas, slice, mode) {
    const { ctx, W, H } = prep(canvas);
    if (!slice) return;
    const res = slice.res, ext = slice.extentA0;
    const L = 30, R = 8, T = 8, B = 26, pw = W - L - R, ph = H - T - B, size = Math.min(pw, ph);
    const x0 = L + (pw - size) / 2, y0 = T + (ph - size) / 2;

    const off = document.createElement('canvas'); off.width = res; off.height = res;
    const octx = off.getContext('2d'), img = octx.createImageData(res, res);
    for (let i = 0; i < res * res; i++) {
      const v = slice.psi[i];
      const c = mode === 'psi' ? HydColors.diverging(v) : HydColors.ramp(v * v);
      img.data[4 * i] = c[0]; img.data[4 * i + 1] = c[1]; img.data[4 * i + 2] = c[2]; img.data[4 * i + 3] = 255;
    }
    octx.putImageData(img, 0, 0);
    ctx.imageSmoothingEnabled = true; ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(off, x0, y0, size, size);

    const hName = slice.plane[0], vName = slice.plane[1];
    ctx.strokeStyle = '#555'; ctx.lineWidth = 1; ctx.strokeRect(x0 + 0.5, y0 + 0.5, size - 1, size - 1);
    ctx.font = '10.5px system-ui, sans-serif'; ctx.fillStyle = '#a9a9a9';
    const ticks = niceTicks(-ext, ext, 4);
    ctx.textAlign = 'center'; ctx.textBaseline = 'top';
    ticks.forEach(v => { const x = x0 + (v + ext) / (2 * ext) * size; ctx.beginPath(); ctx.moveTo(x, y0 + size); ctx.lineTo(x, y0 + size + 4); ctx.stroke(); ctx.fillText(fmt(v), x, y0 + size + 6); });
    ctx.textAlign = 'right'; ctx.textBaseline = 'middle';
    ticks.forEach(v => { const y = y0 + size - (v + ext) / (2 * ext) * size; ctx.beginPath(); ctx.moveTo(x0 - 4, y); ctx.lineTo(x0, y); ctx.stroke(); ctx.fillText(fmt(v), x0 - 6, y); });

    // an orbital can vanish identically on a coordinate plane (for example fxyz on y = 0): say so
    if (!(slice.max > 1e-9)) {
      ctx.fillStyle = 'rgba(0,0,0,.55)'; ctx.fillRect(x0 + 8, y0 + size / 2 - 22, size - 16, 44);
      ctx.fillStyle = '#e0e0e0'; ctx.font = '600 12px system-ui, sans-serif';
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText('ψ = 0 everywhere on this plane', x0 + size / 2, y0 + size / 2 - 8);
      ctx.font = '11px system-ui, sans-serif'; ctx.fillStyle = '#a9a9a9';
      ctx.fillText('it is a nodal plane – try another plane', x0 + size / 2, y0 + size / 2 + 9);
    }

    // axis names and the nucleus
    ctx.fillStyle = '#e0e0e0'; ctx.font = '600 12px system-ui, sans-serif';
    ctx.textAlign = 'right'; ctx.textBaseline = 'bottom'; ctx.fillText(hName + ' (a₀)', x0 + size - 4, y0 + size - 4);
    ctx.textAlign = 'left'; ctx.textBaseline = 'top'; ctx.fillText(vName, x0 + 5, y0 + 4);
    const cx = x0 + size / 2, cy = y0 + size / 2;
    ctx.strokeStyle = 'rgba(255,255,255,.55)'; ctx.beginPath(); ctx.moveTo(cx - 5, cy); ctx.lineTo(cx + 5, cy); ctx.moveTo(cx, cy - 5); ctx.lineTo(cx, cy + 5); ctx.stroke();
  }

  return { drawRadial, drawSlice };
})();
