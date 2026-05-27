"use client";

import { useState, useTransition, useRef } from "react";
import Image from "next/image";
import imageCompression from "browser-image-compression";
import { toast } from "sonner";
import {
  X,
  Upload,
  ArrowLeft,
  ArrowRight,
  Loader2,
  ImageIcon,
} from "lucide-react";
import { Button } from "@/components/ui/button";
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
import { ROOM_PHOTOS_BUCKET, storagePublicUrl } from "@/lib/storage";
import {
  addRoomPhotos,
  deleteRoomPhoto,
  reorderRoomPhotos,
} from "./actions";

const MAX_FILES_PER_UPLOAD = 10;
const ACCEPTED_TYPES = ["image/jpeg", "image/jpg", "image/png", "image/webp"];

const COMPRESSION_OPTIONS = {
  maxSizeMB: 0.25, // ~250 KB target
  maxWidthOrHeight: 1920,
  useWebWorker: true,
  fileType: "image/jpeg" as const,
};

export function PhotoManager({
  roomId,
  initialPhotos,
}: {
  roomId: string;
  initialPhotos: string[];
}) {
  const [photos, setPhotos] = useState<string[]>(initialPhotos);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState<{
    current: number;
    total: number;
  } | null>(null);
  const [photoToDelete, setPhotoToDelete] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? []);
    if (files.length === 0) return;

    // reset the input so the same file can be picked again
    if (fileInputRef.current) fileInputRef.current.value = "";

    if (files.length > MAX_FILES_PER_UPLOAD) {
      toast.error(
        `You can upload at most ${MAX_FILES_PER_UPLOAD} photos at a time.`
      );
      return;
    }

    // Validate types
    const invalid = files.filter((f) => !ACCEPTED_TYPES.includes(f.type));
    if (invalid.length > 0) {
      toast.error("Only JPG, PNG, and WebP images are allowed.");
      return;
    }

    setIsUploading(true);
    setUploadProgress({ current: 0, total: files.length });
    const supabase = createClient();
    const uploadedPaths: string[] = [];

    try {
      for (let i = 0; i < files.length; i++) {
        const file = files[i];
        setUploadProgress({ current: i + 1, total: files.length });

        // Compress (skips small files automatically)
        const compressed =
          file.size > 250 * 1024
            ? await imageCompression(file, COMPRESSION_OPTIONS)
            : file;

        // Unique path: rooms/{roomId}/{timestamp}-{random}.jpg
        const ext = compressed.type === "image/png" ? "png" : "jpg";
        const fileName = `${Date.now()}-${Math.random()
          .toString(36)
          .slice(2, 9)}.${ext}`;
        const path = `${roomId}/${fileName}`;

        const { error: uploadErr } = await supabase.storage
          .from(ROOM_PHOTOS_BUCKET)
          .upload(path, compressed, {
            cacheControl: "31536000", // 1 year — files are immutable
            upsert: false,
          });

        if (uploadErr) {
          console.error("Upload failed for", fileName, uploadErr);
          toast.error(`Failed to upload ${file.name}: ${uploadErr.message}`);
          continue;
        }

        uploadedPaths.push(path);
      }

      if (uploadedPaths.length > 0) {
        const result = await addRoomPhotos(roomId, uploadedPaths);
        if (result.success) {
          setPhotos((prev) => [...prev, ...uploadedPaths]);
          toast.success(
            `${uploadedPaths.length} photo${
              uploadedPaths.length === 1 ? "" : "s"
            } uploaded.`
          );
        } else {
          toast.error(result.error);
        }
      }
    } finally {
      setIsUploading(false);
      setUploadProgress(null);
    }
  };

  const handleDelete = (path: string) => {
    startTransition(async () => {
      const result = await deleteRoomPhoto(roomId, path);
      if (result.success) {
        setPhotos((prev) => prev.filter((p) => p !== path));
        toast.success("Photo removed.");
      } else {
        toast.error(result.error);
      }
      setPhotoToDelete(null);
    });
  };

  const handleMove = (index: number, direction: -1 | 1) => {
    const newIndex = index + direction;
    if (newIndex < 0 || newIndex >= photos.length) return;
    const newPhotos = [...photos];
    [newPhotos[index], newPhotos[newIndex]] = [
      newPhotos[newIndex],
      newPhotos[index],
    ];
    setPhotos(newPhotos);
    startTransition(async () => {
      const result = await reorderRoomPhotos(roomId, newPhotos);
      if (!result.success) {
        toast.error(result.error);
        setPhotos(photos); // revert
      }
    });
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm font-medium">Photos</p>
          <p className="text-xs text-muted-foreground">
            First photo is used as the cover. Drag isn&apos;t supported yet —
            use the arrows to reorder.
          </p>
        </div>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => fileInputRef.current?.click()}
          disabled={isUploading}
        >
          {isUploading ? (
            <Loader2 className="animate-spin" />
          ) : (
            <Upload />
          )}
          {isUploading
            ? `Uploading ${uploadProgress?.current}/${uploadProgress?.total}…`
            : "Upload photos"}
        </Button>
        <input
          ref={fileInputRef}
          type="file"
          accept="image/jpeg,image/jpg,image/png,image/webp"
          multiple
          className="hidden"
          onChange={handleFileSelect}
        />
      </div>

      {photos.length === 0 ? (
        <div className="border-2 border-dashed border-border rounded-lg p-12 text-center">
          <ImageIcon className="h-10 w-10 mx-auto text-muted-foreground/40" />
          <p className="mt-3 text-sm font-medium">No photos yet</p>
          <p className="text-xs text-muted-foreground mt-1">
            Click &quot;Upload photos&quot; to add some. JPG, PNG, or WebP.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
          {photos.map((path, idx) => {
            const url = storagePublicUrl(ROOM_PHOTOS_BUCKET, path);
            const isFirst = idx === 0;
            const isLast = idx === photos.length - 1;
            return (
              <div
                key={path}
                className="relative group aspect-square rounded-md overflow-hidden border border-border bg-muted"
              >
                <Image
                  src={url}
                  alt={`Photo ${idx + 1}`}
                  fill
                  sizes="(max-width: 768px) 50vw, 25vw"
                  className="object-cover"
                />
                {isFirst && (
                  <div className="absolute top-1 left-1 px-1.5 py-0.5 rounded text-[10px] uppercase tracking-wider bg-primary text-primary-foreground font-medium">
                    Cover
                  </div>
                )}
                {/* Overlay */}
                <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-1">
                  <button
                    type="button"
                    onClick={() => handleMove(idx, -1)}
                    disabled={isFirst || isPending}
                    className="p-1.5 rounded bg-background/90 text-foreground hover:bg-background disabled:opacity-30"
                    aria-label="Move left"
                  >
                    <ArrowLeft className="h-4 w-4" />
                  </button>
                  <button
                    type="button"
                    onClick={() => setPhotoToDelete(path)}
                    disabled={isPending}
                    className="p-1.5 rounded bg-destructive text-destructive-foreground hover:bg-destructive/90"
                    aria-label="Delete photo"
                  >
                    <X className="h-4 w-4" />
                  </button>
                  <button
                    type="button"
                    onClick={() => handleMove(idx, 1)}
                    disabled={isLast || isPending}
                    className="p-1.5 rounded bg-background/90 text-foreground hover:bg-background disabled:opacity-30"
                    aria-label="Move right"
                  >
                    <ArrowRight className="h-4 w-4" />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      <AlertDialog
        open={photoToDelete !== null}
        onOpenChange={(open) => !open && setPhotoToDelete(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove this photo?</AlertDialogTitle>
            <AlertDialogDescription>
              The photo will be permanently deleted from storage. This
              can&apos;t be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => photoToDelete && handleDelete(photoToDelete)}
            >
              {isPending ? <Loader2 className="animate-spin" /> : null}
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
