"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { checkPermission } from "@/lib/auth/permissions";
import { canManageSettings } from "@/lib/types";

type ActionResult = { success: true } | { success: false; error: string };

async function requireAdmin() {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { supabase, error: "Not authenticated" } as const;
  const { data: profile } = await supabase
    .from("profiles")
    .select("role, is_active")
    .eq("id", user.id)
    .single();
  if (!profile || !profile.is_active) {
    return { supabase, error: "Inactive account" } as const;
  }
  if (profile.role !== "admin") {
    return { supabase, error: "Admin role required" } as const;
  }
  return { supabase, error: null } as const;
}

export async function updateSettings(
  updates: Record<string, unknown>
): Promise<ActionResult> {
  {
    const _perm = await checkPermission(canManageSettings, "Only owners and managers can perform this action.");
    if (!_perm.ok) return { success: false, error: _perm.error };
  }

  const auth = await requireAdmin();
  if (auth.error) return { success: false, error: auth.error };

  const rows = Object.entries(updates).map(([key, value]) => ({
    key,
    value,
    updated_at: new Date().toISOString(),
  }));

  // Upsert all rows in one round trip
  const { error } = await auth.supabase
    .from("settings")
    .upsert(rows, { onConflict: "key" });

  if (error) return { success: false, error: error.message };

  revalidatePath("/settings");
  revalidatePath("/");
  return { success: true };
}
