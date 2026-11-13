# Arlberg Pioneers

A ski-resort management game on the real terrain of St. Anton am Arlberg, from 1937 into the future.

## Play

Double-click `index.html` (Chrome, Edge or Firefox). No install, no server, works offline.
The game autosaves in the browser while you build and at the start of every summer.

## How a year works

- **Summer – build.** Place lifts and draw pistes. You have limited money and a limited
  number of crew-weeks each summer. A lift must start in a village (yellow circles) or
  where a piste ends; a piste starts at a lift's top station and must end at a lift,
  another piste or a village.
- **Winter – operate.** 120 days pass in about two minutes (1×, 2×, 4× or skip). Guests
  arrive, queue, ski and rate their day. Weather and the snowline change daily.
- **Spring – report.** Profit, reputation, market share and tips from your guests.

Technology arrives with the decades (T-bar and tramway in 1937 … detachable chairs,
funitel, 3S, and beyond), the regional market grows, rivals invest, and the snowline
climbs with the climate. Chapters set goals with deadlines.

## Controls

| | |
|---|---|
| Drag | move the map |
| Right-drag (or Shift-drag) | rotate / tilt |
| Wheel | zoom towards the cursor |
| W A S D, Q E | move, rotate |
| 1–5 | Inspect, Lift, Piste, Hut, Remove |
| Esc / right-click | cancel / undo last piste point |
| Enter / double-click | finish a piste |

## Terrain data

`data/terrain.js` is a 384 × 376 heightmap (~30 m cells, 11.4 × 11.1 km) baked from the
public AWS Terrain Tiles dataset (over Austria: the data.gv.at 10 m DEM).
Re-generate or change the region with:

    python tools/fetch_terrain.py <tile-cache-folder> data/terrain.js

## Files

- `js/config.js` – lift types, technology, campaigns, rivals, events, goals (tune the game here)
- `js/terrain.js` – heightmap sampling, terrain shader (snowline, pistes, slope map)
- `js/world.js` – three.js scene: camera, forests, villages, lifts, guests
- `js/sim.js` – network graph, guests, weather, economy, seasons
- `js/build.js` – lift line engineering (towers, spans, sag), piste drawing
- `js/ui.js`, `js/main.js` – interface and main loop
