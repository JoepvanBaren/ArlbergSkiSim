// Developer helpers for balancing. Not loaded by the game. In the browser console:
//   var s = document.createElement('script'); s.src = 'tools/devtest.js'; document.head.appendChild(s);
(function () {
  var SK = window.SK;
  function hide() { document.getElementById('modal').classList.add('hidden'); }

  // build n random lift + piste pairs, starting from the villages (hubIdx optional)
  window.auto = function (n, types, seed, hubIdx) {
    var G = SK.G, T = SK.T, B = SK.Build, Sim = SK.Sim, rnd = SK.rng(seed || 7), made = 0;
    G.money = 3e9; G.crewLeft = 99999;
    function tryLift(a, type) {
      var ty = SK.LIFT[type];
      for (var k = 0; k < 80; k++) {
        var ang = rnd() * 6.283, L = ty.minLen + rnd() * (Math.min(ty.maxLen, 2400) - ty.minLen);
        var b = { x: a.x + Math.sin(ang) * L, z: a.z - Math.cos(ang) * L };
        if (!T.inside(b.x, b.z, 200)) continue;
        b.y = T.heightAt(b.x, b.z);
        if (b.y - a.y < 150) continue;
        var g = B.liftGeom(ty, a, b);
        if (g.error) continue;
        var nx = -(b.z - a.z) / L, nz = (b.x - a.x) / L;
        for (var w = 0.2; w <= 1.4; w += 0.3) for (var sgn = -1; sgn <= 1; sgn += 2) {
          var pts = [{ x: b.x, z: b.z }], m = 4;
          for (var i = 1; i < m; i++) { var t = i / m, side = (i % 2 ? 1 : -1) * sgn; pts.push({ x: b.x + (a.x - b.x) * t + nx * w * L * 0.5 * side, z: b.z + (a.z - b.z) * t + nz * w * L * 0.5 * side }); }
          pts.push({ x: a.x, z: a.z });
          var pl = B.pistePlan(pts);
          if (!pl.error) { var lift = Sim.addLift(type, a, b, g, g.cost, 0); Sim.addPiste(pl.pts, pl.cost, 0); return lift; }
        }
      }
      return null;
    }
    var hubs = hubIdx === undefined ? SK.World.hubs : [SK.World.hubs[hubIdx]];
    var starts = hubs.map(function (h) { var a = { x: h.x + (rnd() - 0.5) * 300, z: h.z + (rnd() - 0.5) * 300 }; a.y = T.heightAt(a.x, a.z); return a; });
    for (var i = 0; i < n; i++) {
      var s = starts[(rnd() * starts.length) | 0], type = types[(rnd() * types.length) | 0];
      var l = tryLift({ x: s.x, y: s.y, z: s.z }, type);
      if (l) { made++; starts.push({ x: l.b.x, y: l.b.y, z: l.b.z }); }
    }
    var m2 = Sim.metrics();
    return { made: made, km: +m2.km.toFixed(1), byDiff: m2.byDiff, pph: m2.pph, top: Math.round(m2.top), quality: +m2.quality.toFixed(3), issues: Sim.networkIssues().length };
  };

  // advance the running winter by `sec` simulated seconds and redraw
  window.ff = function (sec) {
    for (var i = 0; i < sec * 10 && SK.G.phase === 'winter'; i++) SK.Sim.update(0.1);
    if (SK.G.phase === 'winter') SK.Sim.present();
    for (var k = 0; k < 40; k++) SK.World.frame(0.1);
    SK.UI.refreshAll();
    var S = SK.G.season;
    return S ? JSON.stringify({ day: S.day, v: S.visitorsToday, agents: SK.Sim.agents.length, rep: +SK.G.reputation.toFixed(1), snow: Math.round(S.snowline), wx: S.weather, danger: S.danger }) : SK.G.phase;
  };

  // play one whole winter headless and move on to the next summer
  window.season = function () {
    SK.openSeason();
    for (var i = 0; i < 2000 && SK.G.phase === 'winter'; i++) SK.Sim.update(0.1);
    var h = SK.G.history[SK.G.history.length - 1];
    var out = { y: h.year, v: Math.round(h.visitors), peak: h.peak, inc: Math.round(h.income), cost: Math.round(h.cost), profit: Math.round(h.profit), rep: +h.rep.toFixed(1),
      share: +h.share.toFixed(3), open: +h.open.toFixed(2), avg: +h.avgRating.toFixed(1), snowfall: Math.round(h.snowfall), tOff: +h.tOff.toFixed(1), bd: h.breakdowns,
      av: h.avalanches, acc: h.accidents, wind: h.windDays, wages: Math.round(h.wages), cap: Math.round(SK.Sim.capacity()) };
    hide(); SK.nextYear(); hide();
    return out;
  };

  // snow statistics for a year: days with a skiable base at several altitudes, averaged over seeds
  window.snowStats = function (year, seeds) {
    var G = SK.G, alts = [1300, 1500, 1800, 2200, 2600], keepY = G.year, keepS = G.seed;
    var res = { year: year, days: alts.map(function () { return 0; }), peak: alts.map(function () { return 0; }), snowfall: 0, d3: 0, d4: 0, wind70: 0 };
    for (var s = 0; s < seeds; s++) {
      G.year = year; G.seed = 1000 + s * 77; G.phase = 'summer';
      SK.openSeason();
      var last = -1, guard = 0;
      while (G.phase === 'winter' && guard++ < 4000) {
        SK.Sim.update(0.1);
        var S = G.season; if (!S) break;
        if (S.day !== last) {
          last = S.day;
          alts.forEach(function (a, i) { var d = SK.Sim.depthAt(a); if (d >= 22) res.days[i]++; if (d > res.peak[i]) res.peak[i] = d; });
          if (S.danger >= 3) res.d3++; if (S.danger >= 4) res.d4++; if (S.today.wind > 70) res.wind70++;
        }
      }
      res.snowfall += G.history[G.history.length - 1].snowfall;
      hide(); G.history.pop();
    }
    res.days = res.days.map(function (d) { return Math.round(d / seeds); });
    res.peak = res.peak.map(function (d) { return Math.round(d); });
    ['snowfall', 'd3', 'd4', 'wind70'].forEach(function (k) { res[k] = Math.round(res[k] / seeds); });
    G.year = keepY; G.seed = keepS; G.phase = 'summer';
    return res;
  };

  // a simple computer player: one summer of sensible decisions, then the winter. Returns the season summary.
  window.aiYear = function (seed) {
    if (!SK.G.history.length && seed) SK.G.seed = seed * 1000003;       // reproducible runs
    var G = SK.G, Sim = SK.Sim, T = SK.T, B = SK.Build, rnd = SK.rng((seed || 1) + G.year * 13), m = Sim.metrics();
    // repairs and upkeep first
    G.lifts.forEach(function (l) { if (l.damaged) Sim.repair('lift', l); if (G.year - l.rope > 22) Sim.replaceRope(l); if (l.cond < 80) Sim.overhaul(l); });
    G.pistes.forEach(function (p) { if (p.damaged) Sim.repair('piste', p); });
    SK.TECH.forEach(function (t) { if (Sim.unlocked(t) && !G.tech[t.id] && t.cost < G.money * 0.25) Sim.buyTech(t); });
    SK.PROJECTS.forEach(function (p) { if (Sim.unlocked(p) && !G.projects[p.id] && p.cost < G.money * 0.2) Sim.buyProject(p); });
    // build: best lift type we can afford, from a village or an existing top station
    var types = SK.LIFTS.filter(function (t) { return Sim.unlocked(t) && t.id !== 'tram' && t.id !== 's3' && t.id !== 'funitel'; });
    for (var tries = 0; tries < 3 && G.crewLeft > 6; tries++) {
      var afford = types.filter(function (t) { return t.base * 1.9 < G.money * 0.7; });
      if (!afford.length) break;
      var ty = afford[afford.length - 1 - ((rnd() * Math.min(2, afford.length)) | 0)];
      var starts = SK.World.hubs.map(function (h) { return { x: h.x + (rnd() - 0.5) * 300, z: h.z + (rnd() - 0.5) * 300 }; }).concat(G.lifts.map(function (l) { return { x: l.b.x, z: l.b.z }; }));
      var done = false;
      for (var k = 0; k < 60 && !done; k++) {
        var a = starts[(rnd() * starts.length) | 0]; a = { x: a.x, z: a.z, y: T.heightAt(a.x, a.z) };
        var ang = rnd() * 6.283, L = ty.minLen + rnd() * (Math.min(ty.maxLen, 2200) - ty.minLen);
        var b = { x: a.x + Math.sin(ang) * L, z: a.z - Math.cos(ang) * L };
        if (!T.inside(b.x, b.z, 200)) continue;
        b.y = T.heightAt(b.x, b.z);
        if (b.y - a.y < 140) continue;
        var g = B.liftGeom(ty, a, b);
        if (g.error || Sim.checkBudget(g.cost * 1.25, g.weeks + 2)) continue;
        var nx = -(b.z - a.z) / L, nz = (b.x - a.x) / L, best = null;
        for (var w = 0.2; w <= 1.6; w += 0.2) for (var sgn = -1; sgn <= 1; sgn += 2) {
          var pts = [{ x: b.x, z: b.z }], mm = 5;
          for (var i = 1; i < mm; i++) { var t = i / mm, side = (i % 2 ? 1 : -1) * sgn; pts.push({ x: b.x + (a.x - b.x) * t + nx * w * L * 0.5 * side, z: b.z + (a.z - b.z) * t + nz * w * L * 0.5 * side }); }
          pts.push({ x: a.x, z: a.z });
          var pl = B.pistePlan(pts);
          if (!pl.error && (!best || pl.st.gradeGrad < best.st.gradeGrad)) best = pl;
        }
        if (!best || Sim.checkBudget(g.cost + best.cost, g.weeks + best.weeks)) continue;
        Sim.addLift(ty.id, a, b, g, g.cost, g.weeks); Sim.addPiste(best.pts, best.cost, best.weeks); done = true;
      }
      if (!done) break;
    }
    // valley, staff, marketing, price
    var acc = Sim.access();
    SK.COMMUNITIES.forEach(function (c) { var cost = Sim.villageCost(c.id); if (acc[c.id] === 1 && cost !== null && cost < G.money * 0.15) Sim.upgradeVillage(c.id); });
    var need = Sim.staffNeed();
    ['mech', 'patrol', 'groom'].forEach(function (id) { G.staff[id] = need[id]; });
    SK.CAMPAIGNS.forEach(function (c) { if (Sim.unlocked(c) && !G.campaignsUsed[c.id] && Sim.campaignCost(c) < G.money * 0.08) Sim.runCampaign(c); });
    G.pistes.forEach(function (p) { if (G.tech.snow1 && !p.snowmaking && p.low < 1700 && Sim.snowmakingCost(p) < G.money * 0.1) Sim.toggleSnowmaking(p); });
    G.price = Math.max(4, Math.round(Sim.fairPrice()));
    var before = G.money, r = window.season();
    r.money = Math.round(G.money); r.lifts = G.lifts.length; r.km = +Sim.metrics().km.toFixed(1); r.beds = Math.round(Sim.capacity()); r.goals = Object.keys(G.goals).map(function (k) { return k + ':' + G.goals[k][0]; }).join(' ');
    return r;
  };
  window.cam = function (x, z, d, yaw, p) { var c = SK.World.camGoal; c.tx = x; c.tz = z; c.dist = d; c.yaw = yaw; c.pitch = p; for (var k = 0; k < 60; k++) SK.World.frame(0.1); };
  window.devReady = true;
})();
