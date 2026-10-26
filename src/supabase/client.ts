import { createClient, type SupabaseClient } from "@supabase/supabase-js";

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseKey = import.meta.env.VITE_ANON_KEY;

export const supabase = (supabaseUrl && supabaseKey) 
    ? createClient(supabaseUrl, supabaseKey, {
        // Ship only with the accepted coordinated Auth patch. Never migrate
        // credentials from the legacy domain; this protocol starts signed out.
        auth: { storageKey: `sb-${new URL(supabaseUrl).host}-auth-token-coordinated-v2` },
    })
    : null;

export const getSupabaseClient = (): SupabaseClient => {
    if (!supabase) {
        throw new Error("Supabase client not initialized. Check your environment variables.");
    }
    return supabase;
};
