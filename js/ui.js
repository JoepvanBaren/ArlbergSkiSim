// UI: HUD, tool tray, side panel, reports
(function (SK) {
  'use strict';
  var Sim = SK.Sim, B = SK.Build, Wd = SK.World, CFG = SK.CFG, T = SK.T;
  var UI = SK.UI = { tab: 'goals', view: { snow: false, contour: false, slope: false, top: false } };
  var $ = function (id) { return document.getElementById(id); };
  var M = SK.fmtMoney, I = SK.fmtInt;
  function esc(s) { return String(s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }

  // ------------------------------------------------------------------ icons
  var ICON = {
    inspect: '<path d="M5 3l14 8-6 2-2 6z"/>',
    lift: '<path d="M2 6l20-3"/><path d="M12 4.5V9"/><rect x="7" y="9" width="10" height="9" rx="2.5"/><path d="M7 13h10"/>',
    piste: '<path d="M6 3c8 3-6 7 2 10s8 5 10 8"/><path d="M3 3h6"/>',
    hut: '<path d="M3 12l9-8 9 8"/><path d="M5.5 10.5V20h13v-9.5"/><path d="M10 20v-5h4v5"/>',
    demolish: '<path d="M4 7h16"/><path d="M9 7V4h6v3"/><path d="M6 7l1 13h10l1-13"/><path d="M10 11v6M14 11v6"/>',
  };
  function svg(inner) { return '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">' + inner + '</svg>'; }
  function liftIcon(ty) {
    var c = '#' + ('000000' + ty.color.toString(16)).slice(-6), s = '', rope = '<path d="M4 14 L116 4" stroke="#27313c" stroke-width="1.6"/>';
    if (ty.twin || ty.big) rope += '<path d="M4 17 L116 7" stroke="#27313c" stroke-width="1.2"/>';
    if (ty.style === 'surface') {
      s = rope + '<path d="M60 9v20M52 29h16" stroke="#27313c" stroke-width="2.4"/><path d="M0 42 L120 32" stroke="#b9c4ce" stroke-width="2"/>';
    } else if (ty.style === 'chair') {
      var w = 10 + ty.seats * 4.5;
      s = rope + '<path d="M60 9v14" stroke="#27313c" stroke-width="2"/>' +
        (ty.bubble ? '<path d="M' + (60 - w / 2) + ' 30 q' + (w / 2) + ' -16 ' + w + ' 0" fill="' + c + '" opacity="0.55"/>' : '') +
        '<rect x="' + (60 - w / 2) + '" y="23" width="' + w + '" height="9" rx="2" fill="' + c + '"/><rect x="' + (60 - w / 2) + '" y="31" width="' + w + '" height="3.5" rx="1.5" fill="#27313c"/>';
    } else if (ty.style === 'gondola') {
      var gw = ty.big ? 40 : ty.twin ? 34 : ty.seats >= 8 ? 26 : 20, gh = ty.big ? 24 : 20;
      s = rope + '<path d="M60 9v7" stroke="#27313c" stroke-width="2.4"/><rect x="' + (60 - gw / 2) + '" y="16" width="' + gw + '" height="' + gh + '" rx="5" fill="' + c + '"/>' +
        '<rect x="' + (60 - gw / 2 + 3) + '" y="20" width="' + (gw - 6) + '" height="8" rx="2" fill="#1d2731"/>';
    } else if (ty.style === 'tram') {
      s = rope + '<path d="M54 10l6 8 6-8" stroke="#27313c" stroke-width="2" fill="none"/><rect x="42" y="18" width="36" height="22" rx="3" fill="' + c + '"/><rect x="45" y="22" width="30" height="8" rx="1.5" fill="#1d2731"/>';
    } else {
      s = '<path d="M4 30 L116 20" stroke="' + c + '" stroke-width="3"/><rect x="42" y="8" width="36" height="16" rx="8" fill="#f4f7f9" stroke="#27313c" stroke-width="1.4" transform="rotate(-5 60 16)"/><rect x="48" y="11" width="24" height="6" rx="3" fill="#10343c" transform="rotate(-5 60 16)"/>';
    }
    return '<svg viewBox="0 0 120 44">' + s + '</svg>';
  }

  // ------------------------------------------------------------------ init
  UI.init = function () {
    var tools = [['inspect', 'Inspect'], ['lift', 'Lift'], ['piste', 'Piste'], ['hut', 'Hut'], ['demolish', 'Remove']];
    $('tools').innerHTML = tools.map(function (t, i) {
      return '<button data-tool="' + t[0] + '" class="' + (t[0] === 'inspect' ? 'always' : '') + '" title="' + t[1] + ' (' + (i + 1) + ')">' + svg(ICON[t[0]]) + t[1] + '</button>';
    }).join('');
    $('tools').addEventListener('click', function (e) { var b = e.target.closest('button'); if (b) B.setTool(b.dataset.tool); });
    var tabs = [['goals', 'Goals'], ['money', 'Money'], ['market', 'Market'], ['tech', 'Tech'], ['resort', 'Resort']];
    $('tabs').innerHTML = tabs.map(function (t) { return '<button data-tab="' + t[0] + '">' + t[1] + '</button>'; }).join('');
    $('tabs').addEventListener('click', function (e) { var b = e.target.closest('button'); if (b) { UI.tab = b.dataset.tab; UI.renderSide(); } });
    $('views').innerHTML = '<button data-v="snow">Snow preview</button><button data-v="contour">Contours</button><button data-v="slope">Slope map</button><button data-v="top">Piste map</button>';
    $('views').addEventListener('click', function (e) {
      var b = e.target.closest('button'); if (!b) return;
      var k = b.dataset.v; UI.view[k] = !UI.view[k];
      if (k === 'top') { Wd.camGoal.pitch = UI.view.top ? 1.5 : 0.66; if (UI.view.top) Wd.camGoal.yaw = 0; }
      UI.applyLook(); B.refreshView(); UI.refreshViews();
    });
    $('sidebody').addEventListener('click', onAct);
    $('plan').addEventListener('click', onAct);
    $('controls').addEventListener('click', onAct);
    $('tray').addEventListener('click', function (e) {
      var c = e.target.closest('.lcard'); if (!c || c.classList.contains('locked')) return;
      B.liftType = c.dataset.id; B.start = null; B.plan = null; B.redraw(); UI.refreshTools(); UI.refreshPlan();
    });
    $('sidebody').addEventListener('input', function (e) {
      if (e.target.id === 'price') { SK.G.price = +e.target.value; var m = Sim.metrics(), mk = Sim.market(m); $('pricev').textContent = '€' + SK.G.price; $('pricehint').innerHTML = priceHint(mk); }
    });
    $('sidebody').addEventListener('change', function (e) { if (e.target.id === 'price') UI.renderSide(); });
  };

  function priceHint(mk) {
    var G = SK.G, ratio = G.price / mk.fair;
    var txt = ratio < 0.8 ? 'A bargain. Guests love it, but you leave money on the table.' : ratio < 1.1 ? 'Guests find this fair.' : ratio < 1.4 ? 'Pricey. Some guests go elsewhere.' : 'Guests feel fleeced and stay away.';
    return 'Guests consider about <b>€' + Math.round(mk.fair) + '</b> fair for your resort. ' + txt;
  }

  function onAct(e) {
    var b = e.target.closest('[data-act]'); if (!b) return;
    var G = SK.G, act = b.dataset.act, err = null, d = b.dataset;
    if (act === 'fly') { Wd.flyTo(+d.x, +d.z, Math.min(Wd.camGoal.dist, 3200)); return; }
    if (act === 'open') { UI.confirmOpen(); return; }
    if (act === 'speed') { Sim.paused = d.v === '0'; if (!Sim.paused) Sim.speed = +d.v; UI.refreshControls(); return; }
    if (act === 'skip') { Sim.paused = false; Sim.speed = 40; UI.refreshControls(); return; }
    if (act === 'loan-take') err = Sim.takeLoan(+d.v);
    else if (act === 'loan-repay') err = Sim.repayLoan(+d.v);
    else if (act === 'village') err = Sim.upgradeVillage();
    else if (act === 'campaign') { err = Sim.runCampaign(SK.CAMPAIGNS.filter(function (c) { return c.id === d.id; })[0]); if (!err) UI.toast('Campaign launched. Awareness is now ' + Math.round(G.awareness * 100) + '%.', 'good'); }
    else if (act === 'tech') { err = Sim.buyTech(SK.TECHMAP[d.id]); if (!err) UI.toast(SK.TECHMAP[d.id].name + ' acquired.', 'good'); }
    else if (act === 'select') {
      var list = d.kind === 'lift' ? G.lifts : G.pistes, o = list.filter(function (x) { return x.id === +d.id; })[0];
      if (o) {
        if (B.tool !== 'inspect') B.setTool('inspect');
        B.sel = { kind: d.kind, obj: o }; B.redraw(); UI.refreshSelection();
        var p = d.kind === 'lift' ? { x: (o.a.x + o.b.x) / 2, z: (o.a.z + o.b.z) / 2 } : o.pts[(o.pts.length / 2) | 0];
        Wd.flyTo(p.x, p.z, Math.min(Wd.camGoal.dist, 4200));
      }
      return;
    }
    else if (act === 'demolish') { if (B.sel) { var rf = Sim.remove(B.sel.kind, B.sel.obj); UI.toast('Removed' + (rf ? '. Scrap value ' + M(rf) + '.' : '.')); B.sel = null; B.redraw(); } }
    else if (act === 'snow') { if (B.sel) err = Sim.toggleSnowmaking(B.sel.obj); }
    else if (act === 'upgrade') { if (B.sel) { err = Sim.upgradeLift(B.sel.obj, d.type); if (!err) UI.toast(B.sel.obj.name + ' rebuilt as ' + SK.LIFT[d.type].name + '.', 'good'); B.redraw(); } }
    else if (act === 'finish') { B.finishPiste(); return; }
    else if (act === 'cancel') { B.cancel(); return; }
    else if (act === 'newgame') { UI.modal('<div class="eyebrow">Start over</div><h1>Abandon this resort?</h1><p>Your current save will be replaced.</p>', [{ label: 'Keep playing', cls: 'ghost' }, { label: 'New game', fn: function () { SK.startNew(); } }]); return; }
    if (err) UI.toast(err, 'warn');
    UI.refreshAll();
  }

  // ------------------------------------------------------------------ top bar
  UI.refreshStats = function () {
    var G = SK.G; if (!G) return;
    var S = G.season, m = Sim.metrics(), h = '';
    function st(l, v, cls) { h += '<div class="stat ' + (cls || '') + '"><label>' + l + '</label><span>' + v + '</span></div>'; }
    st('Money', M(G.money), G.money < 0 ? 'neg' : '');
    if (G.phase === 'winter') st('Guests today', I(S.visitorsToday));
    else st('Guest capacity', I(Sim.capacity()));
    st('Reputation', Math.round(G.reputation) + ' <small>/100</small>');
    st('Pistes', (G.phase === 'winter' ? m.openKm.toFixed(1) + ' <small>/ ' + m.km.toFixed(1) + ' km open</small>' : m.km.toFixed(1) + ' <small>km</small>'));
    if (G.phase === 'winter') {
      var wx = { sun: 'Sunny', cloud: 'Cloudy', snow: 'Snowing', storm: 'Storm' }[S.weather] + (S.powder ? ' · powder!' : '');
      st('Snow from', I(Math.round(S.snowline / 10) * 10) + ' m <small>' + wx + '</small>');
    } else st('Build time left', G.crewLeft + ' <small>/ ' + Sim.crewMax() + ' crew-weeks</small>');
    $('stats').innerHTML = h;
    var date;
    if (G.phase === 'winter') date = Sim.dateOf(Math.max(0, S.day)) + ' · Winter ' + G.year + '/' + String(G.year + 1).slice(2);
    else if (G.phase === 'report') date = 'Spring ' + (G.year + 1);
    else date = 'Summer ' + G.year + ' · building season';
    $('date').textContent = date;
    var sb = $('seasonbar');
    sb.style.display = G.phase === 'winter' ? 'block' : 'none';
    if (G.phase === 'winter') sb.firstChild.style.width = (Math.max(0, S.day) / CFG.SEASON_DAYS * 100) + '%';
  };
  UI.refreshControls = function () {
    var G = SK.G, h = '';
    if (G.phase === 'summer') {
      h = '<button class="cta" data-act="open">Open winter ' + G.year + '/' + String(G.year + 1).slice(2) + ' ▸</button>';
    } else if (G.phase === 'winter') {
      var sp = Sim.paused ? 0 : Sim.speed;
      h = '<div class="seg">' + [[0, '❚❚'], [1, '1×'], [2, '2×'], [4, '4×']].map(function (s) {
        return '<button data-act="speed" data-v="' + s[0] + '" class="' + (sp === s[0] ? 'on' : '') + '">' + s[1] + '</button>';
      }).join('') + '</div><button class="cta ghost" data-act="skip">' + (Sim.speed === 40 && !Sim.paused ? 'Skipping…' : 'Skip to spring »') + '</button>';
    }
    $('controls').innerHTML = h;
    $('controls').style.display = h ? '' : 'none';
  };
  UI.refreshViews = function () {
    Array.prototype.forEach.call($('views').children, function (b) { b.classList.toggle('on', !!UI.view[b.dataset.v]); });
  };
  UI.applyLook = function () {
    var G = SK.G;
    if (G.phase === 'winter') return;
    if (UI.view.snow) Wd.setLook(SK.interp(SK.SNOWLINE, G.year), 'sun', true, Sim.smReach());
    else Wd.setLook(2650, 'summer', false, 0);
  };

  // ------------------------------------------------------------------ tools & tray
  UI.refreshTools = function () {
    var G = SK.G;
    Array.prototype.forEach.call($('tools').children, function (b) { b.classList.toggle('on', b.dataset.tool === B.tool); });
    $('tools').classList.toggle('disabled', G.phase !== 'summer');
    document.body.classList.toggle('tooling', B.tool !== 'inspect');
    var tray = $('tray');
    if (!Sim.unlocked(SK.LIFT[B.liftType])) B.liftType = 'tbar';
    if (B.tool === 'lift') {
      var shown = 0;
      tray.innerHTML = SK.LIFTS.map(function (ty) {
        var un = Sim.unlocked(ty);
        if (!un && shown >= 2) return '';
        if (!un) shown++;
        return '<button class="lcard ' + (un ? '' : 'locked ') + (B.liftType === ty.id ? 'on' : '') + '" data-id="' + ty.id + '">' +
          (un ? '' : '<span class="yr">from ' + ty.year + '</span>') + liftIcon(ty) +
          '<div class="n">' + ty.name + '</div><div class="m">' + I(ty.pph) + ' guests/h · ' + (ty.speed / 20).toFixed(1) + ' m/s</div>' +
          '<div class="p">' + M(ty.base) + ' + €' + ty.perM + '/m</div></button>';
      }).join('');
      tray.style.display = 'flex';
    } else tray.style.display = 'none';
    UI.refreshPlan();
  };

  UI.refreshPlan = function () {
    var el = $('plan'), G = SK.G, h = '', pl = B.plan;
    if (B.tool === 'lift') {
      var ty = SK.LIFT[B.liftType];
      if (!B.start) h = '<h4>' + ty.name + '</h4><div class="hint">' + ty.blurb + ' <b>Click the bottom station</b>, then the top. Your first lift should start inside a yellow village circle.</div>';
      else if (pl && pl.kind === 'lift') {
        var g = pl.geom;
        h = '<h4>' + ty.name + '</h4><div class="row"><span>Length <b>' + I(g.slopeLen) + ' m</b></span><span>Vertical <b>' + (g.vertical >= 0 ? '+' : '') + I(g.vertical) + ' m</b></span>' +
          '<span>Towers <b>' + g.towers.length + '</b></span><span>Ride <b>' + g.rideMin.toFixed(1) + ' min</b></span><span>Cost <b>' + M(g.cost) + '</b></span><span>Build <b>' + g.weeks + ' wk</b></span></div>' +
          (pl.error ? '<div class="err">' + pl.error + '</div>' : '<div class="ok">Click to build the top station here.</div>');
      } else h = '<h4>' + ty.name + '</h4><div class="hint">Now click where the top station goes. Right-click to start over.</div>';
    } else if (B.tool === 'piste') {
      if (!B.pts.length) h = '<h4>Draw a piste</h4><div class="hint"><b>Click where it starts</b> (a lift top station), then click your way downhill. The mountain decides the colour: <span class="dot" style="background:#2b7fd6"></span>up to 25% <span class="dot" style="background:#dc3b34;margin-left:8px"></span>up to 40% <span class="dot" style="background:#22262b;margin-left:8px"></span>steeper. Traverse to keep it gentle.</div>';
      else if (pl && pl.kind === 'piste') {
        var st = pl.st, df = SK.DIFF[st.diff];
        h = '<h4><span class="dot" style="background:' + df.css + '"></span>' + df.name + ' piste</h4><div class="row"><span>Length <b>' + I(st.len) + ' m</b></span><span>Drop <b>' + I(st.drop) + ' m</b></span>' +
          '<span>Steepest <b>' + Math.round(st.maxGrad * 100) + '%</b></span><span>Cost <b>' + M(pl.cost) + '</b></span><span>Build <b>' + pl.weeks + ' wk</b></span></div>' +
          (pl.error ? '<div class="err">' + pl.error + '</div>' : '<div class="ok">Click to add a point. Click a station, piste or village - or double-click - to finish.</div>') +
          '<div class="acts"><button class="btn dark" data-act="finish"' + (B.pts.length < 2 ? ' disabled' : '') + '>Build piste (Enter)</button><button class="btn" data-act="cancel">Cancel (Esc)</button></div>';
      } else h = '<h4>Draw a piste</h4><div class="hint">Click the next point downhill.</div>';
    } else if (B.tool === 'hut') {
      h = '<h4>Mountain hut</h4>' + (pl && pl.kind === 'hut' ? '<div class="row"><span>Cost <b>' + M(pl.cost) + '</b></span><span>Build <b>3 wk</b></span><span>Earns about <b>€3.40</b> per guest it can serve (700 a day)</span></div>' +
        (pl.error ? '<div class="err">' + pl.error + '</div>' : '<div class="ok">Click to build.</div>') : '<div class="hint">Place it on flat ground next to a piste. Guests are a little happier, and hungrier.</div>');
    } else if (B.tool === 'demolish') {
      h = '<h4>Remove</h4><div class="hint">Click a lift, piste or hut to tear it down. Lifts return 15% scrap value.</div>';
    } else if (B.sel) h = selectionHtml();
    el.innerHTML = h; el.style.display = h ? 'block' : 'none';
  };
  UI.refreshSelection = UI.refreshPlan;

  function selectionHtml() {
    var G = SK.G, o = B.sel.obj, h = '', summer = G.phase === 'summer';
    if (B.sel.kind === 'lift') {
      var ty = SK.LIFT[o.type], g = o.geom, age = G.year - o.built;
      h = '<h4>' + esc(o.name) + ' <span class="tag">' + ty.name + '</span>' + (o.open === false && G.phase === 'winter' ? ' <span class="tag bad">closed</span>' : '') + '</h4>' +
        '<div class="row"><span>Length <b>' + I(g.slopeLen) + ' m</b></span><span>Vertical <b>' + I(g.vertical) + ' m</b></span><span>Capacity <b>' + I(ty.pph) + '/h</b></span>' +
        '<span>Built <b>' + o.built + '</b>' + (age > 28 ? ' <span class="tag warn">ageing</span>' : '') + '</span>' +
        (G.phase === 'winter' ? '<span>Queue <b>' + Sim.queueTime(o).toFixed(0) + ' min</b></span><span>Carried <b>' + I(o.carried) + '</b></span>' : '') + '</div>';
      if (summer) {
        var ups = SK.LIFTS.filter(function (t) { return Sim.unlocked(t) && t.pph > ty.pph && t.style !== 'surface'; }).slice(-4);
        h += '<div class="acts">' + ups.map(function (t) {
          var u = Sim.upgradeCost(o, t.id);
          return '<button class="btn" data-act="upgrade" data-type="' + t.id + '"' + (u.error ? ' disabled title="' + esc(u.error) + '"' : '') + '>→ ' + t.name + (u.error ? '' : ' · ' + M(u.cost)) + '</button>';
        }).join('') + '<button class="btn red" data-act="demolish">Demolish</button></div>';
      }
    } else if (B.sel.kind === 'piste') {
      var df = SK.DIFF[o.diff];
      h = '<h4><span class="dot" style="background:' + df.css + '"></span>' + esc(o.name) + ' <span class="tag">' + df.name + '</span>' +
        (G.phase === 'winter' ? (o.open ? ' <span class="tag good">open</span>' : ' <span class="tag bad">no snow</span>') : '') + (o.snowmaking ? ' <span class="tag good">snowmaking</span>' : '') + '</h4>' +
        '<div class="row"><span>Length <b>' + I(o.len) + ' m</b></span><span>Drop <b>' + I(o.drop) + ' m</b></span><span>Steepest <b>' + Math.round(o.maxGrad * 100) + '%</b></span><span>From <b>' + I(o.high) + ' m</b> to <b>' + I(o.low) + ' m</b></span></div>';
      if (summer) {
        h += '<div class="acts">';
        if (Sim.smReach()) h += '<button class="btn" data-act="snow">' + (o.snowmaking ? 'Remove snowmaking' : 'Install snowmaking · ' + M(Sim.snowmakingCost(o))) + '</button>';
        else h += '<button class="btn" disabled>Snowmaking: not invented yet (1975)</button>';
        h += '<button class="btn red" data-act="demolish">Remove piste</button></div>';
      }
    } else {
      h = '<h4>Mountain hut</h4><div class="row"><span>Altitude <b>' + I(o.y) + ' m</b></span><span>Built <b>' + o.built + '</b></span></div>' + (summer ? '<div class="acts"><button class="btn red" data-act="demolish">Demolish</button></div>' : '');
    }
    return h;
  }

  // ------------------------------------------------------------------ side panel
  UI.renderSide = function () {
    var G = SK.G; if (!G) return;
    Array.prototype.forEach.call($('tabs').children, function (b) { b.classList.toggle('on', b.dataset.tab === UI.tab); });
    var el = $('sidebody'), keep = el.scrollTop;
    el.innerHTML = ({ goals: tabGoals, money: tabMoney, market: tabMarket, tech: tabTech, resort: tabResort })[UI.tab]();
    el.scrollTop = keep;
  };
  function kv(k, v, cls) { return '<div class="kv"><span>' + k + '</span><b class="' + (cls || '') + '">' + v + '</b></div>'; }

  function tabGoals() {
    var G = SK.G, goal = Sim.currentGoal(), h = '';
    if (goal) {
      var left = goal.by - G.year + 1, pr = Sim.goalProgress(goal);
      if (goal.by >= 1946 && G.year <= 1938) left -= 7;
      h += '<div class="goalcard"><div class="dl">Goal · by spring ' + (goal.by + 1) + ' · ' + left + ' winter' + (left === 1 ? '' : 's') + ' left</div><h3>' + goal.title + '</h3><p>' + goal.text + '</p>';
      pr.forEach(function (p) {
        var f = Math.min(1, p.want ? p.have / p.want : 0);
        h += '<div class="prog"><div class="l"><span>' + p.label + '</span><b>' + p.text + '</b></div><div class="bar"><i class="' + (p.ok ? 'ok' : '') + '" style="width:' + (f * 100).toFixed(0) + '%"></i></div></div>';
      });
      if (goal.reward) h += '<p style="margin:10px 0 0">Reward: <b style="color:var(--ink)">' + M(goal.reward) + '</b> development grant.</p>';
      h += '</div>';
    } else h += '<div class="goalcard"><h3>All chapters complete</h3><p>The Arlberg is yours. Keep building for as long as the snow lasts.</p></div>';
    var issues = G.phase === 'summer' ? Sim.networkIssues() : [];
    if (issues.length) {
      h += '<h5>Before the snow comes</h5>';
      issues.slice(0, 6).forEach(function (is) { h += '<div class="warnbox" ' + (is.x !== undefined ? 'data-act="fly" data-x="' + is.x + '" data-z="' + is.z + '"' : '') + '>' + esc(is.t) + '</div>'; });
    }
    if (!G.lifts.length) {
      h += '<h5>Getting started</h5><p><b>1.</b> Pick <b>Lift</b> on the left and build a T-bar from St. Anton (yellow circle) up the hillside.</p><p><b>2.</b> Pick <b>Piste</b>, click the top station and draw back down into the village.</p><p><b>3.</b> Check <b>Market</b> for a poster campaign, then open the winter.</p>';
    }
    var done = SK.GOALS.filter(function (g) { return G.goals[g.id]; });
    if (done.length) {
      h += '<h5>Chapters</h5>';
      done.forEach(function (g) { h += '<div class="item"><div class="tx"><b>' + g.title + '</b><small>by ' + (g.by + 1) + '</small></div><span class="tag ' + (G.goals[g.id] === 'done' ? 'good">achieved' : 'bad">missed') + '</span></div>'; });
    }
    h += '<h5>Controls</h5><p>Drag to move · right-drag to rotate · wheel to zoom · WASD / QE · Esc cancels · right-click undoes a point.</p><button class="btn" data-act="newgame">New game…</button>';
    return h;
  }

  function tabMoney() {
    var G = SK.G, L = G.ledger, m = Sim.metrics(), mk = Sim.market(m), h = '';
    h += '<div class="pricebox"><div style="display:flex;justify-content:space-between;align-items:baseline"><span>Day ticket</span><span class="big" id="pricev">€' + G.price + '</span></div>' +
      '<input type="range" id="price" min="3" max="120" step="1" value="' + G.price + '"><small id="pricehint" style="color:var(--ink2)">' + priceHint(mk) + '</small></div>';
    h += '<h5>' + (G.phase === 'winter' ? 'This winter so far' : 'This year so far') + '</h5>';
    var inc = L.tickets + L.huts + L.grants, out = L.ops + L.grooming + L.snowmaking + L.marketing + L.construction + L.interest + L.upkeep + L.invest;
    h += kv('Lift tickets', M(L.tickets), 'pos');
    if (L.huts) h += kv('Mountain huts', M(L.huts), 'pos');
    if (L.grants) h += kv('Grants & rewards', M(L.grants), 'pos');
    if (L.construction) h += kv('Construction', M(-L.construction), 'neg');
    if (L.invest) h += kv('Technology & village', M(-L.invest), 'neg');
    if (L.marketing) h += kv('Marketing', M(-L.marketing), 'neg');
    if (L.ops) h += kv('Lift operations & staff', M(-L.ops), 'neg');
    if (L.grooming) h += kv('Grooming', M(-L.grooming), 'neg');
    if (L.snowmaking) h += kv('Snowmaking', M(-L.snowmaking), 'neg');
    h += kv('Balance', M(inc - out), inc - out < 0 ? 'neg' : 'pos');
    var maxL = Sim.maxLoan(), stepL = Math.max(50000, Math.round(maxL / 80000) * 10000);
    h += '<h5>Bank</h5>' + kv('Loan', M(G.loan) + ' <small>of ' + M(maxL) + '</small>') + kv('Interest (7% a year)', M(G.loan * 0.07)) +
      '<div style="display:flex;gap:6px;margin-top:8px"><button class="btn" data-act="loan-take" data-v="' + stepL + '">Borrow ' + M(stepL) + '</button><button class="btn" data-act="loan-repay" data-v="' + stepL + '">Repay ' + M(Math.min(stepL, G.loan)) + '</button></div>';
    var nx = SK.VILLAGE[G.villageLevel + 1];
    h += '<h5>Valley lodging</h5><p>Guests need beds. ' + I(Sim.beds()) + ' beds' + (G.daytrip ? ' plus ' + I(G.daytrip) + ' day visitors' : '') + ' cap you at about <b style="color:var(--ink)">' + I(Sim.capacity()) + '</b> guests a day.</p>';
    if (nx) h += '<button class="btn" data-act="village">Support new guesthouses → ' + I(nx.beds) + ' beds · ' + M(nx.cost) + '</button>';
    if (G.history.length) {
      h += '<h5>Past winters</h5>';
      G.history.slice(-8).reverse().forEach(function (r) {
        h += '<div class="kv"><span>' + r.year + '/' + String(r.year + 1).slice(2) + ' · ' + I(r.visitors) + ' guests/day</span><b class="' + (r.profit < 0 ? 'neg' : 'pos') + '">' + M(r.profit) + '</b></div>';
      });
    }
    return h;
  }

  function tabMarket() {
    var G = SK.G, m = Sim.metrics(), mk = Sim.market(m), h = '';
    h += '<p>About <b style="color:var(--ink)">' + I(mk.size) + '</b> skiers a day are choosing between the resorts of the region. Your share depends on size, lifts, snow, reputation, price - and on whether people have heard of you.</p>';
    var rows = [{ name: 'Your resort', share: mk.share, me: true }].concat(mk.rivals).sort(function (a, b) { return b.share - a.share; });
    rows.forEach(function (r) {
      h += '<div class="share"><span class="nm" style="' + (r.me ? 'font-weight:750' : '') + '">' + r.name + '</span><div class="bar"><i style="width:' + Math.min(100, r.share * 100 / 0.6).toFixed(0) + '%;background:' + (r.me ? 'var(--accent)' : '#9aa7b4') + '"></i></div><span class="pc">' + (r.share * 100).toFixed(1) + '%</span></div>';
    });
    h += '<h5>Awareness</h5><div class="prog"><div class="l"><span>How many skiers know your resort</span><b>' + Math.round(G.awareness * 100) + '%</b></div><div class="bar"><i style="width:' + (G.awareness * 100).toFixed(0) + '%;background:var(--accent)"></i></div></div><p style="margin-top:6px">Fades by about a fifth every year unless you keep advertising.</p>';
    h += '<h5>Campaigns · once a year each</h5>';
    SK.CAMPAIGNS.forEach(function (c) {
      var un = Sim.unlocked(c), used = G.campaignsUsed[c.id];
      if (!un && c.year > G.year + 15) return;
      h += '<div class="item ' + (un ? '' : 'dim') + '"><div class="tx"><b>' + c.name + '</b><small>' + c.desc + '</small></div>' +
        (un ? (used ? '<span class="tag good">running</span>' : '<button class="btn" data-act="campaign" data-id="' + c.id + '">' + M(Sim.campaignCost(c)) + '</button>') : '<span class="tag">' + c.year + '</span>') + '</div>';
    });
    return h;
  }

  function tabTech() {
    var G = SK.G, h = '<p>Technology arrives with the years. What is invented can be bought; what is not yet invented is only a rumour.</p><h5>Upgrades</h5>';
    SK.TECH.forEach(function (t) {
      var un = Sim.unlocked(t), own = G.tech[t.id];
      if (!un && t.year > G.year + 20) return;
      h += '<div class="item ' + (un ? '' : 'dim') + '"><div class="tx"><b>' + t.name + ' <span class="tag">' + t.group + '</span></b><small>' + t.desc + '</small></div>' +
        (own ? '<span class="tag good">owned</span>' : un ? '<button class="btn" data-act="tech" data-id="' + t.id + '">' + M(t.cost) + '</button>' : '<span class="tag">' + t.year + '</span>') + '</div>';
    });
    h += '<h5>Lift timeline</h5>';
    SK.LIFTS.forEach(function (ty) {
      var un = Sim.unlocked(ty);
      h += '<div class="item ' + (un ? '' : 'dim') + '"><div style="width:64px">' + liftIcon(ty) + '</div><div class="tx"><b>' + ty.name + '</b><small>' + I(ty.pph) + ' guests/h · comfort ' + Math.round(ty.comfort * 100) + (ty.wind ? ' · storm-proof' : '') + '</small></div><span class="tag ' + (un ? 'good' : '') + '">' + ty.year + '</span></div>';
    });
    return h;
  }

  function tabResort() {
    var G = SK.G, m = Sim.metrics(), h = '';
    h += kv('Pistes', m.km.toFixed(1) + ' km') +
      kv('<span class="dot" style="background:#2b7fd6"></span>Blue / <span class="dot" style="background:#dc3b34"></span>Red / <span class="dot" style="background:#22262b"></span>Black', m.byDiff.blue.toFixed(1) + ' / ' + m.byDiff.red.toFixed(1) + ' / ' + m.byDiff.black.toFixed(1) + ' km') +
      kv('Lift capacity', I(m.pph) + ' guests/h') + kv('Highest station', m.top ? I(m.top) + ' m' : '–') +
      kv('Snowmaking', m.smKm.toFixed(1) + ' km') + kv('Guests on the mountain', G.season ? I(Sim.agents.length * G.season.scale) : '–');
    h += '<h5>Lifts (' + G.lifts.length + ')</h5>';
    if (!G.lifts.length) h += '<p>No lifts yet.</p>';
    G.lifts.forEach(function (l) {
      var ty = SK.LIFT[l.type], q = G.phase === 'winter' ? Sim.queueTime(l) : 0;
      h += '<div class="item click" data-act="select" data-kind="lift" data-id="' + l.id + '"><div style="width:46px">' + liftIcon(ty) + '</div><div class="tx"><b>' + esc(l.name) + '</b><small>' + ty.name + ' · ' + l.built + '</small></div>' +
        (G.phase === 'winter' ? (l.open ? '<span class="tag ' + (q > 12 ? 'bad' : q > 5 ? 'warn' : 'good') + '">' + q.toFixed(0) + ' min queue</span>' : '<span class="tag bad">closed</span>') : '<span class="tag">' + I(ty.pph) + '/h</span>') + '</div>';
    });
    h += '<h5>Pistes (' + G.pistes.length + ')</h5>';
    if (!G.pistes.length) h += '<p>No pistes yet.</p>';
    G.pistes.forEach(function (p) {
      h += '<div class="item click" data-act="select" data-kind="piste" data-id="' + p.id + '"><div class="tx"><b><span class="dot" style="background:' + SK.DIFF[p.diff].css + '"></span>' + esc(p.name) + '</b><small>' + (p.len / 1000).toFixed(2) + ' km · ' + I(p.high) + ' → ' + I(p.low) + ' m</small></div>' +
        (p.snowmaking ? '<span class="tag good">snow</span> ' : '') + (G.phase === 'winter' ? (p.open ? '<span class="tag good">open</span>' : '<span class="tag bad">closed</span>') : '') + '</div>';
    });
    return h;
  }

  // ------------------------------------------------------------------ toasts & modals
  UI.toast = function (msg, kind) {
    var el = document.createElement('div');
    el.className = 'toast ' + (kind || '');
    el.textContent = msg;
    var host = $('toasts');
    host.appendChild(el);
    while (host.children.length > 4) host.removeChild(host.firstChild);
    setTimeout(function () { if (el.parentNode) el.parentNode.removeChild(el); }, 5200);
  };
  UI.modal = function (html, buttons) {
    var foot = '<div class="foot">' + buttons.map(function (b, i) { return '<button class="cta ' + (b.cls || '') + '" data-i="' + i + '">' + b.label + '</button>'; }).join('') + '</div>';
    $('sheet').innerHTML = html + foot;
    $('modal').classList.remove('hidden');
    $('sheet').querySelectorAll('.foot button').forEach(function (btn) {
      btn.addEventListener('click', function () { $('modal').classList.add('hidden'); var b = buttons[+btn.dataset.i]; if (b.fn) b.fn(); });
    });
  };

  UI.showIntro = function () {
    var btns = [{ label: 'New game', fn: function () { SK.startNew(); } }];
    if (Sim.hasSave()) btns = [{ label: 'New game', cls: 'ghost', fn: function () { SK.startNew(); } }, { label: 'Continue', fn: function () { SK.continueGame(); } }];
    UI.modal('<div class="eyebrow">St. Anton am Arlberg · 1937</div><h1>Build the cradle of alpine skiing.</h1>' +
      '<p>You are general manager of a brand-new ski resort on the real slopes above St. Anton - every ridge and gully comes from elevation data. Start with one tow and a meadow, and take the mountain from wooden skis to the age of autonomous lifts.</p>' +
      '<div class="steps"><div><b>Summer · build</b>Place lifts and draw pistes. Money and crew-weeks are limited every year.</div>' +
      '<div><b>Winter · operate</b>Guests arrive, queue, ski and judge. Days fly by - set your price and watch.</div>' +
      '<div><b>Spring · take stock</b>Profit, reputation and market share decide what you can afford next.</div>' +
      '<div><b>Chapters · deadlines</b>Each goal has a year. New lift technology arrives with the decades.</div></div>' +
      '<p style="font-size:12.5px">Drag to move · right-drag to rotate · wheel to zoom.</p>', btns);
  };

  UI.confirmOpen = function () {
    var G = SK.G, issues = Sim.networkIssues();
    function go() { SK.openSeason(); }
    if (!G.lifts.length || !G.pistes.length) {
      UI.modal('<div class="eyebrow">Not ready</div><h1>Open with ' + (!G.lifts.length ? 'no lifts' : 'no pistes') + '?</h1><p>Without a lift from the village and a piste back down nobody will come this winter - but the year will pass all the same.</p>',
        [{ label: 'Keep building', cls: 'ghost' }, { label: 'Open anyway', fn: go }]);
    } else if (issues.length) {
      UI.modal('<div class="eyebrow">Check your network</div><h1>' + issues.length + ' loose end' + (issues.length > 1 ? 's' : '') + '</h1><ul>' + issues.slice(0, 5).map(function (i) { return '<li>' + esc(i.t) + '</li>'; }).join('') + '</ul><p>Guests who get stuck leave unhappy.</p>',
        [{ label: 'Keep building', cls: 'ghost' }, { label: 'Open anyway', fn: go }]);
    } else go();
  };

  function spark(days) {
    var w = 584, h = 74, n = days.length, max = 1, i, pts = '';
    for (i = 0; i < n; i++) max = Math.max(max, days[i].v);
    var colW = { sun: '#f6c945', cloud: '#b8c2cc', snow: '#8fc4f2', storm: '#55616e' }, strip = '';
    for (i = 0; i < n; i++) {
      var x = i / (n - 1) * w, y = h - 12 - days[i].v / max * (h - 22);
      pts += x.toFixed(1) + ',' + y.toFixed(1) + ' ';
      strip += '<rect x="' + (i / n * w).toFixed(1) + '" y="' + (h - 6) + '" width="' + (w / n + 0.5).toFixed(1) + '" height="6" fill="' + colW[days[i].w] + '"/>';
    }
    return '<svg class="spark" viewBox="0 0 ' + w + ' ' + h + '" preserveAspectRatio="none"><polygon points="0,' + (h - 12) + ' ' + pts + w + ',' + (h - 12) + '" fill="rgba(226,72,58,0.16)"/><polyline points="' + pts + '" fill="none" stroke="#e2483a" stroke-width="1.8"/>' + strip + '</svg>';
  }

  UI.showReport = function (rec, gres) {
    var G = SK.G, prev = G.history[G.history.length - 2], m = Sim.metrics(), tips = [];
    var worst = null;
    G.lifts.forEach(function (l) { var q = (l.qSum || 0) / CFG.SEASON_DAYS; if (!worst || q > worst.q) worst = { l: l, q: q }; });
    if (!rec.visitors) tips.push('Nobody came. You need a lift that starts in a village, and an open piste from its top.');
    if (worst && worst.q > 6) tips.push('Guests queued ' + worst.q.toFixed(0) + ' minutes on average at ' + worst.l.name + '. More capacity there - or a second way up - would help.');
    if (rec.stranded > 0) tips.push(I(rec.stranded * 1) + ' guest groups got stranded at dead ends and had to walk out.');
    if (m.km > 0 && m.byDiff.blue / m.km < 0.15) tips.push('Beginners found almost nothing to ski. A third of your guests want blue pistes.');
    if (m.km > 2 && m.byDiff.black + m.byDiff.red < 0.2 * m.km) tips.push('Good skiers were bored - add some red or black terrain.');
    if (rec.open < 0.8 && m.km > 0) tips.push('Only ' + Math.round(rec.open * 100) + '% of your pistes had snow on an average day. Build higher' + (G.year >= 1975 ? ' or install snowmaking.' : '.'));
    if (rec.peak >= Sim.capacity() * 0.98 && rec.visitors > 0) tips.push('The valley was fully booked on peak days. More beds (Money tab) would let more guests come.');
    var mk = Sim.market(m);
    if (G.price > mk.fair * 1.25) tips.push('Guests grumbled about the ticket price.'); else if (G.price < mk.fair * 0.7 && rec.visitors > 0) tips.push('Your tickets are cheap for what you offer - you could charge more.');
    if (G.awareness < 0.3) tips.push('Few people have heard of your resort. A campaign in the Market tab would change that.');
    if (rec.avgRating >= 75 && !tips.length) tips.push('Guests went home delighted. Word is spreading.');
    var dRep = prev ? rec.rep - prev.rep : rec.rep - 50;
    var h = '<div class="eyebrow">Spring ' + (rec.year + 1) + ' · season report</div><h1>Winter ' + rec.year + '/' + String(rec.year + 1).slice(2) + '</h1>';
    if (gres) h += '<div class="banner ' + (gres.ok ? 'good' : 'bad') + '">' + (gres.ok ? 'Goal achieved: ' + gres.goal.title + (gres.goal.reward ? ' — ' + M(gres.goal.reward) + ' grant received.' : '.') : 'Goal missed: ' + gres.goal.title + '. The valley is disappointed (reputation −4).') + '</div>';
    h += spark(rec.days);
    h += '<div class="grid"><div class="tile"><label>Guests / day</label><b>' + I(rec.visitors) + '</b><small>peak ' + I(rec.peak) + '</small></div>' +
      '<div class="tile"><label>Winter result</label><b style="color:' + (rec.profit < 0 ? 'var(--accent)' : 'var(--good)') + '">' + M(rec.profit) + '</b><small>income ' + M(rec.income) + '</small></div>' +
      '<div class="tile"><label>Reputation</label><b>' + Math.round(rec.rep) + '</b><small>' + (dRep >= 0 ? '+' : '') + dRep.toFixed(1) + ' · guests rated ' + Math.round(rec.avgRating) + '</small></div>' +
      '<div class="tile"><label>Market share</label><b>' + (rec.share * 100).toFixed(1) + '%</b><small>' + Math.round(rec.open * 100) + '% of pistes open</small></div></div>';
    if (tips.length) h += '<ul>' + tips.slice(0, 4).map(function (t) { return '<li>' + esc(t) + '</li>'; }).join('') + '</ul>';
    if (G.over) {
      h += '<div class="banner bad">The bank has lost patience. With debts beyond your credit line, the lift company is wound up.</div>';
      UI.modal(h, [{ label: 'Start a new resort', fn: function () { SK.startNew(); } }]);
      return;
    }
    UI.modal(h, [{ label: 'On to summer ' + (rec.year === 1938 ? 1946 : rec.year + 1) + ' ▸', fn: function () { SK.nextYear(); } }]);
    UI.refreshAll();
  };

  UI.showYearNews = function (res) {
    var G = SK.G, h = '';
    if (!res.event && !res.news.length) return;
    if (res.event) h += '<div class="eyebrow">' + G.year + '</div><h1>' + res.event.title + '</h1><p>' + res.event.text + '</p>';
    else h += '<div class="eyebrow">Summer ' + G.year + '</div><h1>News from the valley</h1>';
    if (res.news.length) h += '<ul>' + res.news.map(function (n) { return '<li>' + esc(n) + '</li>'; }).join('') + '</ul>';
    UI.modal(h, [{ label: 'To work', fn: null }]);
  };

  // ------------------------------------------------------------------ refresh
  UI.refreshAll = function () {
    UI.refreshStats(); UI.refreshControls(); UI.refreshTools(); UI.renderSide(); UI.refreshViews();
    if (SK.started && SK.G.phase === 'summer') Sim.save();          // autosave while building
  };
  var acc = 0, acc2 = 0;
  UI.tick = function (dt) {
    acc += dt; acc2 += dt;
    if (acc > 0.2) { acc = 0; UI.refreshStats(); }
    if (acc2 > 1 && SK.G && SK.G.phase === 'winter') {
      acc2 = 0;
      var ae = document.activeElement;
      if (!(ae && ae.id === 'price')) UI.renderSide();
      if (B.sel) UI.refreshSelection();
    }
  };
})(window.SK);
