"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { checkPermission } from "@/lib/auth/permissions";
import { canManageContent } from "@/lib/types";

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
  if (!profile || !profile.is_active)
    return { supabase, error: "Inactive account" } as const;
  if (profile.role !== "admin")
    return { supabase, error: "Admin role required" } as const;
  return { supabase, error: null } as const;
}

const AddonSchema = z.object({
  name: z.string().min(1, "Name is required").max(80),
  description: z.string().nullable(),
  price: z.number().min(0),
  is_per_night: z.boolean(),
  max_per_room: z.number().int().min(1),
  is_active: z.boolean(),
  display_order: z.number().int().min(0).optional(),
});

export type AddonInput = z.infer<typeof AddonSchema>;

export async function createAddon(input: AddonInput): Promise<ActionResult> {
  {
    const _perm = await checkPermission(canManageContent, "Only owners and managers can perform this action.");
    if (!_perm.ok) return { success: false, error: _perm.error };
  }

  const parsed = AddonSchema.safeParse(input);
  if (!parsed.success)
    return {
      success: false,
      error: parsed.error.errors[0]?.message ?? "Invalid input",
    };

  const auth = await requireAdmin();
  if (auth.error) return { success: false, error: auth.error };

  const { error } = await auth.supabase.from("addons").insert({
    name: parsed.data.name.trim(),
    description: parsed.data.description?.trim() || null,
    price: parsed.data.price,
    is_per_night: parsed.data.is_per_night,
    max_per_room: parsed.data.max_per_room,
    is_active: parsed.data.is_active,
    display_order: parsed.data.display_order ?? 99,
  });
  if (error) return { success: false, error: error.message };

  revalidatePath("/addons");
  return { success: true };
}

export async function updateAddon(
  id: string,
  input: AddonInput
): Promise<ActionResult> {
  {
    const _perm = await checkPermission(canManageContent, "Only owners and managers can perform this action.");
    if (!_perm.ok) return { success: false, error: _perm.error };
  }

  const parsed = AddonSchema.safeParse(input);
  if (!parsed.success)
    return {
      success: false,
      error: parsed.error.errors[0]?.message ?? "Invalid input",
    };

  const auth = await requireAdmin();
  if (auth.error) return { success: false, error: auth.error };

  const { error } = await auth.supabase
    .from("addons")
    .update({
      name: parsed.data.name.trim(),
      description: parsed.data.description?.trim() || null,
      price: parsed.data.price,
      is_per_night: parsed.data.is_per_night,
      max_per_room: parsed.data.max_per_room,
      is_active: parsed.data.is_active,
    })
    .eq("id", id);
  if (error) return { success: false, error: error.message };

  revalidatePath("/addons");
  return { success: true };
}

export async function deleteAddon(id: string): Promise<ActionResult> {
  {
    const _perm = await checkPermission(canManageContent, "Only owners and managers can perform this action.");
    if (!_perm.ok) return { success: false, error: _perm.error };
  }

  const auth = await requireAdmin();
  if (auth.error) return { success: false, error: auth.error };

  // Block deletion if any bookings reference this add-on
  const { count } = await auth.supabase
    .from("booking_room_addons")
    .select("id", { count: "exact", head: true })
    .eq("addon_id", id);

  if ((count ?? 0) > 0) {
    return {
      success: false,
      error:
        "Cannot delete: this add-on is referenced by existing bookings. Deactivate it instead.",
    };
  }

  const { error } = await auth.supabase.from("addons").delete().eq("id", id);
  if (error) return { success: false, error: error.message };

  revalidatePath("/addons");
  return { success: true };
}
