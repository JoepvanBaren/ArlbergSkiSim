# Arlberg Pioneers — handover

Paste the short or the full summary into a new chat, together with the repo link.

## Short summary

Arlberg Pioneers is a browser ski-resort tycoon (plain HTML + JavaScript + three.js, no build step)
on the real terrain of the Arlberg: St. Anton, St. Christoph, Stuben, Zürs, Lech, Warth, Schröcken.
You are general manager from 1937 into the future: build lifts and pistes in summer, run the
winter (snow, wind, breakdowns, avalanches, staff), read the spring report, chase chapter goals.
Repo: https://github.com/JoepvanBaren/ArlbergSkiSim — open `index.html` to play. The owner wants
it to look far less like a prototype (reference: playsnowmount.com, Planet Coaster, RCT3) and to
feel quicker and less instructive. Next work is listed under "Backlog" in `HANDOVER.md`.

## Full summary

**Tech.** Static site, classic scripts sharing a global `SK` namespace, three.js r160 vendored.
No server, no bundler. Saves in `localStorage` (key `arlberg-pioneers-save-v3`), export/import as JSON.
`?low=1` forces the light phone graphics, `?high=1` forces full graphics.

**Data.** `data/terrain.js`: 520 × 616 heightmap (~38 m cells, 19.7 × 23.4 km) from AWS Terrain
Tiles. `data/osm.js`: roads, railway, rivers, lakes, 4,304 building footprints, place and peak
positions from OpenStreetMap. Both are baked by the scripts in `tools/`.

**Files.**
- `js/config.js` — all tunable data: lift types, tech, staff, villages, projects, campaigns, rivals, events, goals.
- `js/terrain.js` — height sampling, forest function, terrain shader (snowline by altitude and aspect,
  piste mask texture, decal texture, slope / avalanche overlays, hub rings, no-go zones).
- `js/world.js` — scene, camera with mouse and touch, `Batch` geometry builder (box, roof, cyl, hull),
  trees and blob shadows, villages from OSM, lift stations / towers / vehicles, skiers (instanced),
  props (huts, marker poles, snow lances, snow bridges), labels, weather look.
- `js/sim.js` — game state `SK.G`, network graph (nodes from lift and piste endpoints, hubs = villages),
  guest agents, snow bands and weather plan, lift condition and breakdowns, staff, avalanches,
  economy, season flow, goals, save / load / export.
- `js/build.js` — lift line engineering (towers on the terrain's convex hull, spans, sag), piste and
  ski-route drawing, snapping, no-go zones, touch confirm flow.
- `js/ui.js`, `js/main.js`, `index.html` — HUD, tabs (Goals, Money, Market, Valley, Team, Tech, Resort), loop.
- `tools/devtest.js` — console helpers: `auto()`, `season()`, `aiYear()`, `snowStats()`, `ff()`, `cam()`.

**Game loop.** Summer: build with limited money and crew-weeks, overhaul lifts, hire, develop villages.
Winter: 120 days (0.7 s each at 1×), guests spawn at village hubs with an open lift, queue, ride,
ski, rate. Spring: report, goals, then next year (1938 jumps to 1946).

**Systems in place.** 12 lift types by year; pistes graded blue / red / black by gradient; ski routes;
snow depth per 100 m band with freezing level, aspect, warming; snowmaking per piste (needs cold);
wind holds per lift type; lift condition, rope age, breakdowns; lift crews, mechanics, patrol, piste
crew; avalanche danger 1–5, exposure per piste and lift, blasting tech, snow bridges, no-go zones,
damage and repair; seven communities with bed levels capped by year; valley projects; rivals,
awareness, campaigns, ticket price; free-play buttons (jump years, add money).

**Known weak spots.**
- Connections only form at a piste's end or within ~65 m of its line; near misses look connected.
- Huts are only an income number; no guest visits them.
- One figure stands for several guests when the resort is large (`season.scale`).
- Balance was only checked with a crude computer player (`aiYear`).
- Not tested on a real phone; frame rate never measured in a real browser.
- Light graphics (`CFG.LOW`) switch on automatically for phones and small screens: no tree snow caps,
  no house windows / chimneys, fewer trees, half-resolution terrain. Test detail work with `?high=1`.

## Backlog (owner's requests, not done yet)

**Graphics — the main one.** A first pass is in (terrain ambient occlusion, valley haze, sun glow,
snow-capped three-tier trees, chalets with window rows, eaves and chimneys). Still to do — every asset more detailed: trees, chalets and hotels, skiers,
lift stations, towers, chairs and cabins, piste edges. Target look: playsnowmount.com.

**Feel.** Less instructive (drop the getting-started steps and pre-opening warnings or put them
behind a help button); report as a small card instead of a full-screen stop; more to do in winter.

**Lifts.** Place the lift line beside the piste rather than through its middle; choose where the
queue forms; a clear "connected" marker; cabins and chairs visibly matching the flow of guests.

**Huts.** Auto-connect to the nearest piste; types (bar, lunch, mountain hotel) with different
effects; guests visibly stop there.

**Snowmaking as a system.** Individual snow cannons along a piste; electricity (transformers,
visible cables to lifts and cannons, simple auto-connect within reach); water reservoirs.

**Terrain.** Terrain manipulation (flatten, raise, lower, dig a reservoir); ski tunnels through a
mountain in later years.

**New content.** Night skiing with floodlit pistes; fun park as a shapeable piste with placeable
features; rescue helicopter flying in for injured guests; news stories (lost or injured guests,
damage) that move reputation; wind and temperature playing a bigger role.

**Modes.** Proper split into story mode and free play (pick start year and money, no goals).

**Later.** Multiplayer: start with a same-seed challenge and leaderboard, then rival resorts
sharing one market, then co-op. Needs a small backend and a fully seeded simulation.
