# Security Policy — Westcoast Poké (and template for all future projects)

Born from a real near-miss (July 2026): our Anthropic API key was compiled into the
browser bundle and visible to anyone with the app URL via dev tools. Fixed by moving
all AI calls behind a Supabase Edge Function. These rules exist so that never happens again.

## 1. Secrets never reach the browser

- API keys, tokens, and service credentials live **only** in server-side secret storage
  (Supabase Edge Function secrets, Vercel server-only env vars — never `VITE_*`/`NEXT_PUBLIC_*` prefixed).
- Any third-party API that needs a key is called through a server-side proxy
  (Edge Function), never directly from client code.
- The only keys allowed in a client bundle are ones **designed** to be public
  (e.g. the Supabase publishable/anon key — safe only because RLS backs it, see §2).

## 2. The database defends itself (RLS)

- Row Level Security is enabled on **every** table, no exceptions. A table without
  RLS is world-readable/writable through the public API key.
- Policies grant the minimum: reads to authenticated users, writes only to roles
  that genuinely need them (e.g. owner emails). Demo/anonymous roles get SELECT at most.
- Schema and policy changes run as SQL in the Supabase dashboard (standing rule).

## 3. Authorization is enforced server-side

- Hiding a button is UX, not security. Every restriction (view-only demo, owner-only
  AI calls, write access) must also be enforced where the client can't reach it:
  RLS policies and Edge Function checks.
- Server code verifies the caller's JWT and identity on every request; it never
  trusts flags, roles, or emails sent by the client.

## 4. Sessions and access

- Login links / OTPs expire fast (5 min); the session itself may persist for
  non-sensitive apps — decide per project based on data sensitivity.
- Temporary access (demos, contractors) is time-boxed, capped, revocable with one
  change, and removed when no longer needed. Access lists live in one obvious place.

## 5. If a secret is ever exposed

1. Assume it's compromised — exposure time doesn't matter.
2. Generate a new secret and install it server-side.
3. Deploy so no live bundle/artifact contains the old one.
4. **Revoke the old secret** at the provider. This step is what actually closes the hole.
5. Check the provider's usage/billing dashboard for abuse.

## 6. Accounts, spend, and dependencies

- 2FA enabled on every account that sits above the app: Supabase, GitHub, Vercel, Anthropic.
  If one of these is breached, nothing else in this document matters.
- A monthly spend limit is set in the Anthropic console (and any other pay-per-use provider),
  so abuse of any kind is capped at a known dollar amount.
- `.env` files are gitignored **before** the first commit. If a secret ever lands in a
  commit, deleting it later is not enough — git history keeps it forever; rotate it (§5).
- Dependencies get an occasional `npm audit`; packages with known vulnerabilities are updated.
- AI output is untrusted input: model responses (receipt scans, web-search results) are
  parsed and validated as JSON, never executed or rendered as raw HTML, and a single
  response can never trigger unbounded writes or spend.

## 7. Checklists — review on demand

Run through these manually at the relevant moment. Nothing here is automated by design
(revisit once our processes settle).

### Before every deploy
- [ ] `grep` the built bundle (`dist/`) for key prefixes (`sk-`, `key`, provider names) — zero hits.
- [ ] No `VITE_*` env var contains anything secret.
- [ ] Every new table has RLS enabled with explicit policies.
- [ ] Every new external API call goes through the server-side proxy.
- [ ] Any new access path (demo, share link) has server-side expiry/limits, not just UI.
- [ ] `.env` still gitignored; no secret in any new commit.

### When starting a new project
- [ ] Copy this SECURITY.md in; update the reporting contact.
- [ ] `.gitignore` includes `.env*` before the first commit.
- [ ] 2FA confirmed on all provider accounts the project uses.
- [ ] Spend limits set on any pay-per-use API.
- [ ] RLS-on-by-default decided for the database from day one.

### Periodically (monthly-ish)
- [ ] Provider usage/billing dashboards look like our own usage.
- [ ] `npm audit` — no high/critical findings left unaddressed.
- [ ] Temporary access (demo codes, contractor accounts) still needed? Remove what isn't.

## 8. Reporting

If you find a vulnerability in this app, email wenceslyne@elitelvlservices.com.
Do not open a public GitHub issue for security problems.
