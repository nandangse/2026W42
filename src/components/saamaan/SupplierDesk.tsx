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
import { AgeingScreen, ReportCardScreen, PaymentHub } from "@/components/kuber/Books";
import { INK, MUTED, BORDER, NAVY, ORANGE } from "@/components/ims/ui";

type Tab = "list" | "card" | "outstanding" | "plan";

export default function SupplierDesk({ erpBase, canKuber }: { erpBase: string; canKuber: boolean }) {
  const [tab, setTab] = useState<Tab>("list");
  const TABS: [Tab, string, string][] = [
    ["list", "Suppliers", "the ERP's supplier master, mirrored"],
    ["card", "Supplier Report Card", "graded A–D on how we pay them and how they deliver — Kuber's figures, live"],
    ["outstanding", "Supplier Outstanding", "every open supplier bill, aged, net of advances — Kuber's payables ageing, live"],
    ["plan", "Supplier Payment Plan", "the 13-week cash plan's supplier side — what we are going to pay, and when"],
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
      {tab === "plan" && canKuber && (
        <div>
          <div className="text-sm mb-2" style={{ color: INK }}><b>Supplier payment plan</b> <span style={{ color: MUTED }}>— the next thirteen weeks, supplier bills by the week they are planned; the same hub Kuber plans on.</span></div>
          <PaymentHub />
        </div>
      )}
    </div>
  );
}
