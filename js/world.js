// World: three.js scene, camera rig (mouse + touch), villages from real map data, lifts / pistes / guests visuals
(function (SK) {
  'use strict';
  var T = SK.T, CFG = SK.CFG;
  var Wd = SK.World = {};
  var renderer, scene, camera, canvas, sun, amb, sky;
  var VS = 2.4;                       // vehicle exaggeration so things read from afar
  var OSM = window.OSM_DATA || { roads: [], rails: [], rivers: [], lakes: [], buildings: [], places: [], peaks: [], stations: [], passes: [] };

  // ---------------------------------------------------------------- geometry batching
  function Batch() { this.p = []; this.n = []; this.c = []; this.i = []; this.v = 0; }
  var FACES = [
    [1, 0, 0, [1, -1, -1], [1, 1, -1], [1, 1, 1], [1, -1, 1]],
    [-1, 0, 0, [-1, -1, -1], [-1, -1, 1], [-1, 1, 1], [-1, 1, -1]],
    [0, 1, 0, [-1, 1, -1], [-1, 1, 1], [1, 1, 1], [1, 1, -1]],
    [0, -1, 0, [-1, -1, -1], [1, -1, -1], [1, -1, 1], [-1, -1, 1]],
    [0, 0, 1, [-1, -1, 1], [1, -1, 1], [1, 1, 1], [-1, 1, 1]],
    [0, 0, -1, [-1, -1, -1], [-1, 1, -1], [1, 1, -1], [1, -1, -1]],
  ];
  var _col = new THREE.Color();
  Batch.prototype.vert = function (cx, cy, cz, lx, ly, lz, ux, uz, nx, ny, nz) {
    this.p.push(cx + lx * ux - lz * uz, cy + ly, cz + lx * uz + lz * ux);
    this.n.push(nx * ux - nz * uz, ny, nx * uz + nz * ux);
    this.c.push(_col.r, _col.g, _col.b);
    return this.v++;
  };
  // centre (cx,cy,cz), size, local X axis (ux,uz), colour, taper = scale of the top face
  Batch.prototype.box = function (cx, cy, cz, sx, sy, sz, ux, uz, color, taper) {
    if (ux === undefined) { ux = 1; uz = 0; }
    _col.set(color); taper = taper === undefined ? 1 : taper;
    for (var f = 0; f < 6; f++) {
      var F = FACES[f], ids = [];
      for (var k = 3; k < 7; k++) {
        var c = F[k], tp = c[1] > 0 ? taper : 1;
        ids.push(this.vert(cx, cy, cz, c[0] * sx / 2 * tp, c[1] * sy / 2, c[2] * sz / 2 * tp, ux, uz, F[0], F[1], F[2]));
      }
      this.i.push(ids[0], ids[1], ids[2], ids[0], ids[2], ids[3]);
    }
    return this;
  };
  // gabled roof, ridge along local X, base centre at (cx,cy,cz)
  Batch.prototype.roof = function (cx, cy, cz, sx, h, sz, ux, uz, color) {
    _col.set(color);
    var hx = sx / 2, hz = sz / 2, l = Math.hypot(h, hz), ny = hz / l, nz = h / l, me = this;
    function quad(a, b, c, d, n) {
      var ids = [a, b, c, d].map(function (q) { return me.vert(cx, cy, cz, q[0], q[1], q[2], ux, uz, n[0], n[1], n[2]); });
      me.i.push(ids[0], ids[1], ids[2], ids[0], ids[2], ids[3]);
    }
    function tri(a, b, c, n) {
      var ids = [a, b, c].map(function (q) { return me.vert(cx, cy, cz, q[0], q[1], q[2], ux, uz, n[0], n[1], n[2]); });
      me.i.push(ids[0], ids[1], ids[2]);
    }
    quad([-hx, 0, hz], [hx, 0, hz], [hx, h, 0], [-hx, h, 0], [0, ny, nz]);
    quad([hx, 0, -hz], [-hx, 0, -hz], [-hx, h, 0], [hx, h, 0], [0, ny, -nz]);
    tri([hx, 0, -hz], [hx, h, 0], [hx, 0, hz], [1, 0, 0]);
    tri([-hx, 0, hz], [-hx, h, 0], [-hx, 0, -hz], [-1, 0, 0]);
    return this;
  };
  // upright cylinder (base centre at cx,cy,cz)
  Batch.prototype.cyl = function (cx, cy, cz, r, h, color, taper, segs) {
    _col.set(color); taper = taper === undefined ? 1 : taper; segs = segs || 8;
    var top = this.vert(cx, cy, cz, 0, h, 0, 1, 0, 0, 1, 0), first = this.v;
    for (var i = 0; i < segs; i++) {
      var a = i / segs * Math.PI * 2, c = Math.cos(a), s = Math.sin(a);
      this.vert(cx, cy, cz, c * r, 0, s * r, 1, 0, c, 0, s);
      this.vert(cx, cy, cz, c * r * taper, h, s * r * taper, 1, 0, c, 0, s);
    }
    for (i = 0; i < segs; i++) {
      var b0 = first + i * 2, b1 = first + ((i + 1) % segs) * 2;
      this.i.push(b0, b0 + 1, b1, b1, b0 + 1, b1 + 1, top, b1 + 1, b0 + 1);
    }
    return this;
  };
  // rounded hull (half ellipse extruded along local X), base centre at (cx,cy,cz)
  Batch.prototype.hull = function (cx, cy, cz, len, w, h, ux, uz, color, segs) {
    _col.set(color); segs = segs || 6;
    var L = len / 2, me = this, o1 = this.vert(cx, cy, cz, L, 0, 0, ux, uz, 1, 0, 0), o2 = this.vert(cx, cy, cz, -L, 0, 0, ux, uz, -1, 0, 0);
    for (var i = 0; i < segs; i++) {
      var a0 = Math.PI * i / segs, a1 = Math.PI * (i + 1) / segs, am = (a0 + a1) / 2;
      var z0 = Math.cos(a0) * w / 2, y0 = Math.sin(a0) * h, z1 = Math.cos(a1) * w / 2, y1 = Math.sin(a1) * h, ny = Math.sin(am), nz = Math.cos(am);
      var A = me.vert(cx, cy, cz, -L, y0, z0, ux, uz, 0, ny, nz), B = me.vert(cx, cy, cz, L, y0, z0, ux, uz, 0, ny, nz);
      var C = me.vert(cx, cy, cz, L, y1, z1, ux, uz, 0, ny, nz), D = me.vert(cx, cy, cz, -L, y1, z1, ux, uz, 0, ny, nz);
      me.i.push(A, B, C, A, C, D);
      var e0 = me.vert(cx, cy, cz, L, y0, z0, ux, uz, 1, 0, 0), e1 = me.vert(cx, cy, cz, L, y1, z1, ux, uz, 1, 0, 0);
      var f0 = me.vert(cx, cy, cz, -L, y0, z0, ux, uz, -1, 0, 0), f1 = me.vert(cx, cy, cz, -L, y1, z1, ux, uz, -1, 0, 0);
      me.i.push(o1, e1, e0, o2, f0, f1);
    }
    return this;
  };
  Batch.prototype.build = function () {
    var g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(this.p), 3));
    g.setAttribute('normal', new THREE.BufferAttribute(new Float32Array(this.n), 3));
    g.setAttribute('color', new THREE.BufferAttribute(new Float32Array(this.c), 3));
    g.setIndex(this.i);
    return g;
  };
  Wd.Batch = Batch;

  var matSolid, matRoof, matTree, matCable, matAgent, matShadow;
  var SUNH = (function () { var l = Math.hypot(T.SUN[0], T.SUN[2]); return { x: T.SUN[0] / l, z: T.SUN[2] / l, tan: T.SUN[1] / l }; })();

  // ---------------------------------------------------------------- init
  Wd.init = function () {
    canvas = document.getElementById('scene');
    renderer = new THREE.WebGLRenderer({ canvas: canvas, antialias: !CFG.LOW, powerPreference: 'high-performance' });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, CFG.LOW ? 1.5 : 2));
    scene = new THREE.Scene();
    camera = new THREE.PerspectiveCamera(38, 1, 30, 220000);
    scene.fog = new THREE.FogExp2(0xdfe9f2, 0.000018);

    sun = new THREE.DirectionalLight(0xfff0d8, 2.6);
    sun.position.set(T.SUN[0], T.SUN[1], T.SUN[2]);
    scene.add(sun);
    amb = new THREE.HemisphereLight(0xcfe0ff, 0x8a8f99, 1.9);
    scene.add(amb);

    matSolid = new THREE.MeshLambertMaterial({ vertexColors: true, side: THREE.DoubleSide });
    matRoof = new THREE.MeshLambertMaterial({ color: 0x6b4a3a });
    matTree = new THREE.MeshLambertMaterial({ vertexColors: true, color: 0x2f5a2c });
    matCable = new THREE.LineBasicMaterial({ color: 0x1c2026 });
    matAgent = new THREE.MeshLambertMaterial({ vertexColors: true });
    matShadow = new THREE.MeshBasicMaterial({ color: 0x1f3357, transparent: true, opacity: 0.3, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });

    sky = new THREE.Mesh(new THREE.SphereGeometry(160000, 24, 12), new THREE.ShaderMaterial({
      side: THREE.BackSide, depthWrite: false, fog: false,
      uniforms: { uTop: { value: new THREE.Color(0x6fa4dc) }, uHor: { value: new THREE.Color(0xdfe9f2) } },
      vertexShader: 'varying vec3 vP; void main(){ vP = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
      fragmentShader: 'uniform vec3 uTop; uniform vec3 uHor; varying vec3 vP; void main(){ float t = clamp(normalize(vP).y, 0.0, 1.0); gl_FragColor = vec4(mix(uHor, uTop, pow(t, 0.55)), 1.0); }',
    }));
    scene.add(sky);

    // overlay textures: piste mask (R core, G snowmaking) and colour decals (edges, roads, rivers ...)
    var size = Math.min(CFG.LOW ? 2048 : 4096, renderer.capabilities.maxTextureSize);
    function mk() {
      var c = document.createElement('canvas'); c.width = c.height = size;
      var t = new THREE.CanvasTexture(c);
      t.flipY = false; t.generateMipmaps = true; t.minFilter = THREE.LinearMipmapLinearFilter;
      t.anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy());
      return { c: c, ctx: c.getContext('2d'), tex: t };
    }
    Wd.pm = mk(); Wd.dc = mk();
    Wd.terrain = T.buildMesh(Wd.pm.tex, Wd.dc.tex);
    scene.add(Wd.terrain);

    // places: real positions from the map data where available
    Wd.hubs = [];
    SK.PLACES.forEach(function (p) {
      var q = T.llToXZ(p.lat, p.lon), nm = p.osm || p.name;
      for (var i = 0; i < OSM.places.length; i++) if (OSM.places[i][0] === nm) { q = { x: OSM.places[i][2], z: OSM.places[i][3] }; break; }
      p.x = q.x; p.z = q.z; p.y = T.heightAt(q.x, q.z);
      if (p.hub) { p.hubIndex = Wd.hubs.length; Wd.hubs.push(p); }
    });
    Wd.hubs.forEach(function (h, i) { T.uniforms.uHubs.value[i].set(h.x, h.z, CFG.HUB_RADIUS); });

    Wd.liftGroup = new THREE.Group(); scene.add(Wd.liftGroup);
    Wd.propGroup = new THREE.Group(); scene.add(Wd.propGroup);
    Wd.villageGroup = new THREE.Group(); scene.add(Wd.villageGroup);
    Wd.preview = new THREE.Group(); scene.add(Wd.preview);
    Wd.liftVis = {};
    initVillages(); initTrees(); initAgents(); initLabels(); initSnowfall();

    var st = Wd.hubs[0];
    Wd.cam = { tx: st.x - 900, tz: st.z - 500, dist: 9800, yaw: 0.62, pitch: 0.66 };
    Wd.camGoal = { tx: st.x - 900, tz: st.z - 500, dist: 9800, yaw: 0.62, pitch: 0.66 };
    initControls();
    window.addEventListener('resize', resize);
    resize();
  };

  function resize() {
    var w = window.innerWidth, h = window.innerHeight;
    renderer.setSize(w, h, false);
    camera.aspect = w / h; camera.updateProjectionMatrix();
  }

  // ---------------------------------------------------------------- clearings (no trees on pistes, lift lines, houses)
  function stamp(x, z, r) {
    var N = Wd.clearN, cs = T.sizeX / N, czs = T.sizeZ / N;
    var i0 = Math.max(0, Math.floor((x - r - T.x0) / cs)), i1 = Math.min(N - 1, Math.ceil((x + r - T.x0) / cs));
    var j0 = Math.max(0, Math.floor((z - r - T.z0) / czs)), j1 = Math.min(N - 1, Math.ceil((z + r - T.z0) / czs));
    for (var j = j0; j <= j1; j++) for (var i = i0; i <= i1; i++) {
      var dx = T.x0 + (i + 0.5) * cs - x, dz = T.z0 + (j + 0.5) * czs - z;
      if (dx * dx + dz * dz <= r * r) Wd.clear[j * N + i] = 1;
    }
  }
  Wd.isCleared = function (x, z) {
    var N = Wd.clearN, i = Math.floor((x - T.x0) / T.sizeX * N), j = Math.floor((z - T.z0) / T.sizeZ * N);
    if (i < 0 || j < 0 || i >= N || j >= N) return false;
    return Wd.clear[j * N + i] === 1;
  };

  // ---------------------------------------------------------------- trees (+ their shadows on the snow)
  var treeMesh, treeCands, treeShadow;
  function initTrees() {
    treeCands = T.treeCandidates();
    var n = treeCands.length / 4, seg = CFG.LOW ? 4 : 5;
    var parts = [new THREE.ConeGeometry(7, 16, seg, 1, true).translate(0, 9.5, 0), new THREE.ConeGeometry(4.8, 13, seg, 1, true).translate(0, 18.5, 0)];
    var pos = [], nor = [], col = [];
    parts.forEach(function (g) {
      g = g.toNonIndexed();
      var p = g.attributes.position.array, nn = g.attributes.normal.array;
      for (var i = 0; i < p.length; i += 3) {
        pos.push(p[i], p[i + 1], p[i + 2]); nor.push(nn[i], nn[i + 1], nn[i + 2]);
        var t = 0.55 + 0.45 * Math.min(1, p[i + 1] / 25); col.push(t, t, t);
      }
    });
    var geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(pos), 3));
    geo.setAttribute('normal', new THREE.BufferAttribute(new Float32Array(nor), 3));
    geo.setAttribute('color', new THREE.BufferAttribute(new Float32Array(col), 3));
    treeMesh = new THREE.InstancedMesh(geo, matTree, n);
    treeMesh.frustumCulled = false;
    scene.add(treeMesh);
    var sg = new THREE.BufferGeometry();
    sg.setAttribute('position', new THREE.BufferAttribute(new Float32Array(n * 9), 3));
    treeShadow = new THREE.Mesh(sg, matShadow);
    treeShadow.frustumCulled = false; treeShadow.renderOrder = 2;
    scene.add(treeShadow);
    Wd.clearN = 1024;
    Wd.clear = new Uint8Array(Wd.clearN * Wd.clearN);
    Wd.rebuildTrees();
  }
  Wd.rebuildTrees = function () {
    Wd.clear.fill(0);
    var G = SK.G, i;
    for (i = 0; i < Wd.shown.length; i++) stamp(Wd.shown[i].x, Wd.shown[i].z, 15);
    for (i = 0; i < OSM.roads.length; i++) {
      var r = OSM.roads[i], p = r[2];
      if (r[0] > 2 || r[1]) continue;
      for (var q = 0; q < p.length - 2; q += 2) {
        var dl = Math.hypot(p[q + 2] - p[q], p[q + 3] - p[q + 1]), st = Math.max(1, Math.ceil(dl / 14));
        for (var s = 0; s <= st; s++) stamp(p[q] + (p[q + 2] - p[q]) * s / st, p[q + 1] + (p[q + 3] - p[q + 1]) * s / st, 12);
      }
    }
    if (G) {
      G.pistes.forEach(function (p) { if (p.diff !== 'route') for (var i = 0; i < p.pts.length; i++) stamp(p.pts[i].x, p.pts[i].z, p.width / 2 + 14); });
      G.lifts.forEach(function (l) {
        for (var d = 0; d <= l.geom.len; d += 12) stamp(l.a.x + l.geom.ux * d, l.a.z + l.geom.uz * d, 17);
        stamp(l.a.x, l.a.z, 38); stamp(l.b.x, l.b.z, 38);
      });
      G.huts.forEach(function (h) { stamp(h.x, h.z, 30); });
    }
    var arr = treeMesh.instanceMatrix.array, sh = treeShadow.geometry.attributes.position.array, c = 0, sc = 0, n = treeCands.length / 4;
    for (var k = 0; k < n; k++) {
      var x = treeCands[k * 4], y = treeCands[k * 4 + 1], z = treeCands[k * 4 + 2], sz = treeCands[k * 4 + 3];
      if (Wd.isCleared(x, z)) continue;
      var o = c * 16;
      arr[o] = sz; arr[o + 1] = 0; arr[o + 2] = 0; arr[o + 3] = 0;
      arr[o + 4] = 0; arr[o + 5] = sz * 1.1; arr[o + 6] = 0; arr[o + 7] = 0;
      arr[o + 8] = 0; arr[o + 9] = 0; arr[o + 10] = sz; arr[o + 11] = 0;
      arr[o + 12] = x; arr[o + 13] = y - 2; arr[o + 14] = z; arr[o + 15] = 1;
      c++;
      if (T.shadeAt(x, z) > 0.55) {
        var L = 25 * sz / SUNH.tan, tx = x - SUNH.x * L, tz = z - SUNH.z * L, rr = 5.5 * sz, so = sc * 9;
        sh[so] = x - SUNH.z * rr; sh[so + 1] = y + 0.7; sh[so + 2] = z + SUNH.x * rr;
        sh[so + 3] = x + SUNH.z * rr; sh[so + 4] = y + 0.7; sh[so + 5] = z - SUNH.x * rr;
        sh[so + 6] = tx; sh[so + 7] = T.heightAt(tx, tz) + 0.7; sh[so + 8] = tz;
        sc++;
      }
    }
    treeMesh.count = c;
    treeMesh.instanceMatrix.needsUpdate = true;
    treeShadow.geometry.setDrawRange(0, sc * 3);
    treeShadow.geometry.attributes.position.needsUpdate = true;
  };

  // ---------------------------------------------------------------- villages: real building footprints and streets
  var comOf = {};
  function initVillages() {
    var vill = SK.PLACES.filter(function (p) { return p.kind === 'village'; });
    SK.COMMUNITIES.forEach(function (c) { comOf[c.id] = { list: [], roads: [] }; });
    Wd.buildings = [];
    var rnd = SK.rng(1937);
    OSM.buildings.forEach(function (b) {
      var x = b[0], z = b[1], best = null, bd = 2100;
      for (var i = 0; i < vill.length; i++) { var d = Math.hypot(vill[i].x - x, vill[i].z - z); if (d < bd) { bd = d; best = vill[i]; } }
      var y = T.heightAt(x, z), o = { x: x, z: z, y: y, w: b[2], d: b[3], a: b[4] / 100, r: rnd(), com: null, rank: 1, farm: false };
      if (best && Math.abs(y - best.y) < 260) { o.com = best.com; o.dist = bd; comOf[best.com].list.push(o); }
      else if (y < 1500 && o.r < 0.5) o.farm = true;          // scattered farms; today's mountain stations are yours to build
      else return;
      Wd.buildings.push(o);
    });
    Object.keys(comOf).forEach(function (id) {
      var l = comOf[id].list;
      l.sort(function (a, b) { return a.dist - b.dist; });
      l.forEach(function (o, i) { o.rank = (i + 0.5) / l.length; });
    });
    // side streets appear with the houses along them
    OSM.roads.forEach(function (r) {
      r.rank = 0; r.com = null;
      if (r[0] < 3) return;
      var p = r[2], mx = p[(p.length >> 2) * 2], mz = p[(p.length >> 2) * 2 + 1], best = null, bd = 2100;
      for (var i = 0; i < vill.length; i++) { var d = Math.hypot(vill[i].x - mx, vill[i].z - mz); if (d < bd) { bd = d; best = vill[i]; } }
      if (!best) { r.rank = 2; return; }
      var l = comOf[best.com].list, lo = 0, hi = l.length;
      while (lo < hi) { var m = (lo + hi) >> 1; if (l[m].dist < bd) lo = m + 1; else hi = m; }
      r.com = best.com; r.rank = l.length ? lo / l.length : 2;
    });
    Wd.shown = [];
  }
  // frac: { communityId: 0..1 } share of today's buildings standing
  Wd.rebuildVillages = function (frac) {
    Wd.villageFrac = frac;
    while (Wd.villageGroup.children.length) { var c = Wd.villageGroup.children.pop(); c.geometry.dispose(); }
    var wb = new Batch(), rb = new Batch(), sh = [], shown = [], year = SK.G ? SK.G.year : 1937;
    Wd.buildings.forEach(function (o, idx) {
      var on = o.farm || (o.com && o.rank <= (frac[o.com] || 0));
      if (!on) return;
      if (CFG.LOW && o.w * o.d < 150 && (idx & 1)) return;
      shown.push(o);
      if (o.w * o.d < 75 && !o.farm) return;                       // sheds and garages only add clutter
      var ux = Math.cos(o.a), uz = Math.sin(o.a), w = o.w, d = o.d, big = o.w * o.d > 420;
      var hgt = big ? 15 + o.r * 7 : (o.w * o.d > 150 ? 10.5 + o.r * 3 : 8 + o.r * 2);
      var wood = o.r < 0.55 && !big, y = o.y;
      wb.box(o.x, y + hgt * 0.25 - 1, o.z, w, hgt * 0.5 + 2, d, ux, uz, big ? 0xf4efe4 : 0xf1eadb);
      wb.box(o.x, y + hgt * 0.75, o.z, w + 0.5, hgt * 0.5, d + 0.5, ux, uz, wood ? (o.r < 0.25 ? 0x6e4a30 : 0x8b5e3c) : (big ? 0xe9dfca : 0xefe6d2));
      if (big) wb.box(o.x, y + hgt * 0.5, o.z, w + 1.6, 0.5, d + 1.6, ux, uz, 0x7a5236);       // balcony band
      rb.roof(o.x, y + hgt, o.z, w + 1.6, (big ? 2.6 : 3.2) + d * 0.1, d + 2.4, ux, uz, 0xffffff);
      if (T.shadeAt(o.x, o.z) > 0.55) {
        var L = (hgt + 3) / SUNH.tan, px = -uz * 0, hw = Math.max(w, d) * 0.5;
        var ax = o.x - SUNH.z * hw, az = o.z + SUNH.x * hw, bx = o.x + SUNH.z * hw, bz = o.z - SUNH.x * hw;
        sh.push(ax, y + 0.6, az, bx, y + 0.6, bz, bx - SUNH.x * L, T.heightAt(bx - SUNH.x * L, bz - SUNH.z * L) + 0.6, bz - SUNH.z * L,
          ax, y + 0.6, az, bx - SUNH.x * L, T.heightAt(bx - SUNH.x * L, bz - SUNH.z * L) + 0.6, bz - SUNH.z * L, ax - SUNH.x * L, T.heightAt(ax - SUNH.x * L, az - SUNH.z * L) + 0.6, az - SUNH.z * L);
      }
    });
    // parish churches
    SK.PLACES.forEach(function (p) {
      if (!p.hub || ['St. Anton', 'Lech', 'Warth', 'Schröcken', 'Stuben', 'St. Christoph'].indexOf(p.name) < 0) return;
      var x = p.x + 30, z = p.z - 22, y = T.heightAt(x, z);
      wb.box(x, y + 6, z, 22, 12, 10, 1, 0, 0xf7f2e6); rb.roof(x, y + 12, z, 23, 7, 11.5, 1, 0, 0xffffff);
      wb.box(x - 14, y + 13, z, 6.5, 26, 6.5, 1, 0, 0xf7f2e6); wb.cyl(x - 14, y + 26, z, 4.2, 13, 0x3f5a4a, 0.05, 6);
    });
    // railway stations and a train
    OSM.stations.forEach(function (s) {
      var newSt = SK.G && SK.G.projects && SK.G.projects.station, x = s[1], z = s[2], y = T.heightAt(x, z);
      var dir = railDirNear(x, z);
      wb.box(x, y + 4, z, 46, 8, 11, dir.x, dir.z, newSt ? 0xdfe5ea : 0xe8dcc0);
      rb.roof(x, y + 8, z, 50, newSt ? 1.5 : 5, 14, dir.x, dir.z, 0xffffff);
      wb.box(x - dir.z * 11, y + 0.6, z + dir.x * 11, 120, 1.2, 5, dir.x, dir.z, 0xb9b3a8);
      for (var k = 0; k < 4; k++) {
        var tx = x - dir.z * 16 + dir.x * (k * 22 - 33), tz = z + dir.x * 16 + dir.z * (k * 22 - 33);
        wb.box(tx, T.heightAt(tx, tz) + 3, tz, 20, 4.4, 3.6, dir.x, dir.z, k === 0 ? 0xc0392b : (year < 1970 ? 0x2f5d3a : 0xd9dde2));
        wb.box(tx, T.heightAt(tx, tz) + 3.6, tz, 18.5, 1.2, 3.7, dir.x, dir.z, 0x1d2731);
      }
    });
    var wm = new THREE.Mesh(wb.build(), matSolid), rm = new THREE.Mesh(rb.build(), matRoof);
    wm.frustumCulled = rm.frustumCulled = false;
    Wd.villageGroup.add(wm); Wd.villageGroup.add(rm);
    if (sh.length) {
      var sg = new THREE.BufferGeometry();
      sg.setAttribute('position', new THREE.BufferAttribute(new Float32Array(sh), 3));
      var sm = new THREE.Mesh(sg, matShadow); sm.frustumCulled = false; sm.renderOrder = 2;
      Wd.villageGroup.add(sm);
    }
    Wd.shown = shown;
  };
  function railDirNear(x, z) {
    var best = { x: 1, z: 0 }, bd = 1e9;
    OSM.rails.forEach(function (r) {
      var p = r[1];
      for (var i = 0; i < p.length - 2; i += 2) {
        var d = Math.hypot(p[i] - x, p[i + 1] - z);
        if (d < bd) { bd = d; var l = Math.hypot(p[i + 2] - p[i], p[i + 3] - p[i + 1]) || 1; best = { x: (p[i + 2] - p[i]) / l, z: (p[i + 3] - p[i + 1]) / l }; }
      }
    });
    return best;
  }

  // ---------------------------------------------------------------- guests
  var agentMesh, AG_MAX;
  var JACKETS = [0xe74c3c, 0x3498db, 0xf1c40f, 0x2ecc71, 0x9b59b6, 0xe67e22, 0x1abc9c, 0xecf0f1, 0xff6fa5, 0x5d7fa3, 0xd35400, 0x27ae60];
  function initAgents() {
    AG_MAX = CFG.MAX_AGENTS + 200;
    var b = new Batch(), k = 1.25;
    b.box(-0.34 * k, 0.07, 0.25 * k, 0.2 * k, 0.1, 3.5 * k, 1, 0, 0x30343a);                 // skis
    b.box(0.34 * k, 0.07, 0.25 * k, 0.2 * k, 0.1, 3.5 * k, 1, 0, 0x30343a);
    b.box(-0.3 * k, 0.6 * k, 0, 0.36 * k, 1.0 * k, 0.4 * k, 1, 0, 0x4a4f58);                 // legs
    b.box(0.3 * k, 0.6 * k, 0, 0.36 * k, 1.0 * k, 0.4 * k, 1, 0, 0x4a4f58);
    b.box(0, 1.62 * k, 0.14 * k, 1.0 * k, 1.1 * k, 0.56 * k, 1, 0, 0xffffff);               // jacket
    b.box(-0.64 * k, 1.5 * k, 0.34 * k, 0.24 * k, 0.8 * k, 0.26 * k, 1, 0, 0xf2f2f2);       // arms
    b.box(0.64 * k, 1.5 * k, 0.34 * k, 0.24 * k, 0.8 * k, 0.26 * k, 1, 0, 0xf2f2f2);
    b.box(0, 2.48 * k, 0.24 * k, 0.56 * k, 0.56 * k, 0.6 * k, 1, 0, 0xd9d9d9);               // helmet
    b.box(0, 2.42 * k, 0.5 * k, 0.5 * k, 0.2 * k, 0.12 * k, 1, 0, 0x202428);                 // goggles
    b.box(-0.8 * k, 0.85 * k, 0.55 * k, 0.07, 1.5 * k, 0.07, 1, 0, 0x2a2e33);                // poles
    b.box(0.8 * k, 0.85 * k, 0.55 * k, 0.07, 1.5 * k, 0.07, 1, 0, 0x2a2e33);
    agentMesh = new THREE.InstancedMesh(b.build(), matAgent, AG_MAX);
    agentMesh.frustumCulled = false;
    var c = new THREE.Color(), rnd = SK.rng(99);
    for (var i = 0; i < AG_MAX; i++) { c.set(JACKETS[(rnd() * JACKETS.length) | 0]); agentMesh.setColorAt(i, c); }
    agentMesh.instanceColor.needsUpdate = true;
    agentMesh.count = 0;
    scene.add(agentMesh);
  }
  Wd.agentScale = function () { return Math.min(9, Math.max(2.0, Wd.cam.dist / 520)); };
  // agents: array of {x,y,z,fx,fz,vis,lean}
  Wd.drawAgents = function (agents) {
    var arr = agentMesh.instanceMatrix.array, c = 0, s = Wd.agentScale();
    for (var i = 0; i < agents.length && c < AG_MAX; i++) {
      var a = agents[i];
      if (!a.vis) continue;
      var o = c * 16, fx = a.fx, fz = a.fz, cl = Math.cos(a.lean || 0), sl = Math.sin(a.lean || 0);
      // right = (fz,0,-fx), up = (0,1,0); lean rolls both around the forward axis
      arr[o] = fz * cl * s; arr[o + 1] = sl * s; arr[o + 2] = -fx * cl * s; arr[o + 3] = 0;
      arr[o + 4] = -fz * sl * s; arr[o + 5] = cl * s; arr[o + 6] = fx * sl * s; arr[o + 7] = 0;
      arr[o + 8] = fx * s; arr[o + 9] = 0; arr[o + 10] = fz * s; arr[o + 11] = 0;
      arr[o + 12] = a.x; arr[o + 13] = a.y; arr[o + 14] = a.z; arr[o + 15] = 1;
      c++;
    }
    agentMesh.count = c;
    agentMesh.instanceMatrix.needsUpdate = true;
  };

  // ---------------------------------------------------------------- overlays: piste mask + decals
  Wd.redrawPistes = function () {
    var G = SK.G; if (!G) return;
    var ctx = Wd.pm.ctx, C = Wd.pm.c.width, sx = C / T.sizeX, sz = C / T.sizeZ, sm = (sx + sz) / 2;
    ctx.fillStyle = '#000'; ctx.fillRect(0, 0, C, C);
    ctx.lineJoin = 'round'; ctx.lineCap = 'round';
    function path(c2, p) {
      c2.beginPath();
      for (var i = 0; i < p.pts.length; i++) {
        var X = (p.pts[i].x - T.x0) * sx, Z = (p.pts[i].z - T.z0) * sz;
        if (i) c2.lineTo(X, Z); else c2.moveTo(X, Z);
      }
    }
    G.pistes.forEach(function (p) {
      if (p.diff === 'route') return;
      path(ctx, p); ctx.lineWidth = p.width * sm; ctx.strokeStyle = p.snowmaking ? '#ffff00' : '#ff0000'; ctx.stroke();
    });
    Wd.pm.tex.needsUpdate = true;
    Wd.redrawDecals();
    Wd.rebuildProps();
    Wd.refreshDynLabels();
  };

  Wd.winterLook = false;
  Wd.redrawDecals = function () {
    var G = SK.G; if (!G) return;
    var ctx = Wd.dc.ctx, C = Wd.dc.c.width, sx = C / T.sizeX, sz = C / T.sizeZ, sm = (sx + sz) / 2, win = Wd.winterLook, frac = Wd.villageFrac || {};
    ctx.clearRect(0, 0, C, C);
    ctx.lineJoin = 'round'; ctx.lineCap = 'round'; ctx.setLineDash([]);
    function flat(p) {
      ctx.beginPath();
      for (var i = 0; i < p.length; i += 2) { var X = (p[i] - T.x0) * sx, Z = (p[i + 1] - T.z0) * sz; if (i) ctx.lineTo(X, Z); else ctx.moveTo(X, Z); }
    }
    function pts(p) {
      ctx.beginPath();
      for (var i = 0; i < p.length; i++) { var X = (p[i].x - T.x0) * sx, Z = (p[i].z - T.z0) * sz; if (i) ctx.lineTo(X, Z); else ctx.moveTo(X, Z); }
    }
    // water
    ctx.fillStyle = win ? 'rgba(206,222,236,0.95)' : 'rgba(74,134,188,0.95)';
    OSM.lakes.forEach(function (l) { flat(l); ctx.closePath(); ctx.fill(); });
    ctx.strokeStyle = win ? 'rgba(120,160,196,0.85)' : 'rgba(74,134,188,0.95)';
    OSM.rivers.forEach(function (r) { flat(r); ctx.lineWidth = Math.max(1.6, 11 * sm); ctx.stroke(); });
    // roads
    var WID = [15, 11, 8.5, 6.5];
    OSM.roads.forEach(function (r) {
      if (r[1]) return;
      if (r[0] === 0 && G.year < 1978) return;
      if (r[0] === 3 && !(r.com && r.rank <= (frac[r.com] || 0) + 0.04)) return;
      flat(r[2]);
      ctx.lineWidth = Math.max(1.3, WID[r[0]] * sm);
      ctx.strokeStyle = win ? (r[0] < 2 ? 'rgba(150,156,166,0.9)' : 'rgba(196,202,210,0.85)') : (r[0] < 2 ? 'rgba(92,94,100,0.95)' : 'rgba(128,124,116,0.9)');
      ctx.stroke();
    });
    // railway
    OSM.rails.forEach(function (r) {
      if (r[0]) return;
      flat(r[1]); ctx.lineWidth = Math.max(1.6, 7 * sm); ctx.strokeStyle = 'rgba(58,48,44,0.95)'; ctx.setLineDash([]); ctx.stroke();
      ctx.lineWidth = Math.max(0.8, 2.6 * sm); ctx.strokeStyle = 'rgba(210,205,196,0.9)'; ctx.setLineDash([5 * sm, 7 * sm]); ctx.stroke(); ctx.setLineDash([]);
    });
    // piste edges in their colour; the groomed core is punched out again
    G.pistes.forEach(function (p) {
      if (p.diff === 'route') return;
      pts(p.pts); ctx.lineWidth = (p.width + 15) * sm; ctx.strokeStyle = SK.DIFF[p.diff].css; ctx.stroke();
    });
    ctx.globalCompositeOperation = 'destination-out';
    G.pistes.forEach(function (p) {
      if (p.diff === 'route') return;
      pts(p.pts); ctx.lineWidth = p.width * sm; ctx.strokeStyle = '#000'; ctx.stroke();
    });
    ctx.globalCompositeOperation = 'source-over';
    // ski routes: dashed orange diamonds, no grooming
    G.pistes.forEach(function (p) {
      if (p.diff !== 'route') return;
      pts(p.pts); ctx.lineWidth = Math.max(2, 13 * sm); ctx.strokeStyle = 'rgba(240,138,28,0.95)'; ctx.setLineDash([16 * sm, 22 * sm]); ctx.stroke(); ctx.setLineDash([]);
    });
    // closed for damage: red cross-hatching along the piste
    G.pistes.forEach(function (p) {
      if (!p.damaged) return;
      pts(p.pts); ctx.lineWidth = Math.max(2, 10 * sm); ctx.strokeStyle = 'rgba(214,40,40,0.9)'; ctx.setLineDash([6 * sm, 18 * sm]); ctx.stroke(); ctx.setLineDash([]);
    });
    // avalanche debris
    (G.debris || []).forEach(function (d) {
      pts(d.pts);
      ctx.lineWidth = d.w * sm; ctx.strokeStyle = 'rgba(196,208,224,0.96)'; ctx.stroke();
      ctx.lineWidth = d.w * 0.55 * sm; ctx.strokeStyle = 'rgba(232,238,246,0.96)'; ctx.setLineDash([9 * sm, 6 * sm]); ctx.stroke(); ctx.setLineDash([]);
      var e = d.pts[d.pts.length - 1];
      ctx.fillStyle = 'rgba(176,190,208,0.96)';
      ctx.beginPath(); ctx.arc((e.x - T.x0) * sx, (e.z - T.z0) * sz, d.w * 0.95 * sm, 0, 6.3); ctx.fill();
    });
    Wd.dc.tex.needsUpdate = true;
  };

  // ---------------------------------------------------------------- lifts
  var GAUGE = { surface: 5, chair: 9, gondola: 11, tram: 17, pod: 7 };
  Wd.ropePoint = function (g, a, d, out) {
    var u = d / g.step, i = Math.floor(u);
    if (i < 0) { i = 0; u = 0; } if (i >= g.ys.length - 1) { i = g.ys.length - 2; u = g.ys.length - 1; }
    var f = u - i;
    out.x = a.x + g.ux * d; out.z = a.z + g.uz * d; out.y = g.ys[i] + (g.ys[i + 1] - g.ys[i]) * f;
    return out;
  };

  function corral(b, p, ux, uz) {             // queue maze behind the bottom station
    for (var k = -2; k <= 2; k++) {
      var x = p.x - ux * 34 - uz * k * 7, z = p.z - uz * 34 + ux * k * 7;
      b.box(x, T.heightAt(x, z) + 1.2, z, 30, 0.5, 0.5, ux, uz, 0xd4392e);
      b.box(x, T.heightAt(x, z) + 0.6, z, 30, 0.2, 0.3, ux, uz, 0xf4f4f4);
    }
  }
  function station(b, p, ux, uz, ty, top) {
    var y = p.y, c = ty.color, sgn = top ? -1 : 1, ox = ux * sgn, oz = uz * sgn;      // (ox,oz) points along the line away from the station
    if (ty.style === 'surface') {
      b.box(p.x - ox * 6 - uz * 7, y + 2.8, p.z - oz * 6 + ux * 7, 8, 5.6, 6, ux, uz, 0x8a5f3f);
      b.roof(p.x - ox * 6 - uz * 7, y + 5.6, p.z - oz * 6 + ux * 7, 10, 2.6, 8, ux, uz, 0xf4f6f8);
      b.cyl(p.x, y - 1, p.z, 0.9, 8.4, 0x7c858c, 0.8, 6);
      b.cyl(p.x, y + 7.2, p.z, 4.2, 0.7, 0xc9a23a, 1, 10);
    } else if (ty.style === 'chair' && ty.pph <= 2000) {
      b.cyl(p.x, y - 1, p.z, 1.3, 10.5, 0x7c858c, 0.8, 6);
      b.cyl(p.x, y + 9.3, p.z, 6.2, 0.9, c, 1, 12);
      b.box(p.x - ox * 3, y + 10.6, p.z - oz * 3, 14, 0.8, 13.5, ux, uz, 0x5f676e);
      b.box(p.x - ox * 9 - uz * 10, y + 3, p.z - oz * 9 + ux * 10, 9, 6, 7, ux, uz, 0x94683f);
      b.roof(p.x - ox * 9 - uz * 10, y + 6, p.z - oz * 9 + ux * 10, 11, 3, 9, ux, uz, 0xf4f6f8);
    } else if (ty.style === 'chair') {
      // detachable terminal: raised rounded hull on legs
      var cx = p.x - ox * 6, cz = p.z - oz * 6;
      b.box(cx - ux * 11, y + 4, cz - uz * 11, 2, 9, 2, ux, uz, 0x8f989f); b.box(cx + ux * 11, y + 4, cz + uz * 11, 2, 9, 2, ux, uz, 0x8f989f);
      b.box(cx, y + 8.6, cz, 36, 1.4, 13, ux, uz, 0x4f5861);
      b.hull(cx, y + 9.3, cz, 36, 13.5, 6.2, ux, uz, 0xeef1f4, 7);
      b.box(cx, y + 10.4, cz, 36.4, 1.6, 13.9, ux, uz, c);
      b.box(cx - uz * 11, y + 2.4, cz + ux * 11, 7, 4.8, 6, ux, uz, 0xdfe4e8); b.box(cx - uz * 11, y + 3.2, cz + ux * 11, 7.2, 1.6, 6.2, ux, uz, 0x253342);
    } else if (ty.style === 'gondola') {
      var k = ty.big ? 1.5 : (ty.twin ? 1.25 : 1), gx = p.x - ox * 14 * k, gz = p.z - oz * 14 * k;
      b.box(gx, y + 6.5 * k, gz, 34 * k, 13 * k, 24 * k, ux, uz, 0xe6eaee);
      b.box(gx, y + 4.4 * k, gz, 34.5 * k, 4.6 * k, 24.5 * k, ux, uz, 0x2a3b4d);
      b.box(gx, y + 11 * k, gz, 34.8 * k, 1.8 * k, 24.8 * k, ux, uz, c);
      b.hull(gx, y + 13 * k, gz, 34 * k, 24 * k, 5 * k, ux, uz, 0xf5f7f9, 7);
      b.hull(p.x + ox * 8 * k, y + 6 * k, p.z + oz * 8 * k, 16 * k, 14 * k, 5.5 * k, ux, uz, 0xdfe5ea, 6);
    } else if (ty.style === 'tram') {
      var tx = p.x - ox * 9, tz = p.z - oz * 9;
      b.box(tx, y + 10, tz, 22, 20, 20, ux, uz, 0xd9d4c7);
      b.box(tx, y + 13, tz, 22.6, 4, 20.6, ux, uz, 0x3a4652);
      b.roof(tx, y + 20, tz, 25, 7, 23, ux, uz, 0xf4f6f8);
      b.box(p.x + ox * 5, y + 9, p.z + oz * 5, 10, 2, 18, ux, uz, 0x6f787f);
    } else {
      b.hull(p.x - ox * 8, y, p.z - oz * 8, 34, 19, 10, ux, uz, 0xf5f7f9, 8);
      b.box(p.x - ox * 8, y + 3.4, p.z - oz * 8, 34.4, 2.4, 19.4, ux, uz, 0x12303a);
      b.box(p.x - ox * 8, y + 0.8, p.z - oz * 8, 34.6, 1.0, 19.6, ux, uz, c);
    }
    if (!top) corral(b, p, ux, uz);
  }

  function vehicleGeo(ty) {
    var b = new Batch(), c = ty.color, s = VS;
    if (ty.style === 'surface') {
      b.box(0, -3.2 * s, 0, 0.3 * s, 6.4 * s, 0.3 * s, 1, 0, 0x30343a);
      b.box(0, -6.2 * s, 0, 2.6 * s, 0.35 * s, 0.35 * s, 1, 0, 0xc9a23a);
    } else if (ty.style === 'chair') {
      var w = (1.2 + ty.seats * 0.85) * s;
      b.box(0, -1.2 * s, 0, 0.3 * s, 2.4 * s, 0.3 * s, 1, 0, 0x4a4f57);               // hanger
      b.box(0, -2.5 * s, -0.3 * s, w * 0.9, 0.24 * s, 0.24 * s, 1, 0, 0x4a4f57);        // top bar
      b.box(-w * 0.45, -3.7 * s, -0.5 * s, 0.2 * s, 2.5 * s, 0.2 * s, 1, 0, 0x4a4f57);
      b.box(w * 0.45, -3.7 * s, -0.5 * s, 0.2 * s, 2.5 * s, 0.2 * s, 1, 0, 0x4a4f57);
      b.box(0, -5.0 * s, 0, w, 0.36 * s, 1.5 * s, 1, 0, 0x2b3036);                      // seat
      b.box(0, -4.25 * s, -0.7 * s, w, 1.4 * s, 0.3 * s, 1, 0, c);                       // backrest
      b.box(0, -5.9 * s, 0.9 * s, w, 0.14 * s, 0.2 * s, 1, 0, 0x4a4f57);                // footrest
      if (ty.bubble) { b.hull(0, -4.3 * s, 0, w, 2.2 * s, 1.6 * s, 1, 0, c, 5); }
    } else if (ty.style === 'gondola') {
      var k = ty.big ? 1.9 : (ty.twin ? 1.5 : (ty.seats >= 8 ? 1.2 : 1));
      b.box(0, -1.1 * s, 0, 0.4 * s, 2.2 * s, 0.4 * s, 1, 0, 0x4a4f57);
      b.box(0, -2.3 * s * k, 0, 2.4 * s * k, 0.5 * s * k, 3.0 * s * k, 1, 0, 0xe9edf0, 0.8);    // roof
      b.box(0, -3.5 * s * k, 0, 3.0 * s * k, 2.0 * s * k, 3.6 * s * k, 1, 0, 0x1d2731);          // glass
      b.box(0, -5.2 * s * k, 0, 3.05 * s * k, 1.5 * s * k, 3.65 * s * k, 1, 0, c);                // body
      b.box(1.6 * s * k, -4.4 * s * k, 0, 0.2 * s * k, 2.4 * s * k, 1.6 * s * k, 1, 0, 0x8f989f); // ski rack
    } else if (ty.style === 'tram') {
      b.box(0, -2.2 * s, 0, 0.6 * s, 4.4 * s, 0.6 * s, 1, 0, 0x4a4f57);
      b.box(0, -0.4 * s, 0, 1.2 * s, 0.8 * s, 6 * s, 1, 0, 0x30343a);
      b.box(0, -4.6 * s, 0, 4.0 * s, 0.6 * s, 7.2 * s, 1, 0, 0xe9edf0, 0.85);
      b.box(0, -6.0 * s, 0, 4.4 * s, 2.2 * s, 7.5 * s, 1, 0, 0x1d2731);
      b.box(0, -8.2 * s, 0, 4.45 * s, 2.4 * s, 7.55 * s, 1, 0, c);
    } else {
      b.hull(0, 0.6 * s, 0, 2.5 * s, 5.2 * s, 2.6 * s, 0, 1, 0xf6f9fb, 6);
      b.box(0, 1.9 * s, 0, 2.55 * s, 0.9 * s, 4.4 * s, 1, 0, 0x10343c);
      b.box(0, 0.5 * s, 0, 2.5 * s, 0.3 * s, 5.3 * s, 1, 0, c);
    }
    return b.build();
  }

  Wd.addLift = function (lift) {
    Wd.removeLift(lift.id);
    var ty = SK.LIFT[lift.type], g = lift.geom, a = lift.a, b = new Batch(), grp = new THREE.Group(), sh = [];
    var gauge = GAUGE[ty.style] * (ty.big ? 1.5 : 1), heavy = ty.style === 'tram' || ty.big;
    station(b, lift.a, g.ux, g.uz, ty, false);
    station(b, lift.b, g.ux, g.uz, ty, true);
    g.towers.forEach(function (t) {
      var x = a.x + g.ux * t.d, z = a.z + g.uz * t.d;
      if (heavy) {
        b.box(x, t.g + t.h / 2 - 2, z, 9, t.h + 4, 9, g.ux, g.uz, 0x8f989f, 0.3);
        b.box(x, t.g + t.h * 0.35, z, 7.4, 0.8, 7.4, g.ux, g.uz, 0x6f787f); b.box(x, t.g + t.h * 0.7, z, 5, 0.8, 5, g.ux, g.uz, 0x6f787f);
      } else b.cyl(x, t.g - 3, z, ty.style === 'surface' ? 0.6 : 1.25, t.h + 3, ty.style === 'pod' ? 0xf0f4f7 : 0x97a0a7, 0.65, 7);
      b.box(x, t.g + t.h + 0.5, z, 1.4, 1.2, gauge + 3.4, g.ux, g.uz, 0x6f787f);
      if (ty.style !== 'surface' && ty.style !== 'pod') {             // sheave trains
        b.box(x - g.uz * gauge / 2, t.g + t.h + 0.2, z + g.ux * gauge / 2, heavy ? 12 : 7, 0.9, 1, g.ux, g.uz, 0x3d444b);
        b.box(x + g.uz * gauge / 2, t.g + t.h + 0.2, z - g.ux * gauge / 2, heavy ? 12 : 7, 0.9, 1, g.ux, g.uz, 0x3d444b);
      }
      if (T.shadeAt(x, z) > 0.55) {
        var L = t.h / SUNH.tan, w = heavy ? 3 : 1.1, ex = x - SUNH.x * L, ez = z - SUNH.z * L, ey = T.heightAt(ex, ez) + 0.7;
        sh.push(x - SUNH.z * w, t.g + 0.7, z + SUNH.x * w, x + SUNH.z * w, t.g + 0.7, z - SUNH.x * w, ex, ey, ez);
      }
    });
    grp.add(new THREE.Mesh(b.build(), matSolid));
    if (sh.length) {
      var sg = new THREE.BufferGeometry();
      sg.setAttribute('position', new THREE.BufferAttribute(new Float32Array(sh), 3));
      var sm = new THREE.Mesh(sg, matShadow); sm.frustumCulled = false; sm.renderOrder = 2; grp.add(sm);
    }
    // cables
    var pts = [], offs = ty.twin ? [gauge / 2 - 1.6, gauge / 2 + 1.6, -gauge / 2 - 1.6, -gauge / 2 + 1.6] : [gauge / 2, -gauge / 2];
    offs.forEach(function (o) {
      for (var i = 0; i < g.ys.length - 1; i++) {
        var d0 = i * g.step, d1 = Math.min(g.len, (i + 1) * g.step);
        pts.push(a.x + g.ux * d0 - g.uz * o, g.ys[i], a.z + g.uz * d0 + g.ux * o, a.x + g.ux * d1 - g.uz * o, g.ys[i + 1], a.z + g.uz * d1 + g.ux * o);
      }
    });
    var lg = new THREE.BufferGeometry();
    lg.setAttribute('position', new THREE.BufferAttribute(new Float32Array(pts), 3));
    var lines = new THREE.LineSegments(lg, ty.style === 'pod' ? new THREE.LineBasicMaterial({ color: 0x00b3a7 }) : matCable);
    lines.frustumCulled = false;
    grp.add(lines);
    // vehicles
    var n = ty.style === 'tram' ? 2 : Math.max(2, Math.floor(2 * g.len / ty.spacing));
    var veh = new THREE.InstancedMesh(vehicleGeo(ty), matSolid, n);
    veh.frustumCulled = false;
    grp.add(veh);
    Wd.liftGroup.add(grp);
    Wd.liftVis[lift.id] = { grp: grp, veh: veh, n: n, phase: Math.random() * 100, gauge: gauge, lift: lift, ty: ty, sp: 2 * g.len / n };
    Wd.updateLifts(0);
  };
  Wd.removeLift = function (id) {
    var v = Wd.liftVis[id];
    if (!v) return;
    Wd.liftGroup.remove(v.grp);
    v.grp.traverse(function (o) { if (o.geometry) o.geometry.dispose(); });
    delete Wd.liftVis[id];
  };
  var _rp = { x: 0, y: 0, z: 0 };
  Wd.updateLifts = function (dt) {
    for (var id in Wd.liftVis) {
      var v = Wd.liftVis[id], l = v.lift, g = l.geom, ty = v.ty, arr = v.veh.instanceMatrix.array;
      if (l.running) v.phase += ty.speed * dt;
      var L = g.len, loop = 2 * L, sp = v.sp;
      for (var i = 0; i < v.n; i++) {
        var d, side;
        if (ty.style === 'tram') {
          var u = (v.phase / (L + 260)) % 2, tt = Math.min(1, Math.max(0, (u < 1 ? u : 2 - u) * (L + 260) / L - 130 / L));
          d = i === 0 ? tt * L : (1 - tt) * L; side = i === 0 ? 1 : -1;
        } else {
          var s = (v.phase + i * sp) % loop;
          if (s < L) { d = s; side = 1; } else { d = loop - s; side = -1; }
        }
        Wd.ropePoint(g, l.a, d, _rp);
        var o = i * 16, ox = -g.uz * side * v.gauge / 2, oz = g.ux * side * v.gauge / 2;
        var fx = g.ux * side, fz = g.uz * side;
        arr[o] = fz; arr[o + 1] = 0; arr[o + 2] = -fx; arr[o + 3] = 0;
        arr[o + 4] = 0; arr[o + 5] = 1; arr[o + 6] = 0; arr[o + 7] = 0;
        arr[o + 8] = fx; arr[o + 9] = 0; arr[o + 10] = fz; arr[o + 11] = 0;
        arr[o + 12] = _rp.x + ox; arr[o + 13] = _rp.y; arr[o + 14] = _rp.z + oz; arr[o + 15] = 1;
      }
      v.veh.instanceMatrix.needsUpdate = true;
    }
  };
  // where a riding guest is drawn: on the nearest chair / T-bar, in his own seat
  Wd.liftSeat = function (lift, d, slot, out) {
    var v = Wd.liftVis[lift.id], g = lift.geom, ty = SK.LIFT[lift.type];
    if (v && v.sp > 0) {
      var k = Math.round((d - v.phase) / v.sp);
      d = Math.min(g.len, Math.max(0, v.phase + k * v.sp));
    }
    Wd.ropePoint(g, lift.a, d, out);
    var gz = (v ? v.gauge / 2 : 4) + (slot - (ty.seats - 1) / 2) * 0.85 * VS * (ty.style === 'surface' ? 1.1 : 1);
    out.x += -g.uz * gz; out.z += g.ux * gz;
    out.y -= ty.style === 'surface' ? g.hang : 4.8 * VS;
    return out;
  };

  // huts, snow guns, piste markers, avalanche barriers, closure signs
  Wd.rebuildProps = function () {
    while (Wd.propGroup.children.length) { var c = Wd.propGroup.children.pop(); c.geometry.dispose(); }
    var G = SK.G; if (!G) return;
    var b = new Batch();
    G.huts.forEach(function (h) {
      b.box(h.x, h.y + 1.8, h.z, 22, 3.6, 15, 0.94, 0.34, 0xe9e2d2);
      b.box(h.x, h.y + 6, h.z, 22.5, 5, 15.5, 0.94, 0.34, 0x8a5a3a);
      b.roof(h.x, h.y + 8.5, h.z, 26, 7, 19, 0.94, 0.34, 0xf4f6f8);
      b.box(h.x + 14, h.y + 0.6, h.z + 10, 12, 1.2, 9, 0.94, 0.34, 0xc19a6b);
      b.box(h.x + 12, h.y + 3.2, h.z + 9, 0.3, 4, 0.3, 1, 0, 0x555555); b.cyl(h.x + 12, h.y + 4.6, h.z + 9, 3, 0.5, 0xd4392e, 0.2, 8);
    });
    G.pistes.forEach(function (p) {
      var n = p.pts.length, col = SK.DIFF[p.diff].rgb, hex = (col[0] << 16) | (col[1] << 8) | col[2], step = CFG.LOW ? 16 : 9;
      for (var i = 2; i < n - 2; i += step) {
        var A = p.pts[i - 1], B = p.pts[i + 1], dl = Math.hypot(B.x - A.x, B.z - A.z) || 1, nx = -(B.z - A.z) / dl, nz = (B.x - A.x) / dl;
        var w = (p.diff === 'route' ? 8 : p.width / 2 + 5);
        for (var s = -1; s <= 1; s += 2) {
          var x = p.pts[i].x + nx * w * s, z = p.pts[i].z + nz * w * s, y = T.heightAt(x, z);
          b.box(x, y + 2.6, z, 0.35, 5.2, 0.35, 1, 0, 0x30343a);
          if (p.diff === 'route') b.box(x, y + 5.4, z, 1.9, 1.9, 0.3, 0.707, 0.707, hex); else b.cyl(x, y + 4.8, z, 1.25, 0.9, hex, 1, 8);
          if (p.diff === 'route') break;
        }
        if (p.snowmaking && (i % (step * 2)) < step) {                      // snow lances along one edge
          var gx = p.pts[i].x + nx * (p.width / 2 + 9), gz = p.pts[i].z + nz * (p.width / 2 + 9), gy = T.heightAt(gx, gz);
          b.cyl(gx, gy, gz, 0.4, 10, 0xf2c230, 0.6, 5); b.box(gx - nx * 1.6, gy + 10.2, gz - nz * 1.6, 3.4, 0.8, 0.8, nx, nz, 0xf2c230);
        }
      }
      if (p.barrier && p.avPath) {                                          // steel snow bridges in the release zone
        for (var r = 0; r < 4; r++) {
          var q = p.avPath[Math.min(p.avPath.length - 1, r * 2)], g2 = T.gradAt(q.x, q.z), gl = Math.hypot(g2[0], g2[1]) || 1;
          var cxn = -g2[1] / gl, czn = g2[0] / gl;
          b.box(q.x, T.heightAt(q.x, q.z) + 1.6, q.z, 56, 3.2, 0.8, cxn, czn, 0x4a4038);
        }
      }
    });
    (G.zones || []).forEach(function (zn) {
      for (var k = 0; k < 6; k++) {
        var a = k / 6 * Math.PI * 2, x = zn.x + Math.cos(a) * zn.r, z = zn.z + Math.sin(a) * zn.r, y = T.heightAt(x, z);
        b.box(x, y + 3, z, 0.4, 6, 0.4, 1, 0, 0x30343a); b.box(x, y + 6.2, z, 3.6, 2.4, 0.3, -Math.sin(a), Math.cos(a), 0xf2c230);
        b.box(x, y + 6.2, z, 3.0, 0.5, 0.36, -Math.sin(a), Math.cos(a), 0x1d1d1d);
      }
    });
    if (b.v) { var m = new THREE.Mesh(b.build(), matSolid); m.frustumCulled = false; Wd.propGroup.add(m); }
    var zu = T.uniforms.uZones.value, zs = G.zones || [];
    for (var i2 = 0; i2 < T.MAXZONES; i2++) { if (zs[i2]) zu[i2].set(zs[i2].x, zs[i2].z, zs[i2].r); else zu[i2].set(0, 0, 0); }
  };
  Wd.rebuildHuts = Wd.rebuildProps;

  // ---------------------------------------------------------------- build previews
  var matRibbon = new THREE.MeshBasicMaterial({ vertexColors: true, transparent: true, opacity: 0.78, depthTest: false, side: THREE.DoubleSide });
  var matMarker = new THREE.MeshBasicMaterial({ color: 0xffb21e, transparent: true, opacity: 0.9, depthTest: false });
  var matMarkerHot = new THREE.MeshBasicMaterial({ color: 0x35e07a, transparent: true, opacity: 0.95, depthTest: false });
  var matMarkerRed = new THREE.MeshBasicMaterial({ color: 0xe5352b, transparent: true, opacity: 0.95, depthTest: false });
  var matLineP = new THREE.LineBasicMaterial({ vertexColors: true, depthTest: false, transparent: true });
  var ringGeo = new THREE.TorusGeometry(1, 0.16, 6, 28).rotateX(Math.PI / 2);
  Wd.clearPreview = function () {
    while (Wd.preview.children.length) {
      var c = Wd.preview.children.pop();
      if (c.geometry !== ringGeo) c.geometry.dispose();
    }
  };
  Wd.previewRibbon = function (pts, colors, width, lift) {
    if (pts.length < 2) return;
    var pos = [], col = [], idx = [], c = new THREE.Color();
    for (var i = 0; i < pts.length; i++) {
      var p = pts[i], q = pts[Math.min(pts.length - 1, i + 1)], r = pts[Math.max(0, i - 1)];
      var dx = q.x - r.x, dz = q.z - r.z, l = Math.hypot(dx, dz) || 1, nx = -dz / l * width / 2, nz = dx / l * width / 2;
      var y1 = T.heightAt(p.x + nx, p.z + nz) + (lift || 4), y2 = T.heightAt(p.x - nx, p.z - nz) + (lift || 4);
      pos.push(p.x + nx, y1, p.z + nz, p.x - nx, y2, p.z - nz);
      c.set(colors[i]); col.push(c.r, c.g, c.b, c.r, c.g, c.b);
      if (i) { var k = i * 2; idx.push(k - 2, k - 1, k, k - 1, k + 1, k); }
    }
    var g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(pos), 3));
    g.setAttribute('color', new THREE.BufferAttribute(new Float32Array(col), 3));
    g.setIndex(idx);
    var m = new THREE.Mesh(g, matRibbon); m.renderOrder = 10; m.frustumCulled = false;
    Wd.preview.add(m);
  };
  Wd.previewLine = function (xyz, color) {
    var g = new THREE.BufferGeometry(), col = [], c = new THREE.Color(color);
    for (var i = 0; i < xyz.length / 3; i++) col.push(c.r, c.g, c.b);
    g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(xyz), 3));
    g.setAttribute('color', new THREE.BufferAttribute(new Float32Array(col), 3));
    var l = new THREE.Line(g, matLineP); l.renderOrder = 11; l.frustumCulled = false;
    Wd.preview.add(l);
  };
  Wd.previewBoxes = function (batch) {
    var m = new THREE.Mesh(batch.build(), new THREE.MeshBasicMaterial({ vertexColors: true, transparent: true, opacity: 0.85, depthTest: false }));
    m.renderOrder = 12; m.frustumCulled = false;
    Wd.preview.add(m);
  };
  Wd.previewRing = function (x, z, r, kind) {
    var m = new THREE.Mesh(ringGeo, kind === 'red' ? matMarkerRed : kind ? matMarkerHot : matMarker);
    m.position.set(x, T.heightAt(x, z) + 6, z); m.scale.set(r, r, r); m.renderOrder = 13;
    Wd.preview.add(m);
  };

  // ---------------------------------------------------------------- labels
  var labelEls = [], dynEls = [], dynHost;
  function initLabels() {
    var host = document.getElementById('labels');
    SK.PLACES.forEach(function (p) {
      var el = document.createElement('div');
      el.className = 'maplabel ' + p.kind;
      el.innerHTML = '<b>' + p.name + '</b>' + (p.kind === 'area' ? '' : '<i>' + SK.fmtInt(Math.round(p.y)) + ' m</i>');
      host.appendChild(el);
      labelEls.push({ el: el, p: new THREE.Vector3(p.x, p.y + (p.kind === 'peak' ? 60 : 90), p.z), far: p.kind === 'village' || p.kind === 'peak' ? 1e9 : 16000 });
    });
    dynHost = document.createElement('div'); host.appendChild(dynHost);
  }
  // name tags for lifts and pistes (shown when zoomed in)
  Wd.refreshDynLabels = function () {
    var G = SK.G; if (!G || !dynHost) return;
    dynHost.innerHTML = ''; dynEls = [];
    function add(html, cls, x, y, z) {
      var el = document.createElement('div'); el.className = 'maplabel tag ' + cls; el.innerHTML = html; el.style.display = 'none';
      dynHost.appendChild(el); dynEls.push({ el: el, p: new THREE.Vector3(x, y, z) });
    }
    G.lifts.forEach(function (l) { add('<b>' + l.name + '</b>', 'lifttag', l.b.x, l.b.y + 40, l.b.z); });
    G.pistes.forEach(function (p, i) {
      var m = p.pts[(p.pts.length / 2) | 0];
      add('<b style="background:' + SK.DIFF[p.diff].css + '">' + (i + 1) + '</b> ' + p.name, 'pistetag', m.x, T.heightAt(m.x, m.z) + 14, m.z);
    });
  };
  var _v = new THREE.Vector3();
  function place(L, w, h) {
    _v.copy(L.p).project(camera);
    if (_v.z > 1 || _v.z < -1 || Math.abs(_v.x) > 1.1 || Math.abs(_v.y) > 1.1) { L.el.style.display = 'none'; return; }
    L.el.style.display = '';
    L.el.style.transform = 'translate(-50%,-100%) translate(' + ((_v.x * 0.5 + 0.5) * w).toFixed(1) + 'px,' + ((-_v.y * 0.5 + 0.5) * h).toFixed(1) + 'px)';
  }
  function updateLabels() {
    var w = window.innerWidth, h = window.innerHeight, i;
    for (i = 0; i < labelEls.length; i++) {
      if (Wd.cam.dist > labelEls[i].far) { labelEls[i].el.style.display = 'none'; continue; }
      place(labelEls[i], w, h);
    }
    var show = Wd.cam.dist < 5200, shown = 0;
    for (i = 0; i < dynEls.length; i++) {
      var L = dynEls[i];
      if (!show || shown > 36 || Math.hypot(L.p.x - Wd.cam.tx, L.p.z - Wd.cam.tz) > Wd.cam.dist * 0.75) { L.el.style.display = 'none'; continue; }
      place(L, w, h); shown++;
    }
  }

  // ---------------------------------------------------------------- snowfall
  var flakes, flakeN = CFG.LOW ? 1200 : 2600;
  function initSnowfall() {
    var p = new Float32Array(flakeN * 3), r = SK.rng(5);
    for (var i = 0; i < flakeN; i++) { p[i * 3] = (r() - 0.5) * 9000; p[i * 3 + 1] = r() * 3600; p[i * 3 + 2] = (r() - 0.5) * 9000; }
    var g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(p, 3));
    flakes = new THREE.Points(g, new THREE.PointsMaterial({ color: 0xffffff, size: 26, sizeAttenuation: true, transparent: true, opacity: 0.85, depthWrite: false, fog: false }));
    flakes.frustumCulled = false; flakes.visible = false;
    scene.add(flakes);
  }

  // ---------------------------------------------------------------- look & weather
  var look = { snow: 2650, fog: 0.000018, top: new THREE.Color(0x6fa4dc), hor: new THREE.Color(0xdfe9f2), sunI: 1, winter: 0 };
  var goal = { snow: 2650, fog: 0.000018, top: new THREE.Color(0x6fa4dc), hor: new THREE.Color(0xdfe9f2), sunI: 1, winter: 0 };
  var WX = {
    sun: { fog: 0.000017, top: 0x5f9bdc, hor: 0xdde9f4, sun: 1.0 },
    cloud: { fog: 0.000028, top: 0xa9bccd, hor: 0xe3e9ee, sun: 0.62 },
    snow: { fog: 0.00006, top: 0xc5ced6, hor: 0xe9edf0, sun: 0.38 },
    storm: { fog: 0.0001, top: 0xaab3bb, hor: 0xdfe3e6, sun: 0.25 },
    summer: { fog: 0.000016, top: 0x4f93dd, hor: 0xd6e8f5, sun: 1.05 },
  };
  Wd.setLook = function (snowline, weather, winter, smLine) {
    var w = WX[weather] || WX.sun;
    goal.snow = snowline; goal.fog = w.fog; goal.top.set(w.top); goal.hor.set(w.hor); goal.sunI = w.sun; goal.winter = winter ? 1 : 0;
    T.uniforms.uSmLine.value = smLine === undefined ? 9999 : smLine;
    flakes.visible = weather === 'snow' || weather === 'storm';
    flakes.material.opacity = weather === 'storm' ? 0.95 : 0.8;
    if (!!winter !== Wd.winterLook) { Wd.winterLook = !!winter; Wd.redrawDecals(); }
  };
  var cTreeS = new THREE.Color(0x2f5a2c), cTreeW = new THREE.Color(0x6f9483), cRoofS = new THREE.Color(0x6b4a3a), cRoofW = new THREE.Color(0xf6f8fb);
  function updateLook(dt) {
    var k = 1 - Math.exp(-dt * 1.6);
    look.snow += (goal.snow - look.snow) * k; look.fog += (goal.fog - look.fog) * k; look.sunI += (goal.sunI - look.sunI) * k;
    look.winter += (goal.winter - look.winter) * k;
    look.top.lerp(goal.top, k); look.hor.lerp(goal.hor, k);
    var u = T.uniforms;
    u.uSnowline.value = look.snow; u.uFogDensity.value = look.fog; u.uFogColor.value.copy(look.hor);
    u.uSunCol.value.set(0.50 * look.sunI, 0.44 * look.sunI, 0.33 * look.sunI);
    var a = 0.60 + (1 - look.sunI) * 0.16;
    u.uAmbCol.value.set(a, a + 0.06 - (1 - look.sunI) * 0.03, a + 0.19 - (1 - look.sunI) * 0.12);
    scene.fog.density = look.fog; scene.fog.color.copy(look.hor);
    sky.material.uniforms.uTop.value.copy(look.top); sky.material.uniforms.uHor.value.copy(look.hor);
    sun.intensity = 2.6 * look.sunI; amb.intensity = 1.9 + (1 - look.sunI) * 0.8;
    matShadow.opacity = 0.34 * Math.max(0, (look.sunI - 0.3) / 0.7);
    var frost = look.winter * T.sstep(2100, 1500, look.snow);
    matTree.color.copy(cTreeS).lerp(cTreeW, frost * 0.85);
    matRoof.color.copy(cRoofS).lerp(cRoofW, look.winter * T.sstep(1900, 1400, look.snow));
    if (flakes.visible) {
      var p = flakes.geometry.attributes.position.array;
      for (var i = 0; i < flakeN; i++) {
        p[i * 3 + 1] -= dt * 420; p[i * 3] += dt * 160;
        if (p[i * 3 + 1] < 0) p[i * 3 + 1] += 3600;
        if (p[i * 3] > 4500) p[i * 3] -= 9000;
      }
      flakes.geometry.attributes.position.needsUpdate = true;
      flakes.position.set(Wd.cam.tx, T.heightAt(Wd.cam.tx, Wd.cam.tz) - 600, Wd.cam.tz);
    }
  }

  // ---------------------------------------------------------------- camera & input (mouse and touch)
  var keys = {};
  Wd.onClick = null; Wd.onMove = null; Wd.onDbl = null; Wd.onRight = null;
  Wd.touch = false;
  var ray = new THREE.Raycaster(), ndc = new THREE.Vector2();
  Wd.pick = function (cx, cy) {
    ndc.set(cx / window.innerWidth * 2 - 1, -(cy / window.innerHeight) * 2 + 1);
    ray.setFromCamera(ndc, camera);
    return T.raycast(ray.ray.origin, ray.ray.direction);
  };
  function pan(dx, dy) {
    var g = Wd.camGoal, k = g.dist / window.innerHeight * 1.25, c = Math.cos(g.yaw), s = Math.sin(g.yaw), sp = Math.max(0.35, Math.sin(g.pitch));
    g.tx -= (dx * c + dy * s / sp) * k;
    g.tz -= (-dx * s + dy * c / sp) * k;
  }
  function initControls() {
    var ptrs = {}, count = 0, drag = null, pinch = null, lastTap = 0, lastX = 0, lastY = 0, pressTimer = null;
    canvas.addEventListener('contextmenu', function (e) { e.preventDefault(); });
    canvas.addEventListener('pointerdown', function (e) {
      try { canvas.setPointerCapture(e.pointerId); } catch (err) { /* ignore */ }
      Wd.touch = e.pointerType === 'touch';
      ptrs[e.pointerId] = { x: e.clientX, y: e.clientY }; count = Object.keys(ptrs).length;
      if (count === 1) {
        drag = { x: e.clientX, y: e.clientY, sx: e.clientX, sy: e.clientY, b: e.button, moved: false, t: performance.now() };
        if (Wd.touch) { clearTimeout(pressTimer); pressTimer = setTimeout(function () { if (drag && !drag.moved && count === 1) { drag.moved = true; if (Wd.onRight) Wd.onRight(e); } }, 650); }
      } else if (count === 2) {
        var k = Object.keys(ptrs), a = ptrs[k[0]], b = ptrs[k[1]];
        pinch = { d: Math.hypot(a.x - b.x, a.y - b.y), ang: Math.atan2(b.y - a.y, b.x - a.x), my: (a.y + b.y) / 2, mx: (a.x + b.x) / 2 };
        if (drag) drag.moved = true;
        clearTimeout(pressTimer);
      }
    });
    canvas.addEventListener('pointermove', function (e) {
      if (ptrs[e.pointerId]) { ptrs[e.pointerId].x = e.clientX; ptrs[e.pointerId].y = e.clientY; }
      var g = Wd.camGoal;
      if (count === 2 && pinch) {
        var k = Object.keys(ptrs), a = ptrs[k[0]], b = ptrs[k[1]];
        var d = Math.hypot(a.x - b.x, a.y - b.y), ang = Math.atan2(b.y - a.y, b.x - a.x), my = (a.y + b.y) / 2, mx = (a.x + b.x) / 2;
        if (pinch.d > 0 && d > 0) g.dist = Math.min(40000, Math.max(450, g.dist * pinch.d / d));
        var da = ang - pinch.ang; if (da > Math.PI) da -= 2 * Math.PI; if (da < -Math.PI) da += 2 * Math.PI;
        g.yaw -= da;
        // two fingers moving together: sideways pans, up/down tilts
        var dmy = my - pinch.my, dmx = mx - pinch.mx;
        if (Math.abs(dmy) > Math.abs(dmx)) g.pitch = Math.min(1.5, Math.max(0.16, g.pitch + dmy * 0.006)); else pan(dmx, 0);
        pinch.d = d; pinch.ang = ang; pinch.my = my; pinch.mx = mx;
      } else if (drag && count === 1) {
        var dx = e.clientX - drag.x, dy = e.clientY - drag.y;
        if (Math.abs(e.clientX - drag.sx) + Math.abs(e.clientY - drag.sy) > (Wd.touch ? 12 : 5)) { drag.moved = true; clearTimeout(pressTimer); }
        if (drag.moved) {
          if (drag.b === 0 && !e.shiftKey) pan(dx, dy);
          else { g.yaw -= dx * 0.005; g.pitch = Math.min(1.5, Math.max(0.16, g.pitch + dy * 0.004)); }
        }
        drag.x = e.clientX; drag.y = e.clientY;
      } else if (!drag && Wd.onMove && e.pointerType !== 'touch') {
        Wd.onMove(Wd.pick(e.clientX, e.clientY), e);
      }
    });
    function up(e) {
      clearTimeout(pressTimer);
      var had = ptrs[e.pointerId];
      delete ptrs[e.pointerId]; count = Object.keys(ptrs).length;
      if (count < 2) pinch = null;
      if (drag && had && count === 0) {
        if (!drag.moved) {
          var now = performance.now(), p = Wd.pick(e.clientX, e.clientY);
          if (drag.b === 0) {
            if (Wd.touch && now - lastTap < 320 && Math.hypot(e.clientX - lastX, e.clientY - lastY) < 28 && Wd.onDbl) Wd.onDbl(p, e);
            else if (Wd.onClick) Wd.onClick(p, e);
            lastTap = now; lastX = e.clientX; lastY = e.clientY;
          }
          if (drag.b === 2 && Wd.onRight) Wd.onRight(e);
        }
        drag = null;
      } else if (count === 1) {                       // one finger left after a pinch: keep panning smoothly
        var k = Object.keys(ptrs)[0];
        drag = { x: ptrs[k].x, y: ptrs[k].y, sx: ptrs[k].x, sy: ptrs[k].y, b: 0, moved: true, t: 0 };
      }
    }
    canvas.addEventListener('pointerup', up);
    canvas.addEventListener('pointercancel', up);
    canvas.addEventListener('dblclick', function (e) { if (!Wd.touch && Wd.onDbl) Wd.onDbl(Wd.pick(e.clientX, e.clientY), e); });
    canvas.addEventListener('wheel', function (e) {
      e.preventDefault();
      var g = Wd.camGoal, f = Math.exp(e.deltaY * 0.0011), old = g.dist;
      g.dist = Math.min(40000, Math.max(450, g.dist * f));
      var p = Wd.pick(e.clientX, e.clientY);
      if (p && g.dist < old) { var t = 1 - g.dist / old; g.tx += (p.x - g.tx) * t; g.tz += (p.z - g.tz) * t; }
    }, { passive: false });
    window.addEventListener('keydown', function (e) { if (e.target.tagName !== 'INPUT') keys[e.key.toLowerCase()] = true; });
    window.addEventListener('keyup', function (e) { keys[e.key.toLowerCase()] = false; });
    window.addEventListener('blur', function () { keys = {}; });
  }
  function updateCamera(dt) {
    var g = Wd.camGoal, c = Wd.cam, mv = g.dist * dt * 0.9, cs = Math.cos(g.yaw), sn = Math.sin(g.yaw);
    var fx = 0, fz = 0;
    if (keys.w || keys.arrowup) fz -= 1; if (keys.s || keys.arrowdown) fz += 1;
    if (keys.a || keys.arrowleft) fx -= 1; if (keys.d || keys.arrowright) fx += 1;
    g.tx += (fx * cs + fz * sn) * mv; g.tz += (-fx * sn + fz * cs) * mv;
    if (keys.q) g.yaw += dt * 1.2; if (keys.e) g.yaw -= dt * 1.2;
    g.tx = Math.max(T.x0, Math.min(-T.x0, g.tx)); g.tz = Math.max(T.z0, Math.min(-T.z0, g.tz));
    var k = 1 - Math.exp(-dt * 9);
    c.tx += (g.tx - c.tx) * k; c.tz += (g.tz - c.tz) * k; c.dist += (g.dist - c.dist) * k;
    c.yaw += (g.yaw - c.yaw) * k; c.pitch += (g.pitch - c.pitch) * k;
    var ty = T.heightAt(c.tx, c.tz), cp = Math.cos(c.pitch);
    camera.position.set(c.tx + Math.sin(c.yaw) * cp * c.dist, ty + Math.sin(c.pitch) * c.dist, c.tz + Math.cos(c.yaw) * cp * c.dist);
    var gy = T.heightAt(camera.position.x, camera.position.z) + 60;
    if (T.inside(camera.position.x, camera.position.z) && camera.position.y < gy) camera.position.y = gy;
    camera.lookAt(c.tx, ty, c.tz);
    sky.position.copy(camera.position);
  }
  Wd.flyTo = function (x, z, dist) { Wd.camGoal.tx = x; Wd.camGoal.tz = z; if (dist) Wd.camGoal.dist = dist; };

  Wd.frame = function (dt) {
    updateCamera(dt); updateLook(dt); Wd.updateLifts(SK.simDt || 0);
    renderer.render(scene, camera);
    updateLabels();
  };
  Wd.camera = function () { return camera; };
})(window.SK);
