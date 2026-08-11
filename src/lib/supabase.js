import { createClient } from "@supabase/supabase-js";

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  // This shows up in the browser console if the env vars weren't set
  // at build time. See README.md for how to set them in Netlify.
  console.error(
    "Missing VITE_SUPABASE_URL or VITE_SUPABASE_ANON_KEY. " +
    "Set these as environment variables in Netlify (or a local .env file) and redeploy."
  );
}

export const supabase = createClient(supabaseUrl ?? "", supabaseAnonKey ?? "");
