/**
 * Request bodies, checked before they are trusted (6 Sep 2026: 126 routes
 * read `await req.json()` and used the fields as they came).
 *
 * Deliberately tiny — no schema library, no dependency. A route says what
 * it needs in one line and gets a typed object or a 400 with the field
 * named:
 *
 *   const b = await body(req, { id: "uuid", note: "string?", days: "number" });
 *
 * Kinds: string, string? (optional), number, number?, boolean, boolean?,
 * uuid, uuid?, date (YYYY-MM-DD), date?, array, array?, object, object?.
 * Anything not in the shape is passed through untouched on `rest`, so a
 * route can validate the fields that matter and keep the ones it does not
 * yet name.
 */
import { HttpError } from "./auth";

type Kind =
  | "string" | "string?" | "number" | "number?" | "boolean" | "boolean?"
  | "uuid" | "uuid?" | "date" | "date?" | "array" | "array?" | "object" | "object?";

type Of<K extends Kind> =
  K extends "string" ? string : K extends "string?" ? string | undefined :
  K extends "number" ? number : K extends "number?" ? number | undefined :
  K extends "boolean" ? boolean : K extends "boolean?" ? boolean | undefined :
  K extends "uuid" ? string : K extends "uuid?" ? string | undefined :
  K extends "date" ? string : K extends "date?" ? string | undefined :
  K extends "array" ? unknown[] : K extends "array?" ? unknown[] | undefined :
  K extends "object" ? Record<string, unknown> : Record<string, unknown> | undefined;

export type Shape = Record<string, Kind>;
/** A body nothing was declared on — what `await req.json()` used to give. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type AnyBody = Record<string, any>;
// Declared fields are typed strictly. Undeclared ones pass through as `any`
// — exactly what `await req.json()` gave before — so a route can adopt this
// with one line and tighten field by field.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type Checked<S extends Shape> = { [K in keyof S]: Of<S[K]> } & { rest: Record<string, unknown> } & Record<string, any>;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const DATE = /^\d{4}-\d{2}-\d{2}$/;

/** Check an already-parsed object against a shape. */
export function check<S extends Shape>(raw: unknown, shape: S): Checked<S> {
  const obj = (raw && typeof raw === "object" && !Array.isArray(raw) ? raw : {}) as Record<string, unknown>;
  const out: Record<string, unknown> = {};
  for (const [key, kind] of Object.entries(shape)) {
    const optional = kind.endsWith("?");
    const base = kind.replace("?", "");
    const v = obj[key];
    if (v === undefined || v === null || v === "") {
      if (optional) { out[key] = undefined; continue; }
      throw new HttpError(400, `${key} is required.`);
    }
    switch (base) {
      case "string": if (typeof v !== "string") throw new HttpError(400, `${key} must be text.`); out[key] = v; break;
      case "number": { const n = typeof v === "number" ? v : Number(v); if (!Number.isFinite(n)) throw new HttpError(400, `${key} must be a number.`); out[key] = n; break; }
      case "boolean": out[key] = v === true || v === "true" || v === 1; break;
      case "uuid": if (typeof v !== "string" || !UUID.test(v)) throw new HttpError(400, `${key} must be an id.`); out[key] = v; break;
      case "date": if (typeof v !== "string" || !DATE.test(v)) throw new HttpError(400, `${key} must be a date (YYYY-MM-DD).`); out[key] = v; break;
      case "array": if (!Array.isArray(v)) throw new HttpError(400, `${key} must be a list.`); out[key] = v; break;
      case "object": if (typeof v !== "object" || Array.isArray(v)) throw new HttpError(400, `${key} must be an object.`); out[key] = v; break;
    }
  }
  const rest: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(obj)) if (!(k in shape)) { rest[k] = v; out[k] = v; }
  out.rest = rest;
  return out as Checked<S>;
}

/** Read and check a request body. A body that is not JSON is a 400, not a 500. */
export async function readBody<S extends Shape>(req: Request, shape: S): Promise<Checked<S>> {
  let raw: unknown;
  try { raw = await req.json(); } catch { throw new HttpError(400, "The request body is not JSON."); }
  return check(raw, shape);
}
