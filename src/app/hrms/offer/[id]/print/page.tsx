import type { Metadata } from "next";
import { currentUser } from "@/lib/auth";
import { adminClient } from "@/lib/supabase/admin";
import { resolveHrmsAccess } from "@/lib/hrms";
import { offerLetterHtml } from "@/lib/offer";
import OfferPrint from "@/components/hrms/OfferPrint";

export const dynamic = "force-dynamic";

export const metadata: Metadata = { title: "Nandan HRMS Genie" };

/**
 * /hrms/offer/<id>/print — the letter on its own, laid out for paper.
 *
 * A separate page rather than a print stylesheet over the builder: the letter
 * that goes to a candidate should not carry a single pixel of the tool that
 * made it, and "print what you see" always ends up printing a tab strip.
 */
export default async function OfferPrintPage({ params }: { params: { id: string } }) {
  const user = await currentUser();
  const allowed =
    !!user && !user.disabled && (await resolveHrmsAccess(adminClient(), user.email, user.isOwner));
  if (!allowed) {
    return (
      <div style={{ padding: 40, fontFamily: "system-ui, sans-serif" }}>
        <h1 style={{ fontSize: 20 }}>You are not authorized to view this Page - Login at the right page</h1>
      </div>
    );
  }

  const admin = adminClient();
  const { data: offer } = await admin.from("hrms_offer").select("*").eq("id", params.id).maybeSingle();
  if (!offer) return <div style={{ padding: 40, fontFamily: "system-ui, sans-serif" }}>No such offer.</div>;

  return <OfferPrint html={offerLetterHtml(offer, String(offer.status) === "Draft", false)} status={String(offer.status)} validDays={Number(offer.valid_days) || 3} name={String(offer.name || "")} offerNo={String(offer.offer_no || "")} />;
}
