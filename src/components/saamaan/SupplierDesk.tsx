"use client";

/**
 * SUPPLIERS — Mukesh's desk in Saamaan (Dr Raghu, 3 Oct 2026).
 *
 * "Within the suppliers section, make another one saying Supplier Report
 * Card and Supplier Outstanding. These are the two things that are there
 * in Kuber, which Mukesh needs to know currently … Also give one more, the
 * supplier payment plan, so that he knows in the future what supplier
 * payment we are going to do in the short term."
 *
 * The three are Kuber's own screens, rendered here, reading Kuber's own
 * routes — the live figures, not a copy. They open only to the supplier
 * hand (lib/accounts: Mukesh, and the owner); every other Saamaan member
 * sees the supplier list alone, as before.
 */
import { useState } from "react";
import PurchaseOrders from "./PurchaseOrders";
import { AgeingScreen, ReportCardScreen } from "@/components/kuber/Books";
import { PaymentRelease, SupplierPlan } from "./SupplierRelease";
import VendorRegistrations from "./VendorRegistrations";
import { INK, MUTED, BORDER, NAVY, ORANGE } from "@/components/ims/ui";

type Tab = "list" | "release" | "card" | "outstanding" | "plan" | "vrf";

export default function SupplierDesk({ erpBase, canKuber }: { erpBase: string; canKuber: boolean }) {
  const [tab, setTab] = useState<Tab>("list");
  const TABS: [Tab, string, string][] = [
    ["list", "Suppliers", "the ERP's supplier master, mirrored"],
    ["release", "Supplier Payment Release", "raise an advance or a bill payment — it goes to Kuber's payment requests and accounts@ is told"],
    ["card", "Supplier Report Card", "graded A–D on how we pay them and how they deliver — Kuber's figures, live"],
    ["outstanding", "Supplier Outstanding", "every open supplier bill, aged, net of advances — Kuber's payables ageing, live"],
    ["plan", "Supplier Payment Plan", "what is planned to be paid to which supplier, and when — suppliers only"],
    ["vrf", "Vendor Registrations", "what suppliers filled on genie.nandan.co.in/portal/vrf — review, approve, reject"],
  ];
  const shown = canKuber ? TABS : TABS.slice(0, 1);
  return (
    <div>
      {canKuber && (
        <div className="flex gap-1 mb-3 flex-wrap" style={{ borderBottom: `1px solid ${BORDER}` }}>
          {shown.map(([k, l, hint]) => (
            <button key={k} onClick={() => setTab(k)} title={hint} className="px-3 py-2 text-sm font-bold"
              style={{ color: tab === k ? NAVY : MUTED, borderBottom: `3px solid ${tab === k ? ORANGE : "transparent"}`, marginBottom: -1 }}>
              {l}
            </button>
          ))}
          <span className="ml-auto self-center text-xs" style={{ color: MUTED }}>Kuber&apos;s figures, read live — the supplier hand&apos;s view</span>
        </div>
      )}
      {tab === "list" && <PurchaseOrders erpBase={erpBase} openOn="suppliers" />}
      {tab === "card" && canKuber && <ReportCardScreen />}
      {tab === "outstanding" && canKuber && <AgeingScreen kind="payable" />}
      {tab === "release" && canKuber && <PaymentRelease />}
      {/* "Ensure that there is no information in this about the cash flow in or out" (Dr Raghu, 6 Oct 2026) — suppliers only */}
      {tab === "plan" && canKuber && <SupplierPlan />}
      {tab === "vrf" && canKuber && <VendorRegistrations />}
    </div>
  );
}
