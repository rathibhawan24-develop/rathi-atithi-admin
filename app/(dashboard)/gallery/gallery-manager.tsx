"use client";

import { useState, useTransition, useRef } from "react";
import imageCompression from "browser-image-compression";
import { toast } from "sonner";
import {
  Upload,
  Loader2,
  Trash2,
  ArrowUp,
  ArrowDown,
  Eye,
  EyeOff,
  Save,
  Image as ImageIcon,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { createClient } from "@/lib/supabase/client";
import { GALLERY_PHOTOS_BUCKET, storagePublicUrl } from "@/lib/storage";
import {
  addGalleryPhotos,
  deleteGalleryPhoto,
  updateGalleryCaption,
  toggleGalleryActive,
  reorderGalleryPhoto,
} from "./actions";

export type GalleryPhoto = {
  id: string;
  storage_path: string;
  caption: string | null;
  display_order: number;
  is_active: boolean;
};

const MAX_FILES_PER_UPLOAD = 20;
const ACCEPTED_TYPES = ["image/jpeg", "image/jpg", "image/png", "image/webp"];
const COMPRESSION_OPTIONS = {
  maxSizeMB: 0.3,
  maxWidthOrHeight: 2000,
  useWebWorker: true,
  fileType: "image/jpeg" as const,
};

export function GalleryManager({ initial }: { initial: GalleryPhoto[] }) {
  const [photos, setPhotos] = useState<GalleryPhoto[]>(initial);
  const [isUploading, setIsUploading] = useState(false);
  const [progress, setProgress] = useState<{ cur: number; total: number } | null>(
    null
  );
  const [toDelete, setToDelete] = useState<GalleryPhoto | null>(null);
  const [isPending, startTransition] = useTransition();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const refresh = (next: GalleryPhoto[]) => setPhotos(next);

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? []);
    if (fileInputRef.current) fileInputRef.current.value = "";
    if (files.length === 0) return;
    if (files.length > MAX_FILES_PER_UPLOAD) {
      toast.error(`At most ${MAX_FILES_PER_UPLOAD} photos at a time.`);
      return;
    }
    const invalid = files.filter((f) => !ACCEPTED_TYPES.includes(f.type));
    if (invalid.length > 0) {
      toast.error("Only JPG, PNG, and WebP images are allowed.");
      return;
    }

    setIsUploading(true);
    setProgress({ cur: 0, total: files.length });
    const supabase = createClient();
    const uploaded: string[] = [];

    try {
      for (let i = 0; i < files.length; i++) {
        const f = files[i];
        setProgress({ cur: i + 1, total: files.length });
        const compressed =
          f.size > 300 * 1024 ? await imageCompression(f, COMPRESSION_OPTIONS) : f;
        const ext = compressed.type === "image/png" ? "png" : "jpg";
        const path = `${Date.now()}-${Math.random()
          .toString(36)
          .slice(2, 9)}.${ext}`;
        const { error } = await supabase.storage
          .from(GALLERY_PHOTOS_BUCKET)
          .upload(path, compressed, {
            cacheControl: "31536000",
            upsert: false,
          });
        if (error) {
          toast.error(`Failed: ${f.name} — ${error.message}`);
          continue;
        }
        uploaded.push(path);
      }

      if (uploaded.length > 0) {
        const res = await addGalleryPhotos(uploaded);
        if (!res.ok) {
          toast.error(res.error);
          return;
        }
        toast.success(
          `${uploaded.length} photo${uploaded.length === 1 ? "" : "s"} uploaded.`
        );
        // Optimistic local update — server-rendered list will refresh on next nav
        const startOrder =
          Math.max(0, ...photos.map((p) => p.display_order)) + 1;
        const newRows: GalleryPhoto[] = uploaded.map((p, i) => ({
          id: `tmp-${p}`,
          storage_path: p,
          caption: null,
          display_order: startOrder + i,
          is_active: true,
        }));
        refresh([...photos, ...newRows]);
      }
    } finally {
      setIsUploading(false);
      setProgress(null);
    }
  };

  const handleDelete = (photo: GalleryPhoto) => {
    startTransition(async () => {
      const res = await deleteGalleryPhoto(photo.id);
      setToDelete(null);
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      toast.success("Photo removed.");
      refresh(photos.filter((p) => p.id !== photo.id));
    });
  };

  const handleToggle = (photo: GalleryPhoto) => {
    startTransition(async () => {
      const res = await toggleGalleryActive(photo.id);
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      refresh(
        photos.map((p) =>
          p.id === photo.id ? { ...p, is_active: !p.is_active } : p
        )
      );
    });
  };

  const handleReorder = (photo: GalleryPhoto, dir: "up" | "down") => {
    startTransition(async () => {
      const res = await reorderGalleryPhoto(photo.id, dir);
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      // Swap locally
      const idx = photos.findIndex((p) => p.id === photo.id);
      const j = dir === "up" ? idx - 1 : idx + 1;
      if (j < 0 || j >= photos.length) return;
      const next = [...photos];
      [next[idx], next[j]] = [next[j], next[idx]];
      refresh(next);
    });
  };

  return (
    <div className="space-y-6">
      {/* Upload area */}
      <div className="rounded-xl border-2 border-dashed border-border bg-secondary/30 p-6 sm:p-10 text-center">
        <ImageIcon className="h-10 w-10 text-muted-foreground/40 mx-auto mb-3" />
        <p className="font-medium">Upload property photos</p>
        <p className="text-sm text-muted-foreground mt-1 max-w-md mx-auto">
          JPG, PNG, or WebP. Up to {MAX_FILES_PER_UPLOAD} at once. Each gets
          compressed to ~300 KB for fast loading on the website.
        </p>
        <input
          ref={fileInputRef}
          type="file"
          accept={ACCEPTED_TYPES.join(",")}
          multiple
          onChange={handleUpload}
          className="hidden"
          id="gallery-upload"
        />
        <Button
          className="mt-4"
          onClick={() => fileInputRef.current?.click()}
          disabled={isUploading}
        >
          {isUploading ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin" />
              Uploading {progress?.cur} / {progress?.total}…
            </>
          ) : (
            <>
              <Upload className="h-4 w-4" />
              Choose photos
            </>
          )}
        </Button>
      </div>

      {/* Photo grid */}
      {photos.length === 0 ? (
        <div className="text-center py-12 text-sm text-muted-foreground">
          No photos yet — upload your first one above.
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {photos.map((photo, idx) => (
            <PhotoCard
              key={photo.id}
              photo={photo}
              index={idx}
              total={photos.length}
              onDelete={() => setToDelete(photo)}
              onToggle={() => handleToggle(photo)}
              onReorder={(d) => handleReorder(photo, d)}
              onCaptionChange={(captionNext) => {
                refresh(
                  photos.map((p) =>
                    p.id === photo.id ? { ...p, caption: captionNext } : p
                  )
                );
              }}
              pending={isPending}
            />
          ))}
        </div>
      )}

      {/* Delete confirm */}
      <AlertDialog
        open={!!toDelete}
        onOpenChange={(o) => !o && setToDelete(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove this photo?</AlertDialogTitle>
            <AlertDialogDescription>
              It will be deleted from the gallery on the website immediately and
              cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => toDelete && handleDelete(toDelete)}
              disabled={isPending}
            >
              {isPending && <Loader2 className="h-4 w-4 animate-spin mr-1" />}
              Remove
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function PhotoCard({
  photo,
  index,
  total,
  onDelete,
  onToggle,
  onReorder,
  onCaptionChange,
  pending,
}: {
  photo: GalleryPhoto;
  index: number;
  total: number;
  onDelete: () => void;
  onToggle: () => void;
  onReorder: (d: "up" | "down") => void;
  onCaptionChange: (next: string) => void;
  pending: boolean;
}) {
  const [caption, setCaption] = useState(photo.caption ?? "");
  const [saving, setSaving] = useState(false);
  const dirty = caption !== (photo.caption ?? "");

  const handleSaveCaption = async () => {
    setSaving(true);
    const res = await updateGalleryCaption(photo.id, caption);
    setSaving(false);
    if (!res.ok) {
      toast.error(res.error);
      return;
    }
    toast.success("Caption saved");
    onCaptionChange(caption.trim() || "");
  };

  return (
    <div className="rounded-xl border border-border bg-card overflow-hidden flex flex-col">
      <div className="relative aspect-[4/3] bg-muted">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={storagePublicUrl(GALLERY_PHOTOS_BUCKET, photo.storage_path)}
          alt={caption || `Gallery photo ${index + 1}`}
          className="absolute inset-0 h-full w-full object-cover"
        />
        {!photo.is_active && (
          <div className="absolute inset-0 bg-black/60 flex items-center justify-center">
            <span className="text-white text-xs uppercase tracking-widest font-medium">
              Hidden
            </span>
          </div>
        )}
        <span className="absolute top-2 left-2 bg-black/60 text-white text-[10px] uppercase tracking-wider px-2 py-1 rounded-full">
          #{index + 1}
        </span>
      </div>
      <div className="p-3 space-y-2">
        <div className="flex gap-2 items-center">
          <Input
            value={caption}
            onChange={(e) => setCaption(e.target.value)}
            placeholder="Caption (optional)"
            className="h-9 text-sm"
          />
          {dirty && (
            <Button
              size="sm"
              onClick={handleSaveCaption}
              disabled={saving}
              title="Save caption"
            >
              {saving ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <Save className="h-3.5 w-3.5" />
              )}
            </Button>
          )}
        </div>
        <div className="flex items-center justify-between gap-1">
          <div className="flex gap-1">
            <Button
              variant="outline"
              size="icon"
              className="h-8 w-8"
              onClick={() => onReorder("up")}
              disabled={pending || index === 0}
              title="Move up (earlier in slideshow)"
            >
              <ArrowUp className="h-3.5 w-3.5" />
            </Button>
            <Button
              variant="outline"
              size="icon"
              className="h-8 w-8"
              onClick={() => onReorder("down")}
              disabled={pending || index === total - 1}
              title="Move down (later in slideshow)"
            >
              <ArrowDown className="h-3.5 w-3.5" />
            </Button>
          </div>
          <div className="flex gap-1">
            <Button
              variant="outline"
              size="icon"
              className="h-8 w-8"
              onClick={onToggle}
              disabled={pending}
              title={photo.is_active ? "Hide from website" : "Show on website"}
            >
              {photo.is_active ? (
                <Eye className="h-3.5 w-3.5" />
              ) : (
                <EyeOff className="h-3.5 w-3.5" />
              )}
            </Button>
            <Button
              variant="outline"
              size="icon"
              className="h-8 w-8 hover:bg-destructive/10 hover:text-destructive hover:border-destructive/40"
              onClick={onDelete}
              disabled={pending}
              title="Delete"
            >
              <Trash2 className="h-3.5 w-3.5" />
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
