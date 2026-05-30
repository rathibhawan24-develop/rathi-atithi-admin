import { createClient as createSupabaseClient } from "@supabase/supabase-js";

// Admin (service-role) Supabase client. Bypasses RLS and exposes
// `auth.admin.*` for creating/deleting users. NEVER expose this on the
// browser; only import from server actions / route handlers.
export function createAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    throw new Error(
      "Admin Supabase client unavailable: SUPABASE_SERVICE_ROLE_KEY env var is not set. Add it on Vercel → Settings → Environment Variables."
    );
  }
  return createSupabaseClient(url, key, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}
