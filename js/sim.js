// Simulation: game state, lift/piste network, guests, snow & weather, staff, maintenance, avalanches, economy, seasons
(function (SK) {
  'use strict';
  var T = SK.T, CFG = SK.CFG, Wd = SK.World;
  var Sim = SK.Sim = {};
  var G = null;
  var agents = Sim.agents = [];
  var nodes = Sim.nodes = [];
  var rnd = Math.random;
  var SAVE_KEY = 'arlberg-pioneers-save-v3';

  var PREF = { 0: { blue: 1, red: 0.14, black: 0.01, route: 0 }, 1: { blue: 0.6, red: 1, black: 0.22, route: 0.05 }, 2: { blue: 0.22, red: 0.8, black: 1, route: 0.9 } };
  var SPEED = { 0: { blue: 95, red: 62, black: 42, route: 30 }, 1: { blue: 128, red: 112, black: 74, route: 55 }, 2: { blue: 150, red: 152, black: 134, route: 118 } };
  var PISTE_NAMES = ['Kandahar', 'Osthang', 'Fang', 'Mattun', 'Schindlerkar', 'Steißbachtal', 'Zammermoos', 'Schöngraben', 'Salzböden', 'Maiensee',
    'Arlenmähder', 'Ulmerhütte', 'Gampberg', 'Riffel', 'Tanzböden', 'Kapall', 'Plattiger', 'Schweinströge', 'Törli', 'Valfagehr', 'Pfannenkopf',
    'Rauz', 'Himmeleck', 'Putzen', 'Lavenar', 'Rossfall', 'Moos', 'Stiegeneck', 'Brunnenhof', 'Nasserein', 'Feldherrnhügel', 'Kaltenegg',
    'Sennhütte', 'Märchenwiese', 'Hasenboden', 'Zwischen', 'Albona', 'Bergwald', 'Sattelkopf', 'Madloch', 'Zürsersee', 'Hexenboden', 'Trittalp',
    'Muggengrat', 'Täli', 'Schlegelkopf', 'Petersboden', 'Steinmähder', 'Zuger Hochlicht', 'Balmengrat', 'Auenfeld', 'Jägeralp', 'Wannenkopf',
    'Hochalp', 'Steffisalp', 'Salober', 'Körbersee', 'Falken', 'Karhorn', 'Sonnen-Jet', 'Schüttboden', 'Kriegerhorn', 'Furka', 'Rotschrofen'];
  var BAND0 = 1000, BANDS = 21;            // snow depth is tracked every 100 m from 1000 to 3000 m
  var FLCLIM = [[-25, 1500], [0, 1150], [20, 900], [50, 760], [80, 1000], [100, 1380], [120, 1780]];

  // ------------------------------------------------------------------ new game / save / load
  function newLedger() { return { tickets: 0, huts: 0, grants: 0, ops: 0, wages: 0, grooming: 0, snowmaking: 0, marketing: 0, construction: 0, interest: 0, upkeep: 0, invest: 0, repairs: 0, damages: 0 }; }
  Sim.newGame = function () {
    G = SK.G = {
      v: 3, year: CFG.START_YEAR, phase: 'summer', money: CFG.START_MONEY, loan: 0,
      lifts: [], pistes: [], huts: [], zones: [], debris: [], nextId: 1, pisteNameIdx: 0,
      tech: {}, villages: {}, projects: {}, daytrip: 0,
      staff: { mech: 0, patrol: 0, groom: 0 }, policy: { avClose: 4 },
      awareness: 0.22, reputation: 50, price: 8,
      campaignsUsed: {}, crewLeft: CFG.BASE_CREW_WEEKS,
      rivals: {}, goals: {}, history: [], season: null,
      ledger: newLedger(), seed: (Math.random() * 1e9) | 0, over: false,
    };
    SK.RIVALS.forEach(function (r) { G.rivals[r.id] = 1; });
    SK.COMMUNITIES.forEach(function (c) { G.villages[c.id] = 0; });
    agents.length = 0;
    Sim.rebuildGraph();
    return G;
  };

  Sim.save = function () {
    if (!G) return;
    var s = JSON.parse(JSON.stringify(G, function (k, v) {
      if (k === 'geom' || k === 'queue' || k === 'cum' || k === 'ys' || k === 'season' || k === 'avPath' || k === 'appeal') return undefined;
      return v;
    }));
    s.phase = 'summer';
    try { localStorage.setItem(SAVE_KEY, JSON.stringify(s)); } catch (e) { /* storage unavailable */ }
  };
  Sim.hasSave = function () { try { return !!localStorage.getItem(SAVE_KEY); } catch (e) { return false; } };
  Sim.load = function () {
    var raw, s;
    try { raw = localStorage.getItem(SAVE_KEY); } catch (e) { return false; }
    if (!raw) return false;
    try { s = JSON.parse(raw); } catch (e) { return false; }
    if (!s || s.v !== 3) return false;
    G = SK.G = s; G.season = null; G.phase = 'summer';
    agents.length = 0;
    G.lifts.forEach(function (l) { l.geom = SK.Build.liftGeom(SK.LIFT[l.type], l.a, l.b); l.queue = []; l.loadAcc = 0; l.running = false; l.open = true; Sim.deriveLift(l); });
    G.pistes.forEach(function (p) { Sim.derivePiste(p); p.open = true; });
    Sim.rebuildGraph();
    return true;
  };

  // ------------------------------------------------------------------ helpers
  Sim.crewMax = function () { return CFG.BASE_CREW_WEEKS + (G.tech.crew2 ? 12 : 0) + (G.tech.heli ? 14 : 0) + (G.tech.prefab ? 16 : 0); };
  Sim.era = function () { return SK.interp(SK.WAGE_ERA, G.year); };
  Sim.assetValue = function () {
    var v = 0;
    G.lifts.forEach(function (l) { v += l.cost * Math.max(0.25, 1 - (G.year - l.built) * 0.02); });
    G.pistes.forEach(function (p) { v += p.cost * 0.6; });
    return v;
  };
  Sim.maxLoan = function () { return Math.round((300000 + Sim.assetValue() * 0.6 + SK.interp(SK.MARKET, G.year) * 6) / 10000) * 10000; };
  Sim.spend = function (amount, key) { G.money -= amount; G.ledger[key] += amount; };
  Sim.earn = function (amount, key) { G.money += amount; G.ledger[key] += amount; };
  Sim.unlocked = function (item) { return G.year >= item.year; };

  // ---- villages --------------------------------------------------------------
  Sim.com = function (id) { for (var i = 0; i < SK.COMMUNITIES.length; i++) if (SK.COMMUNITIES[i].id === id) return SK.COMMUNITIES[i]; return null; };
  Sim.villageFrac = function (id) { return SK.VILLAGE_FRAC[G.villages[id] || 0]; };
  Sim.bedsOf = function (id) { return Math.round(Sim.com(id).bedsMax * Sim.villageFrac(id) / 10) * 10; };
  Sim.villageCap = function () { return Math.floor(SK.interp(SK.VILLAGE_CAP, G.year)); };
  Sim.villageCost = function (id) {
    var lv = G.villages[id] || 0, c = Sim.com(id);
    if (lv >= SK.VILLAGE_FRAC.length - 1) return null;
    return Math.round(c.bedsMax * (SK.VILLAGE_FRAC[lv + 1] - SK.VILLAGE_FRAC[lv]) * 150 * (1 + lv * 0.5) / 1000) * 1000;
  };
  Sim.upgradeVillage = function (id) {
    var cost = Sim.villageCost(id);
    if (cost === null) return 'This village has reached its full size.';
    if ((G.villages[id] || 0) >= Sim.villageCap()) return 'The valley is not ready for more yet - development follows the times (next step around ' + nextCapYear() + ').';
    if (cost > G.money) return 'Not enough money.';
    Sim.spend(cost, 'invest'); G.villages[id] = (G.villages[id] || 0) + 1;
    Sim.syncVillages();
    return null;
  };
  function nextCapYear() { var cap = Sim.villageCap(); for (var i = 0; i < SK.VILLAGE_CAP.length; i++) if (SK.VILLAGE_CAP[i][1] > cap) return SK.VILLAGE_CAP[i][0]; return '–'; }
  Sim.syncVillages = function () {
    var f = {};
    SK.COMMUNITIES.forEach(function (c) { f[c.id] = Sim.villageFrac(c.id); });
    Wd.rebuildVillages(f); Wd.redrawDecals(); Wd.rebuildTrees();
  };
  Sim.dayGuests = function (id) {
    var c = Sim.com(id), d = 40 + (c.train || 0);
    if (id === 'anton') d += G.daytrip + (G.projects.parking ? 2000 : 0) + (G.projects.station ? 2500 : 0);
    if (id === 'lech' && G.projects.garage) d += 1500;
    return d;
  };
  // which communities can put their guests on a lift
  Sim.access = function () {
    var served = {}, any = false, out = {};
    G.lifts.forEach(function (l) { var nd = nodes[l.na]; if (nd && nd.hub >= 0 && l.open !== false) { served[Wd.hubs[nd.hub].com] = true; any = true; } });
    SK.COMMUNITIES.forEach(function (c) { out[c.id] = served[c.id] ? 1 : (any && G.projects.skibus ? 0.7 : 0); });
    return out;
  };
  Sim.capacity = function () {
    var acc = Sim.access(), cap = 0;
    SK.COMMUNITIES.forEach(function (c) { cap += acc[c.id] * (Sim.bedsOf(c.id) * 0.9 + Sim.dayGuests(c.id)); });
    return cap;
  };
  Sim.buyProject = function (p) {
    if (G.projects[p.id]) return 'Already built.';
    if (!Sim.unlocked(p)) return 'Not before ' + p.year + '.';
    if (p.cost > G.money) return 'Not enough money.';
    Sim.spend(p.cost, 'invest'); G.projects[p.id] = G.year;
    if (p.id === 'pedestrian' || p.id === 'tunnels') G.reputation = Math.min(100, G.reputation + 2);
    Sim.syncVillages();
    return null;
  };

  // ---- staff -------------------------------------------------------------------
  Sim.hire = function (id, n) {
    var v = (G.staff[id] || 0) + n;
    if (v < 0) return 'Nobody left to let go.';
    if (v > 60) return 'That is plenty.';
    G.staff[id] = v; return null;
  };
  Sim.staffNeed = function (m) {
    m = m || Sim.metrics();
    var v = G.season ? G.season.visitorsToday : (G.history.length ? G.history[G.history.length - 1].visitors : 0);
    return {
      mech: Math.ceil(G.lifts.length / 4),
      patrol: Math.max(0, Math.ceil(m.km / 8 + v / 3500 - 0.3)),
      groom: Math.max(0, Math.ceil(m.groomKm / (G.tech.snowcat ? 14 : 5) - 0.3)),
    };
  };
  Sim.wagesPerSeason = function () {
    var e = Sim.era(), w = 0;
    SK.STAFF.forEach(function (s) { w += (G.staff[s.id] || 0) * s.wage * e; });
    G.lifts.forEach(function (l) { w += SK.LIFT[l.type].crew * SK.CREW_LEVELS[l.crew === undefined ? 1 : l.crew].f * SK.LIFTIE_WAGE * e; });
    return w;
  };

  // ---- derived geometry ------------------------------------------------------
  // how much avalanche terrain looms above a point: march uphill, count steep open slope
  function hazardAbove(x, z) {
    var px = x, pz = z, hits = 0, path = [{ x: x, z: z }], top = 0;
    for (var k = 0; k < 13; k++) {
      var g = T.gradAt(px, pz), l = Math.hypot(g[0], g[1]);
      if (l < 0.08) break;
      px += g[0] / l * 42; pz += g[1] / l * 42;
      if (!T.inside(px, pz, 60)) break;
      path.push({ x: px, z: pz });
      if (l > 0.55 && l < 1.35 && T.forestAt(px, pz) < 0.35) { hits++; top = path.length; }
    }
    return { score: hits / 13, path: path.slice(0, Math.max(2, top)).reverse() };
  }
  Sim.derivePiste = function (p) {
    var n = p.pts.length, ys = new Float32Array(n), cum = new Float32Array(n), len = 0, i;
    for (i = 0; i < n; i++) {
      ys[i] = T.heightAt(p.pts[i].x, p.pts[i].z);
      if (i) { len += Math.hypot(p.pts[i].x - p.pts[i - 1].x, p.pts[i].z - p.pts[i - 1].z, ys[i] - ys[i - 1]); }
      cum[i] = len;
    }
    p.ys = ys; p.cum = cum; p.len = len; p.drop = ys[0] - ys[n - 1];
    var lo = Infinity, hi = -Infinity, south = 0, cnt = 0, best = { score: 0, path: null };
    for (i = 0; i < n; i++) { if (ys[i] < lo) lo = ys[i]; if (ys[i] > hi) hi = ys[i]; }
    for (i = 0; i < n; i += 4) {
      south += T.southAt(p.pts[i].x, p.pts[i].z); cnt++;
      var hz = hazardAbove(p.pts[i].x, p.pts[i].z);
      if (hz.score > best.score) best = hz;
    }
    p.low = lo; p.high = hi; p.south = cnt ? south / cnt : 0;
    p.expo = Math.min(1, best.score * 1.5); p.avPath = best.path;
    var st = SK.Build.pisteStats(p.pts);
    p.maxGrad = st.maxGrad;
    if (p.diff !== 'route') p.diff = st.diff;
    if (p.width === undefined) p.width = 44;
    return p;
  };
  Sim.deriveLift = function (l) {
    var best = { score: 0, path: null }, g = l.geom;
    g.towers.forEach(function (t) { var hz = hazardAbove(l.a.x + g.ux * t.d, l.a.z + g.uz * t.d); if (hz.score > best.score) best = hz; });
    l.expo = Math.min(1, best.score * 1.3); l.avPath = best.path;
    if (l.cond === undefined) l.cond = 100;
    if (l.rope === undefined) l.rope = l.built;
    if (l.crew === undefined) l.crew = 1;
  };

  // ------------------------------------------------------------------ network graph
  Sim.endpoints = function () {
    var out = [];
    G.lifts.forEach(function (l) { out.push({ x: l.a.x, z: l.a.z, lift: l, end: 'a' }); out.push({ x: l.b.x, z: l.b.z, lift: l, end: 'b' }); });
    G.pistes.forEach(function (p) {
      var a = p.pts[0], b = p.pts[p.pts.length - 1];
      out.push({ x: a.x, z: a.z, piste: p, end: 'a' }); out.push({ x: b.x, z: b.z, piste: p, end: 'b' });
    });
    return out;
  };

  // split pistes where another endpoint touches their interior, so junctions become real nodes
  Sim.normalizeNetwork = function () {
    for (var guard = 0; guard < 40; guard++) {
      var eps = Sim.endpoints(), did = false;
      outer:
      for (var e = 0; e < eps.length; e++) {
        var E = eps[e];
        for (var k = 0; k < G.pistes.length; k++) {
          var p = G.pistes[k];
          if (E.piste === p) continue;
          var best = -1, bd = CFG.SNAP * 0.6;
          for (var i = 0; i < p.pts.length; i++) {
            var d = Math.hypot(p.pts[i].x - E.x, p.pts[i].z - E.z);
            if (d < bd) { bd = d; best = i; }
          }
          if (best < 0) continue;
          if (p.cum[best] < CFG.SNAP * 1.3 || p.len - p.cum[best] < CFG.SNAP * 1.3) continue;
          var mk = function (pts, share) {
            return Sim.derivePiste({ id: G.nextId++, name: p.name, pts: pts, width: p.width, diff: p.diff, snowmaking: p.snowmaking, barrier: p.barrier,
              cost: p.cost * share, built: p.built, open: true });
          };
          G.pistes.splice(k, 1, mk(p.pts.slice(0, best + 1), best / p.pts.length), mk(p.pts.slice(best), 1 - best / p.pts.length));
          did = true;
          break outer;
        }
      }
      if (!did) break;
    }
  };

  Sim.rebuildGraph = function () {
    var eps = Sim.endpoints(), n = eps.length, parent = [], i, j;
    var H = Wd.hubs.length;
    for (i = 0; i < n + H; i++) parent.push(i);
    function find(a) { while (parent[a] !== a) { parent[a] = parent[parent[a]]; a = parent[a]; } return a; }
    function uni(a, b) { a = find(a); b = find(b); if (a !== b) parent[Math.max(a, b)] = Math.min(a, b); }
    for (i = 0; i < n; i++) {
      for (var h = 0; h < H; h++) if (Math.hypot(eps[i].x - Wd.hubs[h].x, eps[i].z - Wd.hubs[h].z) < CFG.HUB_RADIUS) uni(i, n + h);
      for (j = i + 1; j < n; j++) if (Math.hypot(eps[i].x - eps[j].x, eps[i].z - eps[j].z) < CFG.SNAP) uni(i, j);
    }
    nodes.length = 0;
    var map = {};
    function nodeOf(idx, x, z) {
      var r = find(idx);
      if (map[r] === undefined) {
        map[r] = nodes.length;
        nodes.push({ id: nodes.length, x: x, z: z, hub: -1, lifts: [], down: [], pistes: [], into: 0, home: Infinity, next: null });
      }
      return nodes[map[r]];
    }
    for (h = 0; h < H; h++) { var hn = nodeOf(n + h, Wd.hubs[h].x, Wd.hubs[h].z); if (hn.hub < 0) hn.hub = h; }
    for (i = 0; i < n; i++) {
      var E = eps[i], nd = nodeOf(i, E.x, E.z);
      if (E.lift) { if (E.end === 'a') { E.lift.na = nd.id; nd.lifts.push(E.lift); } else { E.lift.nb = nd.id; nd.down.push(E.lift); nd.into++; } }
      else { if (E.end === 'a') { E.piste.na = nd.id; nd.pistes.push(E.piste); } else { E.piste.nb = nd.id; nd.into++; } }
    }
    // pistes inside a closure zone
    G.pistes.forEach(function (p) {
      p.zoned = false;
      (G.zones || []).forEach(function (zn) { for (var q = 0; q < p.pts.length; q += 2) if (Math.hypot(p.pts[q].x - zn.x, p.pts[q].z - zn.z) < zn.r) { p.zoned = true; break; } });
    });
    Sim.findHazards();
    Sim.route();
  };

  // off-piste avalanche slopes freeriders can reach from your lifts
  Sim.findHazards = function () {
    var out = [];
    G.lifts.forEach(function (l) {
      var best = null;
      for (var a = 0; a < 16; a++) for (var r = 280; r <= 760; r += 160) {
        var x = l.b.x + Math.cos(a / 16 * 6.283) * r, z = l.b.z + Math.sin(a / 16 * 6.283) * r;
        if (!T.inside(x, z, 80)) continue;
        var s = T.slopeAt(x, z), y = T.heightAt(x, z);
        if (s < 0.62 || s > 1.25 || y > l.b.y - 30 || T.forestAt(x, z) > 0.3) continue;
        if (!best || s > best.s) best = { x: x, z: z, s: s, name: l.name };
      }
      if (best && !out.some(function (o) { return Math.hypot(o.x - best.x, o.z - best.z) < 420; })) out.push(best);
    });
    out.sort(function (a, b) { return b.s - a.s; });
    out = out.slice(0, T.MAXZONES);                 // the ten worst: one for every closure zone you may mark
    out.forEach(function (hz) { hz.zoned = (G.zones || []).some(function (zn) { return Math.hypot(zn.x - hz.x, zn.z - hz.z) < zn.r; }); });
    Sim.hazards = out;
  };

  // shortest way home (to a village) from every node, over open pistes and lifts
  Sim.route = function () {
    var i;
    for (i = 0; i < nodes.length; i++) { nodes[i].home = nodes[i].hub >= 0 ? 0 : Infinity; nodes[i].next = null; }
    for (var pass = 0; pass < nodes.length + 2; pass++) {
      var changed = false;
      G.pistes.forEach(function (p) {
        if (!p.open) return;
        var c = nodes[p.nb].home + p.len / 120 + (p.diff === 'black' ? 12 : p.diff === 'route' ? 60 : 0);
        if (c < nodes[p.na].home - 1e-6) { nodes[p.na].home = c; nodes[p.na].next = { kind: 'piste', ref: p }; changed = true; }
      });
      G.lifts.forEach(function (l) {
        if (!l.open) return;
        var ty = SK.LIFT[l.type];
        var c = nodes[l.nb].home + l.geom.len / ty.speed + 25;
        if (c < nodes[l.na].home - 1e-6) { nodes[l.na].home = c; nodes[l.na].next = { kind: 'lift', ref: l }; changed = true; }
        if (ty.style !== 'surface') {
          c = nodes[l.na].home + l.geom.len / ty.speed + 40;
          if (c < nodes[l.nb].home - 1e-6) { nodes[l.nb].home = c; nodes[l.nb].next = { kind: 'down', ref: l }; changed = true; }
        }
      });
      if (!changed) break;
    }
    G.lifts.forEach(function (l) {
      l.appeal = [0.03, 0.03, 0.03];
      if (!l.open) return;
      var nd = nodes[l.nb];
      for (var s = 0; s < 3; s++) {
        var best = 0;
        nd.pistes.forEach(function (p) { if (p.open) best = Math.max(best, PREF[s][p.diff]); });
        nd.lifts.forEach(function (l2) { if (l2.open && l2 !== l) best = Math.max(best, 0.45); });
        l.appeal[s] = Math.max(0.03, best);
      }
    });
    G.lifts.forEach(function (l) {
      if (!l.open) return;
      nodes[l.nb].lifts.forEach(function (l2) { if (l2.open) for (var s = 0; s < 3; s++) l.appeal[s] = Math.max(l.appeal[s], l2.appeal[s] * 0.7); });
    });
  };

  Sim.networkIssues = function () {
    var issues = [], hubLift = false;
    G.lifts.forEach(function (l) {
      if (nodes[l.na].hub >= 0) hubLift = true;
      var top = nodes[l.nb];
      if (!top.pistes.length && !top.lifts.length && top.hub < 0) issues.push({ t: l.name + ': no piste starts at the top station.', x: l.b.x, z: l.b.z });
      var bot = nodes[l.na];
      if (bot.hub < 0 && bot.into === 0) issues.push({ t: l.name + ': nobody can reach the bottom station.', x: l.a.x, z: l.a.z });
      if (l.damaged) issues.push({ t: l.name + ' is damaged and needs repair.', x: l.a.x, z: l.a.z });
    });
    G.pistes.forEach(function (p) {
      var a = nodes[p.na], b = nodes[p.nb];
      if (a.hub < 0 && a.into === 0) issues.push({ t: 'Piste ' + p.name + ' starts where no lift or piste arrives.', x: p.pts[0].x, z: p.pts[0].z });
      if (b.hub < 0 && !b.lifts.length && !b.pistes.length) issues.push({ t: 'Piste ' + p.name + ' ends in the wild - connect it to a lift, piste or village.', x: p.pts[p.pts.length - 1].x, z: p.pts[p.pts.length - 1].z });
      if (p.damaged) issues.push({ t: 'Piste ' + p.name + ' was torn up by an avalanche and needs repair.', x: p.pts[0].x, z: p.pts[0].z });
    });
    if (G.lifts.length && !hubLift) issues.unshift({ t: 'No lift starts in a village (yellow circles). Guests cannot get onto the mountain.' });
    return issues;
  };

  // ------------------------------------------------------------------ resort metrics
  Sim.metrics = function () {
    var km = 0, openKm = 0, byDiff = { blue: 0, red: 0, black: 0, route: 0 }, lo = Infinity, hi = -Infinity, pph = 0, comfortW = 0, top = 0, smKm = 0, eff = 0, groomKm = 0;
    G.pistes.forEach(function (p) {
      var k = p.len / 1000, w = p.diff === 'route' ? 0.5 : 1;
      km += k; eff += k * w; if (p.open) openKm += k; byDiff[p.diff] += k;
      if (p.diff !== 'route') groomKm += k;
      if (p.snowmaking) smKm += k;
      lo = Math.min(lo, p.low); hi = Math.max(hi, p.high);
    });
    var best = 0;
    SK.LIFTS.forEach(function (t) { if (t.year <= G.year) best = Math.max(best, t.comfort); });
    G.lifts.forEach(function (l) {
      var ty = SK.LIFT[l.type];
      pph += ty.pph; comfortW += ty.pph * ty.comfort; top = Math.max(top, l.b.y);
      lo = Math.min(lo, l.a.y); hi = Math.max(hi, l.b.y);
    });
    var liftScore = pph ? Math.min(1, (comfortW / pph) / best) : 0;
    var variety = 0, gk = byDiff.blue + byDiff.red + byDiff.black;
    if (gk > 0) {
      var sb = byDiff.blue / gk, sr = byDiff.red / gk, sk = byDiff.black / gk;
      variety = Math.max(0, 1 - 0.5 * (Math.abs(sb - 0.38) + Math.abs(sr - 0.42) + Math.abs(sk - 0.20)) / 0.62);
      if (byDiff.route > 0.8) variety = Math.min(1, variety + 0.08);
    }
    var size = 1 - Math.exp(-eff / 70), vertical = km > 0 ? Math.min(1, (hi - lo) / 1500) : 0;
    var base = 0.36 * size + 0.10 * vertical + 0.13 * liftScore + 0.09 * variety + 0.32 * (G.reputation / 100);
    var quality = km > 0 && pph > 0 ? base * (0.24 + 0.76 * Math.sqrt(size)) : 0;
    var openFrac = km > 0 ? openKm / km : 0;
    return { km: km, openKm: openKm, openFrac: openFrac, byDiff: byDiff, pph: pph, liftScore: liftScore, variety: variety, size: size,
      vertical: vertical, quality: quality, top: top, smKm: smKm, lo: lo, hi: hi, groomKm: groomKm };
  };
  Sim.fairPrice = function (m) { m = m || Sim.metrics(); return 5 + 62 * m.quality * (0.6 + 0.4 * m.openFrac); };
  Sim.market = function (m) {
    m = m || Sim.metrics();
    var fair = Sim.fairPrice(m);
    var priceF = Math.min(1.4, Math.max(0.12, Math.pow(fair / Math.max(1, G.price), 1.5)));
    var q = m.quality * (G.phase === 'winter' ? (0.35 + 0.65 * m.openFrac) : 1);
    var mine = Math.pow(q, 1.15) * (0.35 + 0.65 * G.awareness) * priceF;
    var rows = [], total = mine;
    SK.RIVALS.forEach(function (r) { var a = SK.interp(r.curve, G.year) * (G.rivals[r.id] || 1); rows.push({ id: r.id, name: r.name, a: a }); total += a; });
    var ev = SK.EVENTS[G.year], mult = ev && ev.market ? ev.market : 1;
    var size = SK.interp(SK.MARKET, G.year) * mult;
    rows.forEach(function (r) { r.share = total > 0 ? r.a / total : 0; });
    return { size: size, mine: mine, share: total > 0 ? mine / total : 0, rivals: rows, fair: fair, priceF: priceF };
  };

  // ------------------------------------------------------------------ construction API
  Sim.checkBudget = function (cost, weeks) {
    if (G.phase !== 'summer') return 'Construction happens in summer.';
    if (cost > G.money) return 'Not enough money (' + SK.fmtMoney(cost) + ' needed).';
    if (weeks > G.crewLeft) return 'Not enough construction time left this summer (' + weeks + ' crew-weeks needed).';
    return null;
  };
  function nearestPlace(x, z) {
    var best = null, bd = Infinity;
    SK.PLACES.forEach(function (p) { var d = Math.hypot(p.x - x, p.z - z); if (d < bd) { bd = d; best = p; } });
    return best.name;
  }
  function uniqueName(base, list) {
    var name = base, k = 2;
    while (list.some(function (o) { return o.name === name; })) name = base + ' ' + (k++);
    return name;
  }
  function refreshWorld() { Wd.redrawPistes(); Wd.rebuildTrees(); }
  Sim.addLift = function (type, a, b, geom, cost, weeks) {
    var ty = SK.LIFT[type], short = { surface: 'Lift', chair: 'Chair', gondola: 'Bahn', tram: 'Bahn', pod: 'Line' }[ty.style];
    var l = { id: G.nextId++, type: type, name: uniqueName(nearestPlace(b.x, b.z) + ' ' + short, G.lifts), a: a, b: b, geom: geom,
      built: G.year, rope: G.year, cond: 100, crew: 1, cost: cost, queue: [], loadAcc: 0, running: false, open: true, carried: 0 };
    Sim.deriveLift(l);
    G.lifts.push(l);
    Sim.spend(cost, 'construction'); G.crewLeft -= weeks;
    Sim.normalizeNetwork(); Sim.rebuildGraph();
    Wd.addLift(l); refreshWorld();
    return l;
  };
  Sim.addPiste = function (pts, cost, weeks, route) {
    var p = { id: G.nextId++, name: PISTE_NAMES[G.pisteNameIdx++ % PISTE_NAMES.length], pts: pts, width: 44, snowmaking: false, cost: cost, built: G.year, open: true };
    if (route) p.diff = 'route';
    Sim.derivePiste(p);
    G.pistes.push(p);
    Sim.spend(cost, 'construction'); G.crewLeft -= weeks;
    Sim.normalizeNetwork(); Sim.rebuildGraph();
    refreshWorld();
    return p;
  };
  Sim.addHut = function (pt, cost, weeks) {
    G.huts.push({ id: G.nextId++, x: pt.x, y: pt.y, z: pt.z, built: G.year });
    Sim.spend(cost, 'construction'); G.crewLeft -= weeks;
    Wd.rebuildProps(); Wd.rebuildTrees();
  };
  Sim.addZone = function (pt, r) {
    if (G.zones.length >= T.MAXZONES) return 'Ten closure zones is the limit.';
    G.zones.push({ id: G.nextId++, x: pt.x, z: pt.z, r: r });
    Sim.rebuildGraph(); Wd.rebuildProps();
    return null;
  };
  Sim.remove = function (kind, obj) {
    var refund = 0;
    if (kind === 'lift') { G.lifts.splice(G.lifts.indexOf(obj), 1); Wd.removeLift(obj.id); refund = obj.cost * 0.15; }
    else if (kind === 'piste') { G.pistes.splice(G.pistes.indexOf(obj), 1); }
    else if (kind === 'zone') { G.zones.splice(G.zones.indexOf(obj), 1); }
    else { G.huts.splice(G.huts.indexOf(obj), 1); }
    G.money += refund;
    Sim.rebuildGraph(); refreshWorld();
    return refund;
  };
  Sim.upgradeCost = function (lift, type) {
    var ty = SK.LIFT[type], g = SK.Build.liftGeom(ty, lift.a, lift.b);
    if (g.error) return { error: g.error };
    return { cost: Math.round(g.cost - lift.cost * 0.25), weeks: Math.max(2, g.weeks - 2), geom: g };
  };
  Sim.upgradeLift = function (lift, type) {
    var u = Sim.upgradeCost(lift, type);
    if (u.error) return u.error;
    var err = Sim.checkBudget(u.cost, u.weeks);
    if (err) return err;
    lift.type = type; lift.geom = u.geom; lift.built = G.year; lift.rope = G.year; lift.cond = 100; lift.damaged = false; lift.cost = u.geom.cost;
    Sim.deriveLift(lift);
    Sim.spend(u.cost, 'construction'); G.crewLeft -= u.weeks;
    Sim.rebuildGraph(); Wd.addLift(lift); Wd.rebuildTrees();
    return null;
  };
  Sim.snowmakingCost = function (p) { return Math.round(p.len * (G.tech.snow2 ? 190 : 240)); };
  Sim.toggleSnowmaking = function (p) {
    if (!G.tech.snow1) return 'Buy the Snow cannons technology first.';
    if (p.diff === 'route') return 'Ski routes are left as nature made them.';
    if (p.snowmaking) { p.snowmaking = false; Wd.redrawPistes(); return null; }
    var c = Sim.snowmakingCost(p), err = Sim.checkBudget(c, 1);
    if (err) return err;
    p.snowmaking = true; Sim.spend(c, 'construction'); G.crewLeft -= 1;
    Wd.redrawPistes();
    return null;
  };
  Sim.barrierCost = function (p) { return Math.round((60000 + 520000 * p.expo) * (0.4 + 0.6 * Sim.era()) / 1000) * 1000; };
  Sim.buildBarrier = function (p) {
    if (p.barrier) return 'Already protected.';
    var c = Sim.barrierCost(p), err = Sim.checkBudget(c, 3);
    if (err) return err;
    p.barrier = true; Sim.spend(c, 'construction'); G.crewLeft -= 3;
    Wd.rebuildProps();
    return null;
  };
  // ---- maintenance ----
  Sim.condCap = function (l) { return Math.max(40, 100 - Math.max(0, G.year - (l.rope || l.built) - 20) * 4); };
  Sim.overhaulCost = function (l) { return Math.round(l.cost * (0.012 + 0.035 * (1 - l.cond / 100)) / 100) * 100; };
  Sim.overhaul = function (l) {
    var c = Sim.overhaulCost(l), err = Sim.checkBudget(c, 0);
    if (err) return err;
    Sim.spend(c, 'repairs'); l.cond = Sim.condCap(l);
    return null;
  };
  Sim.ropeCost = function (l) { return Math.round(l.cost * 0.12 / 1000) * 1000; };
  Sim.replaceRope = function (l) {
    var c = Sim.ropeCost(l), err = Sim.checkBudget(c, 1);
    if (err) return err;
    Sim.spend(c, 'repairs'); G.crewLeft -= 1; l.rope = G.year; l.cond = 100;
    return null;
  };
  Sim.repairCost = function (kind, o) { return Math.round(o.cost * (kind === 'lift' ? 0.10 : 0.14) / 100) * 100 + 2000; };
  Sim.repair = function (kind, o) {
    var c = Sim.repairCost(kind, o);
    if (G.phase === 'summer') { var err = Sim.checkBudget(c, kind === 'lift' ? 3 : 1); if (err) return err; G.crewLeft -= kind === 'lift' ? 3 : 1; }
    else { c = Math.round(c * 1.6); if (c > G.money) return 'Not enough money for an emergency repair (' + SK.fmtMoney(c) + ').'; o.repairDays = kind === 'lift' ? 12 : 5; }
    Sim.spend(c, 'repairs'); o.damaged = false;
    if (G.phase === 'summer') Wd.redrawDecals();
    return null;
  };
  Sim.setClosed = function (o, closed) { o.closed = closed; if (G.phase === 'winter') applyOpen(G.season, true); };

  Sim.buyTech = function (t) {
    if (G.tech[t.id]) return 'Already owned.';
    if (!Sim.unlocked(t)) return 'Not invented yet.';
    if (t.cost > G.money) return 'Not enough money.';
    G.tech[t.id] = G.year; Sim.spend(t.cost, 'invest');
    if (t.id === 'crew2') G.crewLeft += 12; if (t.id === 'heli') G.crewLeft += 14; if (t.id === 'prefab') G.crewLeft += 16;
    return null;
  };
  Sim.campaignCost = function (c) {
    var k = Math.max(0.25, Math.min(1, SK.interp(SK.MARKET, G.year) / 50000));
    return Math.round(c.cost * (c.scale + (1 - c.scale) * k) / 1000) * 1000;
  };
  Sim.runCampaign = function (c) {
    if (G.campaignsUsed[c.id]) return 'Already run this year.';
    if (c.needs === 'black' && !G.pistes.some(function (p) { return p.diff === 'black' && p.len > 600; })) return 'Needs a black piste of at least 600 m.';
    var cost = Sim.campaignCost(c);
    if (cost > G.money) return 'Not enough money.';
    Sim.spend(cost, 'marketing'); G.campaignsUsed[c.id] = true;
    G.awareness = Math.min(1, G.awareness + c.aw * (1 - G.awareness * 0.55));
    if (c.rep) G.reputation = Math.min(100, G.reputation + c.rep);
    return null;
  };
  Sim.takeLoan = function (amt) {
    amt = Math.min(amt, Sim.maxLoan() - G.loan);
    if (amt <= 0) return 'The bank will not lend more.';
    G.loan += amt; G.money += amt; return null;
  };
  Sim.repayLoan = function (amt) {
    amt = Math.min(amt, G.loan, Math.max(0, G.money));
    if (amt <= 0) return 'Nothing to repay.';
    G.loan -= amt; G.money -= amt; return null;
  };

  // ------------------------------------------------------------------ snow & weather
  Sim.dateOf = function (day) {
    var m = [['Dec', 31], ['Jan', 31], ['Feb', 28], ['Mar', 31]], d = Math.min(Math.max(0, day), CFG.SEASON_DAYS - 1);
    for (var i = 0; i < m.length; i++) { if (d < m[i][1]) return (d + 1) + ' ' + m[i][0]; d -= m[i][1]; }
    return '31 Mar';
  };
  // the whole winter's weather is rolled at opening: spells of sun, cloud, snow and storm, each with its own temperature
  function genWeather(r, year) {
    var ev = SK.EVENTS[year] || {}, plan = [], warming = SK.interp(SK.WARMING, year);
    var tOff = (r() + r() + r() - 1.5) * 1.7 + (ev.warm || 0), wet = 0.7 + r() * 0.65;
    var w = 'cloud', left = 0, anom = 0, foehn = false;
    for (var d = -25; d < CFG.SEASON_DAYS; d++) {
      if (--left <= 0) {
        var x = r();
        w = x < 0.42 ? 'sun' : x < 0.69 ? 'cloud' : x < 0.92 ? 'snow' : 'storm';
        left = w === 'storm' ? 1 + (r() * 2 | 0) : 2 + (r() * 5 | 0);
        anom = (r() - 0.5) * 5 - (w === 'snow' ? 1.2 : 0);
        foehn = w === 'sun' && r() < 0.14;
        if (foehn) anom += 5;
      }
      var precip = w === 'snow' ? (5 + r() * 12) * wet : w === 'storm' ? (14 + r() * 20) * wet : (w === 'cloud' && r() < 0.22 ? 2.5 * wet : 0);
      var wind = w === 'sun' ? 5 + r() * 25 : w === 'cloud' ? 10 + r() * 35 : w === 'snow' ? 20 + r() * 45 : 65 + r() * 50;
      if (foehn) wind = 50 + r() * 45;
      plan.push({ w: w, fl: SK.interp(FLCLIM, d) + 150 * (warming + tOff + anom), precip: precip, wind: wind, foehn: foehn });
    }
    return { plan: plan, tOff: tOff, wet: wet };
  }
  function snowStep(S, P) {
    var b = S.bands, fresh = 0;
    for (var i = 0; i < BANDS; i++) {
      var a = BAND0 + i * 100, Tc = (P.fl - a) / 150, d = b[i];
      if (P.precip > 0) {
        if (a > P.fl - 250) { var add = P.precip * (1 + Math.max(0, a - 1300) / 1700 * 0.9); d += add * 0.42; if (a === 2200) fresh = add; }   // 1 mm of water = 1 cm of powder, which settles to less than half
        else d -= P.precip * 0.5;
      }
      if (Tc > 0) d -= Tc * (P.w === 'sun' ? 1.5 : 0.9) * (S.day > 90 ? 1.3 : 1);
      d *= 0.988;
      b[i] = d > 0 ? d : 0;
    }
    return fresh;
  }
  Sim.depthAt = function (alt) {
    var S = G.season; if (!S) return 0;
    var u = (alt - BAND0) / 100, i = Math.max(0, Math.min(BANDS - 2, Math.floor(u))), f = Math.max(0, Math.min(1, u - i));
    return S.bands[i] + (S.bands[i + 1] - S.bands[i]) * f;
  };
  function snowlineOf(S) {
    for (var i = 0; i < BANDS; i++) if (S.bands[i] >= 6) {
      if (i === 0) return BAND0 - 100;
      return BAND0 + (i - 1) * 100 + 100 * (6 - S.bands[i - 1]) / Math.max(0.01, S.bands[i] - S.bands[i - 1]);
    }
    return 3200;
  }
  // groomed pistes keep a compacted base that melts more slowly than the snow beside them
  function packStep() {
    G.pistes.forEach(function (p) {
      var nat = Sim.depthAt(p.low - 170 * (p.south || 0)), prev = p.nat0 === undefined ? nat : p.nat0;
      p.pack = p.diff === 'route' ? nat : Math.max(nat, (p.pack || 0) - Math.max(0, prev - nat) * 0.55);
      p.nat0 = nat;
    });
  }
  Sim.pisteSnow = function (p) { return (p.pack || 0) + (p.base || 0); };

  // what is open right now: snow, wind, breakdowns, damage, manual closures, avalanche closures
  function applyOpen(S, quiet) {
    var changed = false, P = S.today;
    G.pistes.forEach(function (p) {
      var need = p.diff === 'route' ? 45 : 22, sn = Sim.pisteSnow(p);
      if (sn >= need) p.snowOK = true; else if (sn < need * 0.55) p.snowOK = false;      // once open, a piste runs on a thin base for a while
      var open = p.snowOK && !p.closed && !p.damaged && !p.zoned && !p.avClosed && !(p.blocked > 0) && !(p.repairDays > 0);
      if (open !== p.open) { p.open = open; changed = true; }
    });
    G.lifts.forEach(function (l) {
      var ty = SK.LIFT[l.type];
      var gust = P.wind * Math.min(1, Math.max(0.45, 0.45 + (l.b.y - 1400) / 1400 * 0.55));
      l.windHold = gust > ty.windMax;
      var open = !l.windHold && !(l.broken > 0) && !l.damaged && !l.closed && !(l.repairDays > 0);
      if (open !== l.open) { l.open = open; l.running = open; changed = true; }
    });
    if (changed) Sim.route();
    return changed;
  }

  Sim.openSeason = function () {
    if (G.phase !== 'summer') return;
    var r = SK.rng(G.seed + G.year * 7919), wx = genWeather(r, G.year), i;
    var S = G.season = {
      day: -1, r: r, plan: wx.plan, tOff: wx.tOff, wet: wx.wet, bands: new Float32Array(BANDS), fresh3: [0, 0, 0], danger: 1,
      weather: 'sun', powder: false, today: wx.plan[25], snowline: 2000,
      visitorsToday: 0, sumVisitors: 0, sumOpen: 0, ratings: 0, ratingSum: 0, dayRatingSum: 0, dayRatings: 0,
      days: [], ledger0: JSON.parse(JSON.stringify(G.ledger)), stranded: 0, peak: 0, shareSum: 0, firstCount: 0,
      snowfall: 0, breakdowns: 0, avalanches: 0, accidents: 0, windDays: 0, flexenDays: 0, log: [],
    };
    for (i = 0; i < BANDS; i++) S.bands[i] = Math.max(0, (BAND0 + i * 100 - 2250) * 0.04);
    G.ledger = newLedger();
    G.phase = 'winter';
    G.debris = [];
    G.lifts.forEach(function (l) { l.queue = []; l.loadAcc = 0; l.open = true; l.running = true; l.carried = 0; l.broken = 0; l.qSum = 0; l.repairDays = 0; l.downDays = 0; });
    G.pistes.forEach(function (p) { p.open = true; p.base = 0; p.pack = 0; p.nat0 = undefined; p.snowOK = false; p.blocked = 0; p.avClosed = false; p.repairDays = 0; });
    // November: the snowpack builds and the cannons run before the first guest arrives
    for (i = 0; i < 25; i++) { S.day = i - 25; snowStep(S, wx.plan[i]); packStep(); snowmaking(S, wx.plan[i], true); }
    S.day = -1;
    agents.length = 0;
    Sim.rebuildGraph();
    var m = Sim.metrics(), mk = Sim.market(m);
    var est = Math.min(mk.size * mk.share * 1.7, Sim.capacity());
    S.scale = Math.max(3, Math.ceil(est / (CFG.MAX_AGENTS * 0.85)));
    S.dayAcc = CFG.DAY_SEC;
    Sim.update(0.0001);
  };

  function snowmaking(S, P, free) {
    if (!G.tech.snow1) return 0;
    var km = 0;
    G.pistes.forEach(function (p) {
      if (!p.snowmaking) return;
      var Tc = (P.fl - p.low) / 150, add = 0;
      if (G.tech.snow3) add = Tc <= -2 ? 11 : (Tc <= 3 ? 3 : 0);
      else if (G.tech.snow2) add = Tc <= -2 ? 9 : 0;
      else add = Tc <= -4 ? 5 : 0;
      if ((p.base || 0) >= 70) add = 0;
      if (Tc > 0) p.base = Math.max(0, (p.base || 0) - Tc * 0.5);
      if (add > 0) { p.base = (p.base || 0) + add; km += p.len / 1000 * (add / 9); }
    });
    if (km && !free) Sim.spend(km * 300 * (G.tech.snow2 ? 0.7 : 1) * (0.5 + 0.5 * Sim.era()), 'snowmaking');
    else if (km) Sim.spend(km * 150 * (0.5 + 0.5 * Sim.era()), 'snowmaking');
    return km;
  }
  function note(S, text, kind, x, z) {
    S.log.push({ d: S.day, t: text, k: kind, x: x, z: z });
    SK.UI.toast(text, kind, x, z);
  }

  // ---- avalanches --------------------------------------------------------------
  function avalanches(S, r, P) {
    var lvl = S.danger, era = Sim.era(), redraw = false;
    var PP = [0, 0, 0.002, 0.012, 0.04, 0.12], PL = [0, 0, 0.0004, 0.003, 0.012, 0.05];
    var blasts = G.tech.ava2 ? 999 : (G.tech.ava1 ? (G.staff.patrol || 0) * 3 : 0);
    var list = G.pistes.filter(function (p) { return p.expo > 0.12; }).sort(function (a, b) { return b.expo - a.expo; });
    list.forEach(function (p) {
      p.avClosed = false;
      if (lvl < 3) return;
      var expo = p.expo * (p.barrier ? 0.12 : 1), secured = false;
      if (blasts > 0 && expo > 0.05) { blasts--; secured = true; if (!G.tech.ava2) Sim.spend(600 * era, 'ops'); }
      if (!secured && G.policy.avClose && lvl >= G.policy.avClose) p.avClosed = true;
      if (p.blocked > 0 || p.damaged) return;
      if (r() < expo * PP[lvl] * (secured ? 0.04 : 1)) {
        var wasOpen = p.open && !p.avClosed && S.visitorsToday > 0;
        S.avalanches++;
        p.blocked = Math.max(2, Math.round(3 + r() * 4 - Math.min(3, (G.staff.groom || 0) * 0.5)));
        if (lvl >= 4 && r() < (lvl === 5 ? 0.6 : 0.3)) p.damaged = true;
        if (p.avPath) { G.debris.push({ pts: p.avPath, w: 46 + p.expo * 60 }); redraw = true; }
        if (wasOpen) {
          var hit = Math.round((3 + lvl + (G.staff.patrol ? 0 : 3)) / (1 + S.accidents * 0.3) * 10) / 10;      // the first accident shocks most
          G.reputation = Math.max(0, G.reputation - hit);
          Sim.spend(Math.round(40000 * era * (1 + r() * 3)), 'damages');
          S.accidents++;
          note(S, 'Avalanche on the open piste ' + p.name + '! Guests were caught. Reputation −' + hit + '.', 'warn', p.pts[0].x, p.pts[0].z);
        } else note(S, 'An avalanche buried the closed piste ' + p.name + '. Nobody was hurt' + (p.damaged ? ', but the piste is torn up.' : '.'), '', p.pts[0].x, p.pts[0].z);
      }
    });
    if (lvl >= 3 && !G.tech.ava2) {
      G.lifts.forEach(function (l) {
        if (l.damaged || l.expo < 0.15) return;
        if (r() < l.expo * PL[lvl] * (G.tech.ava1 && G.staff.patrol ? 0.4 : 1)) {
          l.damaged = true; S.avalanches++;
          if (l.avPath) { G.debris.push({ pts: l.avPath, w: 60 }); redraw = true; }
          note(S, 'An avalanche has taken out a tower of ' + l.name + '. The lift is down until it is repaired.', 'warn', l.a.x, l.a.z);
        }
      });
      (Sim.hazards || []).forEach(function (hz) {
        if (hz.zoned) return;
        if (r() < 0.012 * (lvl - 2) * (G.staff.patrol ? 0.6 : 1.3)) {
          var hit = (G.staff.patrol ? 1.5 : 3) / (1 + S.accidents * 0.3);
          G.reputation = Math.max(0, G.reputation - hit); S.accidents++;
          Sim.spend(Math.round(8000 * era), 'damages');
          note(S, 'Freeriders set off a slab below ' + hz.name + '. A closure zone there would keep them out.', 'warn', hz.x, hz.z);
        }
      });
    }
    if (redraw) Wd.redrawDecals();
  }

  function dayTick() {
    var S = G.season, r = S.r, era = Sim.era();
    S.day++;
    if (S.day >= CFG.SEASON_DAYS) { Sim.endSeason(); return; }
    var P = S.today = S.plan[S.day + 25], prev = S.weather;
    S.weather = P.w;
    // snow
    var fresh = snowStep(S, P);
    S.snowfall += fresh;
    S.fresh3.shift(); S.fresh3.push(fresh);
    S.powder = (prev === 'snow' || prev === 'storm') && P.w === 'sun';
    packStep();
    var smKm = snowmaking(S, P, false);
    S.snowline = snowlineOf(S);
    // avalanche danger 1..5
    var prevFl = S.plan[S.day + 24].fl, new3 = S.fresh3[0] + S.fresh3[1] + S.fresh3[2];
    var score = new3 / 32 + Math.max(0, P.wind - 40) / 55 + (P.fl - prevFl > 350 || (P.precip > 0 && P.fl > 2200) ? 0.8 : 0) + (r() - 0.5) * 0.5;
    S.danger = Math.max(1, Math.min(5, 1 + Math.round(score)));
    // lifts: wear, mechanics, breakdowns
    var pool = (G.staff.mech || 0) * 0.66, list = G.lifts.slice().sort(function (a, b) { return a.cond - b.cond; });
    G.lifts.forEach(function (l) {
      var ty = SK.LIFT[l.type], age = G.year - l.built;
      if (l.repairDays > 0) l.repairDays--;
      if (l.broken > 0) { l.broken--; l.downDays++; return; }
      if (l.damaged || l.closed) return;
      l.cond = Math.max(0, l.cond - 0.16 * SK.CREW_LEVELS[l.crew].wear * (1 + Math.max(0, age - 15) * 0.03) * (P.w === 'storm' ? 1.5 : 1));
      var pb = l.cond >= 85 ? 0.0008 : Math.pow((85 - l.cond) / 85, 2) * 0.12;
      if (r() < pb) {
        l.broken = Math.max(1, Math.ceil((2 + r() * 4) / (1 + (G.staff.mech || 0) * 0.35)));
        l.cond = Math.min(Sim.condCap(l), l.cond + 10);
        Sim.spend(l.cost * 0.004 + 1500 * era, 'repairs');
        S.breakdowns++;
        note(S, l.name + ' has broken down (' + ['a derailed rope', 'a seized sheave', 'a gearbox fault', 'a grip failure', 'an electrical fault'][(r() * 5) | 0] + '). Back in ' + l.broken + ' day' + (l.broken > 1 ? 's' : '') + '.', 'warn', l.a.x, l.a.z);
      }
    });
    list.forEach(function (l) { if (pool <= 0) return; var cap = Sim.condCap(l), add = Math.min(pool, 0.5, cap - l.cond); if (add > 0) { l.cond += add; pool -= add; } });
    G.pistes.forEach(function (p) { if (p.blocked > 0) p.blocked--; if (p.repairDays > 0) p.repairDays--; });
    avalanches(S, r, P);
    applyOpen(S);
    if (G.lifts.some(function (l) { return l.windHold; })) S.windDays++;
    G.lifts.forEach(function (l) { l.qSum += Sim.queueTime(l); });
    // demand
    var m = Sim.metrics(), mk = Sim.market(m), d = S.day;
    var dayF = (d % 7 >= 5 ? 1.22 : 0.93);
    if (d < 12) dayF *= 0.55 + d * 0.03; else if (d >= 22 && d <= 37) dayF *= 1.35; else if (d >= 62 && d <= 90) dayF *= 1.22; else if (d > 106) dayF *= 0.7;
    var wF = P.w === 'sun' ? 1.1 : P.w === 'cloud' ? 1 : P.w === 'snow' ? 0.85 : 0.5;
    if (S.powder) wF = 1.28;
    var acc = Sim.access(), cap = 0, flexenShut = S.danger >= 4 && !G.projects.galleries;
    S.hubW = [];
    var comCap = {};
    SK.COMMUNITIES.forEach(function (c) {
      var k = acc[c.id] * (Sim.bedsOf(c.id) * 0.9 + Sim.dayGuests(c.id)) * (c.flexen && flexenShut ? 0.5 : 1);
      comCap[c.id] = k; cap += k;
    });
    if (flexenShut && (acc.lech || acc.zuers || acc.warth)) { S.flexenDays++; if (S.flexenDays === 1) note(S, 'Avalanche danger shuts the Flexen road. Half the guests of Zürs, Lech and Warth cannot get in.', 'warn'); }
    var v = m.openKm > 0 && cap > 0 ? Math.min(mk.size * mk.share * dayF * wF, cap) : 0;
    S.visitorsToday = Math.round(v);
    S.sumVisitors += S.visitorsToday; S.sumOpen += m.openFrac; S.peak = Math.max(S.peak, S.visitorsToday);
    S.shareSum += mk.share;
    var first = true;
    mk.rivals.forEach(function (rv) { if (rv.id !== 'rest' && rv.a > mk.mine) first = false; });
    if (first) S.firstCount++;
    S.comCap = comCap;
    // money
    var tickets = S.visitorsToday * G.price * (G.tech.dynprice ? 1.09 : 1);
    Sim.earn(tickets, 'tickets');
    if (G.huts.length) Sim.earn(Math.min(S.visitorsToday, G.huts.length * 700) * 3.4, 'huts');
    var ops = 60 + tickets * 0.16;
    G.lifts.forEach(function (l) { if (l.open) ops += SK.LIFT[l.type].op; });
    Sim.spend(ops, 'ops');
    Sim.spend(Sim.wagesPerSeason() / CFG.SEASON_DAYS + G.zones.length * 20 * era, 'wages');
    if (G.tech.snowcat) Sim.spend(m.openKm * 32, 'grooming');
    // staff shortages
    var need = Sim.staffNeed(m);
    S.groomQ = need.groom > 0 ? Math.min(1, (G.staff.groom || 0) / need.groom) : 1;
    S.patrolQ = need.patrol > 0 ? Math.min(1, (G.staff.patrol || 0) / need.patrol) : 1;
    if (S.visitorsToday > 0 && r() < 0.012 + (1 - S.patrolQ) * 0.07) {
      var hit = S.patrolQ < 0.5 ? 1.6 : 0.4;
      G.reputation = Math.max(0, G.reputation - hit); S.accidents++;
      if (S.patrolQ < 0.5 && S.accidents < 4) note(S, 'An injured guest lay on the piste for an hour before help came. You are short of ski patrol.', 'warn');
    }
    if (S.dayRatings > 0) G.reputation += (S.dayRatingSum / S.dayRatings - G.reputation) * 0.014;
    S.dayRatingSum = 0; S.dayRatings = 0;
    if (S.visitorsToday > 0) G.awareness = Math.min(1, G.awareness + 0.00012 * (G.reputation / 60));
    S.days.push({ v: S.visitorsToday, w: P.w, s: S.snowline, d: S.danger });
    var smLine = 9999;
    G.pistes.forEach(function (p) { if (p.snowmaking && (p.base || 0) > 15) smLine = Math.min(smLine, p.low); });
    Wd.setLook(S.snowline, P.w, true, smLine);
  }
  Sim.forecast = function (n) {
    var S = G.season, out = [];
    if (!S) return out;
    for (var i = 1; i <= n; i++) { var P = S.plan[S.day + 25 + i]; if (P) out.push(P); }
    return out;
  };

  Sim.endSeason = function () {
    var S = G.season, n = CFG.SEASON_DAYS, L = G.ledger;
    var upkeep = 0;
    G.lifts.forEach(function (l) { upkeep += l.cost * 0.012; });
    upkeep += G.huts.length * 4000;
    Sim.spend(upkeep, 'upkeep');
    Sim.spend(G.loan * 0.07, 'interest');
    var income = L.tickets + L.huts, cost = L.ops + L.wages + L.grooming + L.snowmaking + L.upkeep + L.interest + L.repairs + L.damages;
    var m = Sim.metrics();
    var rec = { year: G.year, visitors: S.sumVisitors / n, peak: S.peak, income: income, cost: cost, profit: income - cost, rep: G.reputation, km: m.km,
      open: S.sumOpen / n, share: S.shareSum / n, first: S.firstCount > n * 0.6, pph: m.pph, top: m.top, days: S.days, stranded: S.stranded,
      ratings: S.ratings, avgRating: S.ratings ? S.ratingSum / S.ratings : 0, snowfall: S.snowfall, tOff: S.tOff,
      breakdowns: S.breakdowns, avalanches: S.avalanches, accidents: S.accidents, windDays: S.windDays, flexenDays: S.flexenDays,
      wages: L.wages, repairs: L.repairs + L.damages };
    G.history.push(rec);
    var goal = Sim.currentGoal(), gres = null;
    if (goal) {
      var ok = Sim.goalProgress(goal, rec).every(function (p) { return p.ok; });
      if (ok) { G.goals[goal.id] = 'done'; if (goal.reward) Sim.earn(goal.reward, 'grants'); gres = { goal: goal, ok: true }; }
      else if (G.year >= goal.by) { G.goals[goal.id] = 'failed'; G.reputation = Math.max(0, G.reputation - 4); gres = { goal: goal, ok: false }; }
    }
    rec.goal = gres ? { id: gres.goal.id, ok: gres.ok } : null;
    if (G.money < -(Sim.maxLoan() - G.loan) - 50000) G.over = true;
    agents.length = 0;
    G.lifts.forEach(function (l) { l.queue = []; l.running = false; l.open = true; l.broken = 0; l.repairDays = 0; l.windHold = false; });
    G.pistes.forEach(function (p) { p.open = true; p.blocked = 0; p.avClosed = false; p.repairDays = 0; });
    G.debris = [];
    G.phase = 'report';
    G.season = null;
    Sim.route();
    Wd.setLook(2650, 'summer', false);
    Wd.redrawDecals();
    SK.UI.showReport(rec, gres);
  };

  Sim.currentGoal = function () {
    for (var i = 0; i < SK.GOALS.length; i++) if (!G.goals[SK.GOALS[i].id]) return SK.GOALS[i];
    return null;
  };
  Sim.goalProgress = function (goal, rec) {
    rec = rec || G.history[G.history.length - 1] || null;
    var m = Sim.metrics(), out = [], nd = goal.need;
    function add(label, have, want, fmt) { out.push({ label: label, have: have, want: want, ok: have >= want, text: fmt(have) + ' / ' + fmt(want) }); }
    if (nd.visitors) add('Guests per day (season average)', rec ? rec.visitors : 0, nd.visitors, SK.fmtInt);
    if (nd.km) add('Piste kilometres', m.km, nd.km, function (v) { return v.toFixed(1) + ' km'; });
    if (nd.top) add('Highest lift station', m.top, nd.top, function (v) { return SK.fmtInt(v) + ' m'; });
    if (nd.rep) add('Reputation', G.reputation, nd.rep, function (v) { return Math.round(v); });
    if (nd.open) add('Pistes open (season average)', rec ? rec.open : 0, nd.open, function (v) { return Math.round(v * 100) + '%'; });
    if (nd.pph) add('Lift capacity per hour', m.pph, nd.pph, SK.fmtInt);
    if (nd.villages) add('Villages with a lift', Object.keys(Sim.access()).filter(function (k) { return Sim.access()[k] === 1; }).length, nd.villages, function (v) { return v; });
    if (nd.first) out.push({ label: 'Largest share among named rivals', have: rec && rec.first ? 1 : 0, want: 1, ok: !!(rec && rec.first), text: rec && rec.first ? 'Yes' : 'Not yet' });
    return out;
  };

  Sim.nextYear = function () {
    var news = [], prev = G.year;
    G.year = (G.year === 1938) ? 1946 : G.year + 1;
    G.phase = 'summer';
    G.ledger = newLedger();
    G.campaignsUsed = {};
    G.crewLeft = Sim.crewMax();
    G.awareness = Math.max(0.05, G.awareness * 0.78 + 0.02 + (G.reputation - 50) / 100 * 0.06);
    if (G.year !== prev + 1) { G.awareness *= 0.6; G.lifts.forEach(function (l) { l.cond = Math.max(30, l.cond - 25); }); }
    var r = SK.rng(G.seed + G.year * 104729);
    SK.RIVALS.forEach(function (rv) {
      var m = G.rivals[rv.id] * (0.97 + r() * 0.07);
      if (rv.id !== 'rest' && r() < 0.13 && SK.interp(rv.curve, G.year) > 0.05) { m *= 1.08; news.push(rv.name + ' opens a new lift and steps up its advertising.'); }
      G.rivals[rv.id] = Math.min(1.45, Math.max(0.75, m * 0.985 + 0.015));
    });
    var ev = SK.EVENTS[G.year];
    if (ev) {
      if (ev.aw) G.awareness = Math.min(1, G.awareness + ev.aw);
      if (ev.daytrip) G.daytrip += ev.daytrip;
      if (ev.wm && G.reputation >= 70) { G.awareness = Math.min(1, G.awareness + 0.3); G.reputation = Math.min(100, G.reputation + 3); }
    }
    SK.LIFTS.forEach(function (l) { if (l.year > prev && l.year <= G.year) news.push('New lift technology: ' + l.name + '.'); });
    SK.TECH.forEach(function (t) { if (t.year > prev && t.year <= G.year) news.push('New technology available: ' + t.name + '.'); });
    SK.CAMPAIGNS.forEach(function (c) { if (c.year > prev && c.year <= G.year) news.push('New marketing channel: ' + c.name + '.'); });
    SK.PROJECTS.forEach(function (p) { if (p.year > prev && p.year <= G.year) news.push('Valley project possible: ' + p.name + '.'); });
    SK.VILLAGE_CAP.forEach(function (c) { if (c[0] > prev && c[0] <= G.year) news.push('The villages are ready to grow another step (Valley tab).'); });
    G.lifts.forEach(function (l) {
      if (l.damaged) news.push(l.name + ' still has avalanche damage - repair it before winter.');
      else if (l.cond < 55) news.push(l.name + ' is worn (' + Math.round(l.cond) + '%). Overhaul it this summer or expect breakdowns.');
      if (G.year - l.rope === 21) news.push('The rope of ' + l.name + ' is over 20 years old. Its condition can no longer be fully restored until the rope is replaced.');
    });
    for (var hi = 0; hi < G.history.length - 2; hi++) delete G.history[hi].days;
    Sim.syncVillages();
    Sim.save();
    return { news: news, event: ev || null };
  };

  // ------------------------------------------------------------------ guests
  function spawn(S) {
    var cands = [], tw = 0, i;
    for (i = 0; i < nodes.length; i++) {
      var nd = nodes[i];
      if (nd.hub < 0) continue;
      if (nd.lifts.some(function (l) { return l.open; })) {
        var hb = Wd.hubs[nd.hub], w = hb.weight * ((S.comCap && S.comCap[hb.com]) || 1) + 1;
        cands.push([nd, w]); tw += w;
      }
    }
    if (!cands.length) return false;
    var x = rnd() * tw, pick = cands[0][0];
    for (i = 0; i < cands.length; i++) { x -= cands[i][1]; if (x <= 0) { pick = cands[i][0]; break; } }
    var sr = rnd();
    var a = { skill: sr < 0.34 ? 0 : sr < 0.8 ? 1 : 2, state: 'idle', lift: null, piste: null, s: 0, node: pick.id, stay: 55 + rnd() * 70,
      wait: 0, total: 0, runs: 0, rides: 0, comfort: 0, hard: 0, last: [], distinct: 0, home: false, stranded: false, viaLift: false, routes: 0,
      v: 0.85 + rnd() * 0.3, ph: rnd() * 6.28, x: pick.x, y: 0, z: pick.z, fx: 1, fz: 0, vis: false, q: 0, slot: (rnd() * 8) | 0, lean: 0 };
    agents.push(a);
    decide(a, pick, S);
    return true;
  }

  function leave(a, S) {
    a.state = 'gone';
    var fair = Sim._fair || 10;
    var waitFrac = a.wait / Math.max(25, a.total);
    var r = 54;
    r -= Math.min(1, Math.max(0, (waitFrac - 0.14) / 0.45)) * 46;
    r += (a.rides ? a.comfort / a.rides : 0.3) * 12;
    r += Math.min(a.distinct, 6) * 2.6;
    r -= Math.min(3, a.hard) * 7;
    r += Math.min(6, Math.max(-20, (fair / Math.max(1, G.price) - 1) * 30));
    if (a.runs === 0) r -= 28;
    if (a.stranded) { r -= 32; S.stranded++; }
    r += ((S.groomQ === undefined ? 1 : S.groomQ) - 0.6) * 9;                 // well prepared pistes
    if (G.tech.snowcat && S.groomQ > 0.7) r += 3;
    if (G.tech.winch && S.groomQ > 0.7) r += 2;
    if (a.routes) r += 4;
    r += Math.min(4, G.huts.length) * 1.2;
    if (G.projects.pedestrian) r += 1.2;
    if (G.projects.tunnels) r += 1.0;
    if (S.powder) r += 4; else if (S.weather === 'storm') r -= G.projects.hall ? 2 : 6;
    r = Math.min(100, Math.max(0, r));
    S.ratings++; S.ratingSum += r; S.dayRatings++; S.dayRatingSum += r;
  }

  function enqueue(a, lift) { a.state = 'queue'; a.lift = lift; a.q = lift.queue.length; lift.queue.push(a); }

  function decide(a, nd, S) {
    a.node = nd.id; a.lift = null; a.piste = null;
    if (a.stay <= 0) a.home = true;
    if (a.home) {
      if (nd.hub >= 0) { leave(a, S); return; }
      var nx = nd.next;
      if (!nx) { a.stranded = true; leave(a, S); return; }
      if (nx.kind === 'piste') { startPiste(a, nx.ref); return; }
      if (nx.kind === 'lift') { enqueue(a, nx.ref); return; }
      a.state = 'down'; a.lift = nx.ref; a.s = nx.ref.geom.len; return;
    }
    var opts = [], tw = 0, i, w;
    for (i = 0; i < nd.pistes.length; i++) {
      var p = nd.pistes[i];
      if (!p.open) continue;
      if (nodes[p.nb].home === Infinity) continue;
      w = PREF[a.skill][p.diff] * (a.last.indexOf(p.id) >= 0 ? 0.55 : 1);
      if (p.diff === 'route' && S.powder) w *= 1.8;
      if (w <= 0) continue;
      opts.push(['p', p, w]); tw += w;
    }
    for (i = 0; i < nd.lifts.length; i++) {
      var l = nd.lifts[i];
      if (!l.open) continue;
      var thr = Sim.throughput(l, S);
      w = l.appeal[a.skill] * 1.15 / (1 + (l.queue.length / thr) / 14);
      if (a.viaLift) w *= 0.3;
      if (nd.hub >= 0 && nd.pistes.length === 0) w = Math.max(w, 0.02);
      opts.push(['l', l, w]); tw += w;
    }
    if (!opts.length) {
      if (nd.hub >= 0) { leave(a, S); return; }
      a.home = true; decide(a, nd, S); return;
    }
    var x = rnd() * tw, pick = opts[0];
    for (i = 0; i < opts.length; i++) { x -= opts[i][2]; if (x <= 0) { pick = opts[i]; break; } }
    if (pick[0] === 'p') startPiste(a, pick[1]); else enqueue(a, pick[1]);
  }

  function startPiste(a, p) {
    a.state = 'ski'; a.piste = p; a.s = 0; a.viaLift = false;
    if (PREF[a.skill][p.diff] < 0.2) a.hard++;
    if (p.diff === 'route') a.routes++;
    if (a.last.indexOf(p.id) < 0) { a.distinct++; a.last.push(p.id); if (a.last.length > 4) a.last.shift(); }
  }
  Sim.throughput = function (l, S) {
    return SK.LIFT[l.type].pph * (Sim._boost || 1) * SK.CREW_LEVELS[l.crew === undefined ? 1 : l.crew].thr / (60 * S.scale);
  };

  function step(dt, S) {
    var i, a;
    var want = Math.min(CFG.MAX_AGENTS, Math.round(S.visitorsToday / S.scale));
    if (agents.length < want) {
      S.spawnAcc = (S.spawnAcc || 0) + dt * Math.max(2, want / 9);
      while (S.spawnAcc >= 1 && agents.length < want) { S.spawnAcc -= 1; if (!spawn(S)) { S.spawnAcc = 0; break; } }
    }
    for (i = 0; i < G.lifts.length; i++) {
      var l = G.lifts[i];
      if (!l.open) continue;
      l.loadAcc += dt * Sim.throughput(l, S);
      if (!l.queue.length) { if (l.loadAcc > 1) l.loadAcc = 1; continue; }
      var moved = 0;
      while (l.loadAcc >= 1 && l.queue.length) {
        a = l.queue.shift(); l.loadAcc -= 1; moved++;
        a.state = 'lift'; a.s = 0; l.carried += S.scale;
      }
      if (moved) for (var q = 0; q < l.queue.length; q++) l.queue[q].q = q;
    }
    var over = agents.length - want;
    for (i = 0; i < agents.length; i++) {
      a = agents[i];
      a.total += dt; a.stay -= dt;
      if (over > 0 && !a.home && a.total > 20) { a.home = true; a.stay = 0; over--; }
      if (a.state === 'queue') {
        a.wait += dt;
        if (!a.lift.open) { a.lift.queue.splice(a.lift.queue.indexOf(a), 1); a.viaLift = false; decide(a, nodes[a.node], S); }
      } else if (a.state === 'lift') {
        a.s += SK.LIFT[a.lift.type].speed * dt;
        if (a.s >= a.lift.geom.len) {
          a.rides++; a.comfort += SK.LIFT[a.lift.type].comfort; a.viaLift = true;
          decide(a, nodes[a.lift.nb], S);
        }
      } else if (a.state === 'down') {
        a.s -= SK.LIFT[a.lift.type].speed * dt;
        if (a.s <= 0) decide(a, nodes[a.lift.na], S);
      } else if (a.state === 'ski') {
        a.s += SPEED[a.skill][a.piste.diff] * a.v * dt;
        if (a.s >= a.piste.len) { a.runs++; decide(a, nodes[a.piste.nb], S); }
      }
    }
    for (i = agents.length - 1; i >= 0; i--) if (agents[i].state === 'gone') { agents[i] = agents[agents.length - 1]; agents.pop(); }
  }

  var _p = { x: 0, y: 0, z: 0 };
  Sim.present = function () {
    var sc = Wd.agentScale(), gap = Math.max(5, sc * 2.4);
    for (var i = 0; i < agents.length; i++) {
      var a = agents[i];
      a.vis = true; a.lean = 0;
      if (a.state === 'ski') {
        var p = a.piste, cum = p.cum, lo = 0, hi = cum.length - 1;
        while (hi - lo > 1) { var mid = (lo + hi) >> 1; if (cum[mid] <= a.s) lo = mid; else hi = mid; }
        var f = (a.s - cum[lo]) / Math.max(0.01, cum[hi] - cum[lo]), A = p.pts[lo], B = p.pts[hi];
        var dx = B.x - A.x, dz = B.z - A.z, dl = Math.hypot(dx, dz) || 1;
        dx /= dl; dz /= dl;
        var edge = Math.min(1, a.s / 60, (p.len - a.s) / 60), wd = p.diff === 'route' ? 26 : p.width, ph = a.s / 46 + a.ph;
        var wv = Math.sin(ph) * wd * 0.33 * Math.max(0, edge), cw = Math.cos(ph) * 0.55 * edge;
        a.x = A.x + (B.x - A.x) * f - dz * wv; a.z = A.z + (B.z - A.z) * f + dx * wv;
        a.y = T.heightAt(a.x, a.z) + 0.5;
        var fx = dx - dz * cw, fz = dz + dx * cw, fl = Math.hypot(fx, fz);
        a.fx = fx / fl; a.fz = fz / fl; a.lean = -Math.sin(ph) * 0.42 * edge;
      } else if (a.state === 'lift' || a.state === 'down') {
        var ty = SK.LIFT[a.lift.type], st = ty.style;
        if (st === 'gondola' || st === 'tram' || st === 'pod' || a.state === 'down') { a.vis = false; continue; }
        Wd.liftSeat(a.lift, a.s, a.slot % ty.seats, _p);
        a.x = _p.x; a.y = _p.y; a.z = _p.z; a.fx = a.lift.geom.ux; a.fz = a.lift.geom.uz;
      } else if (a.state === 'queue') {
        if (a.q > 59) { a.vis = false; continue; }
        var g = a.lift.geom, row = (a.q / 5) | 0, col = a.q % 5 - 2;
        a.x = a.lift.a.x - g.ux * (22 + row * gap) - g.uz * col * 7;
        a.z = a.lift.a.z - g.uz * (22 + row * gap) + g.ux * col * 7;
        a.y = T.heightAt(a.x, a.z) + 0.5; a.fx = g.ux; a.fz = g.uz;
      } else a.vis = false;
    }
    Wd.drawAgents(agents);
  };

  Sim.speed = 1; Sim.paused = false;
  Sim.update = function (realDt) {
    SK.simDt = 0;
    if (!G || G.phase !== 'winter' || Sim.paused) return;
    var S = G.season, dt = realDt * Sim.speed;
    SK.simDt = dt;
    Sim._boost = 1 + (G.tech.keycard ? 0.08 : 0) + (G.tech.rfid ? 0.10 : 0);
    var left = dt;
    while (left > 0 && G.phase === 'winter') {
      var h = Math.min(0.1, left);
      left -= h;
      S.dayAcc += h;
      if (S.dayAcc >= CFG.DAY_SEC) { S.dayAcc -= CFG.DAY_SEC; Sim._fair = Sim.fairPrice(); dayTick(); if (G.phase !== 'winter') return; }
      step(h, S);
    }
  };
  Sim.queueTime = function (l) {
    if (!G.season) return 0;
    return l.queue.length / Sim.throughput(l, G.season);
  };
})(window.SK);
