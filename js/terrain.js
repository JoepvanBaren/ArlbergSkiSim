// Terrain: real heightmap of the Arlberg, sampling helpers, shaded mesh, forest
(function (SK) {
  'use strict';
  var T = SK.T = {};
  var W, H, hgt;
  T.MAXHUBS = 12; T.MAXZONES = 10;

  T.init = function () {
    var D = window.TERRAIN_DATA;
    W = D.w; H = D.h;
    var bin = atob(D.b64), n = W * H, i, j;
    hgt = new Float32Array(n);
    for (i = 0; i < n; i++) hgt[i] = (bin.charCodeAt(i * 2) | (bin.charCodeAt(i * 2 + 1) << 8)) / 10;
    if (SK.CFG.LOW) {                       // phones: half resolution mesh, same mountains
      var W2 = (W + 1) >> 1, H2 = (H + 1) >> 1, h2 = new Float32Array(W2 * H2);
      for (j = 0; j < H2; j++) for (i = 0; i < W2; i++) h2[j * W2 + i] = hgt[Math.min(H - 1, j * 2) * W + Math.min(W - 1, i * 2)];
      hgt = h2; W = W2; H = H2;
    }
    T.W = W; T.H = H; T.h = hgt;
    T.sizeX = D.widthM; T.sizeZ = D.heightM;
    T.dx = T.sizeX / (W - 1); T.dz = T.sizeZ / (H - 1);
    T.x0 = -T.sizeX / 2; T.z0 = -T.sizeZ / 2;
    T.minH = D.minH; T.maxH = D.maxH;
    T.meta = D;
  };

  T.llToXZ = function (lat, lon) {
    var D = T.meta;
    return {
      x: T.x0 + (lon - D.lon0) / (D.lon1 - D.lon0) * T.sizeX,
      z: T.z0 + (D.lat1 - lat) / (D.lat1 - D.lat0) * T.sizeZ,
    };
  };

  // exact height of the rendered triangle mesh
  T.heightAt = function (x, z) {
    var gx = (x - T.x0) / T.dx, gz = (z - T.z0) / T.dz;
    if (gx < 0) gx = 0; else if (gx > W - 1.001) gx = W - 1.001;
    if (gz < 0) gz = 0; else if (gz > H - 1.001) gz = H - 1.001;
    var i = gx | 0, j = gz | 0, fx = gx - i, fz = gz - j, k = j * W + i;
    var a = hgt[k], b = hgt[k + 1], c = hgt[k + W], d = hgt[k + W + 1];
    if (fx + fz <= 1) return a + (b - a) * fx + (c - a) * fz;
    return d + (c - d) * (1 - fx) + (b - d) * (1 - fz);
  };
  T.gradAt = function (x, z) {
    var e = 30;
    return [(T.heightAt(x + e, z) - T.heightAt(x - e, z)) / (2 * e), (T.heightAt(x, z + e) - T.heightAt(x, z - e)) / (2 * e)];
  };
  T.slopeAt = function (x, z) { var g = T.gradAt(x, z); return Math.sqrt(g[0] * g[0] + g[1] * g[1]); };
  // +1 = faces due south (sunny, melts first), -1 = faces north
  T.southAt = function (x, z) { var g = T.gradAt(x, z), l = Math.hypot(g[0], g[1]); return l > 0.02 ? -g[1] / l : 0; };
  T.inside = function (x, z, m) {
    m = m || 0;
    return x > T.x0 + m && x < -T.x0 - m && z > T.z0 + m && z < -T.z0 - m;
  };

  // ---- noise -------------------------------------------------------------
  function hash(i, j) {
    var n = Math.sin(i * 127.1 + j * 311.7) * 43758.5453;
    return n - Math.floor(n);
  }
  function vnoise(x, y) {
    var i = Math.floor(x), j = Math.floor(y), fx = x - i, fy = y - j;
    fx = fx * fx * (3 - 2 * fx); fy = fy * fy * (3 - 2 * fy);
    var a = hash(i, j), b = hash(i + 1, j), c = hash(i, j + 1), d = hash(i + 1, j + 1);
    return a + (b - a) * fx + (c - a) * fy + (a - b - c + d) * fx * fy;
  }
  function fbm(x, y) { return vnoise(x, y) * 0.6 + vnoise(x * 2.3 + 5.1, y * 2.3 + 1.7) * 0.4; }
  function sstep(a, b, x) { var t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); }
  T.sstep = sstep;

  // forest density 0..1 (below the tree line, not on cliffs, valley floors kept as meadow; north slopes are denser)
  T.forestAt = function (x, z) {
    var h = T.heightAt(x, z), g = T.gradAt(x, z), s = Math.sqrt(g[0] * g[0] + g[1] * g[1]);
    var tl = SK.CFG.TREELINE + (fbm(x / 900, z / 900) - 0.5) * 300 - (s > 0.02 ? -g[1] / s : 0) * 60;
    var f = 1 - sstep(tl - 140, tl + 40, h);
    f *= 1 - sstep(0.8, 1.05, s);
    f *= sstep(0.07, 0.2, s + sstep(1500, 1700, h) * 0.08);      // flat valley floors and high plateaus = meadows
    f *= 0.12 + 0.88 * sstep(0.26, 0.44, fbm(x / 420 + 7.3, z / 420 + 3.9));
    return f;
  };

  // ---- baked sun shadow --------------------------------------------------
  T.SUN = (function () { var v = [0.50, 0.50, 0.70], l = Math.hypot(v[0], v[1], v[2]); return [v[0] / l, v[1] / l, v[2] / l]; })();

  function bakeShade() {
    var out = new Float32Array(W * H);
    var hl = Math.hypot(T.SUN[0], T.SUN[2]), hx = T.SUN[0] / hl, hz = T.SUN[2] / hl, tanA = T.SUN[1] / hl;
    var step = Math.max(38, T.dx), maxSteps = 150, maxH = T.maxH;
    for (var j = 0; j < H; j++) {
      for (var i = 0; i < W; i++) {
        var x = T.x0 + i * T.dx, z = T.z0 + j * T.dz, h0 = hgt[j * W + i] + 3, sh = 1;
        for (var k = 1; k < maxSteps; k++) {
          var d = k * step, ry = h0 + tanA * d;
          if (ry > maxH) break;
          var px = x + hx * d, pz = z + hz * d;
          if (px < T.x0 || px > -T.x0 || pz < T.z0 || pz > -T.z0) break;
          var clear = (ry - T.heightAt(px, pz)) / (d * 0.07 + 12);
          if (clear < sh) { sh = clear; if (sh <= 0) { sh = 0; break; } }
        }
        out[j * W + i] = sh;
      }
    }
    return out;
  }
  T.shadeAt = function (x, z) {
    var i = Math.round((x - T.x0) / T.dx), j = Math.round((z - T.z0) / T.dz);
    if (i < 0 || j < 0 || i >= W || j >= H) return 1;
    return T.shade[j * W + i];
  };

  // ---- mesh ---------------------------------------------------------------
  var VERT = [
    'attribute float aShade; attribute float aForest;',
    'varying float vH; varying vec3 vN; varying float vShade; varying float vForest; varying vec2 vUv2; varying vec3 vW; varying float vDist;',
    'void main(){ vH = position.y; vN = normal; vShade = aShade; vForest = aForest; vUv2 = uv; vW = position;',
    ' vec4 mv = modelViewMatrix * vec4(position,1.0); vDist = length(mv.xyz); gl_Position = projectionMatrix * mv; }'
  ].join('\n');

  var FRAG = [
    'precision highp float;',
    'uniform sampler2D uPiste; uniform sampler2D uDecal; uniform vec3 uSun; uniform float uSnowline; uniform float uSmLine; uniform vec3 uFogColor; uniform float uFogDensity;',
    'uniform float uContour; uniform float uOverlay; uniform vec3 uHubs[' + T.MAXHUBS + ']; uniform float uShowHubs; uniform vec3 uZones[' + T.MAXZONES + '];',
    'uniform vec3 uSunCol; uniform vec3 uAmbCol; uniform float uTime;',
    'varying float vH; varying vec3 vN; varying float vShade; varying float vForest; varying vec2 vUv2; varying vec3 vW; varying float vDist;',
    'float hash(vec2 p){ return fract(sin(dot(p, vec2(127.1,311.7))) * 43758.5453); }',
    'float noise(vec2 p){ vec2 i=floor(p), f=fract(p); f=f*f*(3.0-2.0*f);',
    ' return mix(mix(hash(i),hash(i+vec2(1,0)),f.x), mix(hash(i+vec2(0,1)),hash(i+vec2(1,1)),f.x), f.y); }',
    'void main(){',
    ' vec3 N = normalize(vN);',
    ' float steep = sqrt(max(0.0, 1.0 - N.y*N.y)) / max(N.y, 0.05);',       // rise / run
    ' float n1 = noise(vW.xz/260.0), n2 = noise(vW.xz/37.0), n3 = noise(vW.xz/9.0);',
    ' vec3 meadow = mix(vec3(0.42,0.55,0.26), vec3(0.61,0.60,0.38), smoothstep(1500.0, 2450.0, vH + n1*200.0));',
    ' meadow *= 0.92 + 0.16*n2;',
    // rock: layered strata, darker in the cracks
    ' float strata = noise(vec2(vH/14.0 + n1*3.0, (vW.x+vW.z)/420.0));',
    ' vec3 rock = mix(vec3(0.60,0.56,0.51), vec3(0.37,0.36,0.36), strata*0.55 + n2*0.3 + n3*0.15);',
    ' vec3 forestFloor = vec3(0.20,0.30,0.17);',
    ' float rockF = clamp(smoothstep(0.58, 0.88, steep + n2*0.14) + smoothstep(2350.0, 2800.0, vH + n1*250.0)*0.75, 0.0, 1.0);',
    ' vec3 summer = mix(meadow, forestFloor, vForest*0.85);',
    ' summer = mix(summer, rock, rockF);',
    // snow: sunny south faces lose it first, steep rock sheds it
    ' float hEff = vH - N.z * 300.0 + (n1 - 0.5) * 200.0;',
    ' float hs = smoothstep(uSnowline - 100.0, uSnowline + 100.0, hEff);',
    ' float snowAmt = hs * (1.0 - smoothstep(0.86, 1.32, steep + n2*0.22 + n3*0.08));',
    ' vec3 snow = vec3(0.985, 0.985, 0.99) * (0.985 + 0.02*n2);',
    ' vec3 col = mix(summer, snow, snowAmt);',
    // pistes: R = groomed core, G = snowmaking
    ' vec4 P = texture2D(uPiste, vUv2);',
    ' float core = P.r;',
    ' float pSnow = max(hs, step(0.5, P.g) * step(uSmLine, vH + 5.0));',
    ' vec3 pGrass = mix(summer, vec3(0.70,0.72,0.47), 0.7);',
    ' float cord = 0.985 + 0.03 * step(0.5, fract((vW.x + vW.z) / 9.0));',
    ' vec3 coreCol = mix(pGrass, vec3(0.925,0.955,1.0) * cord, pSnow);',
    ' col = mix(col, coreCol, core);',
    // decals: piste edges, roads, rail, rivers, avalanche debris
    ' vec4 D = texture2D(uDecal, vUv2);',
    ' col = mix(col, D.rgb, D.a);',
    // planning overlays
    ' if (uOverlay > 0.5 && uOverlay < 1.5) {',
    '  vec3 oc = steep <= 0.25 ? vec3(0.25,0.55,0.95) : (steep <= 0.40 ? vec3(0.92,0.25,0.22) : (steep <= 0.85 ? vec3(0.12,0.13,0.16) : vec3(0.55,0.35,0.6)));',
    '  col = mix(col, oc, 0.32 * (1.0 - core));',
    ' } else if (uOverlay > 1.5) {',                                          // avalanche terrain: 30-45 degrees, no forest
    '  float av = smoothstep(0.52, 0.62, steep) * (1.0 - smoothstep(1.05, 1.3, steep)) * (1.0 - smoothstep(0.25, 0.6, vForest));',
    '  col = mix(col, mix(vec3(1.0,0.62,0.1), vec3(0.9,0.12,0.1), smoothstep(0.62, 0.85, steep)), av * 0.6);',
    ' }',
    ' float cl = vH / 100.0; float cf = abs(fract(cl - 0.5) - 0.5) / fwidth(cl);',
    ' col = mix(col, col * 0.72, (1.0 - min(cf, 1.0)) * uContour * (1.0 - core) * (1.0 - smoothstep(9000.0, 20000.0, vDist)));',
    ' if (uShowHubs > 0.5) { for (int i = 0; i < ' + T.MAXHUBS + '; i++) { if (uHubs[i].z < 1.0) continue; float d = distance(vW.xz, uHubs[i].xy);',
    '   float ring = 1.0 - smoothstep(0.0, 14.0, abs(d - uHubs[i].z)); float fill = (1.0 - step(uHubs[i].z, d)) * 0.16;',
    '   col = mix(col, vec3(1.0, 0.72, 0.15), max(ring * 0.9, fill)); } }',
    ' for (int i = 0; i < ' + T.MAXZONES + '; i++) { if (uZones[i].z < 1.0) continue; float d = distance(vW.xz, uZones[i].xy);',
    '   float ring = 1.0 - smoothstep(0.0, 10.0, abs(d - uZones[i].z)); float hatch = step(0.55, fract((vW.x - vW.z) / 46.0)) * (1.0 - step(uZones[i].z, d));',
    '   col = mix(col, vec3(0.86, 0.1, 0.1), max(ring * 0.95, hatch * 0.42)); }',
    // light
    ' float nl = max(dot(N, uSun), 0.0);',
    ' float lit = nl * vShade;',
    ' vec3 light = uAmbCol * (0.80 + 0.20 * N.y) + uSunCol * lit;',
    ' col *= light;',
    ' float fog = 1.0 - exp(-uFogDensity * uFogDensity * vDist * vDist);',
    ' col = mix(col, uFogColor, clamp(fog, 0.0, 1.0));',
    ' gl_FragColor = vec4(col, 1.0);',
    '}'
  ].join('\n');

  T.buildMesh = function (pisteTexture, decalTexture) {
    var n = W * H;
    var pos = new Float32Array(n * 3), nor = new Float32Array(n * 3), uv = new Float32Array(n * 2);
    var forest = new Float32Array(n);
    var shade = bakeShade();
    for (var j = 0; j < H; j++) {
      for (var i = 0; i < W; i++) {
        var k = j * W + i, x = T.x0 + i * T.dx, z = T.z0 + j * T.dz;
        pos[k * 3] = x; pos[k * 3 + 1] = hgt[k]; pos[k * 3 + 2] = z;
        var hl = hgt[j * W + Math.max(0, i - 1)], hr = hgt[j * W + Math.min(W - 1, i + 1)];
        var hu = hgt[Math.max(0, j - 1) * W + i], hd = hgt[Math.min(H - 1, j + 1) * W + i];
        var nx = -(hr - hl) / (2 * T.dx), nz = -(hd - hu) / (2 * T.dz), l = Math.hypot(nx, 1, nz);
        nor[k * 3] = nx / l; nor[k * 3 + 1] = 1 / l; nor[k * 3 + 2] = nz / l;
        uv[k * 2] = i / (W - 1); uv[k * 2 + 1] = j / (H - 1);
        forest[k] = T.forestAt(x, z);
      }
    }
    var idx = new Uint32Array((W - 1) * (H - 1) * 6), p = 0;
    for (j = 0; j < H - 1; j++) {
      for (i = 0; i < W - 1; i++) {
        var a = j * W + i, b = a + 1, c = a + W, d = c + 1;
        idx[p++] = a; idx[p++] = c; idx[p++] = b; idx[p++] = b; idx[p++] = c; idx[p++] = d;
      }
    }
    var geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    geo.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
    geo.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
    geo.setAttribute('aShade', new THREE.BufferAttribute(shade, 1));
    geo.setAttribute('aForest', new THREE.BufferAttribute(forest, 1));
    geo.setIndex(new THREE.BufferAttribute(idx, 1));
    geo.computeBoundingSphere();
    T.shade = shade;
    var hubs = [], zones = [];
    for (i = 0; i < T.MAXHUBS; i++) hubs.push(new THREE.Vector3());
    for (i = 0; i < T.MAXZONES; i++) zones.push(new THREE.Vector3());
    T.uniforms = {
      uPiste: { value: pisteTexture }, uDecal: { value: decalTexture },
      uSun: { value: new THREE.Vector3(T.SUN[0], T.SUN[1], T.SUN[2]) },
      uSnowline: { value: 2650 }, uSmLine: { value: 9999 }, uTime: { value: 0 },
      uFogColor: { value: new THREE.Color(0xdfe9f2) }, uFogDensity: { value: 0.000018 },
      uContour: { value: 0 }, uOverlay: { value: 0 }, uShowHubs: { value: 0 },
      uHubs: { value: hubs }, uZones: { value: zones },
      uSunCol: { value: new THREE.Vector3(0.50, 0.44, 0.33) }, uAmbCol: { value: new THREE.Vector3(0.60, 0.66, 0.79) },
    };
    var mat = new THREE.ShaderMaterial({ vertexShader: VERT, fragmentShader: FRAG, uniforms: T.uniforms });
    var mesh = new THREE.Mesh(geo, mat);
    mesh.frustumCulled = false;

    // diorama skirt
    var sp = [], si = [], base = T.minH - 320, q = 0;
    function edge(ax, az, ah, bx, bz, bh) {
      sp.push(ax, ah, az, bx, bh, bz, ax, base, az, bx, base, bz);
      si.push(q, q + 2, q + 1, q + 1, q + 2, q + 3); q += 4;
    }
    for (i = 0; i < W - 1; i++) {
      var xa = T.x0 + i * T.dx, xb = xa + T.dx;
      edge(xb, T.z0, hgt[i + 1], xa, T.z0, hgt[i]);
      edge(xa, -T.z0, hgt[(H - 1) * W + i], xb, -T.z0, hgt[(H - 1) * W + i + 1]);
    }
    for (j = 0; j < H - 1; j++) {
      var za = T.z0 + j * T.dz, zb = za + T.dz;
      edge(T.x0, za, hgt[j * W], T.x0, zb, hgt[(j + 1) * W]);
      edge(-T.x0, zb, hgt[(j + 1) * W + W - 1], -T.x0, za, hgt[j * W + W - 1]);
    }
    var sg = new THREE.BufferGeometry();
    sg.setAttribute('position', new THREE.BufferAttribute(new Float32Array(sp), 3));
    sg.setIndex(si);
    var skirt = new THREE.Mesh(sg, new THREE.MeshBasicMaterial({ color: 0x4a5560, side: THREE.DoubleSide }));
    var group = new THREE.Group();
    group.add(mesh); group.add(skirt);
    return group;
  };

  // ---- trees ---------------------------------------------------------------
  T.treeCandidates = function () {
    var rnd = SK.rng(4711), out = [], sp = SK.CFG.LOW ? 52 : 34;
    for (var z = T.z0 + 20; z < -T.z0 - 20; z += sp) {
      for (var x = T.x0 + 20; x < -T.x0 - 20; x += sp) {
        var px = x + (rnd() - 0.5) * sp, pz = z + (rnd() - 0.5) * sp, r = rnd(), r2 = rnd();
        var f = T.forestAt(px, pz);
        if (r < f * 0.92) out.push(px, T.heightAt(px, pz), pz, 0.8 + r2 * 0.7);
      }
    }
    return new Float32Array(out);
  };

  // ---- ray picking -----------------------------------------------------------
  T.raycast = function (o, d) {
    var t = 0, step = 25, prev = 0;
    for (var k = 0; k < 3200; k++) {
      var x = o.x + d.x * t, y = o.y + d.y * t, z = o.z + d.z * t;
      if (y < T.minH - 50 && d.y <= 0) return null;
      if (T.inside(x, z, 0) && y <= T.heightAt(x, z)) {
        var lo = prev, hi = t;
        for (var b = 0; b < 12; b++) {
          var m = (lo + hi) / 2, mx = o.x + d.x * m, mz = o.z + d.z * m;
          if (o.y + d.y * m <= T.heightAt(mx, mz)) hi = m; else lo = m;
        }
        x = o.x + d.x * hi; z = o.z + d.z * hi;
        return { x: x, y: T.heightAt(x, z), z: z };
      }
      prev = t;
      t += step; if (t > 3000) step = 60;
    }
    return null;
  };
})(window.SK);
