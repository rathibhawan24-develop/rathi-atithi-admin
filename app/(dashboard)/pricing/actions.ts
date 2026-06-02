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

const OverrideSchema = z
  .object({
    name: z.string().min(1, "Name is required").max(120),
    start_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Invalid start date"),
    end_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Invalid end date"),
    pricing_mode: z.enum(["multiplier", "flat_rate"]),
    multiplier: z.number().positive().nullable(),
    flat_rate: z.number().min(0).nullable(),
    scope: z.enum(["all", "room", "type"]),
    applies_to_room_id: z.string().uuid().nullable(),
    applies_to_room_type: z.string().nullable(),
    priority: z.number().int().min(0),
    is_active: z.boolean(),
  })
  .refine((d) => d.end_date >= d.start_date, {
    message: "End date must be on or after start date",
    path: ["end_date"],
  })
  .refine(
    (d) =>
      (d.pricing_mode === "multiplier" && d.multiplier != null) ||
      (d.pricing_mode === "flat_rate" && d.flat_rate != null),
    { message: "Set either multiplier or flat rate", path: ["multiplier"] }
  )
  .refine(
    (d) =>
      d.scope === "all" ||
      (d.scope === "room" && d.applies_to_room_id) ||
      (d.scope === "type" && d.applies_to_room_type),
    {
      message: "Scope target is required",
      path: ["applies_to_room_id"],
    }
  );

export type OverrideInput = z.infer<typeof OverrideSchema>;

function toRow(input: OverrideInput) {
  return {
    name: input.name.trim(),
    start_date: input.start_date,
    end_date: input.end_date,
    multiplier: input.pricing_mode === "multiplier" ? input.multiplier : null,
    flat_rate: input.pricing_mode === "flat_rate" ? input.flat_rate : null,
    applies_to_room_id: input.scope === "room" ? input.applies_to_room_id : null,
    applies_to_room_type:
      input.scope === "type" ? input.applies_to_room_type : null,
    priority: input.priority,
    is_active: input.is_active,
  };
}

export async function createOverride(
  input: OverrideInput
): Promise<ActionResult> {
  {
    const _perm = await checkPermission(canManageContent, "Only owners and managers can perform this action.");
    if (!_perm.ok) return { success: false, error: _perm.error };
  }

  const parsed = OverrideSchema.safeParse(input);
  if (!parsed.success)
    return {
      success: false,
      error: parsed.error.errors[0]?.message ?? "Invalid input",
    };
  const auth = await requireAdmin();
  if (auth.error) return { success: false, error: auth.error };

  const { error } = await auth.supabase
    .from("price_overrides")
    .insert(toRow(parsed.data));
  if (error) return { success: false, error: error.message };

  revalidatePath("/pricing");
  return { success: true };
}

export async function updateOverride(
  id: string,
  input: OverrideInput
): Promise<ActionResult> {
  {
    const _perm = await checkPermission(canManageContent, "Only owners and managers can perform this action.");
    if (!_perm.ok) return { success: false, error: _perm.error };
  }

  const parsed = OverrideSchema.safeParse(input);
  if (!parsed.success)
    return {
      success: false,
      error: parsed.error.errors[0]?.message ?? "Invalid input",
    };
  const auth = await requireAdmin();
  if (auth.error) return { success: false, error: auth.error };

  const { error } = await auth.supabase
    .from("price_overrides")
    .update(toRow(parsed.data))
    .eq("id", id);
  if (error) return { success: false, error: error.message };

  revalidatePath("/pricing");
  return { success: true };
}

export async function deleteOverride(id: string): Promise<ActionResult> {
  {
    const _perm = await checkPermission(canManageContent, "Only owners and managers can perform this action.");
    if (!_perm.ok) return { success: false, error: _perm.error };
  }

  const auth = await requireAdmin();
  if (auth.error) return { success: false, error: auth.error };

  const { error } = await auth.supabase
    .from("price_overrides")
    .delete()
    .eq("id", id);
  if (error) return { success: false, error: error.message };

  revalidatePath("/pricing");
  return { success: true };
}
