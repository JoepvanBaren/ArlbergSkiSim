// World: three.js scene, camera rig, lifts / pistes / guests visuals
(function (SK) {
  'use strict';
  var T = SK.T, CFG = SK.CFG;
  var Wd = SK.World = {};
  var renderer, scene, camera, canvas, sun, amb, sky;
  var VS = 2.4;                       // vehicle exaggeration so things read from afar

  // ---------------------------------------------------------------- box batching
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
  Batch.prototype.build = function () {
    var g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(this.p), 3));
    g.setAttribute('normal', new THREE.BufferAttribute(new Float32Array(this.n), 3));
    g.setAttribute('color', new THREE.BufferAttribute(new Float32Array(this.c), 3));
    g.setIndex(this.i);
    return g;
  };
  Wd.Batch = Batch;

  var matSolid, matRoof, matTree, matCable, matAgent;

  // ---------------------------------------------------------------- init
  Wd.init = function () {
    canvas = document.getElementById('scene');
    renderer = new THREE.WebGLRenderer({ canvas: canvas, antialias: true, powerPreference: 'high-performance' });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    scene = new THREE.Scene();
    camera = new THREE.PerspectiveCamera(38, 1, 30, 160000);
    scene.fog = new THREE.FogExp2(0xdfe9f2, 0.000028);

    sun = new THREE.DirectionalLight(0xfff0d8, 2.6);
    sun.position.set(T.SUN[0], T.SUN[1], T.SUN[2]);
    scene.add(sun);
    amb = new THREE.HemisphereLight(0xcfe0ff, 0x8a8f99, 1.9);
    scene.add(amb);

    matSolid = new THREE.MeshLambertMaterial({ vertexColors: true });
    matRoof = new THREE.MeshLambertMaterial({ color: 0x6b4a3a });
    matTree = new THREE.MeshLambertMaterial({ vertexColors: true, color: 0x2f5a2c });
    matCable = new THREE.LineBasicMaterial({ color: 0x1c2026 });
    matAgent = new THREE.MeshLambertMaterial({ vertexColors: true });

    // sky dome
    sky = new THREE.Mesh(new THREE.SphereGeometry(120000, 24, 12), new THREE.ShaderMaterial({
      side: THREE.BackSide, depthWrite: false, fog: false,
      uniforms: { uTop: { value: new THREE.Color(0x6fa4dc) }, uHor: { value: new THREE.Color(0xdfe9f2) } },
      vertexShader: 'varying vec3 vP; void main(){ vP = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
      fragmentShader: 'uniform vec3 uTop; uniform vec3 uHor; varying vec3 vP; void main(){ float t = clamp(normalize(vP).y, 0.0, 1.0); gl_FragColor = vec4(mix(uHor, uTop, pow(t, 0.55)), 1.0); }',
    }));
    scene.add(sky);

    // piste overlay texture
    var size = Math.min(4096, renderer.capabilities.maxTextureSize);
    Wd.pCanvas = document.createElement('canvas');
    Wd.pCanvas.width = Wd.pCanvas.height = size;
    Wd.pCtx = Wd.pCanvas.getContext('2d');
    Wd.pTex = new THREE.CanvasTexture(Wd.pCanvas);
    Wd.pTex.flipY = false;
    Wd.pTex.generateMipmaps = true;
    Wd.pTex.minFilter = THREE.LinearMipmapLinearFilter;
    Wd.pTex.anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy());

    Wd.terrain = T.buildMesh(Wd.pTex);
    scene.add(Wd.terrain);

    // hubs
    Wd.hubs = [];
    SK.PLACES.forEach(function (p) {
      var q = T.llToXZ(p.lat, p.lon);
      p.x = q.x; p.z = q.z; p.y = T.heightAt(q.x, q.z);
      if (p.hub) Wd.hubs.push(p);
    });
    Wd.hubs.forEach(function (h, i) { T.uniforms.uHubs.value[i].set(h.x, h.z, CFG.HUB_RADIUS); });

    initVillages(); initTrees(); initAgents(); initLabels(); initSnowfall();
    Wd.liftGroup = new THREE.Group(); scene.add(Wd.liftGroup);
    Wd.hutGroup = new THREE.Group(); scene.add(Wd.hutGroup);
    Wd.preview = new THREE.Group(); scene.add(Wd.preview);
    Wd.liftVis = {};

    Wd.cam = { tx: 300, tz: -300, dist: 9800, yaw: 0.62, pitch: 0.66 };
    Wd.camGoal = { tx: 300, tz: -300, dist: 9800, yaw: 0.62, pitch: 0.66 };
    initControls();
    window.addEventListener('resize', resize);
    resize();
  };

  function resize() {
    var w = window.innerWidth, h = window.innerHeight;
    renderer.setSize(w, h, false);
    camera.aspect = w / h; camera.updateProjectionMatrix();
  }

  // ---------------------------------------------------------------- trees
  var treeMesh, treeCands;
  function initTrees() {
    treeCands = T.treeCandidates();
    var n = treeCands.length / 4;
    var parts = [new THREE.ConeGeometry(7, 16, 5, 1, true).translate(0, 9.5, 0), new THREE.ConeGeometry(4.8, 13, 5, 1, true).translate(0, 18.5, 0)];
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
    Wd.clearN = 768;
    Wd.clear = new Uint8Array(Wd.clearN * Wd.clearN);
    Wd.rebuildTrees();
  }
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
  Wd.rebuildTrees = function () {
    Wd.clear.fill(0);
    var G = SK.G;
    Wd.houses.forEach(function (h) { if (h.on) stamp(h.x, h.z, 16); });
    if (G) {
      G.pistes.forEach(function (p) { for (var i = 0; i < p.pts.length; i++) stamp(p.pts[i].x, p.pts[i].z, p.width / 2 + 14); });
      G.lifts.forEach(function (l) {
        for (var d = 0; d <= l.geom.len; d += 12) stamp(l.a.x + l.geom.ux * d, l.a.z + l.geom.uz * d, 17);
        stamp(l.a.x, l.a.z, 34); stamp(l.b.x, l.b.z, 34);
      });
      G.huts.forEach(function (h) { stamp(h.x, h.z, 30); });
    }
    var arr = treeMesh.instanceMatrix.array, c = 0, n = treeCands.length / 4;
    for (var k = 0; k < n; k++) {
      var x = treeCands[k * 4], y = treeCands[k * 4 + 1], z = treeCands[k * 4 + 2], s = treeCands[k * 4 + 3];
      if (Wd.isCleared(x, z)) continue;
      var o = c * 16;
      arr[o] = s; arr[o + 1] = 0; arr[o + 2] = 0; arr[o + 3] = 0;
      arr[o + 4] = 0; arr[o + 5] = s * 1.1; arr[o + 6] = 0; arr[o + 7] = 0;
      arr[o + 8] = 0; arr[o + 9] = 0; arr[o + 10] = s; arr[o + 11] = 0;
      arr[o + 12] = x; arr[o + 13] = y - 2; arr[o + 14] = z; arr[o + 15] = 1;
      c++;
    }
    treeMesh.count = c;
    treeMesh.instanceMatrix.needsUpdate = true;
  };

  // ---------------------------------------------------------------- villages
  var wallMesh, roofMesh;
  function initVillages() {
    var rnd = SK.rng(1937), list = [];
    SK.PLACES.forEach(function (p) {
      if (!p.houses) return;
      var R = 110 + Math.sqrt(p.houses) * 46, made = 0, tries = 0, mine = [];
      while (made < p.houses && tries < p.houses * 40) {
        tries++;
        var a = rnd() * Math.PI * 2, r = Math.sqrt(rnd()) * R;
        var x = p.x + Math.cos(a) * r * 1.5, z = p.z + Math.sin(a) * r * 0.8;
        if (!T.inside(x, z, 60) || T.slopeAt(x, z) > 0.24 || T.heightAt(x, z) - p.y > 70) continue;
        var ok = true;
        for (var q = 0; q < mine.length; q++) if (Math.hypot(mine[q].x - x, mine[q].z - z) < 26) { ok = false; break; }
        if (!ok) continue;
        var ang = (rnd() < 0.5 ? 0.3 : 1.87) + (rnd() - 0.5) * 0.5;
        mine.push({ x: x, z: z, y: T.heightAt(x, z), ux: Math.cos(ang), uz: Math.sin(ang), s: 0.8 + rnd() * 0.6, rank: 0, wood: rnd() < 0.45, d: r });
        made++;
      }
      mine.sort(function (m, n) { return m.d - n.d; });
      mine.forEach(function (m, i) { m.rank = (i + 0.5) / mine.length; });
      // the main village gets a church
      if (p.name === 'St. Anton' && mine.length) mine[0].church = true;
      list = list.concat(mine);
    });
    list.sort(function (a, b) { return a.rank - b.rank; });
    Wd.houses = list;
    var wb = new Batch(), rb = new Batch();
    list.forEach(function (h) {
      var s = h.s, w = 19 * s, d = 13 * s, ht = 10 * s;
      wb.box(h.x, h.y + ht / 2 - 1, h.z, w, ht + 2, d, h.ux, h.uz, h.wood ? 0x9a6a45 : 0xf3ead8);
      rb.roof(h.x, h.y + ht, h.z, w + 3, 6.5 * s, d + 4, h.ux, h.uz, 0xffffff);
      if (h.church) {
        wb.box(h.x + 16, h.y + 15, h.z + 4, 7, 32, 7, h.ux, h.uz, 0xf7f1e4);
        rb.roof(h.x + 16, h.y + 31, h.z + 4, 8, 13, 8, h.ux, h.uz, 0xffffff);
      } else {                               // keep index counts uniform per house
        wb.box(h.x, h.y - 50, h.z, 0.1, 0.1, 0.1, 1, 0, 0);
        rb.roof(h.x, h.y - 50, h.z, 0.1, 0.1, 0.1, 1, 0, 0);
      }
    });
    wallMesh = new THREE.Mesh(wb.build(), matSolid);
    roofMesh = new THREE.Mesh(rb.build(), matRoof);
    wallMesh.frustumCulled = false; roofMesh.frustumCulled = false;
    scene.add(wallMesh); scene.add(roofMesh);
    Wd.setVillageLevel(0);
  }
  Wd.setVillageLevel = function (lv) {
    var frac = 0.28 + 0.72 * lv / (SK.VILLAGE.length - 1), k = Math.round(Wd.houses.length * frac);
    Wd.houses.forEach(function (h, i) { h.on = i < k; });
    wallMesh.geometry.setDrawRange(0, k * 72);
    roofMesh.geometry.setDrawRange(0, k * 36);
  };

  // ---------------------------------------------------------------- guests
  var agentMesh, AG_MAX;
  var JACKETS = [0xe74c3c, 0x3498db, 0xf1c40f, 0x2ecc71, 0x9b59b6, 0xe67e22, 0x1abc9c, 0xecf0f1, 0xff6fa5, 0x34495e, 0xd35400, 0x27ae60];
  function initAgents() {
    AG_MAX = CFG.MAX_AGENTS + 200;
    var b = new Batch();
    b.box(0, 1.9, 0, 1.5, 2.2, 1.1, 1, 0, 0xffffff);
    b.box(0, 3.5, 0, 0.9, 0.9, 0.9, 1, 0, 0xffe3cc);
    b.box(-0.4, 0.55, 0, 0.45, 1.1, 0.5, 1, 0, 0x555555);
    b.box(0.4, 0.55, 0, 0.45, 1.1, 0.5, 1, 0, 0x555555);
    b.box(0, 0.08, 0.3, 1.5, 0.16, 4.0, 1, 0, 0x333333);
    agentMesh = new THREE.InstancedMesh(b.build(), matAgent, AG_MAX);
    agentMesh.frustumCulled = false;
    var c = new THREE.Color(), rnd = SK.rng(99);
    for (var i = 0; i < AG_MAX; i++) { c.set(JACKETS[(rnd() * JACKETS.length) | 0]); agentMesh.setColorAt(i, c); }
    agentMesh.instanceColor.needsUpdate = true;
    agentMesh.count = 0;
    scene.add(agentMesh);
  }
  // agents: array of {x,y,z,fx,fz,vis}
  Wd.drawAgents = function (agents) {
    var arr = agentMesh.instanceMatrix.array, c = 0;
    var s = Math.min(9, Math.max(2.2, Wd.cam.dist / 520));
    for (var i = 0; i < agents.length && c < AG_MAX; i++) {
      var a = agents[i];
      if (!a.vis) continue;
      var o = c * 16, fx = a.fx, fz = a.fz;
      arr[o] = fz * s; arr[o + 1] = 0; arr[o + 2] = -fx * s; arr[o + 3] = 0;
      arr[o + 4] = 0; arr[o + 5] = s; arr[o + 6] = 0; arr[o + 7] = 0;
      arr[o + 8] = fx * s; arr[o + 9] = 0; arr[o + 10] = fz * s; arr[o + 11] = 0;
      arr[o + 12] = a.x; arr[o + 13] = a.y; arr[o + 14] = a.z; arr[o + 15] = 1;
      c++;
    }
    agentMesh.count = c;
    agentMesh.instanceMatrix.needsUpdate = true;
  };

  // ---------------------------------------------------------------- pistes overlay
  Wd.redrawPistes = function () {
    var ctx = Wd.pCtx, C = Wd.pCanvas.width, sx = C / T.sizeX, sz = C / T.sizeZ, G = SK.G;
    ctx.clearRect(0, 0, C, C);
    ctx.lineJoin = 'round'; ctx.lineCap = 'round';
    function path(p) {
      ctx.beginPath();
      for (var i = 0; i < p.pts.length; i++) {
        var X = (p.pts[i].x - T.x0) * sx, Z = (p.pts[i].z - T.z0) * sz;
        if (i) ctx.lineTo(X, Z); else ctx.moveTo(X, Z);
      }
    }
    G.pistes.forEach(function (p) {
      path(p); ctx.lineWidth = (p.width + 11) * sx; ctx.strokeStyle = SK.DIFF[p.diff].css; ctx.stroke();
    });
    G.pistes.forEach(function (p) {
      path(p); ctx.lineWidth = p.width * sx; ctx.strokeStyle = p.snowmaking ? 'rgb(212,240,255)' : '#ffffff'; ctx.stroke();
    });
    Wd.pTex.needsUpdate = true;
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

  function station(b, p, ux, uz, ty, top) {
    var y = p.y, c = ty.color;
    if (ty.style === 'surface') {
      b.box(p.x, y + 3, p.z, 9, 6, 7, ux, uz, 0x8a5f3f); b.roof(p.x, y + 6, p.z, 11, 3, 9, ux, uz, 0xf4f6f8);
    } else if (ty.style === 'chair') {
      var mod = ty.pph > 2000;
      b.box(p.x, y + 5, p.z, 20, 10, 15, ux, uz, mod ? 0xe9edf0 : 0x94683f);
      b.box(p.x, y + 8.5, p.z, 20.6, 2.4, 15.6, ux, uz, c);
      if (mod) b.box(p.x, y + 10.6, p.z, 22, 1.2, 17, ux, uz, 0xf6f8fa); else b.roof(p.x, y + 10, p.z, 22, 4.5, 17, ux, uz, 0xf4f6f8);
    } else if (ty.style === 'gondola') {
      var k = ty.big ? 1.5 : (ty.twin ? 1.25 : 1);
      b.box(p.x, y + 7 * k, p.z, 30 * k, 14 * k, 22 * k, ux, uz, 0xe6eaee);
      b.box(p.x, y + 5 * k, p.z, 30.6 * k, 5 * k, 22.6 * k, ux, uz, 0x2a3b4d);
      b.box(p.x, y + 11.5 * k, p.z, 30.8 * k, 2.2 * k, 22.8 * k, ux, uz, c);
      b.box(p.x, y + 14.6 * k, p.z, 32 * k, 1.2 * k, 24 * k, ux, uz, 0xf7f9fb);
    } else if (ty.style === 'tram') {
      b.box(p.x, y + 10, p.z, 22, 20, 20, ux, uz, 0xd9d4c7);
      b.box(p.x, y + 13, p.z, 22.6, 4, 20.6, ux, uz, 0x3a4652);
      b.roof(p.x, y + 20, p.z, 24, 7, 23, ux, uz, 0xf4f6f8);
    } else {
      b.box(p.x, y + 5, p.z, 30, 10, 18, ux, uz, 0xf5f7f9);
      b.box(p.x, y + 5, p.z, 30.5, 3, 18.5, ux, uz, 0x12303a);
      b.box(p.x, y + 9, p.z, 30.8, 1.2, 18.8, ux, uz, c);
    }
  }

  function vehicleGeo(ty) {
    var b = new Batch(), c = ty.color, s = VS;
    if (ty.style === 'surface') {
      b.box(0, -3.2 * s, 0, 0.3 * s, 6.4 * s, 0.3 * s, 1, 0, 0x30343a);
      b.box(0, -6.2 * s, 0, 2.6 * s, 0.35 * s, 0.35 * s, 1, 0, 0x30343a);
    } else if (ty.style === 'chair') {
      var w = (1.2 + ty.seats * 0.85) * s;
      b.box(0, -2.4 * s, 0, 0.3 * s, 4.8 * s, 0.3 * s, 1, 0, 0x4a4f57);
      b.box(0, -5.1 * s, 0, w, 0.5 * s, 1.5 * s, 1, 0, 0x30343a);
      b.box(0, -4.4 * s, -0.65 * s, w, 1.4 * s, 0.3 * s, 1, 0, c);
      if (ty.bubble) b.box(0, -3.6 * s, 0, w, 0.5 * s, 1.7 * s, 1, 0, c);
    } else if (ty.style === 'gondola') {
      var k = ty.big ? 1.9 : (ty.twin ? 1.5 : (ty.seats >= 8 ? 1.2 : 1));
      b.box(0, -1.3 * s, 0, 0.4 * s, 2.6 * s, 0.4 * s, 1, 0, 0x4a4f57);
      b.box(0, -4.2 * s * k, 0, 3.0 * s * k, 3.4 * s * k, 3.6 * s * k, 1, 0, c);
      b.box(0, -3.8 * s * k, 0, 3.1 * s * k, 1.3 * s * k, 3.7 * s * k, 1, 0, 0x1d2731);
    } else if (ty.style === 'tram') {
      b.box(0, -2.5 * s, 0, 0.6 * s, 5 * s, 0.6 * s, 1, 0, 0x4a4f57);
      b.box(0, -7.4 * s, 0, 4.4 * s, 4.8 * s, 7.5 * s, 1, 0, c);
      b.box(0, -6.9 * s, 0, 4.5 * s, 1.7 * s, 7.6 * s, 1, 0, 0x1d2731);
    } else {
      b.box(0, 1.6 * s, 0, 2.4 * s, 2.4 * s, 5.2 * s, 1, 0, 0xf6f9fb);
      b.box(0, 1.9 * s, 0, 2.5 * s, 0.9 * s, 5.3 * s, 1, 0, 0x10343c);
      b.box(0, 0.5 * s, 0, 2.5 * s, 0.3 * s, 5.3 * s, 1, 0, c);
    }
    return b.build();
  }

  Wd.addLift = function (lift) {
    Wd.removeLift(lift.id);
    var ty = SK.LIFT[lift.type], g = lift.geom, a = lift.a, b = new Batch(), grp = new THREE.Group();
    var gauge = GAUGE[ty.style] * (ty.big ? 1.5 : 1);
    station(b, lift.a, g.ux, g.uz, ty, false);
    station(b, lift.b, g.ux, g.uz, ty, true);
    g.towers.forEach(function (t) {
      var x = a.x + g.ux * t.d, z = a.z + g.uz * t.d, wd = ty.style === 'tram' || ty.big ? 5.5 : (ty.style === 'surface' ? 1.1 : 2.2);
      b.box(x, t.g + t.h / 2 - 2, z, wd, t.h + 4, wd, g.ux, g.uz, ty.style === 'pod' ? 0xf0f4f7 : 0x8f989f, 0.45);
      b.box(x, t.g + t.h + 0.6, z, 1.6, 1.4, gauge + 3, g.ux, g.uz, 0x6f787f);
    });
    grp.add(new THREE.Mesh(b.build(), matSolid));
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
    Wd.liftVis[lift.id] = { grp: grp, veh: veh, n: n, phase: Math.random() * 100, gauge: gauge, lift: lift, ty: ty };
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
      var L = g.len, loop = 2 * L, sp = ty.style === 'tram' ? 0 : loop / v.n;
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
  Wd.liftSeat = function (lift, d, out) {      // where a riding guest is drawn
    var v = Wd.liftVis[lift.id], g = lift.geom;
    Wd.ropePoint(g, lift.a, d, out);
    var gz = v ? v.gauge / 2 : 4;
    out.x += -g.uz * gz; out.z += g.ux * gz;
    out.y -= (v && v.ty.style === 'surface') ? g.hang : 5.6 * VS;
    return out;
  };

  Wd.rebuildHuts = function () {
    while (Wd.hutGroup.children.length) { var c = Wd.hutGroup.children.pop(); c.geometry.dispose(); }
    if (!SK.G.huts.length) return;
    var b = new Batch();
    SK.G.huts.forEach(function (h) {
      b.box(h.x, h.y + 4, h.z, 20, 10, 14, 0.94, 0.34, 0x8a5a3a);
      b.box(h.x, h.y + 2.2, h.z, 20.5, 2.2, 14.5, 0.94, 0.34, 0xd8d2c4);
      b.roof(h.x, h.y + 9, h.z, 24, 7, 18, 0.94, 0.34, 0xf4f6f8);
      b.box(h.x + 13, h.y + 1, h.z + 9, 9, 1, 7, 0.94, 0.34, 0xc19a6b);
    });
    Wd.hutGroup.add(new THREE.Mesh(b.build(), matSolid));
  };

  // ---------------------------------------------------------------- build previews
  var matRibbon = new THREE.MeshBasicMaterial({ vertexColors: true, transparent: true, opacity: 0.78, depthTest: false, side: THREE.DoubleSide });
  var matMarker = new THREE.MeshBasicMaterial({ color: 0xffb21e, transparent: true, opacity: 0.9, depthTest: false });
  var matMarkerHot = new THREE.MeshBasicMaterial({ color: 0x35e07a, transparent: true, opacity: 0.95, depthTest: false });
  var matLineP = new THREE.LineBasicMaterial({ vertexColors: true, depthTest: false, transparent: true });
  var ringGeo = new THREE.TorusGeometry(1, 0.16, 6, 28).rotateX(Math.PI / 2);
  Wd.clearPreview = function () {
    while (Wd.preview.children.length) {
      var c = Wd.preview.children.pop();
      if (c.geometry !== ringGeo) c.geometry.dispose();
    }
  };
  // pts: [{x,z}], colors per point (THREE.Color or hex), width m
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
  Wd.previewRing = function (x, z, r, hot) {
    var m = new THREE.Mesh(ringGeo, hot ? matMarkerHot : matMarker);
    m.position.set(x, T.heightAt(x, z) + 6, z); m.scale.set(r, r, r); m.renderOrder = 13;
    Wd.preview.add(m);
  };

  // ---------------------------------------------------------------- labels
  var labelEls = [];
  function initLabels() {
    var host = document.getElementById('labels');
    SK.PLACES.forEach(function (p) {
      var el = document.createElement('div');
      el.className = 'maplabel ' + p.kind;
      var alt = Math.round(p.y);
      el.innerHTML = '<b>' + p.name + '</b>' + (p.kind === 'area' ? '' : '<i>' + SK.fmtInt(alt) + ' m</i>');
      host.appendChild(el);
      labelEls.push({ el: el, p: new THREE.Vector3(p.x, p.y + (p.kind === 'peak' ? 60 : 90), p.z) });
    });
  }
  var _v = new THREE.Vector3();
  function updateLabels() {
    var w = window.innerWidth, h = window.innerHeight;
    for (var i = 0; i < labelEls.length; i++) {
      var L = labelEls[i];
      _v.copy(L.p).project(camera);
      if (_v.z > 1 || _v.z < -1 || Math.abs(_v.x) > 1.1 || Math.abs(_v.y) > 1.1) { L.el.style.display = 'none'; continue; }
      L.el.style.display = '';
      L.el.style.transform = 'translate(-50%,-100%) translate(' + ((_v.x * 0.5 + 0.5) * w).toFixed(1) + 'px,' + ((-_v.y * 0.5 + 0.5) * h).toFixed(1) + 'px)';
    }
  }

  // ---------------------------------------------------------------- snowfall
  var flakes, flakeN = 2600;
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
  var look = { snow: 2650, fog: 0.000028, top: new THREE.Color(0x6fa4dc), hor: new THREE.Color(0xdfe9f2), sunI: 1, winter: 0 };
  var goal = { snow: 2650, fog: 0.000028, top: new THREE.Color(0x6fa4dc), hor: new THREE.Color(0xdfe9f2), sunI: 1, winter: 0 };
  var WX = {
    sun: { fog: 0.000026, top: 0x5f9bdc, hor: 0xdde9f4, sun: 1.0 },
    cloud: { fog: 0.000042, top: 0xa9bccd, hor: 0xe3e9ee, sun: 0.62 },
    snow: { fog: 0.000085, top: 0xc5ced6, hor: 0xe9edf0, sun: 0.38 },
    storm: { fog: 0.00014, top: 0xaab3bb, hor: 0xdfe3e6, sun: 0.25 },
    summer: { fog: 0.000024, top: 0x4f93dd, hor: 0xd6e8f5, sun: 1.05 },
  };
  Wd.setLook = function (snowline, weather, winter, smReach) {
    var w = WX[weather] || WX.sun;
    goal.snow = snowline; goal.fog = w.fog; goal.top.set(w.top); goal.hor.set(w.hor); goal.sunI = w.sun; goal.winter = winter ? 1 : 0;
    T.uniforms.uSmReach.value = smReach || 0;
    flakes.visible = weather === 'snow' || weather === 'storm';
    flakes.material.opacity = weather === 'storm' ? 0.95 : 0.8;
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
    // trees and roofs frost over once the snowline drops into the forest
    var frost = look.winter * T.sstep(2100, 1500, look.snow);
    matTree.color.copy(cTreeS).lerp(cTreeW, frost * 0.85);
    matRoof.color.copy(cRoofS).lerp(cRoofW, look.winter * T.sstep(1700, 1300, look.snow));
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

  // ---------------------------------------------------------------- camera & input
  var keys = {};
  Wd.onClick = null; Wd.onMove = null; Wd.onDbl = null; Wd.onRight = null;
  var ray = new THREE.Raycaster(), ndc = new THREE.Vector2();
  Wd.pick = function (cx, cy) {
    ndc.set(cx / window.innerWidth * 2 - 1, -(cy / window.innerHeight) * 2 + 1);
    ray.setFromCamera(ndc, camera);
    return T.raycast(ray.ray.origin, ray.ray.direction);
  };
  function initControls() {
    var drag = null;
    canvas.addEventListener('contextmenu', function (e) { e.preventDefault(); });
    canvas.addEventListener('pointerdown', function (e) {
      canvas.setPointerCapture(e.pointerId);
      drag = { x: e.clientX, y: e.clientY, sx: e.clientX, sy: e.clientY, b: e.button, moved: false };
    });
    canvas.addEventListener('pointermove', function (e) {
      if (drag) {
        var dx = e.clientX - drag.x, dy = e.clientY - drag.y, g = Wd.camGoal;
        if (Math.abs(e.clientX - drag.sx) + Math.abs(e.clientY - drag.sy) > 5) drag.moved = true;
        if (drag.moved) {
          if (drag.b === 0 && !e.shiftKey) {
            var k = g.dist / window.innerHeight * 1.25, c = Math.cos(g.yaw), s = Math.sin(g.yaw);
            g.tx -= (dx * c + dy * s / Math.max(0.35, Math.sin(g.pitch))) * k;
            g.tz -= (-dx * s + dy * c / Math.max(0.35, Math.sin(g.pitch))) * k;
          } else {
            g.yaw -= dx * 0.005; g.pitch = Math.min(1.5, Math.max(0.16, g.pitch + dy * 0.004));
          }
        }
        drag.x = e.clientX; drag.y = e.clientY;
      } else if (Wd.onMove) {
        Wd.onMove(Wd.pick(e.clientX, e.clientY), e);
      }
    });
    canvas.addEventListener('pointerup', function (e) {
      if (drag && !drag.moved) {
        if (drag.b === 0 && Wd.onClick) Wd.onClick(Wd.pick(e.clientX, e.clientY), e);
        if (drag.b === 2 && Wd.onRight) Wd.onRight(e);
      }
      drag = null;
    });
    canvas.addEventListener('dblclick', function (e) { if (Wd.onDbl) Wd.onDbl(Wd.pick(e.clientX, e.clientY), e); });
    canvas.addEventListener('wheel', function (e) {
      e.preventDefault();
      var g = Wd.camGoal, f = Math.exp(e.deltaY * 0.0011), old = g.dist;
      g.dist = Math.min(24000, Math.max(450, g.dist * f));
      var p = Wd.pick(e.clientX, e.clientY);          // zoom towards the cursor
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
