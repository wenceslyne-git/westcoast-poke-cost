// Anthropic proxy — keeps the API key server-side. The browser calls this
// function with the user's Supabase JWT; only owner accounts may use it
// (demo/anonymous sessions are refused, enforcing no-AI-in-demo server-side).
import { createClient } from "jsr:@supabase/supabase-js@2";

const OWNER_EMAILS = [
  "wenceslyne@elitelvlservices.com",
  "sbgomez604@gmail.com",
  "r_gomez_02@yahoo.com",
];

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return new Response("Method not allowed", { status: 405, headers: CORS });

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_ANON_KEY")!,
    { global: { headers: { Authorization: req.headers.get("Authorization") ?? "" } } },
  );
  const { data: { user }, error } = await supabase.auth.getUser();
  const email = user?.email?.toLowerCase().trim();
  if (error || !email || !OWNER_EMAILS.includes(email)) {
    return new Response(JSON.stringify({ error: "Not authorized" }), {
      status: 403,
      headers: { ...CORS, "Content-Type": "application/json" },
    });
  }

  const body = await req.text();
  const upstream = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": Deno.env.get("ANTHROPIC_API_KEY")!,
      "anthropic-version": "2023-06-01",
    },
    body,
  });

  return new Response(await upstream.text(), {
    status: upstream.status,
    headers: { ...CORS, "Content-Type": "application/json" },
  });
});
