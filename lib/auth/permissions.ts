// Server-side helpers for getting the current user's role and guarding pages
// / actions. Use from server components and server actions (not from client).

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import type { UserRole } from "@/lib/types";

/**
 * Returns the current user's role from their profile, or null if not signed in
 * or deactivated. Pages can use this and call requireRole-style helpers below.
 */
export async function getCurrentRole(): Promise<UserRole | null> {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const { data: profile } = await supabase
    .from("profiles")
    .select("role, is_active")
    .eq("id", user.id)
    .single();

  if (!profile || !profile.is_active) return null;
  return profile.role as UserRole;
}

/** Returns the role, redirecting to /login if not signed in. */
export async function requireRole(): Promise<UserRole> {
  const role = await getCurrentRole();
  if (!role) redirect("/login");
  return role;
}

/**
 * For a server component: if the given predicate fails on the user's role,
 * redirect to /. Returns the role on success so the caller can branch further.
 */
export async function requirePermission(
  predicate: (r: UserRole) => boolean,
  fallback: string = "/"
): Promise<UserRole> {
  const role = await requireRole();
  if (!predicate(role)) {
    redirect(fallback);
  }
  return role;
}

/**
 * For a server action: returns { ok: true, role } if allowed, otherwise
 * { ok: false, error } so the caller can return it directly. Never throws.
 */
export async function checkPermission(
  predicate: (r: UserRole) => boolean,
  errorMessage: string = "You don't have permission for this action."
): Promise<{ ok: true; role: UserRole } | { ok: false; error: string }> {
  const role = await getCurrentRole();
  if (!role) return { ok: false, error: "Not signed in." };
  if (!predicate(role)) return { ok: false, error: errorMessage };
  return { ok: true, role };
}
