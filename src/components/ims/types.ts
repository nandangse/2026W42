/** What /api/ims/bootstrap answers — the shell reads it once and passes it down. */
export interface Person { id: string; email: string; full_name: string; initials: string | null; role: string; department: string | null }
export interface StandardRow { id: string; code: string; name: string; sys: string; standard_copy_path: string | null }
export interface RegisterRow { id: string; slug: string; name: string; sys: string | null; description: string; is_system: boolean }

export interface Boot {
  configured: boolean;
  installed: boolean;
  note?: string;
  email?: string;
  role: string;
  department: string | null;
  profileId: string | null;
  approvalMode: string;
  people: Person[];
  standards: StandardRow[];
  registers: RegisterRow[];
}

export type Row = Record<string, unknown> & { id: string };

/** The MR and department heads write; auditors and members read. */
export const isHead = (role: string) => role === "ims_admin" || role === "dept_head";
export const isAdmin = (role: string) => role === "ims_admin";

export const SYS = ["QMS", "EMS", "OHS", "ISMS", "IMS", "WLD"];
export const SYS_LABEL: Record<string, string> = {
  QMS: "QMS — Quality (9001)",
  EMS: "EMS — Environment (14001)",
  OHS: "OHS — Health & safety (45001)",
  ISMS: "ISMS — Information security (27001)",
  IMS: "IMS — cross-system",
  WLD: "WLD — Welding (D1.1 / EN 1090)",
};
export const DOC_TYPE: Record<string, string> = {
  MAN: "MAN — Manual",
  PRO: "PRO — Procedure",
  WI: "WI — Work instruction",
  FRM: "FRM — Format / register template",
  CHK: "CHK — Checklist",
  PLN: "PLN — Plan",
  REG: "REG — Register",
  LST: "LST — List",
  POL: "POL — Policy / objectives",
};
export const CERT_KIND: Record<string, string> = {
  certification: "Certification",
  statutory: "Statutory licence / consent",
  welder_qual: "Welder qualification",
  calibration: "Calibration",
  equipment_test: "Statutory equipment test",
};

/**
 * Upload a file to one of the private buckets.
 *
 * TWO STEPS, deliberately. The route hands back a signed upload URL and the
 * browser PUTs straight to storage — so a 40MB manual never travels through a
 * serverless function with a 4.5MB body limit.
 */
export async function uploadFile(bucket: string, file: File): Promise<{ path?: string; error?: string }> {
  const r = await fetch("/api/ims/file", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ bucket, path: file.name }),
  });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) return { error: j.error || `Could not start the upload (${r.status}).` };

  const put = await fetch(j.signedUrl, { method: "PUT", body: file, headers: { "x-upsert": "true" } });
  if (!put.ok) return { error: `The upload failed (${put.status}).` };
  return { path: j.path };
}

/** Open a private file through a short-lived signed URL. */
export async function openFile(bucket: string, path: string): Promise<string> {
  const r = await fetch(`/api/ims/file?bucket=${encodeURIComponent(bucket)}&path=${encodeURIComponent(path)}`, { cache: "no-store" });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(j.error || "That file could not be opened.");
  return j.url as string;
}
