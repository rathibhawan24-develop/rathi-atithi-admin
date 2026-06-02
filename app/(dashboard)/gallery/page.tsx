import { createClient } from "@/lib/supabase/server";
import { Images } from "lucide-react";
import { GalleryManager, type GalleryPhoto } from "./gallery-manager";
import { requirePermission } from "@/lib/auth/permissions";
import { canManageContent } from "@/lib/types";

export const dynamic = "force-dynamic";

export default async function GalleryPage() {
  await requirePermission(canManageContent, "/");

  const supabase = createClient();
  const { data } = await supabase
    .from("gallery_photos")
    .select("id, storage_path, caption, display_order, is_active")
    .order("display_order", { ascending: true });

  const photos: GalleryPhoto[] = (data ?? []) as GalleryPhoto[];

  return (
    <div className="space-y-6">
      <header>
        <h1 className="font-display text-3xl md:text-4xl tracking-tight flex items-center gap-3">
          <Images className="h-7 w-7 text-primary" />
          Property Gallery
        </h1>
        <p className="text-muted-foreground mt-1 max-w-2xl">
          Photos that appear in the auto-rotating gallery on the website&apos;s
          About section. Inside, outside, hall, courtyard — anything that
          shows the property. Drag-and-drop isn&apos;t available yet; use the
          up/down arrows to reorder.
        </p>
      </header>
      <GalleryManager initial={photos} />
    </div>
  );
}
