// Who reports to you — the whole cascade, not just the people one step down.
//
// `profiles.reports_to` holds a single manager per person, which makes the
// company a tree. Everywhere Genie has asked "whose work is mine to see" it has
// so far answered with DIRECT reports only, and that is wrong for anyone with a
// manager under them: a head of production who cannot see the work of their
// supervisors' teams is looking at a fraction of what they are answerable for.
//
// So this is the walk, written once and shared. Team Goals, Team KPIs and the
// IDP list all read it, and the Tasking "people reporting to me" filter should
// move onto it too.
//
// Two things it guards against, both of which have happened to somebody:
//
//   1. A CYCLE. A reports to B, B reports to A — a mis-click in Admin, and the
//      naive walk hangs the page. Every node is visited once, so a cycle simply
//      stops rather than spinning.
//
//   2. THE ROOT COUNTING ITSELF. You are not in your own team. Left in, every
//      "team average" would quietly include the manager's own numbers.

export interface Reportable {
  id: string;
  reports_to?: string | null;
}

export interface TeamMember {
  id: string;
  /** 1 = a direct report, 2 = their report, and so on. */
  depth: number;
  /** Whose report they are — the person one step up, not the root. */
  manager: string;
}

/**
 * Everyone below `rootId`, breadth-first, so direct reports come before their
 * reports and `depth` climbs monotonically. That order is what lets a UI print
 * the cascade without sorting it again.
 */
export function teamOf(people: Reportable[], rootId: string): TeamMember[] {
  const kidsOf = new Map<string, string[]>();
  for (const p of people) {
    const m = p.reports_to || null;
    // A person reporting to themselves is a data error, not a team of one.
    if (!m || m === p.id) continue;
    const list = kidsOf.get(m) || [];
    list.push(p.id);
    kidsOf.set(m, list);
  }

  const out: TeamMember[] = [];
  const seen = new Set<string>([rootId]);
  let frontier = [rootId];
  let depth = 0;

  while (frontier.length) {
    depth += 1;
    const next: string[] = [];
    for (const manager of frontier) {
      for (const id of kidsOf.get(manager) || []) {
        if (seen.has(id)) continue; // cycle, or two managers claiming one person
        seen.add(id);
        out.push({ id, depth, manager });
        next.push(id);
      }
    }
    frontier = next;
  }
  return out;
}

/** The same walk as a set, for the "is this person mine?" question. */
export function teamIds(people: Reportable[], rootId: string): Set<string> {
  return new Set(teamOf(people, rootId).map((m) => m.id));
}

/** True when anyone at all reports up to this person. */
export const hasTeam = (people: Reportable[], rootId: string): boolean =>
  teamOf(people, rootId).length > 0;

/**
 * The root plus their whole team, root first — the list a "whose ... am I
 * looking at" dropdown offers. Ordering matches teamOf(), so the dropdown reads
 * down the org chart rather than alphabetically across it.
 */
export function meAndTeam(people: Reportable[], rootId: string): { id: string; depth: number }[] {
  return [{ id: rootId, depth: 0 }, ...teamOf(people, rootId).map(({ id, depth }) => ({ id, depth }))];
}
