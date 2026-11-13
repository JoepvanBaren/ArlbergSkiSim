// Boot and main loop
(function (SK) {
  'use strict';
  var T = SK.T, Wd = SK.World, Sim = SK.Sim, B = SK.Build, UI = SK.UI;
  var last = 0, NONE = [];

  function syncWorld() {
    Object.keys(Wd.liftVis).forEach(function (id) { Wd.removeLift(id); });
    SK.G.lifts.forEach(function (l) { Wd.addLift(l); });
    Wd.setVillageLevel(SK.G.villageLevel);
    Wd.redrawPistes(); Wd.rebuildHuts(); Wd.rebuildTrees();
  }
  function enterSummer() {
    B.sel = null;
    B.setTool('inspect');
    UI.applyLook();
    UI.refreshAll();
  }
  SK.startNew = function () { SK.started = true; B.liftType = 'tbar'; Sim.newGame(); syncWorld(); enterSummer(); Sim.save(); };
  SK.continueGame = function () { if (!Sim.load()) { SK.startNew(); return; } SK.started = true; B.liftType = 'tbar'; syncWorld(); enterSummer(); };
  SK.openSeason = function () {
    B.setTool('inspect');
    UI.view.snow = false;
    Sim.speed = 1; Sim.paused = false;
    Sim.openSeason();
    B.setTool('inspect');
    UI.refreshAll();
  };
  SK.nextYear = function () {
    var res = Sim.nextYear();
    enterSummer();
    UI.showYearNews(res);
  };

  function loop(t) {
    var dt = Math.min(0.1, (t - last) / 1000 || 0.016);
    last = t;
    Sim.update(dt);
    if (SK.G.phase === 'winter') Sim.present(); else Wd.drawAgents(NONE);
    Wd.frame(dt);
    UI.tick(dt);
    requestAnimationFrame(loop);
  }

  window.addEventListener('load', function () {
    setTimeout(function () {
      T.init(); Wd.init(); B.init(); UI.init();
      Sim.newGame(); syncWorld(); enterSummer();
      document.getElementById('loading').style.display = 'none';
      UI.showIntro();
      requestAnimationFrame(loop);
    }, 30);
  });
})(window.SK);
