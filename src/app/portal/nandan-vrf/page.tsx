import type { Metadata } from "next";
import VendorForm from "@/components/portal/VendorForm";
export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Nandan Vendor Registration Form" };
/** genie.nandan.co.in/portal/vrf — public, no login (Dr Raghu, 8 Oct 2026: "Don't put any year or whatever else into that") */
export default function Page() { return <VendorForm />; }
