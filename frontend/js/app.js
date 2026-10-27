/* Page logic: picks the orbital, asks the Java backend for numbers, and feeds the 3D view and the plots. */
(() => {
  'use strict';
  const $ = id => document.getElementById(id);
  const view = HydView3D($('cv'), $('plot'));

  const state = {
    catalogue: null,
    id: '3dz2',          // the orbital on show
    z: 1,
    count: 40000,
    seed: 1,
    plane: 'xz',
    info: null,
    slice: null,
    loading: 0
  };

  // ---------------------------------------------------------------- small helpers
  const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const num = (v, d) => (Math.abs(v) >= 1000 || (v !== 0 && Math.abs(v) < 0.01) ? v.toExponential(d - 1) : String(+v.toPrecision(d)));
  function labelHtml(n, shellLetter, sub) { return `${n}${shellLetter}${sub ? `<sub>${esc(sub)}</sub>` : ''}`; }
  function showMessage(t) { const m = $('msg'); m.hidden = !t; m.textContent = t || ''; }
  const findSubshell = id => state.catalogue.subshells.find(s => s.orbitals.some(o => o.id === id));

  // ---------------------------------------------------------------- orbital picker
  function buildPicker() {
    const box = $('shells');
    box.innerHTML = '';
    for (let n = 1; n <= 8; n++) {
      const lab = document.createElement('div');
      lab.className = 'nlab'; lab.textContent = n;
      box.appendChild(lab);
      for (let l = 0; l < 4; l++) {
        const sub = state.catalogue.subshells.find(s => s.n === n && s.l === l);
        const b = document.createElement('button');
        if (!sub) { b.className = 'gap'; b.disabled = true; b.textContent = '-'; box.appendChild(b); continue; }
        b.textContent = sub.shell;
        b.dataset.shell = sub.shell;
        b.addEventListener('click', () => chooseSubshell(sub));
        box.appendChild(b);
      }
    }
  }

  function chooseSubshell(sub) {
    const cur = findSubshell(state.id);
    // keep the same position in the list when moving between subshells of the same letter (3dxz -> 4dxz)
    const idx = cur && cur.l === sub.l ? Math.max(0, cur.orbitals.findIndex(o => o.id === state.id)) : 0;
    select(sub.orbitals[idx].id);
  }

  function refreshPicker() {
    const sub = findSubshell(state.id);
    document.querySelectorAll('#shells button[data-shell]').forEach(b => b.classList.toggle('on', b.dataset.shell === sub.shell));
    const box = $('orients');
    box.innerHTML = '';
    if (sub.orbitals.length === 1) {
      const t = document.createElement('span'); t.className = 'note'; t.textContent = 'one orbital, spherical';
      box.appendChild(t);
      return;
    }
    const letter = sub.shell.slice(-1);
    sub.orbitals.forEach(o => {
      const b = document.createElement('button');
      b.innerHTML = labelHtml(sub.n, letter, o.sub);
      b.className = o.id === state.id ? 'on' : '';
      b.title = o.label;
      b.addEventListener('click', () => select(o.id));
      box.appendChild(b);
    });
  }

  // ---------------------------------------------------------------- loading
  let abortInfo = null, abortCloud = null, abortSlice = null, seqInfo = 0, seqCloud = 0, seqSlice = 0;

  function busy(delta) { state.loading += delta; document.body.style.cursor = state.loading > 0 ? 'progress' : ''; }

  async function loadInfo() {
    const my = ++seqInfo;
    if (abortInfo) abortInfo.abort();
    abortInfo = new AbortController();
    busy(1);
    try {
      const info = await HydApi.orbital(state.id, state.z, abortInfo.signal);
      if (my !== seqInfo) return;
      state.info = info;
      renderInfo();
      view.setOptions({ nodes: info.nodesSigma, z: state.z });
      HydPlots.drawRadial($('radial'), info);
    } catch (e) { if (e.name !== 'AbortError') showMessage(e.message); }
    finally { busy(-1); }
  }

  async function loadCloud() {
    const my = ++seqCloud;
    if (abortCloud) abortCloud.abort();
    abortCloud = new AbortController();
    busy(1);
    try {
      const cloud = await HydApi.cloud(state.id, state.count, state.seed, abortCloud.signal);
      if (my !== seqCloud) return;
      showMessage('');
      view.setCloud(cloud);
      view.setOptions({ z: state.z });
      renderChips();
    } catch (e) { if (e.name !== 'AbortError') showMessage(e.message); }
    finally { busy(-1); }
  }

  // `auto` is true right after a new orbital is chosen: if it vanishes on the current plane, move to a plane where it does not
  async function loadSlice(auto) {
    const my = ++seqSlice;
    if (abortSlice) abortSlice.abort();
    abortSlice = new AbortController();
    busy(1);
    try {
      let slice = await HydApi.slice(state.id, state.plane, 161, state.z, abortSlice.signal);
      if (auto && !(slice.max > 1e-9)) {
        for (const p of ['xz', 'yz', 'xy']) {
          if (p === state.plane) continue;
          const s2 = await HydApi.slice(state.id, p, 161, state.z, abortSlice.signal);
          if (s2.max > 1e-9) {
            slice = s2; state.plane = p;
            document.querySelectorAll('[data-plane]').forEach(x => x.classList.toggle('on', x.dataset.plane === p));
            break;
          }
        }
      }
      if (my !== seqSlice) return;
      state.slice = slice;
      HydPlots.drawSlice($('slice'), slice, $('sliceMode').value);
    } catch (e) { if (e.name !== 'AbortError') showMessage(e.message); }
    finally { busy(-1); }
  }

  function select(id) {
    state.id = id;
    state.seed = 1 + Math.floor(Math.random() * 1e6);
    refreshPicker();
    loadInfo(); loadCloud(); loadSlice(true);
  }

  // ---------------------------------------------------------------- text panels
  function renderInfo() {
    const i = state.info;
    const sym = labelHtml(i.n, i.shell.slice(-1), i.sub);
    const nodes = i.nodesA0.length ? i.nodesA0.map(v => num(v, 3)).join(', ') + ' a₀' : 'none';
    const rows = [
      ['Energy', `${num(i.energyEV, 4)} eV`],
      ['Quantum numbers', `n = ${i.n}, l = ${i.l}`],
      ['Radial nodes', `${i.radialNodes}`],
      ['Node radii', nodes],
      ['Angular nodes', `${i.angularNodes}`],
      ['Total nodes (n − 1)', `${i.totalNodes}`],
      ['Mean radius ⟨r⟩', `${num(i.meanA0, 4)} a₀`],
      ['Most probable r', `${num(i.peakA0, 4)} a₀`],
      ['99.9 % inside', `${num(i.extentA0, 4)} a₀`]
    ];
    $('props').innerHTML = rows.map(([k, v]) => `<dt>${k}</dt><dd>${v}</dd>`).join('');
    $('formulas').innerHTML =
      `<p><span class="tag">Orbital</span> ${sym}: &psi; = R<sub>${i.n}${i.l}</sub>(&sigma;) &middot; Y</p>` +
      `<p><span class="tag">Radial</span><br>${esc(i.radialFormula)}</p>` +
      `<p><span class="tag">Angular (Cartesian form)</span><br>Y = ${esc(i.angularFormula)}</p>` +
      `<p class="muted">&sigma; = Zr/a<sub>0</sub>. Energy E = &minus;13.6 Z&sup2;/n&sup2; eV.</p>`;
    renderChips();
  }

  function renderChips() {
    const i = state.info;
    if (!i) { $('chips').innerHTML = ''; return; }
    $('chips').innerHTML =
      `<span><b>${labelHtml(i.n, i.shell.slice(-1), i.sub)}</b> &middot; Z = <b>${i.z}</b></span>` +
      `<span>E = <b>${num(i.energyEV, 4)} eV</b></span>` +
      `<span>radial nodes <b>${i.radialNodes}</b> &middot; angular nodes <b>${i.angularNodes}</b></span>` +
      `<span><b>${state.count.toLocaleString('en-US')}</b> dots sampled from |&psi;|&sup2;</span>`;
  }

  // ---------------------------------------------------------------- controls
  const debounce = (fn, ms) => { let t = 0; return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); }; };

  const zChanged = debounce(() => { loadInfo(); loadSlice(); }, 90);
  function setZ(v) {
    state.z = v;
    $('zNum').value = v; $('zRange').value = Math.min(20, v);
    view.setOptions({ z: v });
    zChanged();
  }
  $('zRange').addEventListener('input', e => setZ(+e.target.value));
  $('zNum').addEventListener('input', e => {
    const v = Math.round(+e.target.value);
    if (e.target.value !== '' && Number.isFinite(v) && v >= 1 && v <= 118) setZ(v);
  });

  const countChanged = debounce(loadCloud, 150);
  $('count').addEventListener('input', e => {
    state.count = +e.target.value;
    $('countVal').textContent = state.count.toLocaleString('en-US');
    countChanged();
  });
  $('countVal').textContent = state.count.toLocaleString('en-US');

  $('dot').addEventListener('input', e => { view.setOptions({ dot: +e.target.value }); $('dotVal').textContent = (+e.target.value).toFixed(1); });
  $('dotVal').textContent = '1.0';
  $('colour').addEventListener('change', e => view.setOptions({ colour: e.target.value }));
  $('showNodes').addEventListener('change', e => view.setOptions({ showNodes: e.target.checked }));
  $('showNucleus').addEventListener('change', e => view.setOptions({ showNucleus: e.target.checked }));
  $('resample').addEventListener('click', () => { state.seed = 1 + Math.floor(Math.random() * 1e6); loadCloud(); });
  $('rot').addEventListener('change', e => view.setSpin(e.target.checked));
  document.querySelectorAll('[data-view]').forEach(b => b.addEventListener('click', () => view.preset(b.dataset.view)));

  document.querySelectorAll('[data-plane]').forEach(b => b.addEventListener('click', () => {
    state.plane = b.dataset.plane;
    document.querySelectorAll('[data-plane]').forEach(x => x.classList.toggle('on', x === b));
    loadSlice();
  }));
  $('sliceMode').addEventListener('change', () => HydPlots.drawSlice($('slice'), state.slice, $('sliceMode').value));

  new ResizeObserver(debounce(() => {
    HydPlots.drawRadial($('radial'), state.info);
    HydPlots.drawSlice($('slice'), state.slice, $('sliceMode').value);
  }, 60)).observe(document.querySelector('.right'));

  // ---------------------------------------------------------------- start, and quit with the tab
  setInterval(HydApi.ping, 20000);
  window.addEventListener('beforeunload', HydApi.bye);

  window.__hyd = {        // used by the automated browser tests
    state, view,
    ready: () => !!state.info && !!state.slice && state.loading === 0
  };

  (async () => {
    try {
      state.catalogue = await HydApi.orbitals();
      buildPicker();
      select(state.id);
    } catch (e) { showMessage(e.message); }
  })();
})();
