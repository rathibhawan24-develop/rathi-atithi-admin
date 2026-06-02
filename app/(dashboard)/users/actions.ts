"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

type ActionResult = { ok: true } | { ok: false; error: string };

// Ensures the caller is an active admin. Throws on any other situation.
async function requireAdmin(): Promise<{ userId: string }> {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Not authenticated");
  const { data: profile } = await supabase
    .from("profiles")
    .select("role, is_active")
    .eq("id", user.id)
    .single();
  if (!profile || !profile.is_active || profile.role !== "admin") {
    throw new Error("Admin access required");
  }
  return { userId: user.id };
}

export async function createUserAction(
  formData: FormData
): Promise<ActionResult> {
  try {
    await requireAdmin();
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }

  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const password = String(formData.get("password") ?? "");
  const fullName = String(formData.get("full_name") ?? "").trim();
  const role = String(formData.get("role") ?? "reception");

  if (!email || !/^\S+@\S+\.\S+$/.test(email)) {
    return { ok: false, error: "Enter a valid email address." };
  }
  if (password.length < 8) {
    return { ok: false, error: "Password must be at least 8 characters." };
  }
  if (!["admin", "manager", "reception", "viewer"].includes(role)) {
    return { ok: false, error: "Role must be one of: admin, manager, reception, viewer." };
  }

  let admin;
  try {
    admin = createAdminClient();
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }

  // Create the auth user
  const { data: created, error: createErr } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  });
  if (createErr || !created.user) {
    return {
      ok: false,
      error:
        createErr?.message ?? "Could not create the user. Try a different email.",
    };
  }

  // Upsert their profile row
  const { error: profileErr } = await admin.from("profiles").upsert({
    id: created.user.id,
    email,
    full_name: fullName || null,
    role,
    is_active: true,
  });
  if (profileErr) {
    // Roll back the auth user so we don't leave orphans
    await admin.auth.admin.deleteUser(created.user.id);
    return {
      ok: false,
      error: `Profile creation failed: ${profileErr.message}`,
    };
  }

  revalidatePath("/users");
  return { ok: true };
}

export async function updateUserRoleAction(
  userId: string,
  role: string
): Promise<ActionResult> {
  let me;
  try {
    me = await requireAdmin();
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
  if (userId === me.userId && role !== "admin") {
    return {
      ok: false,
      error: "You cannot demote yourself. Ask another admin to do it.",
    };
  }
  if (!["admin", "manager", "reception", "viewer"].includes(role)) {
    return { ok: false, error: "Role must be one of: admin, manager, reception, viewer." };
  }
  const admin = createAdminClient();
  const { error } = await admin
    .from("profiles")
    .update({ role })
    .eq("id", userId);
  if (error) return { ok: false, error: error.message };
  revalidatePath("/users");
  return { ok: true };
}

export async function toggleUserActiveAction(
  userId: string
): Promise<ActionResult> {
  let me;
  try {
    me = await requireAdmin();
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
  if (userId === me.userId) {
    return { ok: false, error: "You cannot deactivate your own account." };
  }
  const admin = createAdminClient();
  const { data: row, error: readErr } = await admin
    .from("profiles")
    .select("is_active")
    .eq("id", userId)
    .single();
  if (readErr || !row) {
    return { ok: false, error: readErr?.message ?? "User not found." };
  }
  const { error } = await admin
    .from("profiles")
    .update({ is_active: !row.is_active })
    .eq("id", userId);
  if (error) return { ok: false, error: error.message };
  revalidatePath("/users");
  return { ok: true };
}

export async function resetUserPasswordAction(
  userId: string,
  newPassword: string
): Promise<ActionResult> {
  try {
    await requireAdmin();
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
  if (newPassword.length < 8) {
    return { ok: false, error: "Password must be at least 8 characters." };
  }
  const admin = createAdminClient();
  const { error } = await admin.auth.admin.updateUserById(userId, {
    password: newPassword,
  });
  if (error) return { ok: false, error: error.message };
  revalidatePath("/users");
  return { ok: true };
}
