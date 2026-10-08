import type { Metadata } from "next";
export const metadata: Metadata = { title: "Genie — Terms of Service" };
const S = { page: { fontFamily: "system-ui, -apple-system, 'Segoe UI', sans-serif", color: "#16232F", maxWidth: 760, margin: "0 auto", padding: "40px 24px", lineHeight: 1.6 } as const, h2: { fontSize: 16, marginTop: 28 } as const };
export default function Terms() {
  return (
    <main style={S.page}>
      <h1 style={{ fontSize: 24 }}>Genie — Terms of Service</h1>
      <p style={{ color: "#5B6470" }}>Nandan GSE Private Limited · last updated 8 October 2026</p>
      <p>Genie is a private business system run by Nandan GSE Private Limited for its own operations. Access is by invitation. By signing in you agree to the following.</p>
      <h2 style={S.h2}>Use</h2>
      <p>Use Genie only for Nandan GSE&apos;s business and only within the role you have been given. Keep your sign-in to yourself. Records you enter must be true to the best of your knowledge; what you send through Genie — e-mail, WhatsApp, documents — goes in your name or the company&apos;s and is logged.</p>
      <h2 style={S.h2}>Connected accounts</h2>
      <p>If you connect a Gmail mailbox, you authorise Genie to send business e-mail as that mailbox and to read replies to what it sent, as described in the <a href="/privacy">Privacy Policy</a>. You may disconnect at any time.</p>
      <h2 style={S.h2}>Confidentiality</h2>
      <p>Much of what Genie holds — pay, personal records, prices, customer and supplier information — is confidential. Do not copy it out of Genie except in the course of your work.</p>
      <h2 style={S.h2}>Availability and liability</h2>
      <p>Genie is provided as it is, for internal use; we aim to keep it available but do not guarantee it. Nandan GSE may change or withdraw Genie, or a person&apos;s access, at any time.</p>
      <h2 style={S.h2}>Contact</h2>
      <p>Nandan GSE Private Limited · <a href="mailto:raghu@nandan.co.in">raghu@nandan.co.in</a></p>
    </main>
  );
}
