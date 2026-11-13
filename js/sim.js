// Simulation: game state, lift/piste network, guests, weather, economy, seasons
(function (SK) {
  'use strict';
  var T = SK.T, CFG = SK.CFG, Wd = SK.World;
  var Sim = SK.Sim = {};
  var G = null;
  var agents = Sim.agents = [];
  var nodes = Sim.nodes = [];
  var rnd = Math.random;

  var PREF = { 0: { blue: 1, red: 0.14, black: 0.01 }, 1: { blue: 0.6, red: 1, black: 0.22 }, 2: { blue: 0.22, red: 0.8, black: 1 } };
  var SPEED = { 0: { blue: 95, red: 62, black: 42 }, 1: { blue: 128, red: 112, black: 74 }, 2: { blue: 150, red: 152, black: 134 } };
  var PISTE_NAMES = ['Kandahar', 'Osthang', 'Fang', 'Mattun', 'Schindlerkar', 'Steißbachtal', 'Zammermoos', 'Schöngraben', 'Salzböden', 'Maiensee',
    'Arlenmähder', 'Ulmerhütte', 'Gampberg', 'Riffel', 'Tanzböden', 'Kapall', 'Plattiger', 'Schweinströge', 'Törli', 'Valfagehr', 'Pfannenkopf',
    'Rauz', 'Himmeleck', 'Putzen', 'Lavenar', 'Rossfall', 'Moos', 'Stiegeneck', 'Brunnenhof', 'Nasserein', 'Feldherrnhügel', 'Kaltenegg',
    'Sennhütte', 'Krazy Kanguruh', 'Märchenwiese', 'Hasenboden', 'Zwischen', 'Albona', 'Bergwald', 'Sattelkopf'];

  // ------------------------------------------------------------------ new game / save / load
  Sim.newGame = function () {
    G = SK.G = {
      v: 2, year: CFG.START_YEAR, phase: 'summer', money: CFG.START_MONEY, loan: 0,
      lifts: [], pistes: [], huts: [], nextId: 1, pisteNameIdx: 0,
      tech: {}, villageLevel: 0, daytrip: 0,
      awareness: 0.22, reputation: 50, price: 8,
      campaignsUsed: {}, crewLeft: CFG.BASE_CREW_WEEKS,
      rivals: {}, goals: {}, history: [], season: null,
      ledger: newLedger(), seed: (Math.random() * 1e9) | 0, wmDone: false, over: false,
    };
    SK.RIVALS.forEach(function (r) { G.rivals[r.id] = 1; });
    agents.length = 0;
    Sim.rebuildGraph();
    return G;
  };
  function newLedger() { return { tickets: 0, huts: 0, grants: 0, ops: 0, grooming: 0, snowmaking: 0, marketing: 0, construction: 0, interest: 0, upkeep: 0, invest: 0 }; }

  Sim.save = function () {
    if (!G) return;
    var s = JSON.parse(JSON.stringify(G, function (k, v) {
      if (k === 'geom' || k === 'queue' || k === 'cum' || k === 'ys' || k === 'season') return undefined;
      return v;
    }));
    s.phase = 'summer';
    try { localStorage.setItem('arlberg-pioneers-save', JSON.stringify(s)); } catch (e) { /* storage unavailable */ }
  };
  Sim.hasSave = function () { try { return !!localStorage.getItem('arlberg-pioneers-save'); } catch (e) { return false; } };
  Sim.load = function () {
    var raw;
    try { raw = localStorage.getItem('arlberg-pioneers-save'); } catch (e) { return false; }
    if (!raw) return false;
    var s;
    try { s = JSON.parse(raw); } catch (e) { return false; }
    if (!s || s.v !== 2) return false;
    G = SK.G = s; G.season = null; G.phase = 'summer';
    agents.length = 0;
    G.lifts.forEach(function (l) { l.geom = SK.Build.liftGeom(SK.LIFT[l.type], l.a, l.b); l.queue = []; l.loadAcc = 0; l.running = false; l.open = true; });
    G.pistes.forEach(function (p) { Sim.derivePiste(p); p.open = true; });
    Sim.rebuildGraph();
    return true;
  };

  // ------------------------------------------------------------------ helpers
  Sim.crewMax = function () {
    return CFG.BASE_CREW_WEEKS + (G.tech.crew2 ? 12 : 0) + (G.tech.heli ? 14 : 0) + (G.tech.prefab ? 16 : 0);
  };
  Sim.beds = function () { return SK.VILLAGE[G.villageLevel].beds; };
  Sim.smReach = function () { return G.tech.snow3 ? 1100 : G.tech.snow2 ? 750 : G.tech.snow1 ? 450 : 0; };
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

  Sim.derivePiste = function (p) {
    var n = p.pts.length, ys = new Float32Array(n), cum = new Float32Array(n), len = 0;
    for (var i = 0; i < n; i++) {
      ys[i] = T.heightAt(p.pts[i].x, p.pts[i].z);
      if (i) { len += Math.hypot(p.pts[i].x - p.pts[i - 1].x, p.pts[i].z - p.pts[i - 1].z, ys[i] - ys[i - 1]); }
      cum[i] = len;
    }
    p.ys = ys; p.cum = cum; p.len = len; p.drop = ys[0] - ys[n - 1];
    var lo = Infinity, hi = -Infinity;
    for (i = 0; i < n; i++) { if (ys[i] < lo) lo = ys[i]; if (ys[i] > hi) hi = ys[i]; }
    p.low = lo; p.high = hi;
    var st = SK.Build.pisteStats(p.pts);
    p.maxGrad = st.maxGrad; p.diff = st.diff;
    return p;
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
          var up = { id: G.nextId++, name: p.name, pts: p.pts.slice(0, best + 1), width: p.width, snowmaking: p.snowmaking, cost: p.cost * best / p.pts.length, built: p.built, open: true };
          var dn = { id: G.nextId++, name: p.name, pts: p.pts.slice(best), width: p.width, snowmaking: p.snowmaking, cost: p.cost * (1 - best / p.pts.length), built: p.built, open: true };
          Sim.derivePiste(up); Sim.derivePiste(dn);
          G.pistes.splice(k, 1, up, dn);
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
    Sim.route();
  };

  // shortest way home (to a village) from every node, over open pistes and lifts
  Sim.route = function () {
    var i;
    for (i = 0; i < nodes.length; i++) { nodes[i].home = nodes[i].hub >= 0 ? 0 : Infinity; nodes[i].next = null; }
    for (var pass = 0; pass < nodes.length + 2; pass++) {
      var changed = false;
      G.pistes.forEach(function (p) {
        if (!p.open) return;
        var c = nodes[p.nb].home + p.len / 120 + (p.diff === 'black' ? 12 : 0);
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
    // appeal of each lift per skill = what you can ski from its top
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
    G.lifts.forEach(function (l) {          // second pass: connector lifts inherit some appeal from the next lift
      if (!l.open) return;
      nodes[l.nb].lifts.forEach(function (l2) { if (l2.open) for (var s = 0; s < 3; s++) l.appeal[s] = Math.max(l.appeal[s], l2.appeal[s] * 0.7); });
    });
  };

  // problems the player should know about
  Sim.networkIssues = function () {
    var issues = [], hubLift = false;
    G.lifts.forEach(function (l) {
      if (nodes[l.na].hub >= 0) hubLift = true;
      var top = nodes[l.nb];
      if (!top.pistes.length && !top.lifts.length && top.hub < 0) issues.push({ t: l.name + ': no piste starts at the top station.', x: l.b.x, z: l.b.z });
      var bot = nodes[l.na];
      if (bot.hub < 0 && bot.into === 0) issues.push({ t: l.name + ': nobody can reach the bottom station.', x: l.a.x, z: l.a.z });
    });
    G.pistes.forEach(function (p) {
      var a = nodes[p.na], b = nodes[p.nb];
      if (a.hub < 0 && a.into === 0) issues.push({ t: 'Piste ' + p.name + ' starts where no lift or piste arrives.', x: p.pts[0].x, z: p.pts[0].z });
      if (b.hub < 0 && !b.lifts.length && !b.pistes.length) issues.push({ t: 'Piste ' + p.name + ' ends in the wild - connect it to a lift, piste or village.', x: p.pts[p.pts.length - 1].x, z: p.pts[p.pts.length - 1].z });
    });
    if (G.lifts.length && !hubLift) issues.unshift({ t: 'No lift starts in a village (yellow circles). Guests cannot get onto the mountain.' });
    return issues;
  };

  // ------------------------------------------------------------------ resort metrics
  Sim.metrics = function () {
    var km = 0, openKm = 0, byDiff = { blue: 0, red: 0, black: 0 }, lo = Infinity, hi = -Infinity, pph = 0, comfortW = 0, top = 0, smKm = 0;
    G.pistes.forEach(function (p) {
      km += p.len / 1000; if (p.open) openKm += p.len / 1000; byDiff[p.diff] += p.len / 1000;
      if (p.snowmaking) smKm += p.len / 1000;
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
    var variety = 0;
    if (km > 0) {
      var sb = byDiff.blue / km, sr = byDiff.red / km, sk = byDiff.black / km;
      variety = 1 - 0.5 * (Math.abs(sb - 0.38) + Math.abs(sr - 0.42) + Math.abs(sk - 0.20)) / 0.62;
      variety = Math.max(0, variety);
    }
    var size = 1 - Math.exp(-km / 45), vertical = km > 0 ? Math.min(1, (hi - lo) / 1500) : 0;
    var base = 0.36 * size + 0.10 * vertical + 0.13 * liftScore + 0.09 * variety + 0.32 * (G.reputation / 100);
    var quality = km > 0 && pph > 0 ? base * (0.22 + 0.78 * Math.sqrt(size)) : 0;
    var openFrac = km > 0 ? openKm / km : 0;
    return { km: km, openKm: openKm, openFrac: openFrac, byDiff: byDiff, pph: pph, liftScore: liftScore, variety: variety, size: size,
      vertical: vertical, quality: quality, top: top, smKm: smKm, lo: lo, hi: hi };
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
  Sim.capacity = function () { return Sim.beds() * 0.9 + G.daytrip + 150; };

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
  Sim.addLift = function (type, a, b, geom, cost, weeks) {
    var ty = SK.LIFT[type], short = { surface: 'Lift', chair: 'Chair', gondola: 'Bahn', tram: 'Bahn', pod: 'Line' }[ty.style];
    var l = { id: G.nextId++, type: type, name: uniqueName(nearestPlace(b.x, b.z) + ' ' + short, G.lifts), a: a, b: b, geom: geom,
      built: G.year, cost: cost, queue: [], loadAcc: 0, running: false, open: true, carried: 0 };
    G.lifts.push(l);
    Sim.spend(cost, 'construction'); G.crewLeft -= weeks;
    Sim.normalizeNetwork(); Sim.rebuildGraph();
    Wd.addLift(l); Wd.redrawPistes(); Wd.rebuildTrees();
    return l;
  };
  Sim.addPiste = function (pts, cost, weeks) {
    var p = { id: G.nextId++, name: PISTE_NAMES[G.pisteNameIdx++ % PISTE_NAMES.length], pts: pts, width: 44, snowmaking: false, cost: cost, built: G.year, open: true };
    Sim.derivePiste(p);
    G.pistes.push(p);
    Sim.spend(cost, 'construction'); G.crewLeft -= weeks;
    Sim.normalizeNetwork(); Sim.rebuildGraph();
    Wd.redrawPistes(); Wd.rebuildTrees();
    return p;
  };
  Sim.addHut = function (pt, cost, weeks) {
    G.huts.push({ id: G.nextId++, x: pt.x, y: pt.y, z: pt.z, built: G.year });
    Sim.spend(cost, 'construction'); G.crewLeft -= weeks;
    Wd.rebuildHuts(); Wd.rebuildTrees();
  };
  Sim.remove = function (kind, obj) {
    var refund = 0;
    if (kind === 'lift') { G.lifts.splice(G.lifts.indexOf(obj), 1); Wd.removeLift(obj.id); refund = obj.cost * 0.15; }
    else if (kind === 'piste') { G.pistes.splice(G.pistes.indexOf(obj), 1); }
    else { G.huts.splice(G.huts.indexOf(obj), 1); Wd.rebuildHuts(); }
    G.money += refund;
    Sim.rebuildGraph(); Wd.redrawPistes(); Wd.rebuildTrees();
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
    lift.type = type; lift.geom = u.geom; lift.built = G.year; lift.cost = u.geom.cost;
    Sim.spend(u.cost, 'construction'); G.crewLeft -= u.weeks;
    Sim.rebuildGraph(); Wd.addLift(lift); Wd.rebuildTrees();
    return null;
  };
  Sim.snowmakingCost = function (p) { return Math.round(p.len * (G.tech.snow2 ? 190 : 240)); };
  Sim.toggleSnowmaking = function (p) {
    if (!Sim.smReach()) return 'Buy the Snow cannons technology first.';
    if (p.snowmaking) { p.snowmaking = false; Wd.redrawPistes(); return null; }
    var c = Sim.snowmakingCost(p), err = Sim.checkBudget(c, 1);
    if (err) return err;
    p.snowmaking = true; Sim.spend(c, 'construction'); G.crewLeft -= 1;
    Wd.redrawPistes();
    return null;
  };
  Sim.buyTech = function (t) {
    if (G.tech[t.id]) return 'Already owned.';
    if (!Sim.unlocked(t)) return 'Not invented yet.';
    if (t.cost > G.money) return 'Not enough money.';
    G.tech[t.id] = G.year; Sim.spend(t.cost, 'invest');
    if (t.id === 'crew2') G.crewLeft += 12; if (t.id === 'heli') G.crewLeft += 14; if (t.id === 'prefab') G.crewLeft += 16;
    return null;
  };
  Sim.campaignCost = function (c) {
    var k = Math.max(0.25, Math.min(1, SK.interp(SK.MARKET, G.year) / 40000));
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
  Sim.upgradeVillage = function () {
    var nx = SK.VILLAGE[G.villageLevel + 1];
    if (!nx) return 'The valley is fully developed.';
    if (nx.cost > G.money) return 'Not enough money.';
    Sim.spend(nx.cost, 'invest'); G.villageLevel++;
    Wd.setVillageLevel(G.villageLevel); Wd.rebuildTrees();
    return null;
  };
  Sim.takeLoan = function (amt) {
    var room = Sim.maxLoan() - G.loan;
    amt = Math.min(amt, room);
    if (amt <= 0) return 'The bank will not lend more.';
    G.loan += amt; G.money += amt; return null;
  };
  Sim.repayLoan = function (amt) {
    amt = Math.min(amt, G.loan, Math.max(0, G.money));
    if (amt <= 0) return 'Nothing to repay.';
    G.loan -= amt; G.money -= amt; return null;
  };

  // ------------------------------------------------------------------ season flow
  Sim.dateOf = function (day) {
    var m = [['Dec', 31], ['Jan', 31], ['Feb', 28], ['Mar', 31]], d = Math.min(day, CFG.SEASON_DAYS - 1);
    for (var i = 0; i < m.length; i++) { if (d < m[i][1]) return (d + 1) + ' ' + m[i][0]; d -= m[i][1]; }
    return '31 Mar';
  };
  Sim.snowlineOn = function (day) {
    var S = G.season, shape;
    if (day < 30) shape = 380 * (1 - day / 30); else if (day < 86) shape = 0; else shape = 460 * (day - 86) / 34;
    return S.baseSnow + shape - S.fresh * 6;
  };

  Sim.openSeason = function () {
    if (G.phase !== 'summer') return;
    var r = SK.rng(G.seed + G.year * 7919), ev = SK.EVENTS[G.year] || {};
    var S = G.season = {
      day: -1, t: 0, weather: 'sun', spell: 0, fresh: 0, powder: false, r: r,
      baseSnow: SK.interp(SK.SNOWLINE, G.year) + (r() - 0.5) * 420 + (ev.snow || 0),
      visitorsToday: 0, sumVisitors: 0, sumOpen: 0, ratings: 0, ratingSum: 0, dayRatingSum: 0, dayRatings: 0,
      days: [], startMoney: G.money, ledger0: JSON.parse(JSON.stringify(G.ledger)), stranded: 0, peak: 0, shareSum: 0, firstCount: 0,
    };
    G.ledger = newLedger();
    G.phase = 'winter';
    G.lifts.forEach(function (l) { l.queue = []; l.loadAcc = 0; l.open = true; l.running = true; l.carried = 0; l.broken = 0; l.qSum = 0; });
    G.pistes.forEach(function (p) { p.open = true; });
    agents.length = 0;
    Sim.rebuildGraph();
    var m = Sim.metrics(), mk = Sim.market(m);
    var est = Math.min(mk.size * mk.share * 1.7, Sim.capacity());
    S.scale = Math.max(3, Math.ceil(est / (CFG.MAX_AGENTS * 0.85)));
    S.dayAcc = CFG.DAY_SEC;          // triggers day 0 immediately
    Sim.update(0.0001);
  };

  function dayTick() {
    var S = G.season, r = S.r;
    S.day++;
    if (S.day >= CFG.SEASON_DAYS) { Sim.endSeason(); return; }
    // weather in spells
    var prev = S.weather;
    if (--S.spell <= 0) {
      var x = r();
      S.weather = x < 0.46 ? 'sun' : x < 0.72 ? 'cloud' : x < 0.93 ? 'snow' : 'storm';
      S.spell = S.weather === 'storm' ? 1 + (r() * 2 | 0) : 2 + (r() * 5 | 0);
    }
    if (S.weather === 'snow' || S.weather === 'storm') S.fresh = Math.min(30, S.fresh + 9); else S.fresh = Math.max(0, S.fresh - 1.5);
    S.powder = (prev === 'snow' || prev === 'storm') && S.weather === 'sun';
    S.snowline = Sim.snowlineOn(S.day);
    // what is open today
    var reach = Sim.smReach(), smKmToday = 0, changed = false;
    G.pistes.forEach(function (p) {
      var natural = S.snowline <= p.low + 160;
      var open = natural || (p.snowmaking && S.snowline - reach <= p.low + 160);
      if (p.snowmaking && !natural && open) smKmToday += p.len / 1000;
      if (open !== p.open) { p.open = open; changed = true; }
    });
    G.lifts.forEach(function (l) {
      var ty = SK.LIFT[l.type], age = G.year - l.built;
      if (l.broken > 0) l.broken--;
      else if (age > 28 && r() < (age - 28) * 0.0012) { l.broken = 2 + (r() * 3 | 0); SK.UI.toast(l.name + ' has broken down. It is ' + age + ' years old.', 'warn'); }
      var open = !(S.weather === 'storm' && !ty.wind && l.b.y > 2050) && !(l.broken > 0);
      if (open !== l.open) { l.open = open; l.running = open; changed = true; }
    });
    if (changed) Sim.route();
    G.lifts.forEach(function (l) { l.qSum += Sim.queueTime(l); });
    // demand
    var m = Sim.metrics(), mk = Sim.market(m), d = S.day;
    var dayF = (d % 7 >= 5 ? 1.22 : 0.93);
    if (d < 12) dayF *= 0.55 + d * 0.03; else if (d >= 22 && d <= 37) dayF *= 1.35; else if (d >= 62 && d <= 90) dayF *= 1.22; else if (d > 106) dayF *= 0.7;
    var wF = S.weather === 'sun' ? 1.1 : S.weather === 'cloud' ? 1 : S.weather === 'snow' ? 0.85 : 0.5;
    if (S.powder) wF = 1.28;
    var hubOpen = G.lifts.some(function (l) { return l.open && nodes[l.na].hub >= 0; });
    var v = hubOpen && m.openKm > 0 ? Math.min(mk.size * mk.share * dayF * wF, Sim.capacity()) : 0;
    S.visitorsToday = Math.round(v);
    S.sumVisitors += S.visitorsToday; S.sumOpen += m.openFrac; S.peak = Math.max(S.peak, S.visitorsToday);
    S.shareSum += mk.share;
    var first = true;
    mk.rivals.forEach(function (rv) { if (rv.id !== 'rest' && rv.a > mk.mine) first = false; });
    if (first) S.firstCount++;
    // money
    var tickets = S.visitorsToday * G.price * (G.tech.dynprice ? 1.09 : 1);
    Sim.earn(tickets, 'tickets');
    if (G.huts.length) Sim.earn(Math.min(S.visitorsToday, G.huts.length * 700) * 3.4, 'huts');
    var ops = 110 + tickets * 0.18;                 // staff, energy, taxes scale with the business
    G.lifts.forEach(function (l) { if (l.open) ops += SK.LIFT[l.type].op * (1 + Math.max(0, G.year - l.built - 20) * 0.02); });
    Sim.spend(ops, 'ops');
    Sim.spend(m.openKm * (G.tech.snowcat ? 85 : 28) + (G.tech.winch ? m.byDiff.black * 30 : 0), 'grooming');
    if (smKmToday) Sim.spend(smKmToday * 320 * (G.tech.snow2 ? 0.7 : 1), 'snowmaking');
    // reputation drifts towards what guests reported today
    if (S.dayRatings > 0) G.reputation += (S.dayRatingSum / S.dayRatings - G.reputation) * 0.014;
    S.dayRatingSum = 0; S.dayRatings = 0;
    if (S.visitorsToday > 0) G.awareness = Math.min(1, G.awareness + 0.00012 * (G.reputation / 60));
    S.days.push({ v: S.visitorsToday, w: S.weather, s: S.snowline });
    Wd.setLook(S.snowline, S.weather, true, reach);
  }

  Sim.endSeason = function () {
    var S = G.season, n = CFG.SEASON_DAYS, L = G.ledger;
    // spring bills
    var upkeep = 0;
    G.lifts.forEach(function (l) { upkeep += l.cost * 0.025 * (1 + Math.max(0, G.year - l.built - 20) * 0.03); });
    upkeep += G.huts.length * 4000;
    Sim.spend(upkeep, 'upkeep');
    var interest = G.loan * 0.07;
    Sim.spend(interest, 'interest');
    var income = L.tickets + L.huts, cost = L.ops + L.grooming + L.snowmaking + L.upkeep + L.interest;
    var m = Sim.metrics();
    var rec = { year: G.year, visitors: S.sumVisitors / n, peak: S.peak, income: income, cost: cost, profit: income - cost, rep: G.reputation, km: m.km,
      open: S.sumOpen / n, share: S.shareSum / n, first: S.firstCount > n * 0.6, pph: m.pph, top: m.top, days: S.days, stranded: S.stranded,
      ratings: S.ratings, avgRating: S.ratings ? S.ratingSum / S.ratings : 0, baseSnow: S.baseSnow,
      marketing: S.ledger0.marketing, construction: S.ledger0.construction, invest: S.ledger0.invest };
    G.history.push(rec);
    // goals
    var goal = Sim.currentGoal(), gres = null;
    if (goal) {
      var ok = Sim.goalProgress(goal, rec).every(function (p) { return p.ok; });
      if (ok) { G.goals[goal.id] = 'done'; if (goal.reward) Sim.earn(goal.reward, 'grants'); gres = { goal: goal, ok: true }; }
      else if (G.year >= goal.by) { G.goals[goal.id] = 'failed'; G.reputation = Math.max(0, G.reputation - 4); gres = { goal: goal, ok: false }; }
    }
    rec.goal = gres ? { id: gres.goal.id, ok: gres.ok } : null;
    if (G.money < -(Sim.maxLoan() - G.loan) - 50000) G.over = true;
    agents.length = 0;
    G.lifts.forEach(function (l) { l.queue = []; l.running = false; });
    G.phase = 'report';
    G.season = null;
    Wd.setLook(2650, 'summer', false, 0);
    SK.UI.showReport(rec, gres);
  };

  Sim.currentGoal = function () {
    for (var i = 0; i < SK.GOALS.length; i++) if (!G.goals[SK.GOALS[i].id]) return SK.GOALS[i];
    return null;
  };
  // rec = season record (or null → use last season / live values)
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
    if (nd.first) out.push({ label: 'Largest share among named rivals', have: rec && rec.first ? 1 : 0, want: 1, ok: !!(rec && rec.first), text: rec && rec.first ? 'Yes' : 'Not yet' });
    return out;
  };

  Sim.nextYear = function () {
    var news = [];
    var prev = G.year;
    G.year = (G.year === 1938) ? 1946 : G.year + 1;
    G.phase = 'summer';
    G.ledger = newLedger();
    G.campaignsUsed = {};
    G.crewLeft = Sim.crewMax();
    G.awareness = Math.max(0.05, G.awareness * 0.78 + 0.02 + (G.reputation - 50) / 100 * 0.06);
    if (G.year !== prev + 1) G.awareness *= 0.6;
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
    for (var hi = 0; hi < G.history.length - 2; hi++) delete G.history[hi].days;      // keep saves small
    Sim.save();
    return { news: news, event: ev || null };
  };

  // ------------------------------------------------------------------ guests
  function spawn(S) {
    var cands = [], tw = 0;
    for (var i = 0; i < nodes.length; i++) {
      var nd = nodes[i];
      if (nd.hub < 0) continue;
      if (nd.lifts.some(function (l) { return l.open; })) { var w = Wd.hubs[nd.hub].weight; cands.push([nd, w]); tw += w; }
    }
    if (!cands.length) return false;
    var x = rnd() * tw, pick = cands[0][0];
    for (i = 0; i < cands.length; i++) { x -= cands[i][1]; if (x <= 0) { pick = cands[i][0]; break; } }
    var sr = rnd();
    var a = { skill: sr < 0.34 ? 0 : sr < 0.8 ? 1 : 2, state: 'idle', lift: null, piste: null, s: 0, node: pick.id, stay: 55 + rnd() * 70,
      wait: 0, total: 0, runs: 0, rides: 0, comfort: 0, hard: 0, last: [], distinct: 0, home: false, stranded: false, viaLift: false,
      v: 0.85 + rnd() * 0.3, ph: rnd() * 6.28, x: pick.x, y: 0, z: pick.z, fx: 1, fz: 0, vis: false, q: 0 };
    agents.push(a);
    decide(a, pick, S);
    return true;
  }

  function leave(a, S) {
    a.state = 'gone';
    var fair = Sim._fair || 10;
    var waitFrac = a.wait / Math.max(25, a.total);
    var r = 55;
    r -= Math.min(1, Math.max(0, (waitFrac - 0.14) / 0.45)) * 46;
    r += (a.rides ? a.comfort / a.rides : 0.3) * 12;
    r += Math.min(a.distinct, 6) * 2.6;
    r -= Math.min(3, a.hard) * 7;
    r += Math.min(6, Math.max(-20, (fair / Math.max(1, G.price) - 1) * 30));
    if (a.runs === 0) r -= 28;
    if (a.stranded) { r -= 32; S.stranded++; }
    if (G.tech.snowcat) r += 4;
    if (G.tech.winch) r += 2;
    r += Math.min(4, G.huts.length) * 1.2;
    if (S.powder) r += 4; else if (S.weather === 'storm') r -= 6;
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
      if (nodes[p.nb].home === Infinity) continue;            // would strand them
      w = PREF[a.skill][p.diff] * (a.last.indexOf(p.id) >= 0 ? 0.55 : 1);
      opts.push(['p', p, w]); tw += w;
    }
    var throughput = 1;
    for (i = 0; i < nd.lifts.length; i++) {
      var l = nd.lifts[i];
      if (!l.open) continue;
      throughput = SK.LIFT[l.type].pph * Sim._boost / (60 * S.scale);
      w = l.appeal[a.skill] * 1.15 / (1 + (l.queue.length / throughput) / 14);
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
    if (a.last.indexOf(p.id) < 0) { a.distinct++; a.last.push(p.id); if (a.last.length > 4) a.last.shift(); }
  }

  function step(dt, S) {
    var i, a;
    // arrivals: keep the mountain populated to today's level
    var want = Math.min(CFG.MAX_AGENTS, Math.round(S.visitorsToday / S.scale));
    if (agents.length < want) {
      S.spawnAcc = (S.spawnAcc || 0) + dt * Math.max(2, want / 9);
      while (S.spawnAcc >= 1 && agents.length < want) { S.spawnAcc -= 1; if (!spawn(S)) { S.spawnAcc = 0; break; } }
    }
    // lifts load from their queues
    for (i = 0; i < G.lifts.length; i++) {
      var l = G.lifts[i];
      if (!l.open) continue;
      l.loadAcc += dt * SK.LIFT[l.type].pph * Sim._boost / (60 * S.scale);
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
      if (over > 0 && !a.home && a.total > 20) { a.home = true; a.stay = 0; over--; }   // the day got quieter
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
    var sc = Math.min(9, Math.max(2.2, Wd.cam.dist / 520)), gap = Math.max(5, sc * 1.9);
    for (var i = 0; i < agents.length; i++) {
      var a = agents[i];
      a.vis = true;
      if (a.state === 'ski') {
        var p = a.piste, cum = p.cum, lo = 0, hi = cum.length - 1;
        while (hi - lo > 1) { var mid = (lo + hi) >> 1; if (cum[mid] <= a.s) lo = mid; else hi = mid; }
        var f = (a.s - cum[lo]) / Math.max(0.01, cum[hi] - cum[lo]), A = p.pts[lo], B = p.pts[hi];
        var dx = B.x - A.x, dz = B.z - A.z, dl = Math.hypot(dx, dz) || 1;
        dx /= dl; dz /= dl;
        var edge = Math.min(1, a.s / 60, (p.len - a.s) / 60);
        var wv = Math.sin(a.s / 46 + a.ph) * p.width * 0.33 * Math.max(0, edge), cw = Math.cos(a.s / 46 + a.ph) * 0.55 * edge;
        a.x = A.x + (B.x - A.x) * f - dz * wv; a.z = A.z + (B.z - A.z) * f + dx * wv;
        a.y = T.heightAt(a.x, a.z) + 0.5;
        var fx = dx - dz * cw, fz = dz + dx * cw, fl = Math.hypot(fx, fz);
        a.fx = fx / fl; a.fz = fz / fl;
      } else if (a.state === 'lift' || a.state === 'down') {
        var st = SK.LIFT[a.lift.type].style;
        if (st === 'gondola' || st === 'tram' || st === 'pod' || a.state === 'down') { a.vis = false; continue; }
        Wd.liftSeat(a.lift, a.s, _p);
        a.x = _p.x; a.y = _p.y; a.z = _p.z; a.fx = a.lift.geom.ux; a.fz = a.lift.geom.uz;
      } else if (a.state === 'queue') {
        if (a.q > 54) { a.vis = false; continue; }
        var g = a.lift.geom, row = (a.q / 5) | 0, col = a.q % 5 - 2;
        a.x = a.lift.a.x - g.ux * (24 + row * gap) - g.uz * col * gap;
        a.z = a.lift.a.z - g.uz * (24 + row * gap) + g.ux * col * gap;
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
  Sim.queueTime = function (l) {       // minutes of waiting, for display
    if (!G.season) return 0;
    var thr = SK.LIFT[l.type].pph * (Sim._boost || 1) / (60 * G.season.scale);
    return l.queue.length / thr;
  };
})(window.SK);
