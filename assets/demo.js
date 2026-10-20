/* Drivetale – demo ekranu jazdy w przeglądarce.
 * Symulowany przejazd po trasie demo (window.DEMO_ROUTE). Wszystkie wartości są przykładowe:
 * profil prędkości, spalanie i cena paliwa są wyliczane tutaj, bez żadnych danych z zewnątrz. */
(function () {
  "use strict";

  var root = document.getElementById("demo-root");
  var ROUTE = window.DEMO_ROUTE;
  if (!root || !ROUTE || ROUTE.length < 2) return;

  var PRICE = 6.49;          // przykładowa cena paliwa [zł/L]
  var STEP = 0.1;            // krok symulacji [s]
  var CHART_WINDOW = 360;    // okno wykresu: 6 min
  var CHART_MIN = 60;        // najkrótsze okno na starcie (wykres się zagęszcza)
  var NS = "http://www.w3.org/2000/svg";

  function $(id) { return document.getElementById(id); }
  function fmt(n, d) { return n.toFixed(d).replace(".", ","); }
  function clock(sec) {
    sec = Math.floor(sec);
    var h = Math.floor(sec / 3600), m = Math.floor((sec % 3600) / 60), s = sec % 60;
    var ss = (s < 10 ? "0" : "") + s;
    return h > 0 ? h + ":" + (m < 10 ? "0" : "") + m + ":" + ss : m + ":" + ss;
  }
  function clamp(x, a, b) { return x < a ? a : x > b ? b : x; }
  function rng(seed) {
    return function () { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed / 4294967296; };
  }

  /* ---------- Profil przejazdu ---------- */
  function buildProfile() {
    var r = rng(20261020), p = [];
    function add(d, v, label) { p.push({ d: d, v: v, label: label }); }
    add(5, 0, "Silnik pracuje – nagrywanie trasy wystartowało samo.");
    add(80, 45, "Ruszanie i spokojna jazda osiedlową ulicą.");
    add(45, 0, "Czerwone światło – zwykły postój, liczy się do „Postoje”.");
    add(170, 58, "Jazda miejska – wykres prędkości wciąż się zagęszcza.");
    add(220, 70, "Szybszy odcinek arterii – spalanie spada.");
    add(50, 32, "Ruch gęstnieje.");
    for (var i = 0; i < 9; i++) {
      add(14 + r() * 14, 0, "Korek – jazda „stój i jedź”.");
      add(10 + r() * 10, 7 + r() * 8, "Korek – jazda „stój i jedź”.");
    }
    add(140, 48, "Korek za plecami – płynna jazda.");
    add(40, 0, "Światła na skrzyżowaniu.");
    add(230, 52, "Jazda miejska.");
    add(25, 0, "Przepuszczanie pieszych.");
    add(110, 40, "Dojazd do celu.");
    add(12, 0, "Na miejscu.");
    var t = 0;
    p.forEach(function (s) { s.start = t; t += s.d; });
    return { segs: p, total: t };
  }
  var PROFILE = buildProfile();

  /* ---------- Model jazdy ---------- */
  function newState() {
    return {
      t: 0, v: 0, a: 0, km: 0, litres: 0, driveTime: 0,
      stopSum: 0, jamSum: 0, inJam: false, moving: false, starts: 0, halts: 0,
      jamQuietUntil: 0, seg: -1, samples: [], nextSample: 0, done: false, jamTrack: [], maxV: 0
    };
  }

  function segmentAt(t) {
    var s = PROFILE.segs;
    for (var i = 0; i < s.length; i++) if (t < s[i].start + s[i].d) return i;
    return s.length - 1;
  }

  function flowLh(v, a) {
    if (v < 1.5) return 0.75;
    return 0.7 + 0.03 * v + 0.000006 * v * v * v + Math.max(0, a) * v * 0.05;
  }

  // Wykrywanie korka: niska średnia i dużo wolnej jazdy w ostatniej minucie; koniec – utrzymana szybsza jazda.
  function detectJam(st) {
    var s = st.samples, n = s.length;
    if (!st.inJam) {
      if (n < 60 || st.t < st.jamQuietUntil) return false;
      var sum = 0, slow = 0;
      for (var i = n - 60; i < n; i++) { sum += s[i].v; if (s[i].v > 1.5 && s[i].v < 20) slow++; }
      return sum / 60 < 14 && slow >= 18;
    }
    if (n < 20) return true;
    var sum2 = 0;
    for (var j = n - 20; j < n; j++) sum2 += s[j].v;
    return sum2 / 20 <= 25;
  }

  function step(st, dt, events) {
    if (st.done) return;
    var i = segmentAt(st.t), seg = PROFILE.segs[i];
    if (i !== st.seg) {
      if (events && (st.seg < 0 || PROFILE.segs[st.seg].label !== seg.label)) events.push({ t: st.t, text: seg.label });
      st.seg = i;
    }
    var target = seg.v;
    if (target > 20) target *= 1 + 0.04 * Math.sin(st.t / 7) + 0.025 * Math.sin(st.t / 2.3);
    var dv = clamp((target - st.v) * 0.8, -9, 5.5 * (1 - st.v / 140));
    var v0 = st.v;
    st.v = Math.max(0, st.v + dv * dt);
    st.a = (st.v - v0) / 3.6 / dt;
    st.km += st.v * dt / 3600;
    st.litres += flowLh(st.v, st.a) * dt / 3600;
    if (st.v > st.maxV) st.maxV = st.v;

    // Starty / stopy z histerezą
    if (!st.moving && st.v >= 5) { st.moving = true; st.starts++; }
    else if (st.moving && st.v < 1.5) { st.moving = false; st.halts++; }
    var stopped = st.v < 1.5;
    if (st.inJam) st.jamSum += dt;
    else if (stopped && st.t > 6) st.stopSum += dt;
    if (!stopped) st.driveTime += dt;

    st.t += dt;
    if (st.t >= st.nextSample) {
      st.samples.push({ t: st.nextSample, v: st.v, jam: st.inJam });
      if (st.samples.length > CHART_WINDOW + 30) st.samples.shift();
      st.nextSample += 1;
      var jam = detectJam(st);
      if (jam !== st.inJam) {
        st.inJam = jam;
        if (jam) st.jamTrack.push([]); else st.jamQuietUntil = st.t + 90;
        if (events) events.push({ t: st.t, jam: jam, text: jam
          ? "Korek wykryty – czas postojów zmienia kolor na czerwony i liczy się do „Korki”."
          : "Koniec korka – czas postojów wraca do zwykłego koloru." });
      }
    }
    if (st.t >= PROFILE.total) { st.done = true; st.v = 0; }
  }

  // Przebieg „na sucho”, żeby dopasować przejechany dystans do długości trasy.
  var SIM_KM = (function () { var s = newState(); while (!s.done) step(s, STEP, null); return s.km; })();

  /* ---------- Geometria trasy ---------- */
  function haversine(a, b) {
    var R = 6371, rad = Math.PI / 180;
    var dLat = (b[0] - a[0]) * rad, dLon = (b[1] - a[1]) * rad;
    var x = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos(a[0] * rad) * Math.cos(b[0] * rad) * Math.sin(dLon / 2) * Math.sin(dLon / 2);
    return 2 * R * Math.asin(Math.sqrt(x));
  }
  var cum = [0];
  for (var k = 1; k < ROUTE.length; k++) cum.push(cum[k - 1] + haversine(ROUTE[k - 1], ROUTE[k]));
  var ROUTE_KM = cum[cum.length - 1];
  var KM_SCALE = ROUTE_KM / SIM_KM; // licznik pokazuje dystans trasy

  var map = $("d-map");
  var proj = (function () {
    var minLat = Infinity, maxLat = -Infinity, minLon = Infinity, maxLon = -Infinity;
    ROUTE.forEach(function (p) {
      minLat = Math.min(minLat, p[0]); maxLat = Math.max(maxLat, p[0]);
      minLon = Math.min(minLon, p[1]); maxLon = Math.max(maxLon, p[1]);
    });
    var kx = Math.cos((minLat + maxLat) / 2 * Math.PI / 180);
    var w = (maxLon - minLon) * kx, h = maxLat - minLat;
    var H = 300, pad = 24, sc = (H - 2 * pad) / h, W = Math.max(220, w * sc + 2 * pad + 120);
    var ox = (W - w * sc) / 2;
    return {
      W: W, H: H,
      xy: function (p) { return [ox + (p[1] - minLon) * kx * sc, pad + (maxLat - p[0]) * sc]; }
    };
  })();
  var XY = ROUTE.map(proj.xy);

  function svgEl(name, attrs, parent) {
    var e = document.createElementNS(NS, name);
    for (var a in attrs) e.setAttribute(a, attrs[a]);
    (parent || map).appendChild(e);
    return e;
  }
  function pts(arr) { return arr.map(function (p) { return p[0].toFixed(1) + "," + p[1].toFixed(1); }).join(" "); }

  map.setAttribute("viewBox", "0 0 " + proj.W.toFixed(0) + " " + proj.H);
  // Delikatna siatka zamiast podkładu mapy
  for (var gx = 0; gx < proj.W; gx += 30) svgEl("line", { x1: gx, y1: 0, x2: gx, y2: proj.H, stroke: "#1F2933", "stroke-width": 1 });
  for (var gy = 0; gy < proj.H; gy += 30) svgEl("line", { x1: 0, y1: gy, x2: proj.W, y2: gy, stroke: "#1F2933", "stroke-width": 1 });
  svgEl("polyline", { points: pts(XY), fill: "none", stroke: "#334155", "stroke-width": 6, "stroke-linecap": "round", "stroke-linejoin": "round" });
  var defs = svgEl("defs", {});
  var grad = svgEl("linearGradient", { id: "dtRouteGrad", x1: 0, y1: 0, x2: 0, y2: 1 }, defs);
  svgEl("stop", { offset: 0, "stop-color": "#22D3EE" }, grad);
  svgEl("stop", { offset: 1, "stop-color": "#A78BFA" }, grad);
  var done = svgEl("polyline", { points: "", fill: "none", stroke: "url(#dtRouteGrad)", "stroke-width": 4, "stroke-linecap": "round", "stroke-linejoin": "round" });
  var jamGroup = svgEl("g", { fill: "none", stroke: "#F43F5E", "stroke-width": 6, "stroke-linecap": "round", "stroke-linejoin": "round" });
  var a0 = XY[0], a1 = XY[XY.length - 1];
  svgEl("circle", { cx: a0[0], cy: a0[1], r: 6, fill: "#34D399", stroke: "#0B0F14", "stroke-width": 2 });
  svgEl("circle", { cx: a1[0], cy: a1[1], r: 6, fill: "#A78BFA", stroke: "#0B0F14", "stroke-width": 2 });
  var lblStart = svgEl("text", { x: a0[0] + 12, y: a0[1] + 4, fill: "#8B98A5", "font-size": 12, "font-family": "Inter, system-ui, sans-serif" });
  lblStart.textContent = "Bielany";
  var lblEnd = svgEl("text", { x: a1[0] + 12, y: a1[1] + 4, fill: "#8B98A5", "font-size": 12, "font-family": "Inter, system-ui, sans-serif" });
  lblEnd.textContent = "Służewiec";
  var halo = svgEl("circle", { r: 11, fill: "rgba(34,211,238,.2)" });
  var car = svgEl("circle", { r: 5.5, fill: "#E6EDF3", stroke: "#22D3EE", "stroke-width": 2.5 });

  function positionAt(km) {
    var d = clamp(km, 0, ROUTE_KM), lo = 0, hi = cum.length - 1;
    while (hi - lo > 1) { var mid = (lo + hi) >> 1; if (cum[mid] <= d) lo = mid; else hi = mid; }
    var seg = cum[hi] - cum[lo], f = seg > 0 ? (d - cum[lo]) / seg : 0;
    return { i: lo, p: [XY[lo][0] + (XY[hi][0] - XY[lo][0]) * f, XY[lo][1] + (XY[hi][1] - XY[lo][1]) * f] };
  }

  /* ---------- Wykres prędkości ---------- */
  var canvas = $("d-chart"), ctx = canvas.getContext("2d");
  function sizeCanvas() {
    var dpr = window.devicePixelRatio || 1, w = canvas.clientWidth || 300, h = canvas.clientHeight || 120;
    canvas.width = Math.round(w * dpr); canvas.height = Math.round(h * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  function drawChart(st) {
    var w = canvas.clientWidth || 300, h = canvas.clientHeight || 120;
    ctx.clearRect(0, 0, w, h);
    var win = clamp(st.t, CHART_MIN, CHART_WINDOW), t0 = st.t - win;
    var top = Math.max(80, Math.ceil((st.maxV + 5) / 20) * 20);
    var padL = 26, padB = 4, cw = w - padL, ch = h - padB - 6;
    function X(t) { return padL + (t - t0) / win * cw; }
    function Y(v) { return 6 + ch - v / top * ch; }

    ctx.font = "10px Inter, system-ui, sans-serif";
    ctx.fillStyle = "#8B98A5"; ctx.strokeStyle = "rgba(139,152,165,.18)"; ctx.lineWidth = 1;
    ctx.textAlign = "right"; ctx.textBaseline = "middle";
    for (var g = 0; g <= top; g += 20) {
      var y = Math.round(Y(g)) + 0.5;
      ctx.beginPath(); ctx.moveTo(padL, y); ctx.lineTo(w, y); ctx.stroke();
      if (g % 40 === 0) ctx.fillText(String(g), padL - 5, y);
    }

    var s = st.samples.filter(function (p) { return p.t >= t0 - 1; });
    // Korek: tło w kolorze róży
    ctx.fillStyle = "rgba(244,63,94,.22)";
    s.forEach(function (p) { if (p.jam) ctx.fillRect(X(p.t), 6, Math.max(1, cw / win) + 0.5, ch); });

    var line = s.map(function (p) { return [X(p.t), Y(p.v)]; });
    if (!st.done) line.push([X(st.t), Y(st.v)]);
    if (line.length < 2) return;
    var area = ctx.createLinearGradient(0, 6, 0, 6 + ch);
    area.addColorStop(0, "rgba(34,211,238,.28)"); area.addColorStop(1, "rgba(34,211,238,0)");
    ctx.save(); ctx.beginPath(); ctx.rect(padL, 0, cw, h); ctx.clip();
    ctx.beginPath(); ctx.moveTo(line[0][0], Y(0));
    line.forEach(function (p) { ctx.lineTo(p[0], p[1]); });
    ctx.lineTo(line[line.length - 1][0], Y(0)); ctx.closePath();
    ctx.fillStyle = area; ctx.fill();
    ctx.beginPath();
    line.forEach(function (p, i) { if (i) ctx.lineTo(p[0], p[1]); else ctx.moveTo(p[0], p[1]); });
    ctx.strokeStyle = "#22D3EE"; ctx.lineWidth = 2; ctx.lineJoin = "round"; ctx.stroke();
    var last = line[line.length - 1];
    ctx.beginPath(); ctx.arc(last[0], last[1], 3.5, 0, Math.PI * 2); ctx.fillStyle = "#E6EDF3"; ctx.fill();
    ctx.restore();
  }

  /* ---------- Widok ---------- */
  var el = {
    status: $("d-status"), elapsed: $("d-elapsed"), speed: $("d-speed"), dist: $("d-dist"), avg: $("d-avg"),
    stopBox: $("d-stopbox"), stop: $("d-stop"), stopsSum: $("d-stops-sum"), jamSum: $("d-jam-sum"),
    fuel: $("d-fuel"), fuelNow: $("d-fuel-now"), cost: $("d-cost"), litres: $("d-litres"),
    starts: $("d-starts"), halts: $("d-halts"), event: $("d-event"), progress: $("d-progress"),
    pSpeed: $("p-speed"), pDrive: $("p-drive"), pAvg: $("p-avg"), pCost: $("p-cost"),
    spark: document.querySelector("#p-spark polyline"), play: $("c-play"), restart: $("c-restart"), price: $("d-price")
  };
  el.price.textContent = fmt(PRICE, 2);

  function setEvent(t, text) {
    el.event.textContent = "";
    var b = document.createElement("b"); b.textContent = clock(t) + " ";
    el.event.appendChild(b); el.event.appendChild(document.createTextNode(text));
  }

  function render(st) {
    var km = st.km * KM_SCALE, avg = st.t > 5 ? km / (st.t / 3600) : 0;
    var cost = st.litres * PRICE, sp = Math.round(st.v), stopped = st.v < 1.5;
    el.speed.textContent = sp; el.pSpeed.textContent = sp;
    el.elapsed.textContent = clock(st.t);
    el.dist.textContent = fmt(km, 1);
    el.avg.textContent = Math.round(avg); el.pAvg.textContent = Math.round(avg);
    el.stop.textContent = clock(st.stopSum + st.jamSum);
    el.stopsSum.textContent = clock(st.stopSum);
    el.jamSum.textContent = clock(st.jamSum);
    el.stopBox.classList.toggle("is-jam", st.inJam);
    el.stopBox.classList.toggle("is-stopped", stopped && !st.inJam && st.t > 6);
    el.fuel.textContent = km > 0.3 ? fmt(st.litres / km * 100, 1) : "–";
    el.fuelNow.textContent = st.v >= 5 ? fmt(flowLh(st.v, st.a) / (st.v * KM_SCALE) * 100, 1) + " L/100" : fmt(flowLh(st.v, 0), 1) + " L/h";
    el.cost.textContent = fmt(cost, 2); el.pCost.textContent = fmt(cost, 2) + " zł";
    el.litres.textContent = fmt(st.litres, 2);
    el.starts.textContent = st.starts; el.halts.textContent = st.halts;
    el.pDrive.textContent = clock(st.driveTime);
    el.progress.style.width = (st.t / PROFILE.total * 100).toFixed(2) + "%";
    el.status.textContent = st.done ? "Trasa zakończona" : st.t === 0 ? "Gotowe do startu"
      : st.inJam ? "Korek" : stopped ? "Postój" : "Nagrywanie trasy";

    // Sparkline okienka: ostatnie 2 min
    var sp2 = st.samples.slice(-120);
    if (sp2.length > 1) {
      var t0 = sp2[0].t, span = Math.max(1, sp2[sp2.length - 1].t - t0), top = Math.max(60, st.maxV);
      el.spark.setAttribute("points", sp2.map(function (p) {
        return ((p.t - t0) / span * 200).toFixed(1) + "," + (34 - p.v / top * 32).toFixed(1);
      }).join(" "));
    } else el.spark.setAttribute("points", "");

    // Mapa
    var pos = positionAt(km);
    done.setAttribute("points", pts(XY.slice(0, pos.i + 1).concat([pos.p])));
    car.setAttribute("cx", pos.p[0].toFixed(1)); car.setAttribute("cy", pos.p[1].toFixed(1));
    halo.setAttribute("cx", pos.p[0].toFixed(1)); halo.setAttribute("cy", pos.p[1].toFixed(1));
    if (st.inJam && st.jamTrack.length) {
      var tr = st.jamTrack[st.jamTrack.length - 1], lp = tr[tr.length - 1];
      if (!lp || Math.abs(lp[0] - pos.p[0]) + Math.abs(lp[1] - pos.p[1]) > 0.5) tr.push(pos.p);
    }
    while (jamGroup.childNodes.length < st.jamTrack.length) svgEl("polyline", { points: "" }, jamGroup);
    st.jamTrack.forEach(function (tr, i) { if (tr.length > 1) jamGroup.childNodes[i].setAttribute("points", pts(tr)); });

    drawChart(st);
  }

  /* ---------- Sterowanie ---------- */
  var st = newState(), running = false, mult = 5, last = 0, acc = 0, raf = 0;
  var reduced = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  function summary() {
    var km = st.km * KM_SCALE;
    setEvent(st.t, "Trasa zakończona: " + fmt(km, 1) + " km w " + Math.round(st.t / 60) + " min, koszt " +
      fmt(st.litres * PRICE, 2) + " zł, postoje " + clock(st.stopSum) + ", korki " + clock(st.jamSum) +
      ". Takie podsumowanie pojawia się po każdej jeździe.");
  }

  function setRunning(on) {
    running = on;
    root.classList.toggle("running", on);
    el.play.setAttribute("aria-pressed", on ? "true" : "false");
    el.play.textContent = on ? "❚❚ Pauza" : st.done ? "▶ Jeszcze raz" : st.t > 0 ? "▶ Wznów" : "▶ Start";
    if (on && !raf) { last = 0; raf = requestAnimationFrame(frame); }
  }

  function frame(ts) {
    raf = 0;
    if (!running) return;
    var dt = last ? Math.min(0.25, (ts - last) / 1000) : 0;
    last = ts;
    acc += dt * mult;
    var events = [];
    while (acc >= STEP && !st.done) { step(st, STEP, events); acc -= STEP; }
    if (events.length) { var e = events[events.length - 1]; setEvent(e.t, e.text); }
    render(st);
    if (st.done) { acc = 0; summary(); setRunning(false); return; }
    raf = requestAnimationFrame(frame);
  }

  function restart(play) {
    st = newState(); acc = 0;
    while (jamGroup.firstChild) jamGroup.removeChild(jamGroup.firstChild);
    el.event.textContent = "Naciśnij Start, żeby odtworzyć przejazd.";
    render(st);
    setRunning(play);
  }

  el.play.addEventListener("click", function () {
    if (st.done) restart(true); else setRunning(!running);
  });
  el.restart.addEventListener("click", function () { restart(true); });
  Array.prototype.forEach.call(root.querySelectorAll(".seg button"), function (b) {
    b.addEventListener("click", function () {
      mult = Number(b.getAttribute("data-mult")) || 1;
      Array.prototype.forEach.call(root.querySelectorAll(".seg button"), function (o) {
        o.classList.toggle("on", o === b);
        o.setAttribute("aria-pressed", o === b ? "true" : "false");
      });
    });
    b.setAttribute("aria-pressed", b.classList.contains("on") ? "true" : "false");
  });

  window.addEventListener("resize", function () { sizeCanvas(); drawChart(st); });
  sizeCanvas();
  render(st);
  setRunning(false);

  // Bez ograniczenia animacji demo rusza samo, gdy pojawi się na ekranie; przy „ogranicz ruch” czeka na Start.
  if (!reduced && "IntersectionObserver" in window) {
    var io = new IntersectionObserver(function (entries) {
      if (entries[0].isIntersecting) {
        io.disconnect();
        if (!running && st.t === 0) setRunning(true);
      }
    }, { threshold: 0.35 });
    io.observe(root);
  }
})();
