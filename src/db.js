// ─── Database layer — everything that talks to Supabase ─────────────────────
import { supabase } from "./supabase.js";
import { DATA } from "./data.jsx";

export async function loadAll() {
  const [prices, sups, recs, menu, sales, alerts] = await Promise.all([
    supabase.from("ingredient_prices").select("*").order("date", { ascending: true }),
    supabase.from("suppliers").select("*"),
    supabase.from("receipts").select("*"),
    supabase.from("menu_items").select("*"),
    supabase.from("sales").select("*"),
    supabase.from("alerts").select("*"),
  ]);

  const ingredients = {};
  (prices.data || []).forEach(r => {
    if (!ingredients[r.ingredient]) ingredients[r.ingredient] = [];
    ingredients[r.ingredient].push({ id: r.id, date: r.date, price: Number(r.price), unit: r.unit, supplier: r.supplier, quantity: r.quantity!=null?Number(r.quantity):null, line_total: r.line_total!=null?Number(r.line_total):null });
  });

  const suppliers = {};
  (sups.data || []).forEach(s => {
    suppliers[s.name] = { type: s.type, contact: s.contact, phone: s.phone, email: s.email, terms: s.terms, delivery: s.delivery, notes: s.notes, preferred: !!s.preferred, address: s.address || "" };
  });

  const menuObj = {};
  (menu.data || []).forEach(m => {
    let sizes = m.sizes && m.sizes.medium ? m.sizes : { small: Number(m.price) - 2, medium: Number(m.price), large: Number(m.price) + 3 };
    let ing = m.ingredients || {};
    if (!ing.medium) { // migrate old flat recipe: it becomes Medium, other sizes prefilled
      const med = ing;
      const scale = (f) => { const o = {}; Object.entries(med).forEach(([k, v]) => { o[k] = Math.round(v * f * 1000) / 1000; }); return o; };
      ing = { small: scale(0.8), medium: med, large: scale(1.25) };
    }
    menuObj[m.name] = { sizes, ing, price: Number(sizes.medium), category: m.category || "classic" };
  });

  const salesObj = {};
  (sales.data || []).forEach(s => { salesObj[s.month] = { loc1: Number(s.loc1), loc2: Number(s.loc2), mix: s.mix || {} }; });

  const alertsObj = {};
  (alerts.data || []).forEach(a => { alertsObj[a.ingredient] = Number(a.threshold); });

  return {
    ingredients, suppliers, menu: menuObj, sales: salesObj,
    receipts: (recs.data || []).map(r => r.fingerprint),
    locations: DATA.locations,
    alerts: alertsObj,
  };
}

export async function seedIfEmpty() {
  const { count } = await supabase.from("menu_items").select("*", { count: "exact", head: true });
  if (count && count > 0) return false;

  await supabase.from("suppliers").upsert(Object.entries(DATA.suppliers).map(([name, s]) => ({
    name, type: s.type || "retail", contact: s.contact || "", phone: s.phone || "",
    email: s.email || "", terms: s.terms || "", delivery: s.delivery || "", notes: s.notes || "",
  })));
  await supabase.from("menu_items").upsert(Object.entries(DATA.menu).map(([name, m]) => ({ name, price: m.sizes.medium, sizes: m.sizes, ingredients: m.ing, category: m.category || "classic" })));
  await supabase.from("sales").upsert(Object.entries(DATA.sales).map(([month, s]) => ({ month, loc1: s.loc1, loc2: s.loc2, mix: s.mix || {} })));
  await supabase.from("alerts").upsert(Object.entries(DATA.alerts).map(([ingredient, threshold]) => ({ ingredient, threshold })));

  const priceRows = [];
  Object.entries(DATA.ingredients).forEach(([ingredient, entries]) => {
    entries.forEach(e => priceRows.push({ ingredient, price: e.price, unit: e.unit, supplier: e.supplier, date: e.date }));
  });
  await supabase.from("ingredient_prices").insert(priceRows);
  return true;
}

export async function resyncMenu() {
  // Upsert every seed item over the DB (adds missing, overwrites sizes/recipe/price/category on name match)
  await supabase.from("menu_items").upsert(
    Object.entries(DATA.menu).map(([name, m]) => ({ name, price: m.sizes.medium, sizes: m.sizes, ingredients: m.ing, category: m.category || "classic" })),
    { onConflict: "name" }
  );
  // Orphans = live rows not present in the seed (flagged to caller, never auto-deleted here)
  const { data: rows } = await supabase.from("menu_items").select("name");
  const seedNames = new Set(Object.keys(DATA.menu));
  const orphans = (rows || []).map(r => r.name).filter(n => !seedNames.has(n));
  return { orphans };
}

export async function saveReceipt(result, location = "all") {
  const fingerprint = `${result.supplier}|${result.date}|${result.items.length}`;
  const { error: rErr } = await supabase.from("receipts").insert({
    fingerprint, supplier: result.supplier || "Unknown",
    date: result.date || new Date().toISOString().slice(0, 10),
    item_count: result.items.length, location,
    gross_total: result.gross_total != null ? result.gross_total : null,
    invoice_total: result.invoice_total != null ? result.invoice_total : null,
  });
  if (rErr && !rErr.message?.includes("duplicate")) throw rErr;

  const rows = result.items.map(it => ({
    ingredient: it.ingredient, price: it.price, unit: it.unit || "unit",
    supplier: result.supplier || "Unknown", date: result.date || new Date().toISOString().slice(0, 10),
    quantity: it.quantity != null ? it.quantity : null,
    line_total: it.line_total != null ? it.line_total : null,
  }));
  const { error: pErr } = await supabase.from("ingredient_prices").insert(rows);
  if (pErr) throw pErr;

  await supabase.from("suppliers").upsert(
    { name: result.supplier || "Unknown", type: "retail", notes: "Added from receipt scan." },
    { onConflict: "name", ignoreDuplicates: true }
  );
}

export async function saveSales(month, loc1, loc2, mix = {}) {
  const { error } = await supabase.from("sales").upsert({ month, loc1, loc2, mix });
  if (error) throw error;
}

// ─── Receipt history (item 13) ──────────────────────────────────────────────
export async function loadReceipts() {
  const { data, error } = await supabase.from("receipts").select("*").order("date", { ascending: false });
  if (error) return [];
  return (data || []).map(r => ({
    id: r.id, supplier: r.supplier, date: r.date, location: r.location || "all",
    itemCount: r.item_count || 0,
    gross: r.gross_total != null ? Number(r.gross_total) : null,
    invoice: r.invoice_total != null ? Number(r.invoice_total) : null,
    fingerprint: r.fingerprint,
  }));
}

// Full cascade: removes the receipt row AND the ingredient_prices lines it created
// (matched by supplier + date — the fingerprint basis). Trends/MCA recalculate.
export async function deleteReceiptByKey(supplier, date) {
  if (!supplier || !date) return;
  await supabase.from("ingredient_prices").delete().eq("supplier", supplier).eq("date", date);
  await supabase.from("receipts").delete().eq("supplier", supplier).eq("date", date);
}

export async function deleteReceiptCascade(receipt) {
  const { supplier, date, id } = receipt;
  if (supplier && date) {
    const { error: pErr } = await supabase.from("ingredient_prices").delete().eq("supplier", supplier).eq("date", date);
    if (pErr) throw pErr;
  }
  const { error: rErr } = await supabase.from("receipts").delete().eq("id", id);
  if (rErr) throw rErr;
}

// ─── Manual entry, edits & deletes ──────────────────────────────────────────
export async function addPrice(ingredient, price, unit, supplier, date) {
  const { error } = await supabase.from("ingredient_prices").insert({ ingredient, price, unit, supplier, date });
  if (error) throw error;
  await supabase.from("suppliers").upsert({ name: supplier, type: "retail", notes: "Added manually." }, { onConflict: "name", ignoreDuplicates: true });
}

export async function deletePriceEntry(id) {
  const { error } = await supabase.from("ingredient_prices").delete().eq("id", id);
  if (error) throw error;
}

export async function deleteIngredient(name) {
  await supabase.from("ingredient_prices").delete().eq("ingredient", name);
  await supabase.from("alerts").delete().eq("ingredient", name);
}

export async function deleteSupplier(name) {
  const { error } = await supabase.from("suppliers").delete().eq("name", name);
  if (error) throw error;
}

export async function upsertSupplier(name, fields) {
  const { error } = await supabase.from("suppliers").upsert({ name, ...fields });
  if (error) throw error;
}

export async function saveMenuItem(name, sizes, ingredients, category) {
  const { error } = await supabase.from("menu_items").upsert({ name, price: sizes.medium, sizes, ingredients, category: category || "classic" });
  if (error) throw error;
}

// ─── Settings (size mix etc.) ───────────────────────────────────────────────
export async function loadSetting(key, fallback) {
  const { data } = await supabase.from("settings").select("value").eq("key", key).limit(1);
  return data && data[0] ? data[0].value : fallback;
}
export async function saveSetting(key, value) {
  const { error } = await supabase.from("settings").upsert({ key, value });
  if (error) throw error;
}

export async function deleteMenuItem(name) {
  const { error } = await supabase.from("menu_items").delete().eq("name", name);
  if (error) throw error;
}

// Repoint every price row from one ingredient name to another.
// New name that doesn't exist yet = rename; existing name = merge (price history combines).
export async function renameIngredientInPrices(oldName, newName) {
  const { error } = await supabase.from("ingredient_prices").update({ ingredient: newName }).eq("ingredient", oldName);
  if (error) throw error;
}

export async function saveAlert(ingredient, threshold) {
  if (threshold === null || threshold === "" || isNaN(threshold)) {
    await supabase.from("alerts").delete().eq("ingredient", ingredient);
  } else {
    const { error } = await supabase.from("alerts").upsert({ ingredient, threshold });
    if (error) throw error;
  }
}

// ─── Market checks (advisory history, item 10) ──────────────────────────────
export async function saveMarketChecks(rows) {
  if (!rows.length) return;
  const { error } = await supabase.from("market_checks").insert(rows);
  if (error) throw error;
}
export async function loadMarketChecks() {
  const { data, error } = await supabase.from("market_checks").select("*").order("checked_at", { ascending: true }).limit(400);
  if (error) return {};
  const byIng = {};
  (data || []).forEach(r => {
    if (!byIng[r.ingredient]) byIng[r.ingredient] = [];
    byIng[r.ingredient].push({ price: Number(r.price), unit: r.unit, source: r.source, url: r.url, at: r.checked_at });
  });
  return byIng;
}

// ─── Daily usage caps (item 11): one row per action per day, shared org-wide ─
export async function canRunToday(action) {
  const today = new Date().toISOString().slice(0, 10);
  const { data } = await supabase.from("usage_log").select("*").eq("action", action).eq("day", today).limit(1);
  return { allowed: !(data && data.length), last: data && data[0] ? data[0] : null };
}
export async function recordRun(action, byEmail) {
  const today = new Date().toISOString().slice(0, 10);
  const { error } = await supabase.from("usage_log").insert({ action, day: today, by_email: byEmail || "" });
  if (error && !error.message?.includes("duplicate")) throw error;
}
export async function lastRun(action) {
  const { data } = await supabase.from("usage_log").select("*").eq("action", action).order("day", { ascending: false }).limit(1);
  return data && data[0] ? data[0] : null;
}

// ─── Monthly scan pool (250/calendar month, shared) ─────────────────────────
export async function scansThisMonth() {
  const monthStart = new Date();
  const first = `${monthStart.getFullYear()}-${String(monthStart.getMonth() + 1).padStart(2, "0")}-01`;
  const { count } = await supabase.from("usage_log").select("*", { count: "exact", head: true }).eq("action", "scan").gte("day", first);
  return count || 0;
}
export async function recordScan(byEmail) {
  const today = new Date().toISOString().slice(0, 10);
  await supabase.from("usage_log").insert({ action: "scan", day: today, by_email: byEmail || "" });
}
