import type { Metadata } from "next";
export const metadata: Metadata = { title: "Genie — Privacy Policy" };
/** Public, no login: Google's OAuth consent screen asks for it (8 Oct 2026). Plain words, true to what Genie does. */
const S = { page: { fontFamily: "system-ui, -apple-system, 'Segoe UI', sans-serif", color: "#16232F", maxWidth: 760, margin: "0 auto", padding: "40px 24px", lineHeight: 1.6 } as const, h2: { fontSize: 16, marginTop: 28 } as const };
export default function Privacy() {
  return (
    <main style={S.page}>
      <h1 style={{ fontSize: 24 }}>Genie — Privacy Policy</h1>
      <p style={{ color: "#5B6470" }}>Nandan GSE Private Limited · last updated 8 October 2026</p>
      <p>Genie (genie.nandan.co.in) is the internal business system of Nandan GSE Private Limited, Khopoli, Maharashtra, India. It is used by our employees, and by suppliers and customers we invite, to run our planning, HR, purchasing, service and sales work. This page explains what Genie does with personal data and with Google account data.</p>
      <h2 style={S.h2}>What we collect</h2>
      <p>Business records our people enter: employee records, attendance and pay, supplier and customer contacts, quotations, orders, service issues, and the messages sent through Genie. Sign-in is by company Google account or by an invited e-mail address.</p>
      <h2 style={S.h2}>Google account data</h2>
      <p>When a user connects a Gmail mailbox to Genie, Genie asks Google for permission to <b>send e-mail as that mailbox</b> and to <b>read replies to the e-mails Genie sent</b>. Genie uses this only to send business e-mail the user composes or approves in Genie (quotations, payslips, HR and marketing mail) and to file the replies against the right record. Genie stores the refresh token Google issues, encrypted, in our database; it stores the e-mails it sent and the replies it pulled. Genie does not read the rest of the mailbox, does not sell or share Google data with anyone, and does not use it for advertising. A user can disconnect at any time from Profile → Gmail, or from <a href="https://myaccount.google.com/permissions">myaccount.google.com/permissions</a>; the token is then deleted.</p>
      <p>Genie&apos;s use and transfer of information received from Google APIs adheres to the <a href="https://developers.google.com/terms/api-services-user-data-policy">Google API Services User Data Policy</a>, including the Limited Use requirements.</p>
      <h2 style={S.h2}>Where data lives and who sees it</h2>
      <p>Data is stored with Supabase (Postgres) and files with Google Drive, under Nandan GSE&apos;s own accounts. Access is by role: a person sees the modules an administrator has opened to them. Pay and personal records are confidential to HR and management.</p>
      <h2 style={S.h2}>Retention and your rights</h2>
      <p>Business records are kept as long as the law and our accounts require. An employee, supplier or customer may ask what Genie holds about them, ask for a correction, or ask for a connected mailbox to be removed, by writing to <a href="mailto:hr@nandan.co.in">hr@nandan.co.in</a>.</p>
      <h2 style={S.h2}>Contact</h2>
      <p>Nandan GSE Private Limited · <a href="mailto:raghu@nandan.co.in">raghu@nandan.co.in</a></p>
    </main>
  );
}
