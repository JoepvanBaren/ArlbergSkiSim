// Build tools: lift line engineering, piste drawing, huts, inspect / demolish
(function (SK) {
  'use strict';
  var T = SK.T, CFG = SK.CFG, Wd = SK.World, Sim = SK.Sim;
  var B = SK.Build = { tool: 'inspect', liftType: 'tbar', start: null, pts: [], hover: null, sel: null, plan: null, route: false, zoneR: 260, pending: false };

  var ENG = {      // per lift style: rope clearance, tower spacing rules, max single span
    chair: { clear: 9, minSpan: 70, maxSpan: 230, hardSpan: 420, sag: 0.03 },
    gondola: { clear: 13, minSpan: 110, maxSpan: 320, hardSpan: 650, sag: 0.03 },
    tram: { clear: 20, minSpan: 450, maxSpan: 1500, hardSpan: 2600, sag: 0.045 },
    pod: { clear: 8, minSpan: 60, maxSpan: 150, hardSpan: 320, sag: 0.0 },
    big: { clear: 22, minSpan: 450, maxSpan: 1600, hardSpan: 3200, sag: 0.04 },
    twin: { clear: 15, minSpan: 140, maxSpan: 420, hardSpan: 900, sag: 0.03 },
  };

  // ------------------------------------------------------------------ lift engineering
  B.liftGeom = function (ty, a, b) {
    var dx = b.x - a.x, dz = b.z - a.z, len = Math.hypot(dx, dz);
    var g = { len: len, ux: dx / (len || 1), uz: dz / (len || 1), towers: [], error: null, hang: 7 };
    var n = Math.max(3, Math.ceil(len / 20) + 1), step = len / (n - 1), i;
    g.step = step;
    var ground = new Float32Array(n), ys = new Float32Array(n), forest = 0;
    for (i = 0; i < n; i++) {
      var x = a.x + g.ux * step * i, z = a.z + g.uz * step * i;
      ground[i] = T.heightAt(x, z);
      if (T.forestAt(x, z) > 0.35 && !Wd.isCleared(x, z)) forest += step;
    }
    g.ys = ys; g.ground = ground;
    g.vertical = ground[n - 1] - ground[0];
    g.slopeLen = Math.hypot(len, g.vertical);
    if (len < ty.minLen) g.error = 'Too short - at least ' + ty.minLen + ' m for this lift.';
    else if (len > ty.maxLen) g.error = 'Too long - ' + ty.name + ' reaches ' + ty.maxLen + ' m at most.';
    else if (g.vertical < 40) g.error = 'The top station must be at least 40 m higher than the bottom.';
    else if (!T.inside(a.x, a.z, 90) || !T.inside(b.x, b.z, 90)) g.error = 'Too close to the edge of the concession.';

    if (ty.style === 'surface') {
      for (i = 0; i < n; i++) ys[i] = ground[i] + g.hang;
      for (i = 0; i < n - 1; i++) {
        var gr = (ground[i + 1] - ground[i]) / step;
        if (!g.error && gr < -0.07) g.error = 'A tow cannot run downhill - the line dips at ' + Math.round(i * step) + ' m.';
        if (!g.error && gr > 0.66) g.error = 'Too steep for a tow (' + Math.round(gr * 100) + '% at ' + Math.round(i * step) + ' m).';
      }
      var cnt = Math.max(1, Math.round(len / 80));
      for (i = 1; i <= cnt; i++) { var d = len * i / (cnt + 1), k = Math.round(d / step); g.towers.push({ d: k * step, g: ground[k], h: g.hang }); }
    } else {
      var E = ENG[ty.big ? 'big' : ty.twin ? 'twin' : ty.style], top = new Float32Array(n);
      for (i = 0; i < n; i++) top[i] = ground[i] + E.clear;
      top[0] = ground[0] + 7; top[n - 1] = ground[n - 1] + 7;
      // upper convex hull: a taut rope over the terrain profile
      var hull = [0];
      for (i = 1; i < n; i++) {
        while (hull.length >= 2) {
          var p = hull[hull.length - 2], q = hull[hull.length - 1];
          if ((top[q] - top[p]) * (i - p) <= (top[i] - top[p]) * (q - p)) hull.pop(); else break;
        }
        hull.push(i);
      }
      // thin clustered towers
      var keep = [0], minS = E.minSpan / step;
      for (i = 1; i < hull.length - 1; i++) if (hull[i] - keep[keep.length - 1] >= minS && (n - 1) - hull[i] >= minS * 0.7) keep.push(hull[i]);
      keep.push(n - 1);
      // re-insert where thinning would put the rope into the ground
      for (var guard = 0; guard < 30; guard++) {
        var worst = 0, wi = -1, wk = -1;
        for (var s = 0; s < keep.length - 1; s++) {
          var i0 = keep[s], i1 = keep[s + 1];
          for (i = i0 + 1; i < i1; i++) {
            var ry = top[i0] + (top[i1] - top[i0]) * (i - i0) / (i1 - i0), v = ground[i] + E.clear * 0.55 - ry;
            if (v > worst) { worst = v; wi = i; wk = s + 1; }
          }
        }
        if (wi < 0) break;
        keep.splice(wk, 0, wi);
      }
      // subdivide long spans where the ground is close enough for a tower
      var maxS = E.maxSpan / step, out = [keep[0]];
      for (s = 0; s < keep.length - 1; s++) {
        i0 = keep[s]; i1 = keep[s + 1];
        var parts = Math.ceil((i1 - i0) / maxS);
        for (var c = 1; c < parts; c++) {
          var im = Math.round(i0 + (i1 - i0) * c / parts);
          var hh = top[i0] + (top[i1] - top[i0]) * (im - i0) / (i1 - i0) - ground[im];
          if (hh < (ty.style === 'tram' || ty.big ? 110 : 55) && im > out[out.length - 1]) out.push(im);
        }
        out.push(i1);
      }
      keep = out;
      for (s = 0; s < keep.length - 1; s++) {
        i0 = keep[s]; i1 = keep[s + 1];
        var span = (i1 - i0) * step;
        if (!g.error && span > E.hardSpan) g.error = 'A ' + Math.round(span) + ' m span over the valley is too much for this lift (max ' + E.hardSpan + ' m). Try a tramway or 3S.';
        var sag = Math.min(span * E.sag, E.clear * 0.5 + 2);
        for (i = i0; i <= i1; i++) {
          var t = (i - i0) / (i1 - i0);
          ys[i] = top[i0] + (top[i1] - top[i0]) * t - 4 * sag * t * (1 - t);
        }
        if (s > 0) g.towers.push({ d: i0 * step, g: ground[i0], h: top[i0] - ground[i0] });
      }
    }
    var alt = 1 + Math.max(0, ground[n - 1] - 2000) / 1000 * 0.25;
    g.cost = Math.round((ty.base + ty.perM * g.slopeLen + ty.tower * g.towers.length) * alt + forest * 45);
    g.weeks = ty.weeks + Math.round(len / 800);
    g.forest = forest;
    g.rideMin = g.slopeLen / (ty.speed / 20) / 60;
    return g;
  };

  // ------------------------------------------------------------------ piste geometry
  function chaikin(pts) {
    if (pts.length < 3) return pts.slice();
    var out = [pts[0]];
    for (var i = 0; i < pts.length - 1; i++) {
      var a = pts[i], b = pts[i + 1];
      if (i > 0) out.push({ x: a.x * 0.75 + b.x * 0.25, z: a.z * 0.75 + b.z * 0.25 });
      if (i < pts.length - 2) out.push({ x: a.x * 0.25 + b.x * 0.75, z: a.z * 0.25 + b.z * 0.75 });
    }
    out.push(pts[pts.length - 1]);
    return out;
  }
  B.resample = function (clicks) {
    var pts = chaikin(chaikin(clicks)), out = [{ x: pts[0].x, z: pts[0].z }], sp = 15, carry = 0;
    for (var i = 0; i < pts.length - 1; i++) {
      var a = pts[i], b = pts[i + 1], l = Math.hypot(b.x - a.x, b.z - a.z), d = sp - carry;
      while (d <= l) { out.push({ x: a.x + (b.x - a.x) * d / l, z: a.z + (b.z - a.z) * d / l }); d += sp; }
      carry = l - (d - sp);
    }
    var last = pts[pts.length - 1], e = out[out.length - 1];
    if (Math.hypot(last.x - e.x, last.z - e.z) > 4) out.push({ x: last.x, z: last.z }); else out[out.length - 1] = { x: last.x, z: last.z };
    return out;
  };
  // gradients over ~75 m windows; classes per point
  B.pisteStats = function (pts) {
    var n = pts.length, ys = new Float32Array(n), i, W = 5, grads = new Float32Array(n), maxG = 0, minG = 1, len = 0, uphillAt = -1, cliffAt = -1;
    for (i = 0; i < n; i++) ys[i] = T.heightAt(pts[i].x, pts[i].z);
    for (i = 0; i < n; i++) {
      var i0 = Math.max(0, i - 2), i1 = Math.min(n - 1, i0 + W);
      i0 = Math.max(0, i1 - W);
      var run = 0;
      for (var k = i0; k < i1; k++) run += Math.hypot(pts[k + 1].x - pts[k].x, pts[k + 1].z - pts[k].z);
      var g = run > 1 ? (ys[i0] - ys[i1]) / run : 0;
      grads[i] = g;
      if (g > maxG) maxG = g;
      if (g < minG) minG = g;
      if (g < -0.035 && uphillAt < 0) uphillAt = i;
      if (g > 0.85 && cliffAt < 0) cliffAt = i;
      if (i) len += Math.hypot(pts[i].x - pts[i - 1].x, pts[i].z - pts[i - 1].z, ys[i] - ys[i - 1]);
    }
    // short steep pitches do not change the colour: grade by the gradient exceeded on ~8% of the run
    var sorted = Array.prototype.slice.call(grads).sort(function (a, b) { return a - b; });
    var p92 = sorted[Math.min(n - 1, Math.floor(n * 0.92))];
    return { ys: ys, grads: grads, maxGrad: maxG, gradeGrad: p92, diff: SK.gradeOf(p92), len: len, drop: ys[0] - ys[n - 1], uphillAt: uphillAt, cliffAt: cliffAt };
  };
  B.pistePlan = function (clicks, route) {
    var pts = B.resample(clicks), st = B.pisteStats(pts), cost = 0, forest = 0, err = null;
    for (var i = 1; i < pts.length; i++) {
      var p = pts[i], sl = T.slopeAt(p.x, p.z), along = Math.abs(st.grads[i]);
      var side = Math.sqrt(Math.max(0, sl * sl - along * along)), seg = 15;
      var f = T.forestAt(p.x, p.z) > 0.35 && !Wd.isCleared(p.x, p.z);
      if (f) forest += seg;
      cost += seg * (11 + side * 34 + (f ? 42 : 0));
    }
    if (st.len < 150) err = 'Too short - draw at least 150 m.';
    else if (st.uphillAt >= 0) err = 'The piste runs uphill at ' + Math.round(st.uphillAt * 15) + ' m. Skis only go down.';
    else if (st.cliffAt >= 0 && !(route && st.maxGrad < 1.15)) err = 'That is a cliff (' + Math.round(st.grads[st.cliffAt] * 100) + '%). Find a way around.';
    else if (st.drop < 20) err = 'Almost flat - guests would have to walk.';
    if (route) return { pts: pts, st: st, cost: Math.round(1500 + st.len * 2.2), weeks: 1, error: err, forest: forest, route: true };
    return { pts: pts, st: st, cost: Math.round(cost), weeks: Math.max(1, Math.round(st.len / 1100 + forest / 700)), error: err, forest: forest };
  };

  // ------------------------------------------------------------------ snapping & picking
  B.snap = function (p) {
    var best = null, bd = CFG.SNAP;
    Sim.endpoints().forEach(function (e) {
      var d = Math.hypot(e.x - p.x, e.z - p.z);
      if (d < bd) { bd = d; best = e; }
    });
    if (best) return { x: best.x, z: best.z, y: T.heightAt(best.x, best.z), snapped: true, what: best };
    // interior of an existing piste
    var bi = null; bd = CFG.SNAP * 0.6;
    SK.G.pistes.forEach(function (ps) {
      for (var i = 0; i < ps.pts.length; i++) { var d = Math.hypot(ps.pts[i].x - p.x, ps.pts[i].z - p.z); if (d < bd) { bd = d; bi = ps.pts[i]; } }
    });
    if (bi) return { x: bi.x, z: bi.z, y: T.heightAt(bi.x, bi.z), snapped: true, what: null };
    return { x: p.x, z: p.z, y: p.y, snapped: false };
  };
  B.inHub = function (p) {
    for (var i = 0; i < Wd.hubs.length; i++) if (Math.hypot(Wd.hubs[i].x - p.x, Wd.hubs[i].z - p.z) < CFG.HUB_RADIUS) return Wd.hubs[i];
    return null;
  };
  function distSeg(px, pz, ax, az, bx, bz) {
    var dx = bx - ax, dz = bz - az, l2 = dx * dx + dz * dz, t = l2 ? ((px - ax) * dx + (pz - az) * dz) / l2 : 0;
    t = Math.max(0, Math.min(1, t));
    return Math.hypot(px - ax - dx * t, pz - az - dz * t);
  }
  B.pickObject = function (p) {
    var G = SK.G, best = null, bd = Math.max(70, Wd.cam.dist / 90);
    G.huts.forEach(function (h) { var d = Math.hypot(h.x - p.x, h.z - p.z) * 0.6; if (d < bd) { bd = d; best = { kind: 'hut', obj: h }; } });
    (G.zones || []).forEach(function (zn) { var d = Math.abs(Math.hypot(zn.x - p.x, zn.z - p.z) - zn.r) * 0.7; if (d < bd) { bd = d; best = { kind: 'zone', obj: zn }; } });
    G.lifts.forEach(function (l) { var d = distSeg(p.x, p.z, l.a.x, l.a.z, l.b.x, l.b.z) * 0.8; if (d < bd) { bd = d; best = { kind: 'lift', obj: l }; } });
    G.pistes.forEach(function (ps) {
      for (var i = 0; i < ps.pts.length; i += 2) { var d = Math.hypot(ps.pts[i].x - p.x, ps.pts[i].z - p.z); if (d < bd) { bd = d; best = { kind: 'piste', obj: ps }; } }
    });
    return best;
  };

  // ------------------------------------------------------------------ tool state
  B.setTool = function (tool) {
    if (tool !== 'inspect' && tool !== 'zone' && SK.G.phase !== 'summer') { SK.UI.toast('Construction happens in summer. The crews are home for the winter.', 'warn'); tool = 'inspect'; }
    B.tool = tool; B.start = null; B.pts = []; B.plan = null; B.pending = false;
    if (tool !== 'inspect') B.sel = null;
    T.uniforms.uShowHubs.value = (tool === 'lift' || tool === 'piste') ? 1 : 0;
    B.refreshView();
    B.redraw();
    SK.UI.refreshTools();
  };
  B.refreshView = function () {
    var v = SK.UI.view;
    T.uniforms.uOverlay.value = (v.ava || B.tool === 'zone') ? 2 : ((v.slope || B.tool === 'piste') ? 1 : 0);
    T.uniforms.uContour.value = (v.contour || B.tool === 'piste' || B.tool === 'lift') ? 1 : 0;
  };
  B.cancel = function () {
    if (B.start || B.pts.length || B.pending) { B.start = null; B.pts = []; B.plan = null; B.pending = false; B.redraw(); SK.UI.refreshPlan(); }
    else if (B.tool !== 'inspect') B.setTool('inspect');
    else { B.sel = null; B.redraw(); SK.UI.refreshSelection(); }
  };
  B.undoPoint = function () {
    if (B.tool === 'piste' && B.pts.length) { B.pts.pop(); B.updatePlan(); }
    else B.cancel();
  };

  var COL = { blue: 0x2b7fd6, red: 0xdc3b34, black: 0x15181c, bad: 0xff7a00 };

  B.updatePlan = function () {
    B.plan = null;
    var h = B.hover;
    if (B.tool === 'lift' && B.start && h && Math.hypot(h.x - B.start.x, h.z - B.start.z) > 40) {
      var ty = SK.LIFT[B.liftType], e = B.snap(h);
      var g = B.liftGeom(ty, B.start, { x: e.x, y: e.y, z: e.z });
      var err = g.error || Sim.checkBudget(g.cost, g.weeks);
      B.plan = { kind: 'lift', ty: ty, geom: g, b: { x: e.x, y: e.y, z: e.z }, error: err, hard: !!g.error };
    } else if (B.tool === 'piste' && B.pts.length) {
      var clicks = B.pts.slice();
      if (h) { var s = B.snap(h); if (Math.hypot(s.x - clicks[clicks.length - 1].x, s.z - clicks[clicks.length - 1].z) > 25) clicks.push({ x: s.x, z: s.z }); }
      if (clicks.length >= 2) {
        var pl = B.pistePlan(clicks, B.route);
        pl.kind = 'piste'; pl.hard = !!pl.error; pl.error = pl.error || Sim.checkBudget(pl.cost, pl.weeks);
        B.plan = pl;
      }
    } else if (B.tool === 'hut' && h) {
      var sl = T.slopeAt(h.x, h.z), near = false;
      SK.G.pistes.forEach(function (ps) { for (var i = 0; i < ps.pts.length; i += 3) if (Math.hypot(ps.pts[i].x - h.x, ps.pts[i].z - h.z) < 160) near = true; });
      var cost = 60000 + Math.round(Math.max(0, h.y - 1400) * 60), e2 = null;
      if (sl > 0.35) e2 = 'Too steep for a hut.'; else if (!near) e2 = 'Huts need a piste within 160 m.';
      B.plan = { kind: 'hut', cost: cost, weeks: 3, error: e2 || Sim.checkBudget(cost, 3), hard: !!e2, pt: h };
    } else if (B.tool === 'zone' && h) {
      B.plan = { kind: 'zone', pt: h, r: B.zoneR, error: SK.G.zones.length >= T.MAXZONES ? 'Ten closure zones is the limit.' : null };
    }
    B.redraw();
    SK.UI.refreshPlan();
  };

  B.redraw = function () {
    Wd.clearPreview();
    var G = SK.G, i;
    if (B.tool === 'lift' || B.tool === 'piste') {
      Sim.endpoints().forEach(function (e) { Wd.previewRing(e.x, e.z, 26, false); });
    }
    if (B.tool === 'lift' && B.start) {
      Wd.previewRing(B.start.x, B.start.z, 40, true);
      var pl = B.plan;
      if (pl && pl.kind === 'lift') {
        var g = pl.geom, a = B.start, xyz = [], col = pl.error ? (pl.hard ? 0xff4b3a : 0xffa826) : 0x2fe07a;
        for (i = 0; i < g.ys.length; i++) xyz.push(a.x + g.ux * g.step * i, g.ys[i], a.z + g.uz * g.step * i);
        Wd.previewLine(xyz, col);
        var bt = new Wd.Batch();
        g.towers.forEach(function (t) { bt.box(a.x + g.ux * t.d, t.g + t.h / 2, a.z + g.uz * t.d, 5, t.h, 5, g.ux, g.uz, col, 0.5); });
        bt.box(a.x, a.y + 5, a.z, 20, 10, 15, g.ux, g.uz, col);
        bt.box(pl.b.x, pl.b.y + 5, pl.b.z, 20, 10, 15, g.ux, g.uz, col);
        Wd.previewBoxes(bt);
      }
    }
    if (B.tool === 'piste') {
      B.pts.forEach(function (p, k) { Wd.previewRing(p.x, p.z, k ? 16 : 36, k === 0); });
      if (B.plan && B.plan.kind === 'piste') {
        var st = B.plan.st, cols = [];
        for (i = 0; i < B.plan.pts.length; i++) {
          var gr = st.grads[i];
          cols.push(gr < -0.035 || gr > 0.85 ? COL.bad : COL[SK.gradeOf(gr)]);
        }
        Wd.previewRibbon(B.plan.pts, B.route ? cols.map(function (c) { return c === COL.bad ? c : 0xf08a1c; }) : cols, B.route ? 16 : 44);
      }
    }
    if (B.tool === 'hut' && B.plan && B.plan.kind === 'hut') Wd.previewRing(B.plan.pt.x, B.plan.pt.z, 30, !B.plan.error);
    if (B.tool === 'zone' && B.plan && B.plan.kind === 'zone') Wd.previewRing(B.plan.pt.x, B.plan.pt.z, B.plan.r, 'red');
    if (B.tool === 'zone' || SK.UI.view.ava) (Sim.hazards || []).forEach(function (hz) { if (!hz.zoned) Wd.previewRing(hz.x, hz.z, 70, 'red'); });
    if (B.sel) {
      var o = B.sel.obj;
      if (B.sel.kind === 'piste') Wd.previewRibbon(o.pts, o.pts.map(function () { return 0xffc21a; }), o.width + 26);
      else if (B.sel.kind === 'lift') {
        var pp = [];
        for (i = 0; i <= 20; i++) pp.push({ x: o.a.x + (o.b.x - o.a.x) * i / 20, z: o.a.z + (o.b.z - o.a.z) * i / 20 });
        Wd.previewRibbon(pp, pp.map(function () { return 0xffc21a; }), 30, 3);
      } else Wd.previewRing(o.x, o.z, B.sel.kind === 'zone' ? o.r : 34, true);
    }
    // warnings on the map
    if (G && G.phase === 'summer' && (B.tool === 'lift' || B.tool === 'piste' || B.tool === 'inspect')) {
      Sim.networkIssues().forEach(function (is) { if (is.x !== undefined) Wd.previewRing(is.x, is.z, 55, false); });
    }
  };

  // ------------------------------------------------------------------ input
  B.onMove = function (p) { if (B.pending) return; B.hover = p; if (B.tool !== 'inspect' && B.tool !== 'demolish') B.updatePlan(); };
  // touch screens have no hover: a tap proposes, the Build button in the plan card confirms
  B.confirm = function () { if (!B.pending || !B.hover) return; B.pending = false; var t = Wd.touch; Wd.touch = false; B.onClick(B.hover); Wd.touch = t; };

  B.onClick = function (p) {
    if (!p) return;
    var G = SK.G;
    B.hover = p;
    if (Wd.touch && ((B.tool === 'lift' && B.start) || B.tool === 'hut' || B.tool === 'zone')) { B.updatePlan(); B.pending = !!B.plan; SK.UI.refreshPlan(); return; }
    if (B.tool === 'inspect') {
      B.sel = B.pickObject(p);
      B.redraw(); SK.UI.refreshSelection();
    } else if (B.tool === 'demolish') {
      var hit = B.pickObject(p);
      if (hit) {
        var refund = Sim.remove(hit.kind, hit.obj);
        SK.UI.toast('Removed ' + (hit.obj.name || (hit.kind === 'zone' ? 'the closure zone' : 'the hut')) + (refund ? '. Scrap value ' + SK.fmtMoney(refund) + '.' : '.'));
        B.redraw(); SK.UI.refreshAll();
      }
    } else if (B.tool === 'lift') {
      if (!B.start) {
        var s = B.snap(p);
        if (!T.inside(s.x, s.z, 90)) { SK.UI.toast('Too close to the edge of the concession.', 'warn'); return; }
        B.start = { x: s.x, y: T.heightAt(s.x, s.z), z: s.z };
        B.updatePlan();
      } else {
        B.updatePlan();
        var pl = B.plan;
        if (!pl) return;
        if (pl.error) { SK.UI.toast(pl.error, 'warn'); return; }
        var l = Sim.addLift(B.liftType, B.start, pl.b, pl.geom, pl.geom.cost, pl.geom.weeks);
        SK.UI.toast(l.name + ' built for ' + SK.fmtMoney(pl.geom.cost) + '.', 'good');
        B.start = null; B.plan = null;
        B.redraw(); SK.UI.refreshAll();
      }
    } else if (B.tool === 'piste') {
      var e = B.snap(p);
      if (!B.pts.length) {
        B.pts.push({ x: e.x, z: e.z });
        B.updatePlan();
      } else {
        var last = B.pts[B.pts.length - 1];
        if (Math.hypot(e.x - last.x, e.z - last.z) < 25) return;
        B.pts.push({ x: e.x, z: e.z });
        B.updatePlan();
        // clicking a station, another piste or a village finishes the piste
        if (e.snapped || B.inHub(e)) B.finishPiste();
      }
    } else if (B.tool === 'hut') {
      B.updatePlan();
      if (!B.plan) return;
      if (B.plan.error) { SK.UI.toast(B.plan.error, 'warn'); return; }
      Sim.addHut({ x: p.x, y: p.y, z: p.z }, B.plan.cost, B.plan.weeks);
      SK.UI.toast('Mountain hut opened. Kaiserschmarrn for everyone.', 'good');
      B.updatePlan(); SK.UI.refreshAll();
    } else if (B.tool === 'zone') {
      var ze = Sim.addZone({ x: p.x, z: p.z }, B.zoneR);
      if (ze) SK.UI.toast(ze, 'warn'); else SK.UI.toast('Closure zone marked. Nobody skis in there.', 'good');
      B.plan = null; B.redraw(); SK.UI.refreshAll();
    }
  };

  B.finishPiste = function () {
    if (B.tool !== 'piste' || B.pts.length < 2) return;
    var pl = B.pistePlan(B.pts, B.route), err = pl.error || Sim.checkBudget(pl.cost, pl.weeks);
    if (err) { SK.UI.toast(err, 'warn'); if (pl.error) { B.pts.pop(); B.updatePlan(); } return; }
    var p = Sim.addPiste(pl.pts, pl.cost, pl.weeks, B.route);
    SK.UI.toast('Piste "' + p.name + '" opened: ' + SK.DIFF[p.diff].name.toLowerCase() + ', ' + (pl.st.len / 1000).toFixed(2) + ' km.', 'good');
    B.pts = []; B.plan = null;
    B.redraw(); SK.UI.refreshAll();
  };

  B.init = function () {
    Wd.onMove = B.onMove; Wd.onClick = B.onClick;
    Wd.onDbl = function () { if (B.tool === 'piste') B.finishPiste(); };
    Wd.onRight = function () { B.undoPoint(); };
    window.addEventListener('keydown', function (e) {
      if (e.target.tagName === 'INPUT') return;
      if (e.key === 'Escape') B.cancel();
      else if (e.key === 'Enter') B.finishPiste();
      else if (e.key === 'Backspace') B.undoPoint();
      else if (e.key === '1') B.setTool('inspect'); else if (e.key === '2') B.setTool('lift'); else if (e.key === '3') B.setTool('piste');
      else if (e.key === '4') B.setTool('hut'); else if (e.key === '5') B.setTool('zone'); else if (e.key === '6') B.setTool('demolish');
    });
  };
})(window.SK);
