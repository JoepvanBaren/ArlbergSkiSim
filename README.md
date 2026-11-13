# Arlberg Pioneers

A ski-resort management game on the real mountains of the Arlberg — St. Anton, St. Christoph,
Stuben, Zürs, Lech, Warth and Schröcken — from 1937 into the future.

## Play

Open `index.html` in Chrome, Edge, Firefox or Safari. No install, no server, works offline.
On a phone, hold it sideways. The game autosaves in the browser.

Add `?low=1` to the address for lighter graphics, `?high=1` to force full graphics on a phone.

## How a year works

- **Summer – build.** Lifts, pistes, ski routes, huts. Money and crew-weeks are limited.
  A lift starts in a village (yellow circles) or where a piste ends; a piste starts at a lift's
  top station and ends at a lift, another piste or a village. Overhaul worn lifts, replace old
  ropes, repair avalanche damage, hire staff, support the villages.
- **Winter – operate.** 120 days in about two minutes (1×, 2×, 4× or skip). Snow depth is
  tracked by altitude; south faces melt first. Wind stops exposed lifts, lifts break down,
  avalanches bury pistes and take out towers. You can close and reopen things, order
  emergency repairs and mark no-go zones while the season runs.
- **Spring – report.** Profit, reputation, market share, and what your guests thought.

## What to manage

| | |
|---|---|
| Snow | Depth by altitude and aspect, freezing level, good and bad winters, warming decade by decade. Snowmaking (from 1975) only runs when it is cold enough. |
| Lifts | 12 types from T-bar to 3S and beyond. Each has a wind limit, a crew, a condition and a rope that ages. |
| Team | Lift crews per lift (skeleton / standard / full), mechanics, ski patrol, piste crew. |
| Avalanches | Danger level 1–5 every day. Close in time, blast (from 1948), build snow bridges, or mark no-go zones for freeriders. The Avalanche view shows the dangerous slopes. |
| Pistes | Blue / red / black by gradient, numbered and edged in their colour. Ski routes are marked but ungroomed. |
| Valley | Seven villages with real streets and buildings that grow as you support them, at the pace history allows. Valley projects: Flexen galleries, ski bus, car parks, the 2000 railway move… |
| Market | Rival resorts, awareness, campaigns, ticket price. |

## Controls

| Mouse / keyboard | Touch |
|---|---|
| Drag: move · right-drag or Shift-drag: rotate/tilt · wheel: zoom | One finger: move · pinch: zoom · twist: rotate · two fingers up/down: tilt |
| Click: place · double-click or Enter: finish a piste · right-click: undo | Tap: place, then **Build here** · long-press: undo |
| W A S D, Q E · 1–6 pick tools · Esc cancels | |

## Data and credits

- Elevation: AWS Terrain Tiles (over Austria the data.gv.at 10 m DEM), baked to a 520 × 616 grid
  (~38 m cells, 19.7 × 23.4 km) in `data/terrain.js`.
- Roads, railway, rivers, lakes, building footprints, village and peak positions:
  © OpenStreetMap contributors, ODbL, baked to `data/osm.js`.
- Rendering: three.js (MIT).

Regenerate the data (or change the region in the scripts):

    python tools/fetch_terrain.py <tile-cache-folder> data/terrain.js
    python tools/fetch_osm.py <osm-cache-folder> data/terrain.js data/osm.js

Rival resorts carry real names, but their strength in the game is invented.

## Files

- `js/config.js` – lifts, technology, staff, villages, projects, campaigns, rivals, events, goals (tune the game here)
- `js/terrain.js` – heightmap sampling and the terrain shader (snowline, aspect, pistes, overlays)
- `js/world.js` – three.js scene: camera and touch input, forests, villages, lifts, guests
- `js/sim.js` – network graph, guests, snow and weather, staff, maintenance, avalanches, economy
- `js/build.js` – lift line engineering, piste and route drawing, no-go zones
- `js/ui.js`, `js/main.js` – interface and main loop
- `tools/devtest.js` – balancing helpers for the browser console (not loaded by the game)
