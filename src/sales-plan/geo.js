/* ================= GEO — schematic India map =================
   Pure data + projection. No tiles, no network: the map is an inline SVG so it
   works offline and inside the single-file demo.

   The outline is deliberately SCHEMATIC — good enough to place a dot in the right
   part of the country, not a survey boundary. Label it as such wherever it is drawn. */

/** Rough India outline, [lat, lng], clockwise from Kutch. */
const INDIA_OUTLINE = [
  [23.9,68.2],[22.5,69.0],[22.2,70.0],[21.0,72.6],[19.9,72.7],[19.0,72.8],[17.0,73.3],
  [15.3,73.9],[13.0,74.7],[11.0,75.5],[9.5,76.3],[8.1,77.5],[9.0,78.5],[9.3,79.2],
  [10.3,79.8],[12.0,80.0],[13.1,80.3],[14.5,80.2],[16.0,81.3],[16.3,82.3],[17.7,83.3],
  [19.0,84.8],[20.3,86.6],[21.6,87.5],[21.8,88.2],[22.5,88.4],[23.0,89.0],[24.0,89.0],
  [25.2,89.8],[26.0,89.9],[26.8,92.0],[27.5,95.3],[28.2,97.0],[27.0,97.2],[25.5,95.0],
  [24.0,94.2],[23.0,93.4],[22.0,93.0],[23.0,92.3],[24.5,92.5],[25.2,90.0],[26.5,88.9],
  [27.0,88.2],[27.9,86.0],[28.6,84.0],[29.5,81.5],[30.4,80.0],[31.0,79.0],[32.6,78.5],
  [34.0,78.9],[35.5,78.0],[35.9,76.5],[35.0,74.5],[34.0,73.9],[33.0,74.2],[32.5,74.6],
  [31.5,74.5],[30.0,74.5],[28.5,73.5],[27.0,71.0],[25.0,70.0],[24.2,68.8],[23.9,68.2]
];

/** Approximate coordinates for the places Nandan actually sells into. */
const CITIES = {
  'mumbai':[19.08,72.88], 'navi mumbai':[19.03,73.03], 'thane':[19.22,72.98],
  'pune':[18.52,73.86], 'nashik':[19.997,73.79], 'aurangabad':[19.88,75.34],
  'nagpur':[21.15,79.09], 'delhi':[28.61,77.21], 'new delhi':[28.61,77.21],
  'gurgaon':[28.46,77.03], 'gurugram':[28.46,77.03], 'noida':[28.54,77.39],
  'faridabad':[28.41,77.31], 'ghaziabad':[28.67,77.45],
  'bangalore':[12.97,77.59], 'bengaluru':[12.97,77.59], 'hosur':[12.74,77.83],
  'mysore':[12.30,76.64], 'mysuru':[12.30,76.64], 'mangalore':[12.91,74.86],
  'hubli':[15.36,75.12], 'belgaum':[15.85,74.50],
  'chennai':[13.08,80.27], 'coimbatore':[11.02,76.96], 'madurai':[9.93,78.12],
  'salem':[11.66,78.15], 'trichy':[10.79,78.70], 'tiruchirappalli':[10.79,78.70],
  'hyderabad':[17.39,78.49], 'secunderabad':[17.44,78.50],
  'visakhapatnam':[17.69,83.22], 'vizag':[17.69,83.22], 'vijayawada':[16.51,80.65],
  'kolkata':[22.57,88.36], 'howrah':[22.59,88.31],
  'ahmedabad':[23.02,72.57], 'gandhinagar':[23.22,72.65], 'surat':[21.17,72.83],
  'vadodara':[22.31,73.18], 'baroda':[22.31,73.18], 'rajkot':[22.30,70.80],
  'bhavnagar':[21.76,72.15], 'jamnagar':[22.47,70.06],
  'jaipur':[26.91,75.79], 'jodhpur':[26.24,73.02], 'udaipur':[24.58,73.71],
  'lucknow':[26.85,80.95], 'kanpur':[26.45,80.33], 'varanasi':[25.32,82.97],
  'bhopal':[23.26,77.41], 'indore':[22.72,75.86], 'raipur':[21.25,81.63],
  'patna':[25.59,85.14], 'ranchi':[23.34,85.31], 'jamshedpur':[22.80,86.18],
  'bhubaneswar':[20.30,85.82], 'cuttack':[20.46,85.88],
  'guwahati':[26.14,91.74], 'chandigarh':[30.73,76.78], 'ludhiana':[30.90,75.86],
  'amritsar':[31.63,74.87], 'dehradun':[30.32,78.03],
  'kochi':[9.93,76.27], 'cochin':[9.93,76.27], 'trivandrum':[8.52,76.94],
  'thiruvananthapuram':[8.52,76.94], 'calicut':[11.25,75.78], 'kozhikode':[11.25,75.78],
  'goa':[15.30,74.12], 'panaji':[15.49,73.83], 'srinagar':[34.08,74.80],
  'leh':[34.16,77.58], 'shillong':[25.58,91.89], 'agartala':[23.83,91.28],
  'siliguri':[26.73,88.40], 'durgapur':[23.52,87.31], 'haldia':[22.06,88.06],
  'kandla':[23.03,70.22], 'mundra':[22.84,69.72], 'tuticorin':[8.76,78.13],
  'ennore':[13.23,80.32], 'paradip':[20.32,86.61], 'kakinada':[16.99,82.25]
};

/** Map extent — a little padding around the country. */
const LNG0 = 67.0, LNG1 = 98.5, LAT0 = 6.0, LAT1 = 37.5;

/** Equirectangular projection into an SVG box. */
function project(lat, lng, w, h) {
  return [
    ((lng - LNG0) / (LNG1 - LNG0)) * w,
    ((LAT1 - lat) / (LAT1 - LAT0)) * h
  ];
}

/** Look a place name up in the gazetteer; tolerant of "Pune, Maharashtra". */
function coordsFor(name) {
  if (!name) return null;
  const n = String(name).toLowerCase().trim();
  if (CITIES[n]) return CITIES[n];
  const head = n.split(/[,(\-–]/)[0].trim();
  if (CITIES[head]) return CITIES[head];
  const hit = Object.keys(CITIES).find(c => n.includes(c));
  return hit ? CITIES[hit] : null;
}
