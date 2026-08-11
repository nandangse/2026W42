/* boot.js — Genie edition of main.js + supa.js.
   There is NO login screen here: the surrounding Genie app owns the session.
   We ask /api/sales/plan/session (cookie-authed, re-checks the sales grant
   server-side) for the caller's access token + profile, then run supabase-js
   on that externally-managed JWT.

   Deliberate design: the Genie parent keeps the ONLY refresh token. This
   client never rotates it (persistSession/autoRefreshToken off) — two clients
   refreshing one token family would invalidate each other. Instead we re-read
   a fresh access token from the parent session every few minutes. */
let sb = null, spToken = '';

async function spFetchSession() {
  const r = await fetch('/api/sales/plan/session', { cache: 'no-store' });
  if (r.status === 401) throw new Error('Your Genie session has expired — reload the page and sign in again.');
  if (r.status === 403) throw new Error('Sales Genie has not been shared with this account.');
  if (!r.ok) throw new Error('Could not confirm your access (HTTP ' + r.status + ').');
  return r.json();
}

(async function spBoot() {
  try {
    const s = await spFetchSession();
    spToken = s.access_token;
    sb = supabase.createClient(s.supabase_url, s.supabase_anon_key, {
      auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
      global: {
        // every PostgREST call carries the CURRENT token, read at call time
        fetch: (input, init) => {
          init = init || {};
          const h = new Headers(init.headers || {});
          h.set('Authorization', 'Bearer ' + spToken);
          return fetch(input, Object.assign({}, init, { headers: h }));
        },
      },
    });
    sb.realtime.setAuth(spToken);
    // Supabase access tokens live ~1 hour; refresh well inside that window
    setInterval(async () => {
      try {
        const n = await spFetchSession();
        spToken = n.access_token;
        sb.realtime.setAuth(spToken);
      } catch (e) { console.warn('sales-plan token refresh failed', e); }
    }, 10 * 60 * 1000);
    await startApp(s.profile, s.email);
  } catch (e) {
    bootFail(e.message || String(e));
  }
})();
