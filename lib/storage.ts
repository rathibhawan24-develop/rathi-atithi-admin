/**
 * Build a public URL for a file path inside a Supabase Storage bucket.
 * Used to display photos directly via Supabase's CDN.
 */
export function storagePublicUrl(bucket: string, path: string): string {
  const base = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (!base) return "";
  // Encode the path so spaces and other unsafe chars are handled
  const encoded = path
    .split("/")
    .map((segment) => encodeURIComponent(segment))
    .join("/");
  return `${base}/storage/v1/object/public/${bucket}/${encoded}`;
}

export const ROOM_PHOTOS_BUCKET = "room-photos";
export const GUEST_ID_PROOFS_BUCKET = "guest-id-proofs";
export const GALLERY_PHOTOS_BUCKET = "gallery-photos";
