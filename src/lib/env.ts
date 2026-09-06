/**
 * Every environment key Genie reads, in one place, with what happens when
 * it is missing (6 Sep 2026: twelve keys were referenced and documented
 * nowhere, so a missing one showed up as a feature silently failing).
 *
 * `env("KEY")` returns the value or throws a sentence naming the key and
 * the feature — never a bare `undefined` that becomes a 500 three calls
 * later. `envOptional` is for the doors that stay shut politely.
 * `missingEnv()` lists what is absent for the admin health screen.
 */
export const ENV_KEYS = {
  NEXT_PUBLIC_SUPABASE_URL: { required: true, feature: "Genie's database" },
  NEXT_PUBLIC_SUPABASE_ANON_KEY: { required: true, feature: "sign-in" },
  SUPABASE_SERVICE_ROLE_KEY: { required: true, feature: "every server-side read and write" },
  RAGHU_EMAIL: { required: false, feature: "the owner account (defaults to raghu@nandan.co.in)" },
  ANTHROPIC_API_KEY: { required: false, feature: "everything Genie writes with Claude" },
  CRM_SUPABASE_URL: { required: false, feature: "the CRM's own database" },
  CRM_SUPABASE_SERVICE_KEY: { required: false, feature: "the CRM's own database" },
  CRON_SECRET: { required: false, feature: "the nine Vercel crons" },
  RESEND_API_KEY: { required: false, feature: "outbound mail that is not Gmail" },
  IMS_MAIL_FROM: { required: false, feature: "IMS expiry mail's From address" },
  GOOGLE_OAUTH_CLIENT_ID: { required: false, feature: "Connect Gmail" },
  GOOGLE_OAUTH_CLIENT_SECRET: { required: false, feature: "Connect Gmail" },
  GOOGLE_SA_EMAIL: { required: false, feature: "Drive filing (service account)" },
  GOOGLE_SA_PRIVATE_KEY: { required: false, feature: "Drive filing (service account)" },
  DRIVE_UPLOAD_FOLDER_ID: { required: false, feature: "Drive filing — the upload folder" },
  DRIVE_MAIL_ROOT: { required: false, feature: "Drive filing — the mail root" },
  NEXT_PUBLIC_SITE_URL: { required: false, feature: "absolute links in mail (defaults to genie.nandan.co.in)" },
  OPENAI_API_KEY: { required: false, feature: "server-side transcription of voice notes" },
  CHROME_PATH: { required: false, feature: "PDF pressing on a laptop (Vercel ships its own Chromium)" },
} as const;

export type EnvKey = keyof typeof ENV_KEYS;

export function env(key: EnvKey): string {
  const v = process.env[key];
  if (!v) throw new Error(`${key} is not set — it powers ${ENV_KEYS[key].feature}.`);
  return v;
}

export function envOptional(key: EnvKey): string | null {
  return process.env[key] || null;
}

/** The keys that are absent, with the feature each one powers. */
export function missingEnv(): { key: EnvKey; required: boolean; feature: string }[] {
  return (Object.keys(ENV_KEYS) as EnvKey[])
    .filter((k) => !process.env[k])
    .map((k) => ({ key: k, required: ENV_KEYS[k].required, feature: ENV_KEYS[k].feature }));
}
