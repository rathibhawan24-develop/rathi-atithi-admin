"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { GALLERY_PHOTOS_BUCKET } from "@/lib/storage";
import { checkPermission } from "@/lib/auth/permissions";
import { canManageContent } from "@/lib/types";

type Result = { ok: true } | { ok: false; error: string };

async function requireStaff(): Promise<{ userId: string } | { error: string }> {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Not authenticated" };
  const { data: profile } = await supabase
    .from("profiles")
    .select("role, is_active")
    .eq("id", user.id)
    .single();
  if (
    !profile ||
    !profile.is_active ||
    (profile.role !== "admin" && profile.role !== "staff")
  ) {
    return { error: "Staff access required" };
  }
  return { userId: user.id };
}

export async function addGalleryPhotos(
  storagePaths: string[]
): Promise<Result> {
  {
    const _perm = await checkPermission(canManageContent, "Only owners and managers can perform this action.");
    if (!_perm.ok) return { ok: false, error: _perm.error };
  }

  const auth = await requireStaff();
  if ("error" in auth) return { ok: false, error: auth.error };

  if (!storagePaths.length) return { ok: true };
  const supabase = createClient();

  // Find current max order so new photos go to the end
  const { data: maxRow } = await supabase
    .from("gallery_photos")
    .select("display_order")
    .order("display_order", { ascending: false })
    .limit(1)
    .maybeSingle();
  const startOrder = (maxRow?.display_order ?? 0) + 1;

  const inserts = storagePaths.map((path, i) => ({
    storage_path: path,
    display_order: startOrder + i,
    is_active: true,
    created_by: auth.userId,
  }));

  const { error } = await supabase.from("gallery_photos").insert(inserts);
  if (error) return { ok: false, error: error.message };

  revalidatePath("/gallery");
  return { ok: true };
}

export async function deleteGalleryPhoto(id: string): Promise<Result> {
  {
    const _perm = await checkPermission(canManageContent, "Only owners and managers can perform this action.");
    if (!_perm.ok) return { ok: false, error: _perm.error };
  }

  const auth = await requireStaff();
  if ("error" in auth) return { ok: false, error: auth.error };

  const supabase = createClient();
  const { data: row, error: readErr } = await supabase
    .from("gallery_photos")
    .select("storage_path")
    .eq("id", id)
    .single();
  if (readErr || !row) return { ok: false, error: "Photo not found" };

  // Delete the storage object first
  const { error: storageErr } = await supabase.storage
    .from(GALLERY_PHOTOS_BUCKET)
    .remove([row.storage_path]);
  if (storageErr) {
    // If storage fails, still proceed to delete the row — better to have an
    // orphaned blob than a row pointing at a missing file.
    console.warn("Storage delete failed:", storageErr.message);
  }

  const { error } = await supabase
    .from("gallery_photos")
    .delete()
    .eq("id", id);
  if (error) return { ok: false, error: error.message };

  revalidatePath("/gallery");
  return { ok: true };
}

export async function updateGalleryCaption(
  id: string,
  caption: string
): Promise<Result> {
  {
    const _perm = await checkPermission(canManageContent, "Only owners and managers can perform this action.");
    if (!_perm.ok) return { ok: false, error: _perm.error };
  }

  const auth = await requireStaff();
  if ("error" in auth) return { ok: false, error: auth.error };

  const supabase = createClient();
  const { error } = await supabase
    .from("gallery_photos")
    .update({ caption: caption.trim() || null })
    .eq("id", id);
  if (error) return { ok: false, error: error.message };

  revalidatePath("/gallery");
  return { ok: true };
}

export async function toggleGalleryActive(id: string): Promise<Result> {
  {
    const _perm = await checkPermission(canManageContent, "Only owners and managers can perform this action.");
    if (!_perm.ok) return { ok: false, error: _perm.error };
  }

  const auth = await requireStaff();
  if ("error" in auth) return { ok: false, error: auth.error };

  const supabase = createClient();
  const { data: row, error: readErr } = await supabase
    .from("gallery_photos")
    .select("is_active")
    .eq("id", id)
    .single();
  if (readErr || !row) return { ok: false, error: "Photo not found" };

  const { error } = await supabase
    .from("gallery_photos")
    .update({ is_active: !row.is_active })
    .eq("id", id);
  if (error) return { ok: false, error: error.message };

  revalidatePath("/gallery");
  return { ok: true };
}

export async function reorderGalleryPhoto(
  id: string,
  direction: "up" | "down"
): Promise<Result> {
  {
    const _perm = await checkPermission(canManageContent, "Only owners and managers can perform this action.");
    if (!_perm.ok) return { ok: false, error: _perm.error };
  }

  const auth = await requireStaff();
  if ("error" in auth) return { ok: false, error: auth.error };

  const supabase = createClient();
  const { data: all, error: readErr } = await supabase
    .from("gallery_photos")
    .select("id, display_order")
    .order("display_order", { ascending: true });
  if (readErr || !all) return { ok: false, error: "Could not read photos" };

  const idx = all.findIndex((p) => p.id === id);
  if (idx === -1) return { ok: false, error: "Photo not found" };
  const swapIdx = direction === "up" ? idx - 1 : idx + 1;
  if (swapIdx < 0 || swapIdx >= all.length) {
    return { ok: false, error: "Already at the edge" };
  }

  const a = all[idx];
  const b = all[swapIdx];

  // Two-phase swap using a temporary value to avoid uniqueness collisions
  const tmp = -Math.floor(Math.random() * 1e9) - 1;
  const { error: e1 } = await supabase
    .from("gallery_photos")
    .update({ display_order: tmp })
    .eq("id", a.id);
  if (e1) return { ok: false, error: e1.message };
  const { error: e2 } = await supabase
    .from("gallery_photos")
    .update({ display_order: a.display_order })
    .eq("id", b.id);
  if (e2) return { ok: false, error: e2.message };
  const { error: e3 } = await supabase
    .from("gallery_photos")
    .update({ display_order: b.display_order })
    .eq("id", a.id);
  if (e3) return { ok: false, error: e3.message };

  revalidatePath("/gallery");
  return { ok: true };
}
