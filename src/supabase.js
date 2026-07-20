import { createClient } from "@supabase/supabase-js";

// ─── Supabase connection ─────────────────────────────────────────────────────
const SUPABASE_URL = "https://yjknlosqeqjslxzxzyys.supabase.co";
const SUPABASE_KEY = "sb_publishable_xoB-xLU-K291e9hJ3hMuIw_Bcll3sV9";

export const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

// ─── Owner access list ───────────────────────────────────────────────────────
// ONLY these email addresses can log in. Everyone else is refused.
// EDIT THIS LIST: replace with the real owner email addresses.
export const OWNER_EMAILS = [
  "wenceslyne@elitelvlservices.com",
  "sheila@westcoastpoke.com",
  "richard@westcoastpoke.com",
];

export const isOwner = (email) =>
  !!email && OWNER_EMAILS.map(e => e.toLowerCase().trim()).includes(email.toLowerCase().trim());
