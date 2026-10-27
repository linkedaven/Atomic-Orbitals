/* Talks to the Java backend. Every function returns a promise and throws an Error with a readable message. */
window.HydApi = (() => {
  'use strict';

  async function json(url, signal) {
    let r;
    try {
      r = await fetch(url, { signal });
    } catch (e) {
      if (e.name === 'AbortError') throw e;
      throw new Error('Cannot reach the Java server. Is it still running?');
    }
    const body = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(body.error || 'The server answered with HTTP ' + r.status + '.');
    return body;
  }

  const id = s => encodeURIComponent(s);

  return {
    orbitals: () => json('/api/orbitals'),
    orbital: (orbitalId, z, signal) => json(`/api/orbital?id=${id(orbitalId)}&z=${z}`, signal),
    slice: (orbitalId, plane, res, z, signal) => json(`/api/slice?id=${id(orbitalId)}&plane=${plane}&res=${res}&z=${z}`, signal),

    /**
     * Random points distributed as |psi|^2. Binary reply: int32 N, N x (x, y, z) as float32 (sigma units),
     * then N int8 signs of psi.
     */
    async cloud(orbitalId, count, seed, signal) {
      let r;
      try {
        r = await fetch(`/api/cloud?id=${id(orbitalId)}&count=${count}&seed=${seed}`, { signal });
      } catch (e) {
        if (e.name === 'AbortError') throw e;
        throw new Error('Cannot reach the Java server. Is it still running?');
      }
      if (!r.ok) {
        const body = await r.json().catch(() => ({}));
        throw new Error(body.error || 'The server answered with HTTP ' + r.status + '.');
      }
      const buf = await r.arrayBuffer();
      const n = new DataView(buf).getInt32(0, true);
      return {
        n,
        xyz: new Float32Array(buf, 4, 3 * n),
        sign: new Int8Array(buf, 4 + 12 * n, n),
        extent: parseFloat(r.headers.get('X-Extent-Sigma'))
      };
    },

    ping: () => fetch('/api/ping', { method: 'POST' }).catch(() => {}),
    bye: () => navigator.sendBeacon && navigator.sendBeacon('/api/bye')
  };
})();
