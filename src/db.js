// ─── Database layer — everything that talks to Supabase ─────────────────────
import { supabase } from "./supabase.js";
import { DATA } from "./data.jsx";

// Load everything and return it in the app's data shape
export async function loadAll() {
  const [prices, sups, recs, menu, sales] = await Promise.all([
    supabase.from("ingredient_prices").select("*").order("date", { ascending: true }),
    supabase.from("suppliers").select("*"),
    supabase.from("receipts").select("fingerprint"),
    supabase.from("menu_items").select("*"),
    supabase.from("sales").select("*"),
  ]);

  const ingredients = {};
  (prices.data || []).forEach(r => {
    if (!ingredients[r.ingredient]) ingredients[r.ingredient] = [];
    ingredients[r.ingredient].push({ date: r.date, price: Number(r.price), unit: r.unit, supplier: r.supplier });
  });

  const suppliers = {};
  (sups.data || []).forEach(s => {
    suppliers[s.name] = { type: s.type, contact: s.contact, phone: s.phone, email: s.email, terms: s.terms, delivery: s.delivery, notes: s.notes };
  });

  const menuObj = {};
  (menu.data || []).forEach(m => { menuObj[m.name] = { price: Number(m.price), ing: m.ingredients || {} }; });

  const salesObj = {};
  (sales.data || []).forEach(s => { salesObj[s.month] = { loc1: Number(s.loc1), loc2: Number(s.loc2), mix: s.mix || {} }; });

  return {
    ingredients,
    suppliers,
    menu: menuObj,
    sales: salesObj,
    receipts: (recs.data || []).map(r => r.fingerprint),
    locations: DATA.locations,
    alerts: DATA.alerts,
  };
}

// First run: if the database is empty, seed it with the starting data
export async function seedIfEmpty() {
  const { count } = await supabase.from("menu_items").select("*", { count: "exact", head: true });
  if (count && count > 0) return false; // already seeded

  const supRows = Object.entries(DATA.suppliers).map(([name, s]) => ({
    name, type: s.type || "retail", contact: s.contact || "", phone: s.phone || "",
    email: s.email || "", terms: s.terms || "", delivery: s.delivery || "", notes: s.notes || "",
  }));
  await supabase.from("suppliers").upsert(supRows);

  const menuRows = Object.entries(DATA.menu).map(([name, m]) => ({ name, price: m.price, ingredients: m.ing }));
  await supabase.from("menu_items").upsert(menuRows);

  const salesRows = Object.entries(DATA.sales).map(([month, s]) => ({ month, loc1: s.loc1, loc2: s.loc2, mix: s.mix || {} }));
  await supabase.from("sales").upsert(salesRows);

  const priceRows = [];
  Object.entries(DATA.ingredients).forEach(([ingredient, entries]) => {
    entries.forEach(e => priceRows.push({ ingredient, price: e.price, unit: e.unit, supplier: e.supplier, date: e.date }));
  });
  await supabase.from("ingredient_prices").insert(priceRows);

  return true;
}

// Save a scanned receipt: the receipt record plus each ingredient price line
export async function saveReceipt(result) {
  const fingerprint = `${result.supplier}|${result.date}|${result.items.length}`;
  const { error: rErr } = await supabase.from("receipts").insert({
    fingerprint, supplier: result.supplier || "Unknown",
    date: result.date || new Date().toISOString().slice(0, 10),
    item_count: result.items.length,
  });
  if (rErr && !rErr.message?.includes("duplicate")) throw rErr;

  const rows = result.items.map(it => ({
    ingredient: it.ingredient, price: it.price, unit: it.unit || "unit",
    supplier: result.supplier || "Unknown", date: result.date || new Date().toISOString().slice(0, 10),
  }));
  const { error: pErr } = await supabase.from("ingredient_prices").insert(rows);
  if (pErr) throw pErr;

  // Make sure the supplier exists
  await supabase.from("suppliers").upsert(
    { name: result.supplier || "Unknown", type: "retail", notes: "Added from receipt scan." },
    { onConflict: "name", ignoreDuplicates: true }
  );
}

// Save or update a month's sales figures
export async function saveSales(month, loc1, loc2, mix = {}) {
  const { error } = await supabase.from("sales").upsert({ month, loc1, loc2, mix });
  if (error) throw error;
}
