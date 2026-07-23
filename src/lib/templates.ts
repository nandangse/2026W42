// Milestone templates by product family — ported verbatim from V1.9 templateFor().
// Used to seed family_templates and as the default when a job has no plan yet.

export interface Crew {
  fitter: number;
  helper: number;
  welder: number;
  painter: number;
  hydraulic: number;
  electrician: number;
}

export interface TemplateMilestone {
  name: string;
  days: number;
  pred: number;
  crew: Crew;
  offset: number;
}

export const TRADES = [
  { key: "fitter", label: "Fitter", short: "FIT", tiny: "F", color: "#2563EB" },
  { key: "helper", label: "Helper", short: "HLP", tiny: "H", color: "#64748B" },
  { key: "welder", label: "Welder", short: "WLD", tiny: "W", color: "#D97706" },
  { key: "painter", label: "Painter", short: "PNT", tiny: "P", color: "#0D9488" },
  { key: "electrician", label: "Electrician", short: "ELE", tiny: "E", color: "#DC2626" },
  { key: "hydraulic", label: "Hydraulic", short: "HYD", tiny: "Hd", color: "#7C3AED" },
] as const;

export const zeroCrew = (): Crew => ({
  fitter: 0,
  helper: 0,
  welder: 0,
  painter: 0,
  hydraulic: 0,
  electrician: 0,
});

const crew = (
  f: number,
  h: number,
  w: number,
  p: number,
  hy: number,
  e: number,
): Crew => ({
  fitter: f,
  helper: h,
  welder: w,
  painter: p,
  hydraulic: hy,
  electrician: e,
});

const M = (
  name: string,
  days: number,
  pred: number,
  c: Crew,
): TemplateMilestone => ({ name, days, pred, crew: c, offset: 0 });

export function templateFor(fam: string | null | undefined): TemplateMilestone[] {
  const F = fam || "";
  if (F.includes("Hi Lift"))
    return [
      M("Order review & BOM release", 3, 0, zeroCrew()),
      M("Chassis receipt & inspection", 2, 1, crew(1, 1, 0, 0, 0, 0)),
      M("Material kitting", 7, 1, crew(0, 2, 0, 0, 0, 0)),
      M("Scissor frame fabrication", 8, 3, crew(2, 2, 3, 0, 0, 0)),
      M("Sub-assembly fabrication", 6, 3, crew(2, 2, 2, 0, 0, 0)),
      M("Scissor assembly & cylinder mtg", 5, 4, crew(3, 2, 1, 0, 1, 0)),
      M("Van body fabrication", 8, 3, crew(2, 2, 3, 0, 0, 0)),
      M("Body mounting on chassis", 3, 7, crew(3, 2, 1, 0, 0, 0)),
      M("Hydraulic piping & powerpack", 5, 6, crew(1, 1, 0, 0, 3, 0)),
      M("Electrical wiring & panels", 5, 8, crew(0, 1, 0, 0, 0, 3)),
      M("Platform & stabilizer fitment", 4, 9, crew(2, 2, 1, 0, 1, 0)),
      M("Painting & body finishing", 6, 8, crew(0, 2, 0, 3, 0, 0)),
      M("Final assembly & decals", 4, 12, crew(3, 2, 0, 1, 0, 1)),
      M("Rain test & load test", 2, 13, crew(1, 1, 0, 0, 1, 1)),
      M("Final inspection & dispatch", 2, 14, crew(1, 2, 0, 0, 0, 0)),
    ];
  if (F.includes("Runway"))
    return [
      M("Order review & BOM release", 3, 0, zeroCrew()),
      M("Material kitting", 10, 1, crew(0, 2, 0, 0, 0, 0)),
      M("Base frame fabrication", 8, 2, crew(2, 3, 4, 0, 0, 0)),
      M("Stabilizer fabrication", 6, 2, crew(1, 2, 2, 0, 0, 0)),
      M("Hopper / mixer sub-assembly", 8, 2, crew(2, 2, 3, 0, 0, 0)),
      M("Platform fabrication", 5, 3, crew(1, 2, 2, 0, 0, 0)),
      M("Trial assembly", 5, 5, crew(3, 2, 1, 0, 0, 0)),
      M("Shot blasting & primer", 3, 7, crew(0, 2, 0, 2, 0, 0)),
      M("Final painting", 4, 8, crew(0, 1, 0, 3, 0, 0)),
      M("Hydraulic system fitment", 5, 9, crew(2, 1, 0, 0, 3, 0)),
      M("Electrical & controls", 4, 9, crew(0, 1, 0, 0, 0, 2)),
      M("Final assembly", 5, 10, crew(3, 3, 0, 1, 1, 1)),
      M("Testing & trials", 3, 12, crew(2, 1, 0, 0, 1, 1)),
      M("Inspection & dispatch", 2, 13, crew(1, 2, 0, 0, 0, 0)),
    ];
  if (
    F.includes("Scissor") ||
    F.includes("Tail Lift") ||
    F.includes("Goods Lift")
  )
    return [
      M("Order review & GA approval", 4, 0, zeroCrew()),
      M("BOM & drawing release", 3, 1, zeroCrew()),
      M("Material kitting", 7, 2, crew(0, 2, 0, 0, 0, 0)),
      M("Cutting & profiling", 3, 3, crew(1, 2, 0, 0, 0, 0)),
      M("Scissor / frame fabrication", 6, 4, crew(2, 2, 3, 0, 0, 0)),
      M("Platform fabrication", 4, 4, crew(1, 1, 2, 0, 0, 0)),
      M("Cylinder & pin assembly", 3, 5, crew(2, 1, 0, 0, 1, 0)),
      M("Trial assembly", 3, 7, crew(2, 2, 0, 0, 0, 0)),
      M("Surface prep & painting", 4, 8, crew(0, 1, 0, 2, 0, 0)),
      M("Powerpack & hydraulics", 3, 9, crew(1, 1, 0, 0, 2, 0)),
      M("Electrical & controls", 3, 9, crew(0, 1, 0, 0, 0, 2)),
      M("Final assembly & safety items", 3, 10, crew(2, 1, 0, 1, 0, 1)),
      M("Load test & QC", 2, 12, crew(1, 1, 0, 0, 1, 1)),
      M("Inspection & dispatch", 1, 13, crew(1, 1, 0, 0, 0, 0)),
    ];
  return [
    M("Order review & BOM release", 3, 0, zeroCrew()),
    M("Material kitting", 7, 1, crew(0, 2, 0, 0, 0, 0)),
    M("Cutting & profiling", 3, 2, crew(1, 2, 0, 0, 0, 0)),
    M("Main structure fabrication", 7, 3, crew(2, 2, 3, 0, 0, 0)),
    M("Sub-assembly fabrication", 5, 3, crew(1, 2, 2, 0, 0, 0)),
    M("Trial assembly", 4, 5, crew(2, 2, 1, 0, 0, 0)),
    M("Shot blasting & painting", 4, 6, crew(0, 2, 0, 2, 0, 0)),
    M("Hydraulic fitment", 3, 7, crew(1, 1, 0, 0, 2, 0)),
    M("Electrical fitment", 3, 7, crew(0, 1, 0, 0, 0, 2)),
    M("Final assembly", 3, 8, crew(2, 2, 0, 1, 0, 0)),
    M("Testing & QC", 2, 10, crew(1, 1, 0, 0, 1, 1)),
    M("Inspection & dispatch", 1, 11, crew(1, 1, 0, 0, 0, 0)),
  ];
}

/** The families we seed as explicit template rows (the four templateFor branches). */
export const SEED_FAMILIES = [
  "Hi Lift",
  "Runway",
  "Scissor Lift",
  "Default",
] as const;
