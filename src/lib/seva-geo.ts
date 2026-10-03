/**
 * WHERE A TICKET HAPPENED (Dr Raghu, 3 Oct 2026: "the map of India will
 * show and each location marked there with the dot proportionate to the
 * number of customers there").
 *
 * The ERP's Issue.location is free text — 829 spellings on the day this was
 * written: "Navi Mumbai, Rabale MIDC", "Rabale", "RabaleMIDC", "Tubhe",
 * "Mumbia", "Varnasi". No geocoder is called; a gazetteer of the places
 * Nandan actually serves is matched by keyword, suburb first (Rabale is
 * Navi Mumbai before it is Mumbai), and a ticket with a blank location is
 * read off its title ("CAFS - Gujrat - HL"). What matches nothing is listed
 * as unplaced, never dropped and never guessed onto the map.
 */
export interface Place { city: string; state: string; country: string; lat: number; lon: number }
type Entry = Place & { keys: string[] };

const IN = (city: string, state: string, lat: number, lon: number, keys: string[]): Entry => ({ city, state, country: "India", lat, lon, keys });
const OUT = (city: string, country: string, lat: number, lon: number, keys: string[]): Entry => ({ city, state: "", country, lat, lon, keys });

/* ORDER MATTERS: a suburb's name wins over the city it sits in. */
export const GAZETTEER: Entry[] = [
  // abroad first — "Tanzania" must never land in Maharashtra
  OUT("Dar es Salaam", "Tanzania", -6.8, 39.3, ["tanzania", "dar es salaam", "zanzibar"]),
  OUT("Dubai", "UAE", 25.2, 55.3, ["dubai", "uae", "abu dhabi", "sharjah", "emirates"]),
  OUT("Muscat", "Oman", 23.6, 58.5, ["oman", "muscat"]),
  OUT("Doha", "Qatar", 25.3, 51.5, ["qatar", "doha"]),
  OUT("Riyadh", "Saudi Arabia", 24.7, 46.7, ["saudi", "riyadh", "jeddah", "dammam"]),
  OUT("Kuwait", "Kuwait", 29.4, 47.9, ["kuwait"]),
  OUT("Manama", "Bahrain", 26.2, 50.6, ["bahrain"]),
  OUT("Kathmandu", "Nepal", 27.7, 85.3, ["nepal", "kathmandu"]),
  OUT("Colombo", "Sri Lanka", 6.9, 79.9, ["sri lanka", "srilanka", "colombo"]),
  OUT("Dhaka", "Bangladesh", 23.8, 90.4, ["bangladesh", "dhaka"]),
  OUT("Thimphu", "Bhutan", 27.5, 89.6, ["bhutan"]),
  OUT("Malé", "Maldives", 4.2, 73.5, ["maldives", "male airport"]),
  OUT("Nairobi", "Kenya", -1.3, 36.8, ["kenya", "nairobi", "mombasa"]),
  OUT("Kampala", "Uganda", 0.3, 32.6, ["uganda", "kampala", "entebbe"]),
  OUT("Addis Ababa", "Ethiopia", 9.0, 38.7, ["ethiopia", "addis"]),
  OUT("Lagos", "Nigeria", 6.5, 3.4, ["nigeria", "lagos", "abuja"]),
  OUT("Accra", "Ghana", 5.6, -0.2, ["ghana", "accra"]),
  OUT("Port Louis", "Mauritius", -20.2, 57.5, ["mauritius"]),
  OUT("Cairo", "Egypt", 30.0, 31.2, ["egypt", "cairo"]),
  OUT("Singapore", "Singapore", 1.3, 103.8, ["singapore"]),
  OUT("Kuala Lumpur", "Malaysia", 3.1, 101.7, ["malaysia", "kuala lumpur"]),
  OUT("Bangkok", "Thailand", 13.8, 100.5, ["thailand", "bangkok"]),
  OUT("Jakarta", "Indonesia", -6.2, 106.8, ["indonesia", "jakarta"]),
  OUT("Johannesburg", "South Africa", -26.2, 28.0, ["south africa", "johannesburg", "durban", "cape town"]),
  OUT("Abroad", "Abroad", 0, 0, ["export", "overseas", "africa"]),

  // Navi Mumbai's suburbs before Mumbai's
  IN("Navi Mumbai", "Maharashtra", 19.08, 73.0, ["navi mumbai", "rabale", "taloja", "turbhe", "tubhe", "seawood", "nerul", "pawne", "pawane", "mahape", "ghansoli", "airoli", "vashi", "kalamboli", "panvel", "kharghar", "koparkhairane", "kopar khairane", "belapur", "uran", "jnpt", "nhava", "sanpada", "ulwe", "rabbale", "rabala", "khopoli", "patalganga", "mahad", "roha", "pen "]),
  IN("Mumbai", "Maharashtra", 19.08, 72.88, ["mumbai", "mumbia", "bombay", "bom ", "sion", "bandra", "colaba", "khar", "worli", "juhu", "santacruz", "santa cruz", "dadar", "chandivali", "vikhroli", "andheri", "bkc", "nalasopara", "nala sopara", "sahara", "powai", "goregaon", "malad", "borivali", "mulund", "chembur", "kurla", "ghatkopar", "byculla", "wadala", "parel", "mahim", "vile parle", "marol", "saki naka", "sakinaka", "kanjurmarg", "bhandup", "dahisar", "kandivali", "jogeshwari", "versova", "fort", "nariman", "cuffe", "churchgate", "mazgaon", "sewri", "cst", "csmt", "mira road", "meera road", "virar", "vasai", "boisar", "palghar", "tarapur", "csia", "airport", "santcruz", "santacrux"]),
  IN("Thane", "Maharashtra", 19.2, 72.97, ["thane", "kalyan", "bhiwandi", "dombivli", "ambernath", "badlapur", "badalapur", "ulhasnagar", "wada", "murbad"]),
  IN("Pune", "Maharashtra", 18.52, 73.86, ["pune", "chakan", "chankan", "hinjewadi", "pimpri", "chinchwad", "talegaon", "ranjangaon", "shirwal", "bhosari", "khed", "baramati", "magar patta", "magarpatta", "hadapsar", "wagholi"]),
  IN("Nashik", "Maharashtra", 20.0, 73.78, ["nashik", "nasik", "sinnar", "igatpuri"]),
  IN("Aurangabad", "Maharashtra", 19.88, 75.34, ["aurangabad", "waluj", "jalna", "shendra"]),
  IN("Nagpur", "Maharashtra", 21.15, 79.09, ["nagpur", "butibori", "wardha", "chandrapur"]),
  IN("Karad", "Maharashtra", 17.29, 74.18, ["karad", "satara", "kolhapur", "sangli", "ichalkaranji"]),
  IN("Solapur", "Maharashtra", 17.66, 75.9, ["solapur", "latur"]),
  IN("Ratnagiri", "Maharashtra", 16.99, 73.3, ["ratnagiri", "chiplun", "lote", "sindhudurg"]),
  IN("Silvassa", "Dadra & Nagar Haveli", 20.27, 73.0, ["silvassa", "dapada", "dadra", "athal", "nagar haveli", "khanvel", "daman", "vapi", "umbergaon", "sarigam", "bhilad"]),
  IN("Goa", "Goa", 15.4, 73.9, ["goa", "verna", "mormugao", "vasco", "panaji", "ponda"]),
  IN("Surat", "Gujarat", 21.17, 72.83, ["surat", "hazira", "bharuch", "dahej", "ankleshwar", "navsari", "valsad"]),
  IN("Vadodara", "Gujarat", 22.31, 73.19, ["vadodara", "baroda", "halol", "savli", "anand"]),
  IN("Ahmedabad", "Gujarat", 23.02, 72.57, ["ahmedabad", "ahemdabad", "ahemadabad", "amdavad", "sanand", "gandhinagar", "mehsana", "kadi", "changodar", "bavla", "gujarat", "gujrat", "guj "]),
  IN("Jamnagar", "Gujarat", 22.47, 70.06, ["jamnagar", "rajkot", "morbi", "kutch", "kandla", "mundra", "gandhidham", "bhuj", "porbandar"]),
  IN("Delhi NCR", "Delhi", 28.61, 77.21, ["delhi", "del ", "noida", "gurgaon", "gurugram", "faridabad", "palam", "ghaziabad", "greater noida", "manesar", "okhla", "igi", "dwarka", "bawal", "ncr", "sahibabad", "bahadurgarh", "kundli", "ballabgarh", "palwal"]),
  IN("Bhiwadi", "Rajasthan", 28.2, 76.86, ["bhiwadi", "bhiwari", "dharuhera", "neemrana", "alwar", "tapukara", "khushkhera", "rewari"]),
  IN("Jaipur", "Rajasthan", 26.91, 75.79, ["jaipur", "ajmer", "kota", "udaipur", "jodhpur", "rajasthan"]),
  IN("Sonipat", "Haryana", 28.99, 77.02, ["sonipat", "panipat", "kundli", "karnal", "rohtak", "haryana", "ambala", "yamunanagar", "hisar"]),
  IN("Chandigarh", "Punjab", 30.73, 76.78, ["chandigarh", "rajpura", "mohali", "ludhiana", "halwara", "punjab", "amritsar", "jalandhar", "patiala", "baddi", "derabassi", "zirakpur", "panchkula"]),
  IN("Dehradun", "Uttarakhand", 30.32, 78.03, ["dehradun", "deharadhun", "deharadun", "dehradoon", "haridwar", "roorkee", "rudrapur", "pantnagar", "uttarakhand", "sidcul"]),
  IN("Lucknow", "Uttar Pradesh", 26.85, 80.95, ["lucknow", "kanpur", "uttar pradesh", "barabanki", "unnao"]),
  IN("Varanasi", "Uttar Pradesh", 25.32, 82.97, ["varanasi", "varnasi", "banaras", "allahabad", "prayagraj", "gorakhpur"]),
  IN("Agra", "Uttar Pradesh", 27.18, 78.01, ["agra", "mathura", "aligarh", "meerut", "bareilly", "moradabad"]),
  IN("Indore", "Madhya Pradesh", 22.72, 75.86, ["pithampur", "indore", "dewas", "ujjain", "madhya pradesh"]),
  IN("Bhopal", "Madhya Pradesh", 23.26, 77.41, ["bhopal", "mandideep", "jabalpur", "gwalior", "gwailor"]),
  IN("Raipur", "Chhattisgarh", 21.25, 81.63, ["raipur", "bhilai", "chhattisgarh", "bilaspur"]),
  IN("Kolkata", "West Bengal", 22.57, 88.36, ["kolkata", "kolkatta", "calcutta", "ulberia", "uluberia", "howrah", "haldia", "durgapur", "west bengal", "kharagpur", "dankuni", "barasat"]),
  IN("Siliguri", "West Bengal", 26.73, 88.4, ["siliguri", "bagdogra", "darjeeling", "jalpaiguri"]),
  IN("Bhubaneswar", "Odisha", 20.3, 85.82, ["bhubaneswar", "odisha", "orissa", "cuttack", "paradip", "jharsuguda", "angul", "rourkela"]),
  IN("Patna", "Bihar", 25.6, 85.14, ["patna", "bihar", "muzaffarpur"]),
  IN("Ranchi", "Jharkhand", 23.34, 85.31, ["ranchi", "jamshedpur", "jharkhand", "bokaro", "dhanbad"]),
  IN("Guwahati", "Assam", 26.14, 91.74, ["guwahati", "assam", "dibrugarh", "silchar", "agartala", "imphal", "shillong", "aizawl", "dimapur"]),
  IN("Hyderabad", "Telangana", 17.39, 78.49, ["hyderabad", "shamshabad", "secunderabad", "kanchanbagh", "telangana", "medak", "warangal"]),
  IN("Visakhapatnam", "Andhra Pradesh", 17.69, 83.22, ["visakhapatnam", "vizag", "andhra", "vijayawada", "guntur", "tirupati", "nellore", "sri city", "ap "]),
  IN("Bengaluru", "Karnataka", 12.97, 77.59, ["bangalore", "banglore", "banglaore", "bengalore", "bengaluru", "haronahalli", "haronahali", "harohalli", "hosur", "whitefield", "peenya", "hoskote", "devanahalli", "tumkur", "karnataka", "mysore", "mysuru", "belgaum", "hubli", "dharwad"]),
  IN("Mangaluru", "Karnataka", 12.91, 74.86, ["mangalore", "mangaluru", "udupi", "manipal", "kateel", "karwar"]),
  IN("Chennai", "Tamil Nadu", 13.08, 80.27, ["chennai", "madras", "sriperumbudur", "oragadam", "ambattur", "tamil nadu", "tamilnadu", "coimbatore", "trichy", "madurai", "salem", "tirupur", "hosur", "ennore", "kanchipuram"]),
  IN("Kochi", "Kerala", 9.93, 76.27, ["kochi", "cochin", "kerala", "trivandrum", "trivendrum", "thiruvananthapuram", "calicut", "kozhikode", "kannur", "nedumbassery"]),
  IN("Jammu", "Jammu & Kashmir", 32.73, 74.87, ["jammu", "srinagar", "kashmir", "kathua", "samba", "leh", "ladakh"]),
  IN("Shimla", "Himachal Pradesh", 31.1, 77.17, ["himachal", "shimla", "nalagarh", "parwanoo", "solan", "kala amb", "paonta"]),
  IN("India", "India", 22.0, 79.0, ["india"]),
];

const norm = (v: unknown) => ` ${String(v ?? "").toLowerCase().replace(/[^a-z ]+/g, " ").replace(/\s+/g, " ").trim()} `;

/** The place a location (or, failing that, a title) names; null when nothing in the gazetteer matches. */
export function placeOf(location: unknown, title?: unknown): Place | null {
  for (const text of [norm(location), norm(title)]) {
    if (text.trim().length < 2) continue;
    for (const e of GAZETTEER) {
      for (const k of e.keys) {
        /* a key ending in a space ("bom ", "guj ", "ap ") is a code that must stand as its own word;
           any other key matches at the start of a word, so "rabalemidc" still finds Rabale */
        const hit = k.endsWith(" ") ? text.includes(` ${k}`) : text.includes(` ${k}`);
        if (hit) return { city: e.city, state: e.state, country: e.country, lat: e.lat, lon: e.lon };
      }
    }
  }
  return null;
}

/** India's outline as [lon, lat] pairs, coarse but true to shape — Kashmir to Kanyakumari to the North-East. */
export const INDIA_OUTLINE: [number, number][] = [
  [74.5, 37.0], [77.8, 35.5], [78.9, 34.3], [79.0, 32.5], [78.5, 31.0], [80.0, 30.3], [81.0, 30.0], [82.0, 29.6], [84.0, 28.9], [85.5, 28.4], [87.0, 27.9], [88.1, 27.9],
  [88.8, 27.4], [89.5, 28.2], [90.5, 28.1], [92.0, 27.8], [93.5, 28.6], [95.5, 29.5], [97.0, 28.3], [97.3, 27.3], [96.5, 26.8], [95.3, 26.3], [95.0, 25.2], [94.5, 24.5],
  [94.0, 23.6], [93.2, 22.5], [92.5, 22.2], [92.3, 23.8], [91.5, 24.2], [90.6, 25.2], [89.8, 26.0], [89.0, 26.4], [88.4, 26.5], [88.1, 25.5], [88.9, 24.7], [88.5, 23.7],
  [89.0, 22.3], [88.2, 21.6], [87.0, 21.5], [86.5, 20.2], [85.0, 19.5], [83.5, 18.2], [82.3, 17.0], [80.3, 15.9], [80.2, 13.5], [79.9, 11.5], [79.8, 10.3], [78.2, 8.9],
  [77.5, 8.1], [76.5, 8.9], [76.0, 10.5], [75.0, 12.0], [74.3, 14.0], [73.5, 16.0], [72.9, 18.9], [72.8, 20.3], [72.6, 21.2], [72.9, 22.0], [72.4, 22.4], [70.6, 20.8],
  [69.0, 22.4], [68.4, 23.6], [70.0, 24.4], [71.1, 24.6], [71.0, 25.9], [70.2, 26.7], [69.5, 27.1], [70.6, 28.0], [71.9, 28.9], [73.4, 29.9], [74.5, 31.0], [74.6, 32.0],
  [74.0, 33.4], [73.9, 34.6], [74.5, 37.0],
];
