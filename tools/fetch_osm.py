"""Fetch real roads, railway, rivers, lakes, buildings, village and peak names for the Arlberg
from OpenStreetMap (Overpass API) and bake them into data/osm.js.

Map data (c) OpenStreetMap contributors, ODbL.
Usage:  python -I tools/fetch_osm.py <cache_dir> <terrain_js> <output_js>
"""
import json, math, os, re, sys, time, urllib.parse, urllib.request

cache, terrain_js, out = sys.argv[1], sys.argv[2], sys.argv[3]
os.makedirs(cache, exist_ok=True)
meta = json.loads(re.search(r"TERRAIN_DATA = (\{.*?\});", open(terrain_js, encoding="utf-8").read()).group(1))
BB = f'{meta["lat0"]},{meta["lon0"]},{meta["lat1"]},{meta["lon1"]}'
MIRRORS = ["https://overpass-api.de/api/interpreter", "https://overpass.kumi.systems/api/interpreter",
           "https://overpass.private.coffee/api/interpreter", "https://maps.mail.ru/osm/tools/overpass/api/interpreter"]

QUERIES = {
    "lines": f'[out:json][timeout:120];(way["highway"~"^(motorway|trunk|primary|secondary|tertiary|unclassified|residential|living_street|pedestrian)$"]({BB});'
             f'way["railway"="rail"]({BB});way["waterway"="river"]({BB});way["natural"="water"]({BB}););out geom;',
    "buildings": f'[out:json][timeout:120];way["building"]({BB});out bb;',
    "nodes": f'[out:json][timeout:60];(node["place"~"^(town|village|hamlet|suburb)$"]({BB});node["natural"="peak"]["name"]({BB});'
             f'node["railway"~"^(station|halt)$"]({BB});node["mountain_pass"="yes"]["name"]({BB}););out;',
}


def fetch(name, q):
    path = os.path.join(cache, name + ".json")
    if os.path.exists(path) and os.path.getsize(path) > 200:
        return json.load(open(path, encoding="utf-8"))
    for attempt in range(8):
        url = MIRRORS[attempt % len(MIRRORS)]
        try:
            print("query", name, "->", url)
            req = urllib.request.Request(url, data=urllib.parse.urlencode({"data": q}).encode(), headers={"User-Agent": "terrain-fetch/1.0"})
            with urllib.request.urlopen(req, timeout=150) as r:
                raw = r.read().decode("utf-8")
            data = json.loads(raw)
            if "elements" in data:
                open(path, "w", encoding="utf-8").write(raw)
                return data
        except Exception as e:  # busy server, timeout, bad gateway: try the next mirror
            print("  failed:", str(e)[:90])
            time.sleep(4 + attempt * 3)
    raise SystemExit("could not fetch " + name)


W, H = meta["widthM"], meta["heightM"]


def xz(lat, lon):
    return ((lon - meta["lon0"]) / (meta["lon1"] - meta["lon0"]) * W - W / 2,
            (meta["lat1"] - lat) / (meta["lat1"] - meta["lat0"]) * H - H / 2)


def simplify(pts, tol):
    if len(pts) < 3:
        return pts
    keep = [False] * len(pts)
    keep[0] = keep[-1] = True
    stack = [(0, len(pts) - 1)]
    while stack:
        a, b = stack.pop()
        ax, az = pts[a]; bx, bz = pts[b]
        dx, dz = bx - ax, bz - az
        l2 = dx * dx + dz * dz
        best, bi = 0, -1
        for i in range(a + 1, b):
            px, pz = pts[i]
            t = ((px - ax) * dx + (pz - az) * dz) / l2 if l2 else 0
            t = max(0, min(1, t))
            d = math.hypot(px - ax - dx * t, pz - az - dz * t)
            if d > best:
                best, bi = d, i
        if best > tol:
            keep[bi] = True
            stack += [(a, bi), (bi, b)]
    return [p for p, k in zip(pts, keep) if k]


lines = fetch("lines", QUERIES["lines"])
builds = fetch("buildings", QUERIES["buildings"])
nodes = fetch("nodes", QUERIES["nodes"])

ROADCLASS = {"motorway": 0, "trunk": 0, "primary": 1, "secondary": 1, "tertiary": 2, "unclassified": 3,
             "residential": 3, "living_street": 3, "pedestrian": 3}
roads, rails, rivers, lakes, segs = [], [], [], [], []
for el in lines["elements"]:
    t = el.get("tags", {})
    if "geometry" not in el:
        continue
    pts = [xz(g["lat"], g["lon"]) for g in el["geometry"]]
    flat = lambda p: [round(v) for q in p for v in q]
    tunnel = t.get("tunnel") in ("yes", "avalanche_protector", "building_passage") or t.get("covered") == "yes"
    if "highway" in t:
        cls = ROADCLASS[t["highway"]]
        p = simplify(pts, 5)
        roads.append([cls, 1 if t.get("tunnel") == "yes" else 0, flat(p)])
        if t.get("tunnel") != "yes":
            for a, b in zip(pts, pts[1:]):
                segs.append((a[0], a[1], b[0], b[1]))
    elif t.get("railway") == "rail":
        if t.get("service") in ("siding", "yard", "spur"):
            continue
        rails.append([1 if tunnel else 0, flat(simplify(pts, 5))])
    elif t.get("waterway") == "river":
        rivers.append(flat(simplify(pts, 8)))
    elif t.get("natural") == "water" and len(pts) > 3:
        xs = [p[0] for p in pts]; zs = [p[1] for p in pts]
        if (max(xs) - min(xs)) * (max(zs) - min(zs)) > 4000:
            lakes.append(flat(simplify(pts, 6)))

# buildings: centre, footprint size, orientation from the nearest street
cell = 120
grid = {}
for s in segs:
    for gx in range(int(min(s[0], s[2]) // cell), int(max(s[0], s[2]) // cell) + 1):
        for gz in range(int(min(s[1], s[3]) // cell), int(max(s[1], s[3]) // cell) + 1):
            grid.setdefault((gx, gz), []).append(s)
bl = []
for el in builds["elements"]:
    b = el.get("bounds")
    if not b:
        continue
    x0, z1 = xz(b["minlat"], b["minlon"]); x1, z0 = xz(b["maxlat"], b["maxlon"])
    cx, cz, w, d = (x0 + x1) / 2, (z0 + z1) / 2, x1 - x0, z1 - z0
    if w * d < 45 or abs(cx) > W / 2 - 40 or abs(cz) > H / 2 - 40:
        continue
    best, ang = 1e9, 0.0
    gx, gz = int(cx // cell), int(cz // cell)
    for ix in (gx - 1, gx, gx + 1):
        for iz in (gz - 1, gz, gz + 1):
            for s in grid.get((ix, iz), ()):
                dx, dz = s[2] - s[0], s[3] - s[1]
                l2 = dx * dx + dz * dz
                t = max(0, min(1, ((cx - s[0]) * dx + (cz - s[1]) * dz) / l2)) if l2 else 0
                dd = math.hypot(cx - s[0] - dx * t, cz - s[1] - dz * t)
                if dd < best:
                    best, ang = dd, math.atan2(dz, dx)
    area = w * d * (0.62 if best < 1e8 else 0.8)          # bbox of a rotated house overestimates
    side = math.sqrt(area)
    bl.append([round(cx), round(cz), round(min(60, max(7, side * 1.25))), round(min(40, max(6, side * 0.8))), round(ang * 100)])

places, peaks, stations, passes = [], [], [], []
for el in nodes["elements"]:
    t = el.get("tags", {})
    x, z = xz(el["lat"], el["lon"])
    if abs(x) > W / 2 - 150 or abs(z) > H / 2 - 150:
        continue
    name = t.get("name", "")
    if "place" in t and name:
        places.append([name, t["place"], round(x), round(z)])
    elif t.get("natural") == "peak":
        try:
            ele = float(re.sub(r"[^0-9.]", "", t.get("ele", "0")) or 0)
        except ValueError:
            ele = 0
        peaks.append([name, round(ele), round(x), round(z)])
    elif "railway" in t and name:
        stations.append([name, round(x), round(z)])
    elif t.get("mountain_pass") == "yes":
        passes.append([name, round(x), round(z)])
peaks.sort(key=lambda p: -p[1])

data = {"roads": roads, "rails": rails, "rivers": rivers, "lakes": lakes, "buildings": bl, "places": places,
        "peaks": peaks, "stations": stations, "passes": passes}
with open(out, "w", encoding="utf-8") as f:
    f.write("// Roads, railway, rivers, buildings and names: (c) OpenStreetMap contributors, ODbL. Generated by tools/fetch_osm.py\n")
    f.write("window.OSM_DATA = " + json.dumps(data, ensure_ascii=False, separators=(",", ":")) + ";\n")
print({k: len(v) for k, v in data.items()}, os.path.getsize(out), "bytes")
print("places:", [(p[0], p[1]) for p in places])
print("stations:", stations, "passes:", passes)
print("top peaks:", peaks[:40])
