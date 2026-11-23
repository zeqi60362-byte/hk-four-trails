/* Four Trails heat & shade dashboard
 * Data: window.TRAIL_DATA (built from the xlsx by tools/build_data.py)
 */
(function () {
  "use strict";
  const D = window.TRAIL_DATA;
  const C = D.cols;
  const N = D.n;
  const TR = D.trails;
  const fmt = d3.format(",");
  const f2 = d3.format(".2f"), f3 = d3.format(".3f"), f1 = d3.format(".1f"), f0 = d3.format(".0f");

  // ---------- constants ----------
  const WINDOWS = [
    { key: "08", label: "Morning", span: "08–10" },
    { key: "10", label: "Late morning", span: "10–12" },
    { key: "12", label: "Noon", span: "12–14" },
    { key: "14", label: "Afternoon", span: "14–16" },
  ];
  const DEPS = [
    { key: "08", label: "08:00", h: 8 },
    { key: "10", label: "10:00", h: 10 },
    { key: "12", label: "12:00", h: 12 },
    { key: "14", label: "14:00", h: 14 },
  ];
  const EXP = [
    { key: 0, label: "Shaded", color: "#a9bdb0", test: v => v < 0.05 },
    { key: 1, label: "Low", color: "#fdd49e", test: v => v < 0.30 },
    { key: 2, label: "Moderate", color: "#f08c3a", test: v => v < 0.55 },
    { key: 3, label: "High", color: "#a8400a", test: () => true },
  ];
  const QUAL = [
    { key: 0, label: "High", color: "#4a4a45" },
    { key: 1, label: "Low", color: "#c9c9c2" },
  ];
  const OBS = [
    { key: "tree", label: "Tree crowns", color: "#3f8f4f" },
    { key: "built", label: "Structures", color: "#8c8c86" },
    { key: "terrain", label: "Terrain", color: "#a6814c" },
  ];

  // index of points per trail, in sequence order (data already sorted)
  const byTrail = TR.map(() => []);
  for (let i = 0; i < N; i++) byTrail[C.t[i]].push(i);
  const trailLen = byTrail.map(ix => d3.max(ix, i => C.dist_km[i]));

  function domObs(i) {
    const a = C.h_tree_max[i], b = C.h_built_max[i], c = C.h_terrain_max[i];
    if (a >= b && a >= c) return 0;
    if (b >= c) return 1;
    return 2;
  }
  const obsIdx = new Uint8Array(N);
  for (let i = 0; i < N; i++) obsIdx[i] = domObs(i);

  // ---------- colour metrics ----------
  const seq = (interp, lo, hi) => d3.scaleSequential(interp).domain([lo, hi]).clamp(true);
  const METRICS = {
    trail: { label: "Trail", type: "cat", items: () => TR.map((t, k) => ({ label: t.en.replace(" Trail", ""), color: t.color })), color: i => TR[C.t[i]].color },
    exposure: { label: "Sun exposure (window)", type: "cat", items: () => EXP.map(e => ({ label: e.label, color: e.color })), color: i => EXP[expClass(i)].color },
    window_val: { label: "Exposure value (window)", type: "seq", lo: 0, hi: 0.78, scale: seq(t => d3.interpolateYlOrBr(0.08 + t * 0.85), 0, 0.78), val: i => winVal(i), fmt: f2 },
    static_share: { label: "Static share (all-day)", type: "seq", lo: 0, hi: 0.65, scale: seq(t => d3.interpolateYlOrBr(0.08 + t * 0.85), 0, 0.65), val: i => C.static_share[i], fmt: f2 },
    gvi: { label: "Green view index", type: "seq", lo: 0, hi: 0.9, scale: seq(t => d3.interpolateYlGn(0.1 + t * 0.9), 0, 0.9), val: i => C.gvi[i], fmt: f2 },
    tree_frac: { label: "Tree canopy fraction", type: "seq", lo: 0, hi: 0.85, scale: seq(t => d3.interpolateGreens(0.15 + t * 0.85), 0, 0.85), val: i => C.tree_frac[i], fmt: f2 },
    sky_frac: { label: "Sky fraction", type: "seq", lo: 0, hi: 0.6, scale: seq(t => d3.interpolateBlues(0.15 + t * 0.85), 0, 0.6), val: i => C.sky_frac[i], fmt: f2 },
    h_obs_max: { label: "Combined obstruction angle (°)", type: "seq", lo: 0, hi: 90, scale: seq(t => d3.interpolatePuBu(0.1 + t * 0.9), 0, 90), val: i => C.h_obs_max[i], fmt: d3.format(".0f") },
    dem_m: { label: "Elevation, DSM (m)", type: "seq", lo: 0, hi: 900, scale: seq(d3.interpolateCividis, 0, 900), val: i => C.dem_m[i], fmt: d3.format(".0f") },
    year: { label: "Panorama year", type: "seq", lo: 2011, hi: 2026, scale: seq(d3.interpolateViridis, 2011, 2026), val: i => Math.floor(C.ym[i] / 100), fmt: d3.format("d") },
    quality: { label: "Image quality", type: "cat", items: () => QUAL.map(q => ({ label: q.label, color: q.color })), color: i => QUAL[C.q[i]].color },
  };
  function colourOf(i) {
    const m = METRICS[S.colour];
    if (m.type === "cat") return m.color(i);
    const v = m.val(i);
    return v == null ? "#bbb" : m.scale(v);
  }

  // ---------- state ----------
  const S = {
    trailOn: TR.map(() => true),
    expOn: EXP.map(() => true),
    qOn: QUAL.map(() => true),
    gvi: [0, 1],
    win: 2, // Noon
    colour: "trail",
    profTrail: 0,
    sel: null,
    hover: null,
    dep: 0,
  };
  const DEFAULT = JSON.stringify({ trailOn: S.trailOn, expOn: S.expOn, qOn: S.qOn, gvi: S.gvi });

  const winKey = () => WINDOWS[S.win].key;
  function winVal(i, w) { return C["e_" + WINDOWS[w == null ? S.win : w].key][i]; }
  function expClass(i) { const v = winVal(i); for (const e of EXP) if (e.test(v)) return e.key; return 3; }

  function pass(i, except) {
    if (except !== "trail" && !S.trailOn[C.t[i]]) return false;
    if (except !== "exp" && !S.expOn[expClass(i)]) return false;
    if (except !== "q" && !S.qOn[C.q[i]]) return false;
    if (except !== "gvi") { const g = C.gvi[i]; if (g < S.gvi[0] - 1e-9 || g > S.gvi[1] + 1e-9) return false; }
    return true;
  }
  let passArr = new Uint8Array(N);
  function computePass() { for (let i = 0; i < N; i++) passArr[i] = pass(i) ? 1 : 0; }

  // ---------- header ----------
  document.getElementById("hdr-n").textContent = fmt(N);
  document.getElementById("src-name").textContent = D.source;

  // ---------- filter UI ----------
  function chip(container, label, swatch, swClass, checked, onChange) {
    const el = document.createElement("label");
    el.className = "chip";
    el.innerHTML = `<input type="checkbox"><span class="${swClass}" style="background:${swatch}"></span><span class="lb"></span> <span class="cnt"></span>`;
    el.querySelector(".lb").textContent = label;
    const cb = el.querySelector("input");
    cb.checked = checked;
    cb.addEventListener("change", () => onChange(cb.checked));
    container.appendChild(el);
    return el;
  }
  const trailChips = TR.map((t, k) => chip(document.getElementById("f-trail"), t.en.replace(" Trail", ""), t.color, "sw", true, v => { S.trailOn[k] = v; update(); }));
  TR.forEach((t, k) => trailChips[k].title = `${t.en} ${t.cn}`);
  const expChips = EXP.map((e, k) => chip(document.getElementById("f-exp"), e.label, e.color, "sq", true, v => { S.expOn[k] = v; update(); }));
  const qChips = QUAL.map((q, k) => chip(document.getElementById("f-q"), q.label, q.color, "sq", true, v => { S.qOn[k] = v; update(); }));

  const winSeg = document.getElementById("f-window");
  WINDOWS.forEach((w, k) => {
    const b = document.createElement("button");
    b.textContent = w.label; b.title = w.span;
    b.addEventListener("click", () => { S.win = k; update(); });
    winSeg.appendChild(b);
  });

  const colourSel = document.getElementById("colour-by");
  Object.entries(METRICS).forEach(([k, m]) => { const o = document.createElement("option"); o.value = k; o.textContent = m.label; colourSel.appendChild(o); });
  colourSel.value = S.colour;
  colourSel.addEventListener("change", () => { S.colour = colourSel.value; update(); });

  const gLo = document.getElementById("gvi-lo"), gHi = document.getElementById("gvi-hi");
  gLo.value = 0; gHi.value = 1;
  function gviInput(e) {
    let lo = +gLo.value, hi = +gHi.value;
    if (lo > hi) { if (e.target === gLo) { lo = hi; gLo.value = lo; } else { hi = lo; gHi.value = hi; } }
    S.gvi = [lo, hi];
    update();
  }
  gLo.addEventListener("input", gviInput); gHi.addEventListener("input", gviInput);

  document.getElementById("reset").addEventListener("click", () => {
    S.trailOn = TR.map(() => true); S.expOn = EXP.map(() => true); S.qOn = QUAL.map(() => true); S.gvi = [0, 1];
    trailChips.forEach(c => c.querySelector("input").checked = true);
    expChips.forEach(c => c.querySelector("input").checked = true);
    qChips.forEach(c => c.querySelector("input").checked = true);
    gLo.value = 0; gHi.value = 1;
    update();
  });

  // tabs
  document.querySelectorAll(".tab").forEach(b => b.addEventListener("click", () => showTab(b.dataset.tab)));
  function showTab(name) {
    document.querySelectorAll(".tab").forEach(b => { const on = b.dataset.tab === name; b.classList.toggle("active", on); b.setAttribute("aria-selected", on); });
    document.querySelectorAll(".pane").forEach(p => p.classList.toggle("active", p.id === "pane-" + name));
  }

  // profile trail buttons
  const profSeg = document.getElementById("prof-trails");
  TR.forEach((t, k) => {
    const b = document.createElement("button");
    b.innerHTML = `<span class="sw" style="background:${t.color}"></span>${t.en.replace(" Trail", "")}`;
    b.title = `${t.en} ${t.cn}`;
    b.addEventListener("click", () => { setProfTrail(k, true); });
    profSeg.appendChild(b);
  });
  function setProfTrail(k, fit) {
    S.profTrail = k;
    profZoom = null;
    [...profSeg.children].forEach((b, j) => b.classList.toggle("on", j === k));
    renderProfile();
    if (fit) fitTrail(k);
  }

  // ---------- MAP ----------
  const BLANK_STYLE = { version: 8, sources: {}, layers: [{ id: "bg", type: "background", paint: { "background-color": "#eef0ed" } }] };
  const TRACK = window.TRAIL_TRACK || null;   // 完整轨迹（40 m），用于补齐没有全景的段落
  // 各径的分段起点（km），用于地图上的段落标注
  const SECTIONS = {
    0: [0, 10, 24.02, 33.35, 45.58, 56.35, 60.58, 67.58, 76.78, 82.97, 98.09],
    1: [0, 4.75, 11.57, 20.65, 28.47, 36.7, 41.77, 51.82, 60.92, 71.0, 77.71],
    2: [0, 6.08, 10.35, 15.75, 22.48, 26.05, 30.38, 37.3, 44.78],
    3: [0, 2.15, 8.3, 12.55, 17.73, 25.45, 27.32, 37.05, 41.8, 48.17, 55.27, 58.0, 67.03],
  };
  const allBounds = [[d3.min(C.lon), d3.min(C.lat)], [d3.max(C.lon), d3.max(C.lat)]];
  let map = null, mapReady = false;
  try {
    map = new maplibregl.Map({
      container: "map",
      style: "https://tiles.openfreemap.org/styles/positron",
      bounds: allBounds,
      fitBoundsOptions: { padding: 30 },
      attributionControl: { compact: false, customAttribution: "Points: 8,847 panorama samples · " },
    });
    map.addControl(new maplibregl.NavigationControl({ showCompass: false }), "top-right");
    map.addControl(new maplibregl.ScaleControl({ maxWidth: 80 }), "bottom-right");
    let styleLoaded = false;
    const fallback = () => { if (!styleLoaded) { console.warn("Basemap unavailable; using blank background."); map.setStyle(BLANK_STYLE); } };
    map.on("error", e => { if (!styleLoaded && e && e.error && /style|fetch|Failed/i.test(String(e.error.message || e.error))) fallback(); });
    setTimeout(fallback, 10000);
    map.on("style.load", () => { styleLoaded = true; addLayers(); });
  } catch (err) {
    console.error(err);
    document.getElementById("map").innerHTML = '<div class="empty">The map could not start in this browser (WebGL unavailable). Charts and profile still work.</div>';
  }

  function lineGeoJSON() {
    const solid = [], jumps = [];
    byTrail.forEach((ix, k) => {
      let cur = [];
      ix.forEach((i, j) => {
        const p = [C.lon[i], C.lat[i]];
        if (C.gap[i] && j > 0) {
          if (cur.length > 1) solid.push({ k, c: cur });
          const prev = ix[j - 1];
          // short jumps are drawn dashed; very long ones are ordering breaks in the source line and are left open
          if (haversine(C.lat[prev], C.lon[prev], C.lat[i], C.lon[i]) < 2) jumps.push({ k, c: [[C.lon[prev], C.lat[prev]], p] });
          cur = [];
        }
        cur.push(p);
      });
      if (cur.length > 1) solid.push({ k, c: cur });
    });
    const feat = (o, kind) => ({ type: "Feature", properties: { k: o.k, kind }, geometry: { type: "LineString", coordinates: o.c } });
    return { type: "FeatureCollection", features: solid.map(o => feat(o, "solid")).concat(jumps.map(o => feat(o, "jump"))) };
  }
  function pointGeoJSON() {
    const feats = [];
    for (let i = 0; i < N; i++) {
      if (!passArr[i]) continue;
      feats.push({ type: "Feature", id: i, properties: { i, c: colourOf(i), q: C.q[i] }, geometry: { type: "Point", coordinates: [C.lon[i], C.lat[i]] } });
    }
    return { type: "FeatureCollection", features: feats };
  }
  function selGeo(i) {
    return { type: "FeatureCollection", features: i == null ? [] : [{ type: "Feature", properties: {}, geometry: { type: "Point", coordinates: [C.lon[i], C.lat[i]] } }] };
  }
  function trackGeoJSON() {
    if (!TRACK) return { type: "FeatureCollection", features: [] };
    const feats = [];
    TR.forEach((t, k) => {
      (TRACK[t.code] || []).forEach((part, j) => {
        if (part.length > 1) feats.push({
          type: "Feature", properties: { k, j },
          geometry: { type: "LineString", coordinates: part.map(r => [r[2], r[1]]) },
        });
      });
    });
    return { type: "FeatureCollection", features: feats };
  }
  function sectionGeoJSON() {
    const feats = [];
    if (!TRACK) return { type: "FeatureCollection", features: feats };
    TR.forEach((t, k) => {
      const edges = SECTIONS[k];
      if (!edges) return;
      const verts = [];
      (TRACK[t.code] || []).forEach(part => part.forEach(v => verts.push(v)));
      if (!verts.length) return;
      for (let s = 0; s < edges.length - 1; s++) {
        const mid = (edges[s] + edges[s + 1]) / 2;
        let best = null;
        verts.forEach(v => { if (best == null || Math.abs(v[0] - mid) < Math.abs(best[0] - mid)) best = v; });
        feats.push({
          type: "Feature",
          properties: { label: `${t.en.replace(" Trail", "")} ${s + 1}`, color: t.color },
          geometry: { type: "Point", coordinates: [best[2], best[1]] },
        });
      }
    });
    return { type: "FeatureCollection", features: feats };
  }

  function addLayers() {
    if (map.getSource("lines")) return;
    map.addSource("lines", { type: "geojson", data: lineGeoJSON() });
    map.addSource("track", { type: "geojson", data: trackGeoJSON() });
    map.addLayer({
      id: "track-line", type: "line", source: "track",
      paint: {
        "line-color": "#8f8f87",
        "line-width": ["interpolate", ["linear"], ["zoom"], 9, 1, 13, 2],
        "line-opacity": 0.45,
      },
    });
    map.addSource("pts", { type: "geojson", data: pointGeoJSON() });
    map.addSource("sel", { type: "geojson", data: selGeo(S.sel) });
    map.addSource("hov", { type: "geojson", data: selGeo(null) });
    map.addLayer({ id: "line-solid", type: "line", source: "lines", filter: ["==", ["get", "kind"], "solid"], paint: { "line-color": "#3a3a36", "line-width": ["interpolate", ["linear"], ["zoom"], 9, 0.6, 14, 1.4], "line-opacity": 0.45 } });
    map.addLayer({ id: "line-jump", type: "line", source: "lines", filter: ["==", ["get", "kind"], "jump"], paint: { "line-color": "#555", "line-width": 1, "line-dasharray": [3, 2.5] } });
    map.addLayer({
      id: "pts", type: "circle", source: "pts",
      paint: {
        "circle-color": ["get", "c"],
        "circle-radius": ["interpolate", ["linear"], ["zoom"], 9, 2.1, 11, 3, 13, 3.8, 15, 5.5],
        "circle-stroke-color": "#ffffff",
        "circle-stroke-width": ["interpolate", ["linear"], ["zoom"], 12, 0, 13, 0.5, 15, 1],
      },
    });
    map.addLayer({ id: "hov", type: "circle", source: "hov", paint: { "circle-radius": 7, "circle-color": "rgba(0,0,0,0)", "circle-stroke-color": "#222", "circle-stroke-width": 1.5 } });
    map.addLayer({ id: "sel", type: "circle", source: "sel", paint: { "circle-radius": 8, "circle-color": "rgba(0,0,0,0)", "circle-stroke-color": "#d1001f", "circle-stroke-width": 2.5 } });
    try {   // 段落标注失败绝不能影响底图与点位
    map.addSource("sects", { type: "geojson", data: sectionGeoJSON() });
    map.addLayer({
      id: "sects", type: "symbol", source: "sects", minzoom: 9.4,
      layout: {
        "text-field": ["get", "label"],
        "text-size": ["interpolate", ["linear"], ["zoom"], 9.4, 9, 12, 11, 15, 13],
        "text-font": ["Noto Sans Regular"],
        "text-padding": 3,
        "text-allow-overlap": false,
        "symbol-sort-key": ["length", ["get", "label"]],
      },
      paint: { "text-color": ["get", "color"], "text-halo-color": "rgba(255,255,255,.92)", "text-halo-width": 1.6 },
    });
    } catch (e) { console.warn("section labels skipped", e); }
    mapReady = true;
    refreshMap();   // 底图样式可能在首次 update() 之后才加载完，这里补一次点位数据

    map.on("mousemove", "pts", e => {
      map.getCanvas().style.cursor = "pointer";
      const i = e.features[0].properties.i;
      setHover(i, e.point);
    });
    map.on("mouseleave", "pts", () => { map.getCanvas().style.cursor = ""; setHover(null); });
    map.on("click", "pts", e => { select(e.features[0].properties.i, false); });
  }
  function fitTrail(k) {
    if (!mapReady) return;
    const ix = byTrail[k];
    map.fitBounds([[d3.min(ix, i => C.lon[i]), d3.min(ix, i => C.lat[i])], [d3.max(ix, i => C.lon[i]), d3.max(ix, i => C.lat[i])]], { padding: 40, duration: 700 });
  }
  function refreshMap() {
    if (!mapReady) return;
    map.getSource("pts").setData(pointGeoJSON());
  }

  // tooltip
  const tip = document.getElementById("maptip");
  function tipHTML(i) {
    const t = TR[C.t[i]];
    return `<b>${t.en}</b> · km ${f2(C.dist_km[i])}<br>` +
      `<span class="k">${WINDOWS[S.win].label} exposure</span> ${f2(winVal(i))} (${EXP[expClass(i)].label.toLowerCase()})<br>` +
      `<span class="k">GVI</span> ${f2(C.gvi[i])} · <span class="k">canopy</span> ${f2(C.tree_frac[i])} · <span class="k">sky</span> ${f2(C.sky_frac[i])}<br>` +
      `<span class="k">Elevation</span> ${C.dem_m[i] == null ? "–" : f1(C.dem_m[i]) + " m"} · <span class="k">fid</span> ${C.fid[i]}`;
  }
  function setHover(i, pt) {
    S.hover = i;
    if (mapReady) map.getSource("hov").setData(selGeo(i));
    if (i == null) { tip.hidden = true; profHover(null); return; }
    if (pt) {
      tip.innerHTML = tipHTML(i);
      tip.hidden = false;
      const mw = document.getElementById("map").clientWidth;
      let x = pt.x + 12, y = pt.y + 12;
      if (x + 250 > mw) x = pt.x - 252;
      tip.style.left = x + "px"; tip.style.top = y + "px";
    } else tip.hidden = true;
    profHover(i);
  }

  function select(i, pan) {
    S.sel = i;
    if (mapReady) {
      map.getSource("sel").setData(selGeo(i));
      if (pan && i != null) {
        const b = map.getBounds();
        if (!b.contains([C.lon[i], C.lat[i]])) map.easeTo({ center: [C.lon[i], C.lat[i]], duration: 400 });
      }
    }
    if (i != null && C.t[i] !== S.profTrail) setProfTrail(C.t[i], false); else renderProfileMarks();
    renderDetail();
    if (i != null) showTab("detail");
  }

  // ---------- legend ----------
  function renderLegend() {
    const m = METRICS[S.colour];
    let h = `<div class="lt">${m.label}</div>`;
    if (m.type === "cat") {
      h += m.items().map(it => `<div class="li"><span class="dot" style="background:${it.color}"></span>${it.label}</div>`).join("");
    } else {
      const stops = d3.range(0, 1.0001, 0.1).map(t => `${m.scale(m.lo + t * (m.hi - m.lo))} ${t * 100}%`).join(",");
      h += `<div class="grad" style="background:linear-gradient(90deg,${stops})"></div><div class="gl"><span>${m.fmt(m.lo)}</span><span>${m.fmt((m.lo + m.hi) / 2)}</span><span>${m.fmt(m.hi)}+</span></div>`;
    }
    h += `<div class="li" style="margin-top:3px"><span class="ln"></span>Trail line</div><div class="li"><span class="ln d"></span>Location jump</div>`;
    document.getElementById("legend").innerHTML = h;
    document.getElementById("prof-colour-name").textContent = m.label.toLowerCase();
  }

  // ---------- PROFILE ----------
  const profEl = document.getElementById("profile");
  let profZoom = null; // current zoomed x-scale domain
  let prof = null; // render context
  function renderProfile() {
    const k = S.profTrail, ix = byTrail[k];
    const W = profEl.clientWidth || 600, H = profEl.clientHeight || 160;
    const m = { l: 40, r: 14, t: 16, b: 22 };
    profEl.innerHTML = "";
    const svg = d3.select(profEl).append("svg").attr("width", W).attr("height", H);
    const x0 = d3.scaleLinear().domain([0, trailLen[k]]).range([m.l, W - m.r]);
    const x = profZoom ? x0.copy().domain(profZoom) : x0.copy();
    const ext = d3.extent(ix, i => C.dem_m[i]);
    const trk = [];
    const lo = ext[0], hi = ext[1];
    const y = d3.scaleLinear().domain([Math.max(0, lo - 20), hi + 20]).nice().range([H - m.b, m.t]);
    svg.append("defs").append("clipPath").attr("id", "pclip").append("rect").attr("x", m.l).attr("y", 0).attr("width", W - m.l - m.r).attr("height", H);
    svg.append("g").attr("class", "gridline").attr("transform", `translate(${m.l},0)`).call(d3.axisLeft(y).ticks(4).tickSize(-(W - m.l - m.r)).tickFormat("")).call(g => g.select(".domain").remove());
    const gx = svg.append("g").attr("class", "axis").attr("transform", `translate(0,${H - m.b})`);
    const gy = svg.append("g").attr("class", "axis").attr("transform", `translate(${m.l},0)`).call(d3.axisLeft(y).ticks(4));
    gy.append("text").attr("x", -m.l + 2).attr("y", 9).attr("text-anchor", "start").text("m");
    const plot = svg.append("g").attr("clip-path", "url(#pclip)");
    const gArea = plot.append("g"), gTrack = plot.append("g"), gLines = plot.append("g"), gJumps = plot.append("g"), gMarks = plot.append("g");
    prof = { svg, x, x0, y, ix, gArea, gTrack, gLines, gJumps, gMarks, gx, m, W, H, trk };
    drawProfileContent();

    // interaction
    const overlay = svg.append("rect").attr("x", m.l).attr("y", m.t).attr("width", W - m.l - m.r).attr("height", H - m.t - m.b).attr("fill", "transparent").style("cursor", "crosshair");
    const near = ev => {
      const [px] = d3.pointer(ev);
      const d = prof.x.invert(px);
      const j = d3.bisector(i => C.dist_km[i]).center(ix, d);
      return ix[Math.max(0, Math.min(ix.length - 1, j))];
    };
    overlay.on("mousemove", ev => {
      const i = near(ev);
      S.hover = i;
      if (mapReady) map.getSource("hov").setData(selGeo(i));
      profHover(i, true);
    }).on("mouseleave", () => { setHover(null); }).on("click", ev => select(near(ev), true));
    const zoom = d3.zoom().scaleExtent([1, 60]).translateExtent([[m.l, 0], [W - m.r, H]]).extent([[m.l, 0], [W - m.r, H]])
      .filter(ev => ev.type === "wheel" || ev.type === "dblclick" || (ev.type === "mousedown" && ev.shiftKey) || ev.type.startsWith("touch"))
      .on("zoom", ev => { prof.x = ev.transform.rescaleX(x0); profZoom = prof.x.domain(); drawProfileContent(); });
    svg.call(zoom).on("dblclick.zoom", null);
    svg.on("dblclick", () => { svg.call(zoom.transform, d3.zoomIdentity); });
    if (profZoom) {
      const kz = trailLen[k] / (profZoom[1] - profZoom[0]);
      const tx = m.l - kz * x0(profZoom[0]);
      svg.call(zoom.transform, d3.zoomIdentity.translate(tx, 0).scale(kz));
    }
  }
  function drawProfileContent() {
    const { x, y, ix, gArea, gLines, gJumps, gx, H, m } = prof;
    gx.call(d3.axisBottom(x).ticks(Math.max(3, Math.floor((prof.W - 60) / 70))).tickFormat(d => d + " km"));
    // segments split at gaps
    const segs = []; let cur = [];
    ix.forEach((i, j) => { if (C.gap[i] && j > 0) { segs.push(cur); cur = []; } if (C.dem_m[i] != null) cur.push(i); });
    segs.push(cur);
    const area = d3.area().x(i => x(C.dist_km[i])).y0(H - m.b).y1(i => y(C.dem_m[i]));
    gArea.selectAll("path").data(segs).join("path").attr("d", area).attr("fill", "#f1f1ee");
    // coloured line: build per-colour paths to keep DOM small
    const groups = new Map();
    segs.forEach(seg => {
      for (let j = 0; j < seg.length - 1; j++) {
        const a = seg[j], b = seg[j + 1];
        const col = passArr[a] ? colourOf(a) : "#d6d6d0";
        const s = `M${x(C.dist_km[a]).toFixed(1)},${y(C.dem_m[a]).toFixed(1)}L${x(C.dist_km[b]).toFixed(1)},${y(C.dem_m[b]).toFixed(1)}`;
        groups.set(col, (groups.get(col) || "") + s);
      }
    });
    gLines.selectAll("path").data([...groups]).join("path").attr("d", d => d[1]).attr("stroke", d => d[0]).attr("fill", "none").attr("stroke-width", 2).attr("stroke-linecap", "round");
    // jumps
    const jumps = [];
    ix.forEach((i, j) => {
      if (C.gap[i] && j > 0) {
        const p = ix[j - 1];
        const km = haversine(C.lat[p], C.lon[p], C.lat[i], C.lon[i]);
        jumps.push({ d: C.dist_km[i], km });
      }
    });
    let lastX = -1e9;
    jumps.forEach(j => { const px = x(j.d); j.show = px - lastX > 13; if (j.show) lastX = px; });
    const gj = gJumps.selectAll("g").data(jumps).join(enter => { const g = enter.append("g"); g.append("line"); g.append("text"); return g; });
    gj.select("line").attr("x1", d => x(d.d)).attr("x2", d => x(d.d)).attr("y1", m.t).attr("y2", H - m.b).attr("stroke", "#777").attr("stroke-dasharray", "3,3");
    gj.select("text").attr("transform", d => `translate(${x(d.d) - 3},${m.t + 2}) rotate(-90)`).attr("text-anchor", "end").attr("font-size", 9.5).attr("fill", "#666").style("display", d => d.show ? null : "none").text(d => `jump ${d.km >= 1 ? f1(d.km) + " km" : Math.round(d.km * 1000) + " m"}`);
    renderProfileMarks();
  }
  function renderProfileMarks() {
    if (!prof) return;
    const { x, y, gMarks, H, m } = prof;
    gMarks.selectAll("*").remove();
    if (S.sel != null && C.t[S.sel] === S.profTrail && C.dem_m[S.sel] != null) {
      const px = x(C.dist_km[S.sel]);
      gMarks.append("line").attr("x1", px).attr("x2", px).attr("y1", m.t).attr("y2", H - m.b).attr("stroke", "#d1001f").attr("stroke-width", 1);
      gMarks.append("circle").attr("cx", px).attr("cy", y(C.dem_m[S.sel])).attr("r", 4.5).attr("fill", "#fff").attr("stroke", "#d1001f").attr("stroke-width", 2);
    }
    gMarks.append("g").attr("class", "hovmark");
  }
  function profHover(i, fromProfile) {
    if (!prof) return;
    const g = prof.gMarks.select(".hovmark");
    g.selectAll("*").remove();
    if (i == null || C.t[i] !== S.profTrail || C.dem_m[i] == null) { if (fromProfile) tip.hidden = true; return; }
    const px = prof.x(C.dist_km[i]), py = prof.y(C.dem_m[i]);
    g.append("line").attr("x1", px).attr("x2", px).attr("y1", prof.m.t).attr("y2", prof.H - prof.m.b).attr("stroke", "#222").attr("stroke-opacity", .4);
    g.append("circle").attr("cx", px).attr("cy", py).attr("r", 4).attr("fill", colourOf(i)).attr("stroke", "#222");
    g.append("text").attr("x", px + (px > prof.W - 160 ? -6 : 6)).attr("y", prof.m.t + 10).attr("text-anchor", px > prof.W - 160 ? "end" : "start").attr("font-size", 11)
      .text(`km ${f2(C.dist_km[i])} · ${f1(C.dem_m[i])} m · exp ${f2(winVal(i))} · GVI ${f2(C.gvi[i])}`);
  }

  function haversine(a1, o1, a2, o2) {
    const r = Math.PI / 180, dLa = (a2 - a1) * r, dLo = (o2 - o1) * r;
    const h = Math.sin(dLa / 2) ** 2 + Math.cos(a1 * r) * Math.cos(a2 * r) * Math.sin(dLo / 2) ** 2;
    return 12742 * Math.asin(Math.sqrt(h));
  }

  // ---------- OVERVIEW CHARTS ----------
  function chartWidth(el) { return Math.max(260, el.clientWidth || 360); }

  function renderDonut(sel) {
    const el = document.getElementById("ch-donut"); el.innerHTML = "";
    const counts = TR.map((t, k) => ({ k, n: sel.filter(i => C.t[i] === k).length })).filter(d => d.n > 0);
    const W = chartWidth(el), H = 190, R = 70, r0 = 44;
    const svg = d3.select(el).append("svg").attr("width", W).attr("height", H);
    if (!counts.length) { svg.append("text").attr("x", W / 2).attr("y", H / 2).attr("text-anchor", "middle").attr("fill", "#888").text("No points match the filters"); return; }
    const total = d3.sum(counts, d => d.n);
    const g = svg.append("g").attr("transform", `translate(${W / 2},${H / 2})`);
    const arcs = d3.pie().sort(null).value(d => d.n)(counts);
    const arc = d3.arc().innerRadius(r0).outerRadius(R);
    g.selectAll("path").data(arcs).join("path").attr("d", arc).attr("fill", d => TR[d.data.k].color).attr("stroke", "#fff").attr("stroke-width", 1.5);
    const outer = d3.arc().innerRadius(R + 14).outerRadius(R + 14);
    arcs.forEach(a => {
      const [cx, cy] = outer.centroid(a), [lx, ly] = d3.arc().innerRadius(R).outerRadius(R).centroid(a);
      const right = cx >= 0;
      g.append("polyline").attr("points", `${lx},${ly} ${cx},${cy} ${cx + (right ? 8 : -8)},${cy}`).attr("fill", "none").attr("stroke", "#999");
      const t = g.append("text").attr("x", cx + (right ? 11 : -11)).attr("y", cy - 2).attr("text-anchor", right ? "start" : "end").attr("font-size", 11);
      t.append("tspan").text(TR[a.data.k].en.replace(" Trail", ""));
      t.append("tspan").attr("x", cx + (right ? 11 : -11)).attr("dy", 12).attr("fill", "#666").text(`${fmt(a.data.n)} · ${d3.format(".1%")(a.data.n / total)}`);
    });
  }

  function bars(el, data, opts) {
    // data: [{label, value, color, sub}]
    el.innerHTML = "";
    const W = chartWidth(el), H = opts.h || 170, m = { l: 34, r: 8, t: 14, b: 32 };
    const svg = d3.select(el).append("svg").attr("width", W).attr("height", H);
    const x = d3.scaleBand().domain(data.map(d => d.label)).range([m.l, W - m.r]).padding(0.35);
    const y = d3.scaleLinear().domain([0, opts.max]).range([H - m.b, m.t]);
    svg.append("g").attr("class", "gridline").attr("transform", `translate(${m.l},0)`).call(d3.axisLeft(y).ticks(4).tickSize(-(W - m.l - m.r)).tickFormat("")).call(g => g.select(".domain").remove());
    svg.append("g").attr("class", "axis").attr("transform", `translate(${m.l},0)`).call(d3.axisLeft(y).ticks(4).tickFormat(opts.tickFmt || null)).call(g => g.select(".domain").remove());
    svg.append("g").attr("class", "axis").attr("transform", `translate(0,${H - m.b})`).call(d3.axisBottom(x).tickSize(0)).call(g => g.select(".domain").attr("stroke", "#bbb")).selectAll("text").attr("dy", "1.1em");
    data.forEach(d => {
      if (d.value == null || isNaN(d.value)) return;
      svg.append("rect").attr("x", x(d.label)).attr("width", x.bandwidth()).attr("y", y(d.value)).attr("height", y(0) - y(d.value)).attr("fill", d.color);
      svg.append("text").attr("x", x(d.label) + x.bandwidth() / 2).attr("y", y(d.value) - 4).attr("text-anchor", "middle").attr("font-size", 11).text(opts.fmt(d.value));
      if (d.sub) svg.append("text").attr("x", x(d.label) + x.bandwidth() / 2).attr("y", H - 4).attr("text-anchor", "middle").attr("font-size", 10).attr("fill", "#888").text(d.sub);
    });
  }

  function renderWindowChart(sel) {
    const data = WINDOWS.map((w, k) => ({ label: w.label, sub: w.span, value: sel.length ? d3.mean(sel, i => winVal(i, k)) : null, color: k === S.win ? "#b84a0c" : "#d3d3cd" }));
    bars(document.getElementById("ch-window"), data, { max: 0.6, fmt: f2 });
  }

  function renderGviHist() {
    const el = document.getElementById("ch-gvi"); el.innerHTML = "";
    const vals = []; for (let i = 0; i < N; i++) if (pass(i, "gvi")) vals.push(C.gvi[i]);
    const W = chartWidth(el), H = 150, m = { l: 40, r: 8, t: 8, b: 24 };
    const svg = d3.select(el).append("svg").attr("width", W).attr("height", H);
    const x = d3.scaleLinear().domain([0, 1]).range([m.l, W - m.r]);
    const bins = d3.bin().domain([0, 1]).thresholds(d3.range(0, 1.0001, 0.05))(vals);
    const y = d3.scaleLinear().domain([0, d3.max(bins, b => b.length) || 1]).nice().range([H - m.b, m.t]);
    svg.append("g").attr("class", "axis").attr("transform", `translate(0,${H - m.b})`).call(d3.axisBottom(x).ticks(5));
    svg.append("g").attr("class", "axis").attr("transform", `translate(${m.l},0)`).call(d3.axisLeft(y).ticks(3).tickFormat(d3.format("~s"))).call(g => g.select(".domain").remove());
    svg.selectAll("rect").data(bins).join("rect")
      .attr("x", b => x(b.x0) + 0.5).attr("width", b => Math.max(0, x(b.x1) - x(b.x0) - 1))
      .attr("y", b => y(b.length)).attr("height", b => y(0) - y(b.length))
      .attr("fill", b => (b.x1 > S.gvi[0] + 1e-9 && b.x0 < S.gvi[1] - 1e-9) ? "#4f9a5a" : "#d8d8d2");
    if (S.gvi[0] > 0 || S.gvi[1] < 1) {
      svg.append("rect").attr("x", x(S.gvi[0])).attr("width", x(S.gvi[1]) - x(S.gvi[0])).attr("y", m.t).attr("height", H - m.b - m.t).attr("fill", "#4f9a5a").attr("opacity", .08);
    }
    el.insertAdjacentHTML("beforeend", `<div class="note">Ignores the GVI filter; the selected range is shaded. Median of shown points: ${vals.length ? f2(d3.median(vals)) : "–"}.</div>`);
  }

  function renderDirChart(sel) {
    const dirs = [["N", "tree_N"], ["E", "tree_E"], ["S", "tree_S"], ["W", "tree_W"]];
    const data = dirs.map(([l, f]) => ({ label: l, value: sel.length ? d3.mean(sel, i => C[f][i]) : null, color: l === "S" ? "#2f7a3e" : "#8fbf95" }));
    bars(document.getElementById("ch-dir"), data, { max: 60, fmt: f1, h: 150 });
  }

  function renderObsChart(sel) {
    const el = document.getElementById("ch-obs"); el.innerHTML = "";
    const rows = TR.map((t, k) => {
      const s = sel.filter(i => C.t[i] === k);
      const c = [0, 0, 0]; s.forEach(i => c[obsIdx[i]]++);
      return { k, n: s.length, c };
    }).filter(r => r.n > 0);
    const W = chartWidth(el), rowH = 22, m = { l: 74, r: 10, t: 4, b: 26 };
    const H = m.t + m.b + rows.length * rowH;
    const svg = d3.select(el).append("svg").attr("width", W).attr("height", H);
    const x = d3.scaleLinear().domain([0, 1]).range([m.l, W - m.r]);
    rows.forEach((r, j) => {
      let acc = 0;
      const yy = m.t + j * rowH;
      svg.append("text").attr("x", m.l - 6).attr("y", yy + 14).attr("text-anchor", "end").attr("font-size", 11).text(TR[r.k].en.replace(" Trail", ""));
      r.c.forEach((v, q) => {
        const f = v / r.n;
        svg.append("rect").attr("x", x(acc)).attr("width", Math.max(0, x(acc + f) - x(acc))).attr("y", yy + 3).attr("height", rowH - 7).attr("fill", OBS[q].color).append("title").text(`${OBS[q].label}: ${fmt(v)} (${d3.format(".0%")(f)})`);
        if (f > 0.09) svg.append("text").attr("x", x(acc + f / 2)).attr("y", yy + 15).attr("text-anchor", "middle").attr("font-size", 10).attr("fill", "#fff").text(d3.format(".0%")(f));
        acc += f;
      });
    });
    const lg = svg.append("g").attr("transform", `translate(${m.l},${H - 10})`);
    let lx = 0;
    OBS.forEach(o => { lg.append("rect").attr("x", lx).attr("y", -8).attr("width", 9).attr("height", 9).attr("fill", o.color); lg.append("text").attr("x", lx + 13).attr("y", 0).attr("font-size", 10.5).attr("fill", "#555").text(o.label); lx += 13 + o.label.length * 6 + 12; });
  }

  function renderSummary(sel) {
    const el = document.getElementById("tb-summary");
    const rows = TR.map((t, k) => {
      const s = sel.filter(i => C.t[i] === k);
      if (!s.length) return null;
      return { t, n: s.length, gvi: d3.mean(s, i => C.gvi[i]), tree: d3.mean(s, i => C.tree_frac[i]), sky: d3.mean(s, i => C.sky_frac[i]), st: d3.mean(s, i => C.static_share[i]), w: d3.mean(s, i => winVal(i)), low: s.filter(i => C.q[i]).length / s.length, obs: d3.median(s, i => C.h_obs_max[i]) };
    }).filter(Boolean);
    if (!rows.length) { el.innerHTML = '<div class="empty">No points match the filters. Widen a filter or press Reset filters.</div>'; return; }
    el.innerHTML = `<div class="tscroll"><table class="t"><thead><tr><th>Trail</th><th>Points</th><th>GVI</th><th>Canopy</th><th>Obstr.°</th><th>Static</th><th title="Sun minutes per km in the selected window">Min/km<br><span class="muted">${WINDOWS[S.win].span}</span></th></tr></thead><tbody>` +
      rows.map(r => `<tr><td><span class="sw" style="background:${r.t.color}"></span>${r.t.en.replace(" Trail", "")}</td><td>${fmt(r.n)}</td><td>${f2(r.gvi)}</td><td>${f2(r.tree)}</td><td>${f1(r.obs)}</td><td>${f2(r.st)}</td><td>${f1(r.w * 15)}</td></tr>`).join("") +
      `</tbody></table></div><div class="note" style="margin-top:6px">GVI and canopy are means; obstruction is the median combined angle; Min/km = mean exposure in the selected window × 15.</div>`;
  }

  // ---------- DETAIL ----------
  function miniBars(items, max, fmtv, colorFn, h) {
    const W = 360, H = h || 120, m = { l: 30, r: 6, t: 14, b: 30 };
    const x = d3.scaleBand().domain(items.map(d => d.label)).range([m.l, W - m.r]).padding(0.35);
    const y = d3.scaleLinear().domain([0, max]).range([H - m.b, m.t]);
    let s = `<svg viewBox="0 0 ${W} ${H}" width="100%" style="max-width:${W}px">`;
    y.ticks(3).forEach(t => { s += `<line x1="${m.l}" x2="${W - m.r}" y1="${y(t)}" y2="${y(t)}" stroke="#eee"/><text x="${m.l - 4}" y="${y(t) + 3}" text-anchor="end" font-size="10" fill="#777">${t}</text>`; });
    items.forEach((d, k) => {
      const v = Math.max(0, d.value || 0);
      s += `<rect x="${x(d.label)}" width="${x.bandwidth()}" y="${y(v)}" height="${y(0) - y(v)}" fill="${colorFn(d, k)}"/>`;
      s += `<text x="${x(d.label) + x.bandwidth() / 2}" y="${y(v) - 3}" text-anchor="middle" font-size="10.5">${d.value == null ? "–" : d.value < 0 ? "none" : fmtv(d.value)}</text>`;
      s += `<text x="${x(d.label) + x.bandwidth() / 2}" y="${H - m.b + 13}" text-anchor="middle" font-size="10.5" fill="#444">${d.label}</text>`;
      if (d.sub) s += `<text x="${x(d.label) + x.bandwidth() / 2}" y="${H - m.b + 25}" text-anchor="middle" font-size="9.5" fill="#888">${d.sub}</text>`;
    });
    return s + "</svg>";
  }
  function compass(i) {
    const S = 200, c = S / 2, R = 62;
    const vals = [C.tree_N[i], C.tree_E[i], C.tree_S[i], C.tree_W[i]].map(v => Math.max(0, Math.min(100, v || 0)));
    const rad = a => a * Math.PI / 180;
    const names = [["N", 0], ["E", 90], ["S", 180], ["W", 270]];
    // 四个方向的半径做周期 Catmull-Rom 插值，得到一条闭合的平滑曲线
    const radiusAt = a => {
      const x = ((a % 360) + 360) % 360, seg = x / 90;
      const i0 = Math.floor(seg) % 4, t = seg - Math.floor(seg);
      const p0 = vals[(i0 + 3) % 4], p1 = vals[i0], p2 = vals[(i0 + 1) % 4], p3 = vals[(i0 + 2) % 4];
      const t2 = t * t, t3 = t2 * t;
      const v = 0.5 * (2 * p1 + (-p0 + p2) * t + (2 * p0 - 5 * p1 + 4 * p2 - p3) * t2 + (-p0 + 3 * p1 - 3 * p2 + p3) * t3);
      return Math.max(0, Math.min(100, v));
    };
    let s = `<svg viewBox="0 0 ${S} ${S}" width="${S}" height="${S}" style="flex:none">`;
    [25, 50, 75, 100].forEach(p => s += `<circle cx="${c}" cy="${c}" r="${R * p / 100}" fill="none" stroke="#e9e9e3"/>`);
    s += `<line x1="${c}" y1="${c - R}" x2="${c}" y2="${c + R}" stroke="#eeeeea"/><line x1="${c - R}" y1="${c}" x2="${c + R}" y2="${c}" stroke="#eeeeea"/>`;
    s += `<circle cx="${c}" cy="${c}" r="2.4" fill="#2f7a3e"/>`;
    // 四根胶囊柱：长度即该方向树冠占比
    names.forEach(([lab, a0], k) => {
      const r = Math.max(1.5, R * vals[k] / 100);
      s += `<rect x="${c - 7}" y="${(c - r).toFixed(1)}" width="14" height="${r.toFixed(1)}" rx="7"
        transform="rotate(${a0} ${c} ${c})" fill="#cfe6c9" stroke="#2f7a3e" stroke-width="1.3"/>`;
    });
    names.forEach(([lab, a0], k) => {
      const lp = R + 17, lx = c + lp * Math.sin(rad(a0)), ly = c - lp * Math.cos(rad(a0));
      s += `<text x="${lx}" y="${ly + 4}" text-anchor="middle" font-size="11" font-weight="600" fill="#333">${lab}</text>`;
      const vr = R * vals[k] / 100 + 14;
      const vx = c + vr * Math.sin(rad(a0)), vy = c - vr * Math.cos(rad(a0));
      s += `<text x="${vx}" y="${vy + 4}" text-anchor="middle" font-size="10" fill="#2f5a36">${f0(vals[k])}%</text>`;
    });
    return s + "</svg>";
  }
  function renderDetail() {
    const el = document.getElementById("detail");
    const i = S.sel;
    if (i == null) { el.innerHTML = '<div class="empty">Click a point on the map or the elevation profile to see its details.<br>Use ← and → to step along the trail once a point is selected.</div>'; return; }
    const t = TR[C.t[i]], ym = C.ym[i];
    const date = `${Math.floor(ym / 100)}-${String(ym % 100).padStart(2, "0")}`;
    const sv = `https://www.google.com/maps/@?api=1&map_action=pano&viewpoint=${C.lat[i]},${C.lon[i]}`;
    const winItems = WINDOWS.map((w, k) => ({ label: w.label.replace("Late morning", "Late morn."), sub: w.span, value: winVal(i, k) }));
    const panoName = String(C.fid[i]).padStart(5, "0") + "_" + t.code + ".jpg";
    const obsItems = [["Tree", "h_tree_max"], ["Structure", "h_built_max"], ["Terrain", "h_terrain_max"], ["Combined", "h_obs_max"]].map(([l, f]) => ({ label: l, value: C[f][i] }));
    el.innerHTML = `
      <div class="dhead"><div><h2>${t.en}</h2><div class="sub">km ${f2(C.dist_km[i])} · fid ${C.fid[i]} · ${EXP[expClass(i)].label} exposure at ${WINDOWS[S.win].label.toLowerCase()}</div></div>
      <div class="dnav"><button id="d-prev" title="Previous point (←)">‹</button><button id="d-next" title="Next point (→)">›</button></div></div>
      <div class="pano"><img id="pano-img" src="pano/${panoName}" alt="360° panorama at fid ${C.fid[i]}">
        <div class="ph" id="pano-ph" hidden>Panorama not included in this build.<br>Use the Street View link below.</div></div>
      <div class="pano-link"><span class="muted">360° survey image · ${date}</span><a href="${sv}" target="_blank" rel="noopener">Open in Google Street View ↗</a></div>
      <div class="kv">
        <span class="k">Coordinates</span><span>${C.lat[i].toFixed(5)}, ${C.lon[i].toFixed(5)} · <a href="${sv}" target="_blank" rel="noopener">Street View</a></span>
        <span class="k">Panorama date</span><span>${date} · offset ${f1(C.offset_m[i])} m from target</span>
        <span class="k">Elevation (DSM)</span><span>${C.dem_m[i] == null ? "–" : f1(C.dem_m[i]) + " m"}</span>
        <span class="k">Image quality</span><span class="${C.q[i] ? "flag-low" : ""}">${C.q[i] ? "Low" : "High"} · ground sharpness ${fmt(C.qc_lap_bottom[i])} · luminance ${C.qc_lum[i]}</span>
        <span class="k">GVI · canopy · sky</span><span>${f3(C.gvi[i])} · ${f3(C.tree_frac[i])} · ${f3(C.sky_frac[i])}</span>
        <span class="k">Static share</span><span>${f3(C.static_share[i])} · ${f1(C.static_share[i] * 15)} sun min/km all-day average</span>
      </div>
      <h3>Solar exposure by time window</h3>
      ${miniBars(winItems, 0.8, f2, (d, k) => k === S.win ? "#b84a0c" : "#d3d3cd")}
      <h3>Tree canopy by viewing direction</h3>
      <div style="display:flex;align-items:center;gap:12px">${compass(i)}<div class="note">Each bar points to one direction; its length is the share of tree-crown pixels facing there (cos-weighted, 100 % = fully closed). South faces the noon sun, so a long S bar matters most for midday shade.</div></div>
      <h3>Horizon obstruction angles (°)</h3>
      ${miniBars(obsItems, 90, d => d3.format(".0f")(d), (d, k) => k === 3 ? "#3f5f8a" : ["#3f8f4f", "#8c8c86", "#a6814c"][k], 125)}
      <div class="note">Maximum over 360 azimuths. Negative structure angles mean nothing was detected above the horizon (shown as 0).</div>
    `;
    const pimg = document.getElementById("pano-img");
    if (pimg) pimg.addEventListener("error", () => { pimg.style.display = "none"; const ph = document.getElementById("pano-ph"); if (ph) ph.hidden = false; });
    document.getElementById("d-prev").onclick = () => step(-1);
    document.getElementById("d-next").onclick = () => step(1);
  }
  function clock(h) {
    if (h >= 24) return "+" + Math.floor(h / 24) + "d";
    const hh = Math.floor(h), mm = Math.round((h - hh) * 60);
    return `${String(hh + (mm === 60 ? 1 : 0)).padStart(2, "0")}:${String(mm % 60).padStart(2, "0")}`;
  }
  function step(d) {
    if (S.sel == null) return;
    const ix = byTrail[C.t[S.sel]];
    const j = ix.indexOf(S.sel) + d;
    if (j >= 0 && j < ix.length) select(ix[j], true);
  }
  document.addEventListener("keydown", e => {
    if (e.target.tagName === "INPUT" || e.target.tagName === "SELECT") return;
    if (e.key === "ArrowLeft") { step(-1); e.preventDefault(); }
    if (e.key === "ArrowRight") { step(1); e.preventDefault(); }
  });

  // ---------- UPDATE ----------
  function update() {
    computePass();
    const sel = []; for (let i = 0; i < N; i++) if (passArr[i]) sel.push(i);
    // counts per facet
    TR.forEach((t, k) => { let n = 0; for (let i = 0; i < N; i++) if (C.t[i] === k && pass(i, "trail")) n++; setCount(trailChips[k], n); });
    EXP.forEach((e, k) => { let n = 0; for (let i = 0; i < N; i++) if (expClass(i) === k && pass(i, "exp")) n++; setCount(expChips[k], n); });
    QUAL.forEach((q, k) => { let n = 0; for (let i = 0; i < N; i++) if (C.q[i] === k && pass(i, "q")) n++; setCount(qChips[k], n); });
    [...winSeg.children].forEach((b, j) => b.classList.toggle("on", j === S.win));
    document.getElementById("exp-window-note").textContent = `(${WINDOWS[S.win].label.toLowerCase()}, ${WINDOWS[S.win].span})`;
    document.getElementById("gvi-val").textContent = `${f2(S.gvi[0])} – ${f2(S.gvi[1])}`;
    const fill = document.getElementById("gvi-fill"); fill.style.left = S.gvi[0] * 100 + "%"; fill.style.width = (S.gvi[1] - S.gvi[0]) * 100 + "%";
    document.getElementById("showing").textContent = sel.length === N ? `Showing all ${fmt(N)} points` : `Showing ${fmt(sel.length)} of ${fmt(N)} points`;
    document.getElementById("ov-note").textContent = `Charts reflect the current filters (${fmt(sel.length)} of ${fmt(N)} points). The GVI histogram ignores the GVI filter and shades the selected range instead.`;
    renderLegend();
    refreshMap();
    renderProfile();
    renderDonut(sel); renderWindowChart(sel); renderGviHist(); renderDirChart(sel); renderObsChart(sel); renderSummary(sel);
    if (S.sel != null) renderDetail();
  }
  function setCount(chipEl, n) { chipEl.querySelector(".cnt").textContent = fmt(n); chipEl.classList.toggle("zero", n === 0); }

  let rT = null;
  window.addEventListener("resize", () => { clearTimeout(rT); rT = setTimeout(() => { if (map) map.resize(); update(); }, 150); });

  // init
  [...profSeg.children].forEach((b, j) => b.classList.toggle("on", j === S.profTrail));
  renderDetail();
  update();
  // 深链接：?tab=detail&fid=5903
  const qp = new URLSearchParams(location.search);
  if (qp.get("fid")) { const k = C.fid.indexOf(Number(qp.get("fid"))); if (k >= 0) select(k, true); }
  if (qp.get("tab")) showTab(qp.get("tab"));
})();
