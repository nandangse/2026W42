import type { Metadata } from "next";
import FloorReport from "@/components/FloorReport";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "On Floor Report" };

/**
 * /floor-report — the On Floor board as a sheet of paper.
 *
 * Printed and carried onto the shop floor: the cards on top, then one row
 * per job with its open tasks and a tickbox in front of each, so the walk
 * around the floor can be ticked off with a pen. The data comes from the
 * same /api/board the Planning Suite reads, so this page cannot disagree
 * with the screen it summarises.
 */
export default function FloorReportPage() {
  return <FloorReport />;
}
