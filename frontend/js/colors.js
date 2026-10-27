/* Colour helpers shared by the 3D view and the plots. */
window.HydColors = (() => {
  'use strict';

  // viridis-like ramp (same as the particle-in-a-box page)
  const STOPS = [[0, .02, .02, .10], [.25, .15, .12, .45], [.5, .10, .55, .60], [.75, .45, .85, .35], [1, .99, .95, .25]];
  function ramp(v) {
    v = Math.pow(Math.min(1, Math.max(0, v)), 0.75);
    let k = 0;
    while (k < STOPS.length - 2 && v > STOPS[k + 1][0]) k++;
    const a = STOPS[k], b = STOPS[k + 1], u = (v - a[0]) / (b[0] - a[0]);
    return [0, 1, 2].map(c => Math.round(255 * (a[c + 1] + u * (b[c + 1] - a[c + 1]))));
  }

  const POS = [255, 159, 67], NEG = [84, 160, 255], MID = [44, 46, 58];
  const mix = (c0, c1, u) => [0, 1, 2].map(i => Math.round(c0[i] + u * (c1[i] - c0[i])));
  const css = c => `rgb(${c[0]},${c[1]},${c[2]})`;

  /** Diverging colour for v in [-1, 1]: orange for positive, blue for negative, dark grey at 0. */
  function diverging(v) {
    const m = Math.pow(Math.min(1, Math.abs(v)), 0.8);
    return mix(MID, v >= 0 ? POS : NEG, m);
  }

  return { ramp, diverging, css, POS, NEG, MID, mix };
})();
