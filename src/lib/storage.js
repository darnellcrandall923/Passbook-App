import { supabase } from "./supabase";

const KEYS = ["accounts", "transactions", "goals", "budgets", "scheduled"];

// Loads every data key for the signed-in user (enforced server-side by
// row-level security, so this only ever returns that user's rows).
export async function loadAll() {
  const out = {};
  KEYS.forEach((k) => { out[k] = []; });
  try {
    const { data, error } = await supabase.from("user_data").select("key, value");
    if (error) throw error;
    (data || []).forEach((row) => { out[row.key] = row.value; });
  } catch (e) {
    console.error("Failed to load data from Supabase:", e);
  }
  return out;
}

// Upserts one key's full value (accounts, transactions, etc.) for the
// current user. Mirrors the same one-array-per-key shape the app already
// used with localStorage, just persisted to Postgres instead.
export async function save(key, value) {
  try {
    const { data: { user }, error: userError } = await supabase.auth.getUser();
    if (userError) throw userError;
    if (!user) return;
    const { error } = await supabase
      .from("user_data")
      .upsert({ user_id: user.id, key, value }, { onConflict: "user_id,key" });
    if (error) throw error;
  } catch (e) {
    console.error("Failed to save data to Supabase:", e);
  }
}
