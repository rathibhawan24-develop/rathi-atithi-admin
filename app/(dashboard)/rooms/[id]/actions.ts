"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { ROOM_PHOTOS_BUCKET } from "@/lib/storage";
import { z } from "zod";

const RoomUpdateSchema = z.object({
  id: z.string().uuid(),
  room_number: z.string().min(1, "Room number is required"),
  name: z.string().min(1, "Name is required").max(100),
  room_type: z.string().min(1, "Type is required"),
  description: z.string().nullable(),
  base_price: z.number().min(0),
  weekend_price: z.number().min(0).nullable(),
  base_occupancy: z.number().int().min(1),
  extra_capacity: z.number().int().min(0),
  amenities: z.array(z.string()),
  is_active: z.boolean(),
});

export type RoomUpdateInput = z.infer<typeof RoomUpdateSchema>;

type ActionResult = { success: true } | { success: false; error: string };

export async function updateRoom(input: RoomUpdateInput): Promise<ActionResult> {
  const parsed = RoomUpdateSchema.safeParse(input);
  if (!parsed.success) {
    return {
      success: false,
      error: parsed.error.errors[0]?.message ?? "Invalid input",
    };
  }

  const supabase = createClient();

  // Verify the user is authenticated and is admin (only admin can change room data)
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { success: false, error: "Not authenticated" };

  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single();
  if (profile?.role !== "admin") {
    return { success: false, error: "Only admins can modify rooms" };
  }

  const { id, ...updates } = parsed.data;

  const { error } = await supabase
    .from("rooms")
    .update({
      ...updates,
      description: updates.description?.trim() || null,
      weekend_price: updates.weekend_price ?? null,
    })
    .eq("id", id);

  if (error) {
    console.error("Update room failed:", error);
    return { success: false, error: error.message };
  }

  revalidatePath("/rooms");
  revalidatePath(`/rooms/${id}`);
  return { success: true };
}

/**
 * Append photo paths to a room's photos[] array.
 * Called after client uploads files to Storage.
 */
export async function addRoomPhotos(
  roomId: string,
  paths: string[]
): Promise<ActionResult> {
  if (paths.length === 0) return { success: true };

  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { success: false, error: "Not authenticated" };

  // Fetch existing
  const { data: room, error: fetchErr } = await supabase
    .from("rooms")
    .select("photos")
    .eq("id", roomId)
    .single();
  if (fetchErr || !room) {
    return { success: false, error: "Room not found" };
  }

  const newPhotos = [...(room.photos ?? []), ...paths];
  const { error } = await supabase
    .from("rooms")
    .update({ photos: newPhotos })
    .eq("id", roomId);

  if (error) {
    return { success: false, error: error.message };
  }

  revalidatePath(`/rooms/${roomId}`);
  revalidatePath("/rooms");
  return { success: true };
}

/**
 * Remove a single photo by path:
 *   1) delete from Storage
 *   2) remove from photos[] array in DB
 */
export async function deleteRoomPhoto(
  roomId: string,
  photoPath: string
): Promise<ActionResult> {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { success: false, error: "Not authenticated" };

  // 1. Delete from Storage (fire-and-forget logging, but block the update on it)
  const { error: storageErr } = await supabase.storage
    .from(ROOM_PHOTOS_BUCKET)
    .remove([photoPath]);
  if (storageErr) {
    // Log but continue — DB consistency matters more than orphaned storage
    console.warn("Storage delete failed (continuing):", storageErr);
  }

  // 2. Remove from DB array
  const { data: room, error: fetchErr } = await supabase
    .from("rooms")
    .select("photos")
    .eq("id", roomId)
    .single();
  if (fetchErr || !room) return { success: false, error: "Room not found" };

  const newPhotos = (room.photos ?? []).filter((p: string) => p !== photoPath);
  const { error } = await supabase
    .from("rooms")
    .update({ photos: newPhotos })
    .eq("id", roomId);

  if (error) return { success: false, error: error.message };

  revalidatePath(`/rooms/${roomId}`);
  revalidatePath("/rooms");
  return { success: true };
}

/**
 * Reorder the photos array directly (caller supplies the full new order).
 */
export async function reorderRoomPhotos(
  roomId: string,
  orderedPaths: string[]
): Promise<ActionResult> {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { success: false, error: "Not authenticated" };

  const { error } = await supabase
    .from("rooms")
    .update({ photos: orderedPaths })
    .eq("id", roomId);

  if (error) return { success: false, error: error.message };

  revalidatePath(`/rooms/${roomId}`);
  revalidatePath("/rooms");
  return { success: true };
}
