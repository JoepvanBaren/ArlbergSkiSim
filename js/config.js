// Arlberg Pioneers - static game data
window.SK = window.SK || {};
(function (SK) {
  'use strict';

  SK.CFG = {
    START_YEAR: 1937,
    START_MONEY: 480000,
    SEASON_DAYS: 120,          // Dec 1 .. Mar 30
    DAY_SEC: 1.2,              // real seconds per game day at 1x
    SNAP: 110,                 // metres: endpoints closer than this connect
    HUB_RADIUS: 360,           // metres: valley station zone around a village
    MAX_AGENTS: 1300,
    // lighter graphics on phones; force with ?low=1 or ?high=1 in the address
    LOW: /low=1/.test(location.search) || (!/high=1/.test(location.search) && (/Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent) || Math.min(window.screen.width, window.screen.height) < 600)),
    BASE_CREW_WEEKS: 24,
    TREELINE: 1960,
  };

  // Communities own the beds; hubs are the valley-station zones guests start from.
  // bedsMax ~ guest beds today. Village buildings and streets come from OpenStreetMap and are revealed as a community develops.
  SK.COMMUNITIES = [
    { id: 'anton', name: 'St. Anton', bedsMax: 10500, train: 220 },
    { id: 'christoph', name: 'St. Christoph', bedsMax: 700 },
    { id: 'stuben', name: 'Stuben', bedsMax: 750 },
    { id: 'zuers', name: 'Zürs', bedsMax: 1900, flexen: true },
    { id: 'lech', name: 'Lech', bedsMax: 7200, flexen: true },
    { id: 'warth', name: 'Warth', bedsMax: 2400, flexen: true },
    { id: 'schroecken', name: 'Schröcken', bedsMax: 900 },
  ];
  SK.VILLAGE_FRAC = [0.08, 0.15, 0.25, 0.37, 0.5, 0.63, 0.76, 0.88, 1.0];
  SK.VILLAGE_CAP = [[1937, 2], [1952, 3], [1963, 4], [1973, 5], [1984, 6], [1996, 7], [2008, 8]];   // real-world pace of development

  SK.PLACES = [
    { name: 'St. Anton', osm: 'St. Anton am Arlberg', lat: 47.1287, lon: 10.2670, kind: 'village', hub: true, com: 'anton', weight: 0.7 },
    { name: 'Nasserein', lat: 47.1345, lon: 10.2820, kind: 'village', hub: true, com: 'anton', weight: 0.3 },
    { name: 'St. Jakob', osm: 'Sankt Jakob am Arlberg', lat: 47.1410, lon: 10.3000, kind: 'village', com: 'anton' },
    { name: 'St. Christoph', osm: 'St. Christoph', lat: 47.1283, lon: 10.2135, kind: 'village', hub: true, com: 'christoph', weight: 1 },
    { name: 'Stuben', osm: 'Stuben', lat: 47.1367, lon: 10.1617, kind: 'village', hub: true, com: 'stuben', weight: 1 },
    { name: 'Zürs', lat: 47.1700, lon: 10.1633, kind: 'village', hub: true, com: 'zuers', weight: 1 },
    { name: 'Lech', lat: 47.2083, lon: 10.1417, kind: 'village', hub: true, com: 'lech', weight: 0.65 },
    { name: 'Oberlech', lat: 47.2117, lon: 10.1283, kind: 'village', hub: true, com: 'lech', weight: 0.2 },
    { name: 'Zug', lat: 47.1960, lon: 10.1080, kind: 'village', hub: true, com: 'lech', weight: 0.15 },
    { name: 'Warth', lat: 47.2583, lon: 10.1833, kind: 'village', hub: true, com: 'warth', weight: 1 },
    { name: 'Schröcken', lat: 47.2583, lon: 10.0917, kind: 'village', hub: true, com: 'schroecken', weight: 1 },
    { name: 'Langen', osm: 'Langen am Arlberg', lat: 47.1320, lon: 10.1220, kind: 'area' },
    { name: 'Valluga', lat: 47.1576, lon: 10.2131, kind: 'peak' },
    { name: 'Weißschrofenspitze', lat: 47.1560, lon: 10.2468, kind: 'peak' },
    { name: 'Trittkopf', lat: 47.1549, lon: 10.1923, kind: 'peak' },
    { name: 'Rüfikopf', lat: 47.2010, lon: 10.1697, kind: 'peak' },
    { name: 'Omeshorn', lat: 47.1860, lon: 10.1281, kind: 'peak' },
    { name: 'Hasenfluh', lat: 47.1682, lon: 10.1392, kind: 'peak' },
    { name: 'Kriegerhorn', lat: 47.2136, lon: 10.1121, kind: 'peak' },
    { name: 'Mohnenfluh', lat: 47.2324, lon: 10.1021, kind: 'peak' },
    { name: 'Karhorn', lat: 47.2478, lon: 10.1517, kind: 'peak' },
    { name: 'Saloberkopf', lat: 47.2573, lon: 10.1366, kind: 'peak' },
    { name: 'Galzig', lat: 47.1344, lon: 10.2237, kind: 'peak' },
    { name: 'Kapall', lat: 47.1478, lon: 10.2497, kind: 'peak' },
    { name: 'Gampen', lat: 47.1392, lon: 10.2553, kind: 'area' },
    { name: 'Rendl', lat: 47.1108, lon: 10.2480, kind: 'area' },
    { name: 'Albona', lat: 47.1180, lon: 10.1650, kind: 'area' },
    { name: 'Flexenpass', lat: 47.1583, lon: 10.1650, kind: 'area' },
    { name: 'Verwall', lat: 47.0960, lon: 10.2180, kind: 'area' },
  ];

  // style: surface | chair | gondola | tram | pod
  SK.LIFTS = [
    { id: 'tbar', name: 'T-bar tow', year: 1937, style: 'surface', pph: 700, speed: 55, base: 55000, perM: 170, tower: 1500,
      minLen: 200, maxLen: 1400, op: 170, comfort: 0.30, weeks: 4, wind: 1, seats: 2, spacing: 60, color: 0xd9a441,
      blurb: 'Cheap and tough. Follows the ground, so it needs a steady uphill line.' },
    { id: 'tram', name: 'Aerial tramway', year: 1937, style: 'tram', pph: 420, speed: 120, base: 620000, perM: 420, tower: 60000,
      minLen: 600, maxLen: 3800, op: 800, comfort: 0.60, weeks: 14, wind: 0, seats: 40, spacing: 0, color: 0xc0392b,
      blurb: 'Two big cabins on a long span. Reaches summits nothing else can - but slow to fill.' },
    { id: 'single', name: 'Single chairlift', year: 1946, style: 'chair', pph: 480, speed: 42, base: 110000, perM: 230, tower: 6000,
      minLen: 250, maxLen: 1900, op: 210, comfort: 0.40, weeks: 6, wind: 0, seats: 1, spacing: 50, color: 0x5d6d7e,
      blurb: 'One seat, one blanket. Crosses rough ground a tow cannot.' },
    { id: 'double', name: 'Double chairlift', year: 1955, style: 'chair', pph: 1150, speed: 45, base: 230000, perM: 300, tower: 9000,
      minLen: 250, maxLen: 2200, op: 330, comfort: 0.50, weeks: 7, wind: 0, seats: 2, spacing: 48, color: 0x2e86c1,
      blurb: 'The workhorse of the boom years.' },
    { id: 'gondola4', name: '4-seat gondola', year: 1968, style: 'gondola', pph: 1500, speed: 85, base: 1300000, perM: 850, tower: 28000,
      minLen: 500, maxLen: 3600, op: 1150, comfort: 0.75, weeks: 12, wind: 0, seats: 4, spacing: 70, color: 0xe67e22,
      blurb: 'Warm, enclosed, and it carries people back down too.' },
    { id: 'quad', name: 'Detachable quad', year: 1984, style: 'chair', pph: 2400, speed: 95, base: 2100000, perM: 1050, tower: 30000,
      minLen: 400, maxLen: 2600, op: 1500, comfort: 0.70, weeks: 10, wind: 0, seats: 4, spacing: 60, color: 0x1f618d,
      blurb: 'Slows in the station, flies on the line. Queues melt away.' },
    { id: 'gondola8', name: '8-seat gondola', year: 1990, style: 'gondola', pph: 2800, speed: 105, base: 4200000, perM: 1600, tower: 45000,
      minLen: 600, maxLen: 4600, op: 2300, comfort: 0.85, weeks: 15, wind: 0, seats: 8, spacing: 75, color: 0x16a085,
      blurb: 'High capacity backbone from valley to mountain.' },
    { id: 'six', name: '6-seat bubble chair', year: 1996, style: 'chair', pph: 3000, speed: 95, base: 3300000, perM: 1350, tower: 36000,
      minLen: 400, maxLen: 2600, op: 1900, comfort: 0.85, weeks: 11, wind: 0, seats: 6, spacing: 62, color: 0xf39c12, bubble: true,
      blurb: 'Weather bubble and padded seats for six.' },
    { id: 'funitel', name: 'Funitel', year: 2001, style: 'gondola', pph: 3300, speed: 125, base: 8500000, perM: 2500, tower: 90000,
      minLen: 700, maxLen: 4200, op: 3300, comfort: 0.92, weeks: 18, wind: 1, seats: 24, spacing: 110, color: 0x8e44ad, twin: true,
      blurb: 'Two ropes hold every cabin steady. Runs when storms close everything else.' },
    { id: 'eight', name: '8-seat heated chair', year: 2010, style: 'chair', pph: 4000, speed: 100, base: 5600000, perM: 1800, tower: 42000,
      minLen: 400, maxLen: 2800, op: 2500, comfort: 0.95, weeks: 12, wind: 0, seats: 8, spacing: 64, color: 0xd35400, bubble: true,
      blurb: 'Heated leather, child locks, enormous throughput.' },
    { id: 's3', name: '3S tricable gondola', year: 2015, style: 'gondola', pph: 4600, speed: 150, base: 17000000, perM: 3400, tower: 260000,
      minLen: 900, maxLen: 6500, op: 4800, comfort: 1.0, weeks: 22, wind: 1, seats: 32, spacing: 180, color: 0x2c3e50, big: true,
      blurb: 'Three ropes, giant spans, almost no towers. The flagship.' },
    { id: 'pod', name: 'Autonomous pod line', year: 2032, style: 'pod', pph: 6200, speed: 190, base: 28000000, perM: 3900, tower: 120000,
      minLen: 500, maxLen: 7500, op: 5200, comfort: 1.0, weeks: 20, wind: 1, seats: 10, spacing: 55, color: 0x00b3a7,
      blurb: 'Self-driving pods on a fixed rail of light. No queue to speak of.' },
  ];
  SK.LIFT = {};
  var CREW = { tbar: 2, tram: 4, single: 2, double: 3, gondola4: 5, quad: 4, gondola8: 6, six: 4, funitel: 7, eight: 5, s3: 8, pod: 3 };
  var WINDMAX = { tbar: 95, tram: 70, single: 50, double: 55, gondola4: 60, quad: 65, gondola8: 70, six: 72, funitel: 105, eight: 75, s3: 110, pod: 120 };
  SK.LIFTS.forEach(function (l) { SK.LIFT[l.id] = l; l.crew = CREW[l.id]; l.windMax = WINDMAX[l.id]; l.op = Math.round(l.op * 0.55); });

  // Seasonal staff (wages in today's money, scaled by the era)
  SK.STAFF = [
    { id: 'mech', name: 'Lift mechanics', wage: 30000, desc: 'Keep sheaves, grips and ropes in shape. One looks after about four lifts and shortens every breakdown.' },
    { id: 'patrol', name: 'Ski patrol', wage: 24000, desc: 'Mark, close, rescue - and blast avalanches once you have the charges. One per 8 km of piste.' },
    { id: 'groom', name: 'Piste crew', wage: 22000, desc: 'Prepare the slopes every night: one per 5 km by boot and shovel, one per 14 km with snowcats.' },
  ];
  SK.LIFTIE_WAGE = 20000;
  SK.CREW_LEVELS = [{ name: 'Skeleton crew', f: 0.6, thr: 0.86, wear: 1.35 }, { name: 'Standard crew', f: 1, thr: 1, wear: 1 }, { name: 'Full crew', f: 1.45, thr: 1.07, wear: 0.8 }];
  SK.WAGE_ERA = [[1937, 0.22], [1955, 0.35], [1975, 0.65], [1995, 0.9], [2015, 1]];

  // Warming relative to the 1930s (degrees C) - drives the freezing level
  SK.WARMING = [[1937, 0], [1975, 0.2], [1990, 0.8], [2005, 1.4], [2020, 2.0], [2035, 2.8], [2050, 3.6], [2070, 4.6]];

  // Valley projects: real milestones of the Arlberg the player can push through
  SK.PROJECTS = [
    { id: 'galleries', com: 'lech', year: 1950, cost: 800000, name: 'Flexen road avalanche galleries', desc: 'Zürs, Lech and Warth stay reachable when the avalanche danger is high. Without them the road shuts and half the guests stay away on those days.' },
    { id: 'skibus', com: null, year: 1968, cost: 500000, name: 'Ski bus network', desc: 'Guests sleeping in a village without a lift ride the bus to the next valley station (70% of them come).' },
    { id: 'parking', com: 'anton', year: 1978, cost: 1500000, name: 'Valley car parks', desc: 'The road tunnel brings day guests - if they can park. +2,000 day guests in St. Anton.' },
    { id: 'pedestrian', com: 'anton', year: 1984, cost: 1200000, name: 'Pedestrian zone', desc: 'Cars leave the village centre of St. Anton. Guests rate their stay higher.' },
    { id: 'garage', com: 'lech', year: 1988, cost: 4000000, name: 'Underground car park Lech', desc: '+1,500 day guests in Lech without a sea of cars.' },
    { id: 'tunnels', com: 'lech', year: 1994, cost: 5000000, name: 'Oberlech tunnel system', desc: 'Deliveries go underground and Oberlech becomes car-free. Guests rate their stay higher.' },
    { id: 'station', com: 'anton', year: 1999, cost: 9000000, name: 'Move the railway, new station', desc: 'As in 2000: the tracks move to the south side of the valley. +2,500 day guests by train.' },
    { id: 'hall', com: 'anton', year: 2000, cost: 6000000, name: 'Congress & wellness hall', desc: 'Something to do when the lifts stand still: storm days hurt satisfaction far less.' },
  ];

  // One-time upgrades
  SK.TECH = [
    { id: 'crew2', name: 'Second construction crew', year: 1937, cost: 90000, group: 'Construction', desc: '+12 crew-weeks every summer.' },
    { id: 'heli', name: 'Helicopter construction', year: 1962, cost: 450000, group: 'Construction', desc: '+14 crew-weeks. Towers fly to the mountain.' },
    { id: 'prefab', name: 'Modular stations', year: 1995, cost: 2500000, group: 'Construction', desc: '+16 crew-weeks. Stations arrive pre-built.' },
    { id: 'snowcat', name: 'Snowcat grooming', year: 1960, cost: 220000, group: 'Slopes', desc: 'Corduroy every morning. Guests are happier, beginners especially.' },
    { id: 'winch', name: 'Winch groomers', year: 1990, cost: 1500000, group: 'Slopes', desc: 'Even black runs get groomed. More satisfaction on steep slopes.' },
    { id: 'snow1', name: 'Snow cannons', year: 1975, cost: 600000, group: 'Snow', desc: 'Unlocks snowmaking on pistes. The cannons need about -4 degrees to run.' },
    { id: 'snow2', name: 'Automated snow lances', year: 1996, cost: 3500000, group: 'Snow', desc: 'Snow from -2 degrees, almost twice as fast, and 30% cheaper to run.' },
    { id: 'snow3', name: 'All-weather snow factory', year: 2022, cost: 12000000, group: 'Snow', desc: 'Makes snow even at plus degrees - slowly and at a price.' },
    { id: 'keycard', name: 'Magnetic key cards', year: 1985, cost: 700000, group: 'Tickets', desc: 'Faster gates: +8% lift throughput.' },
    { id: 'rfid', name: 'Hands-free RFID gates', year: 2003, cost: 2800000, group: 'Tickets', desc: 'Another +10% lift throughput, and guest data for marketing.' },
    { id: 'dynprice', name: 'Dynamic pricing', year: 2024, cost: 4000000, group: 'Tickets', desc: '+9% ticket revenue from demand-based prices.' },
    { id: 'ava1', name: 'Avalanche commission & hand charges', year: 1948, cost: 120000, group: 'Safety', desc: 'Your ski patrol blasts threatened slopes before opening: each patroller secures three pistes on a danger day.' },
    { id: 'forecast', name: 'Weather station network', year: 1970, cost: 350000, group: 'Safety', desc: 'Avalanche bulletin and wind forecast three days ahead - time to close what needs closing.' },
    { id: 'ava2', name: 'Remote blasting masts', year: 1992, cost: 3000000, group: 'Safety', desc: 'Fixed masts fire at the push of a button. Every piste and lift is secured, whatever the weather.' },
  ];
  SK.TECHMAP = {};
  SK.TECH.forEach(function (t) { SK.TECHMAP[t.id] = t; });

  // Marketing campaigns: once per year each. aw = awareness gain (0..1 scale)
  SK.CAMPAIGNS = [
    { id: 'poster', name: 'Posters & brochures', year: 1937, cost: 12000, scale: 0.15, aw: 0.07, desc: 'Lithograph posters in railway stations from Vienna to Zurich.' },
    { id: 'press', name: 'Newspaper adverts', year: 1937, cost: 35000, scale: 0.3, aw: 0.11, desc: 'Weekly snow reports in the big city papers.' },
    { id: 'race', name: 'Host a ski race', year: 1946, cost: 90000, scale: 0.6, aw: 0.16, rep: 2, needs: 'black', desc: 'A downhill classic draws the press. Needs an open black piste.' },
    { id: 'film', name: 'Ski film', year: 1950, cost: 150000, scale: 0.5, aw: 0.17, desc: 'Powder turns on cinema screens across Europe.' },
    { id: 'tv', name: 'Television commercial', year: 1965, cost: 420000, scale: 1, aw: 0.22, desc: 'Prime time, right before the weather.' },
    { id: 'tour', name: 'Tour operator deals', year: 1975, cost: 300000, scale: 1, aw: 0.15, desc: 'Charter packages from Britain, the Netherlands and Germany.' },
    { id: 'web', name: 'Website & online booking', year: 1998, cost: 250000, scale: 1, aw: 0.14, desc: 'Webcams, snow report and lift tickets online.' },
    { id: 'worldcup', name: 'World Cup weekend', year: 1988, cost: 1800000, scale: 1, aw: 0.30, rep: 4, needs: 'black', desc: 'The world\'s best race on your mountain. Needs an open black piste.' },
    { id: 'social', name: 'Social media & creators', year: 2010, cost: 500000, scale: 1, aw: 0.20, desc: 'Drone shots at sunrise, shared a million times.' },
  ];

  // Regional skier market (potential guests per day across all nearby resorts)
  SK.MARKET = [[1937, 2200], [1946, 1800], [1950, 4200], [1960, 11500], [1970, 26000], [1980, 44000], [1990, 60000],
    [2000, 73000], [2010, 80000], [2020, 83000], [2035, 78000], [2060, 66000]];

  // Rival resorts: attractiveness over time
  SK.RIVALS = [
    { id: 'montafon', name: 'Montafon', curve: [[1937, 0.10], [1950, 0.14], [1965, 0.26], [1980, 0.40], [2000, 0.55], [2020, 0.63], [2060, 0.66]] },
    { id: 'ischgl', name: 'Ischgl', curve: [[1937, 0.0], [1962, 0.02], [1965, 0.10], [1980, 0.36], [2000, 0.62], [2020, 0.74], [2060, 0.78]] },
    { id: 'serfaus', name: 'Serfaus-Fiss', curve: [[1937, 0.02], [1960, 0.10], [1980, 0.30], [2000, 0.50], [2020, 0.64], [2060, 0.66]] },
    { id: 'sonnenkopf', name: 'Sonnenkopf', curve: [[1937, 0.0], [1970, 0.02], [1980, 0.10], [2000, 0.17], [2020, 0.20], [2060, 0.18]] },
    { id: 'rest', name: 'Rest of Tyrol', curve: [[1937, 0.30], [1950, 0.40], [1965, 0.75], [1980, 1.15], [2000, 1.5], [2020, 1.65], [2060, 1.6]] },
  ];

  // Scripted history. market = multiplier on the regional market for that winter.
  SK.EVENTS = {
    1946: { title: 'A new beginning', text: 'The lifts stood still through the war years. Now the first guests return to the Arlberg - with wooden skis and big hopes.' },
    1953: { title: 'The ski film craze', text: 'Cinema audiences fall for the Arlberg technique. Awareness of every Tyrolean resort is rising.', aw: 0.05 },
    1964: { title: 'Innsbruck Winter Olympics', text: 'The Games put Tyrol on every television screen. The regional market jumps this winter.', market: 1.18 },
    1973: { title: 'Oil crisis', text: 'Sunday driving bans and expensive fuel. Fewer day guests this winter.', market: 0.86 },
    1976: { title: 'Olympics return to Innsbruck', text: 'A second Olympic winter fills the valleys.', market: 1.14 },
    1978: { title: 'Arlberg road tunnel opens', text: 'A 14 km tunnel makes the Arlberg winter-safe by car. Day guests can now reach St. Anton easily: +1,500 a day, more once they can park.', daytrip: 1500 },
    1988: { title: 'A green Christmas', text: 'Almost no snow until January. Resorts with snow cannons smile; the rest pray.', warm: 2.4 },
    1989: { title: 'Another poor winter', text: 'Two bad winters in a row. Snowmaking is no longer a luxury.', warm: 2.0 },
    2001: { title: 'Alpine World Ski Championships', text: 'St. Anton hosts the world. If your reputation is 70 or better the event doubles as a giant advertisement.', wm: true },
    2006: { title: 'The warmest winter on record', text: 'Rain to 2,000 m in January.', warm: 2.6 },
    2020: { title: 'The closed winter', text: 'Travel restrictions keep foreign guests away. Only locals ski this season.', market: 0.3 },
    2030: { title: 'The snowline keeps climbing', text: 'Winters below 1,700 m are no longer reliable. Guests look for resorts that go high - or make their own snow.' },
  };

  // Campaign chapters. All "avg" values are season averages.
  SK.GOALS = [
    { id: 'g1', by: 1938, title: 'First tracks', text: 'Open a lift and a piste from the valley and welcome an average of 120 guests a day.',
      need: { visitors: 120 }, reward: 150000 },
    { id: 'g2', by: 1952, title: 'Post-war revival', text: 'Average 700 guests a day with at least 8 km of pistes.',
      need: { visitors: 700, km: 8 }, reward: 400000 },
    { id: 'g2b', by: 1958, title: 'Over the pass', text: 'Bring lifts to three of the seven villages - Lech, Zürs and Stuben are waiting - and average 1,400 guests a day.',
      need: { visitors: 1400, villages: 3 }, reward: 800000 },
    { id: 'g3', by: 1965, title: 'To the summits', text: 'Take guests above 2,600 m and average 2,000 guests a day.',
      need: { visitors: 2000, top: 2600 }, reward: 1500000 },
    { id: 'g4', by: 1980, title: 'The boom years', text: 'Average 5,000 guests a day, 60 km of pistes, lifts in five villages and a reputation of 65.',
      need: { visitors: 5000, km: 60, rep: 65, villages: 5 }, reward: 5000000 },
    { id: 'g5', by: 1995, title: 'Snow insurance', text: 'Keep 85% of your piste kilometres open across a whole winter and average 6,000 guests.',
      need: { visitors: 6000, open: 0.85 }, reward: 9000000 },
    { id: 'g6', by: 2001, title: 'World Championship stage', text: 'Reach a reputation of 78 and 30,000 guests per hour of lift capacity.',
      need: { rep: 78, pph: 30000 }, reward: 15000000 },
    { id: 'g7', by: 2020, title: 'Number one', text: 'Hold the largest market share of all named rivals and average 11,000 guests a day.',
      need: { visitors: 11000, first: true }, reward: 30000000 },
    { id: 'g8', by: 2045, title: 'Above the snowline', text: 'The climate has changed. Still average 11,000 guests with 85% of pistes open and a reputation of 80.',
      need: { visitors: 11000, open: 0.85, rep: 80 }, reward: 0 },
  ];

  SK.interp = function (curve, x) {
    if (x <= curve[0][0]) return curve[0][1];
    for (var i = 1; i < curve.length; i++) {
      if (x <= curve[i][0]) {
        var a = curve[i - 1], b = curve[i];
        return a[1] + (b[1] - a[1]) * (x - a[0]) / (b[0] - a[0]);
      }
    }
    return curve[curve.length - 1][1];
  };

  SK.DIFF = {
    blue: { name: 'Blue', css: '#2b7fd6', rgb: [43, 127, 214] },
    red: { name: 'Red', css: '#dc3b34', rgb: [220, 59, 52] },
    black: { name: 'Black', css: '#22262b', rgb: [34, 38, 43] },
    route: { name: 'Ski route', css: '#f08a1c', rgb: [240, 138, 28] },
  };
  SK.gradeOf = function (g) { return g <= 0.25 ? 'blue' : g <= 0.40 ? 'red' : 'black'; };

  // deterministic RNG (mulberry32)
  SK.rng = function (seed) {
    var a = seed >>> 0;
    return function () {
      a |= 0; a = a + 0x6D2B79F5 | 0;
      var t = Math.imul(a ^ a >>> 15, 1 | a);
      t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
      return ((t ^ t >>> 14) >>> 0) / 4294967296;
    };
  };
  SK.fmtMoney = function (v) {
    var s = v < 0 ? '-' : '';
    v = Math.abs(v);
    if (v >= 1e6) return s + '€' + (v / 1e6).toFixed(v >= 1e7 ? 1 : 2) + 'M';
    if (v >= 1e4) return s + '€' + Math.round(v / 1e3) + 'k';
    return s + '€' + Math.round(v).toLocaleString('en-US');
  };
  SK.fmtInt = function (v) { return Math.round(v).toLocaleString('en-US'); };
})(window.SK);
