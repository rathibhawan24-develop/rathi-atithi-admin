"use client";

import { useState, useTransition, useRef } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  FileText,
  Upload,
  Loader2,
  CheckCircle2,
  ExternalLink,
  X,
  Plus,
  Image as ImageIcon,
} from "lucide-react";
import imageCompression from "browser-image-compression";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { createClient } from "@/lib/supabase/client";
import { GUEST_ID_PROOFS_BUCKET } from "@/lib/storage";
import { updateIdProof, getIdProofSignedUrl } from "./actions";

type Props = {
  bookingId: string;
  initial: {
    type: string | null;
    number: string | null;
    urls: string[];
  };
};

const ID_TYPES = [
  { value: "aadhaar", label: "Aadhaar" },
  { value: "passport", label: "Passport" },
  { value: "driving_license", label: "Driving License" },
  { value: "voter_id", label: "Voter ID" },
  { value: "other", label: "Other" },
] as const;

const ACCEPTED_TYPES = [
  "image/jpeg",
  "image/jpg",
  "image/png",
  "image/webp",
  "application/pdf",
];

const MAX_FILES = 5;

function isPdf(path: string): boolean {
  return path.toLowerCase().endsWith(".pdf");
}

export function IdProofSection({ bookingId, initial }: Props) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [isUploading, setIsUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [type, setType] = useState(initial.type ?? "aadhaar");
  const [number, setNumber] = useState(initial.number ?? "");
  const [urls, setUrls] = useState<string[]>(initial.urls ?? []);

  // Thumbnail cache: storage path → signed URL (so we don't re-sign each render)
  const [thumbs, setThumbs] = useState<Record<string, string>>({});
  const [loadingThumbs, setLoadingThumbs] = useState<Set<string>>(new Set());

  // Lazily fetch a thumbnail signed URL when we don't have one yet
  const ensureThumb = async (path: string) => {
    if (thumbs[path] || loadingThumbs.has(path) || isPdf(path)) return;
    setLoadingThumbs((s) => new Set(s).add(path));
    const result = await getIdProofSignedUrl(path);
    if (result.url) {
      setThumbs((t) => ({ ...t, [path]: result.url! }));
    }
    setLoadingThumbs((s) => {
      const n = new Set(s);
      n.delete(path);
      return n;
    });
  };

  // Trigger thumb load for all current URLs once on mount
  if (typeof window !== "undefined") {
    urls.forEach((u) => {
      if (!thumbs[u] && !loadingThumbs.has(u) && !isPdf(u)) {
        void ensureThumb(u);
      }
    });
  }

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? []);
    if (files.length === 0) return;
    if (fileInputRef.current) fileInputRef.current.value = "";

    // Respect the 5-file cap
    const available = MAX_FILES - urls.length;
    if (available <= 0) {
      toast.error(`Maximum of ${MAX_FILES} files reached.`);
      return;
    }
    const toProcess = files.slice(0, available);
    if (files.length > available) {
      toast.warning(
        `Only the first ${available} file(s) will be uploaded (max ${MAX_FILES}).`
      );
    }

    setIsUploading(true);
    const supabase = createClient();
    const newPaths: string[] = [];

    try {
      for (const file of toProcess) {
        if (!ACCEPTED_TYPES.includes(file.type)) {
          toast.error(`${file.name}: only JPG, PNG, WebP, or PDF allowed.`);
          continue;
        }
        if (file.size > 10 * 1024 * 1024) {
          toast.error(`${file.name}: file too large (max 10 MB).`);
          continue;
        }

        // Compress images, leave PDFs alone
        let toUpload: File | Blob = file;
        let ext = file.type === "application/pdf" ? "pdf" : "jpg";
        if (file.type.startsWith("image/") && file.size > 300 * 1024) {
          toUpload = await imageCompression(file, {
            maxSizeMB: 0.3,
            maxWidthOrHeight: 2000,
            useWebWorker: true,
            fileType: "image/jpeg",
          });
          ext = "jpg";
        } else if (file.type === "image/png") {
          ext = "png";
        } else if (file.type === "image/webp") {
          ext = "webp";
        }

        const path = `${bookingId}/${Date.now()}-${Math.random()
          .toString(36)
          .slice(2, 9)}.${ext}`;

        const { error: uploadErr } = await supabase.storage
          .from(GUEST_ID_PROOFS_BUCKET)
          .upload(path, toUpload, {
            cacheControl: "3600",
            upsert: false,
          });
        if (uploadErr) {
          toast.error(`${file.name}: ${uploadErr.message}`);
          continue;
        }
        newPaths.push(path);
      }

      if (newPaths.length === 0) {
        toast.error("No files were uploaded.");
        return;
      }

      const merged = [...urls, ...newPaths];
      const result = await updateIdProof({
        booking_id: bookingId,
        id_proof_type: type as
          | "aadhaar"
          | "passport"
          | "driving_license"
          | "voter_id"
          | "other",
        id_proof_number: number || "(pending)",
        id_proof_urls: merged,
      });
      if (result.success) {
        setUrls(merged);
        toast.success(
          `${newPaths.length} file${newPaths.length > 1 ? "s" : ""} uploaded.`
        );
        router.refresh();
      } else {
        toast.error(result.error);
      }
    } catch (err) {
      console.error(err);
      toast.error("Upload failed.");
    } finally {
      setIsUploading(false);
    }
  };

  const handleRemove = (path: string) => {
    startTransition(async () => {
      const next = urls.filter((u) => u !== path);
      const result = await updateIdProof({
        booking_id: bookingId,
        id_proof_type: type as
          | "aadhaar"
          | "passport"
          | "driving_license"
          | "voter_id"
          | "other",
        id_proof_number: number || "(pending)",
        id_proof_urls: next,
      });
      if (result.success) {
        setUrls(next);
        toast.success("File removed.");
        router.refresh();
      } else {
        toast.error(result.error);
      }
    });
  };

  const handleView = async (path: string) => {
    const result = await getIdProofSignedUrl(path);
    if (result.url) {
      window.open(result.url, "_blank", "noopener,noreferrer");
    } else {
      toast.error(result.error ?? "Could not generate view URL");
    }
  };

  const handleSaveDetails = () => {
    if (!number.trim()) {
      toast.error("ID number is required.");
      return;
    }
    startTransition(async () => {
      const result = await updateIdProof({
        booking_id: bookingId,
        id_proof_type: type as
          | "aadhaar"
          | "passport"
          | "driving_license"
          | "voter_id"
          | "other",
        id_proof_number: number,
        id_proof_urls: urls,
      });
      if (result.success) {
        toast.success("ID proof details saved.");
        router.refresh();
      } else {
        toast.error(result.error);
      }
    });
  };

  const isComplete = !!(initial.type && initial.number && urls.length > 0);
  const canAddMore = urls.length < MAX_FILES;

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2 text-sm">
        {isComplete ? (
          <>
            <CheckCircle2 className="h-4 w-4 text-success" />
            <span className="text-muted-foreground">
              ID proof recorded ({urls.length} file{urls.length > 1 ? "s" : ""})
            </span>
          </>
        ) : (
          <>
            <FileText className="h-4 w-4 text-warning" />
            <span className="text-muted-foreground">
              Required for check-in (Form C)
            </span>
          </>
        )}
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div className="space-y-2">
          <Label htmlFor="id_type">Type</Label>
          <select
            id="id_type"
            value={type}
            onChange={(e) => setType(e.target.value)}
            className="flex h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
          >
            {ID_TYPES.map((t) => (
              <option key={t.value} value={t.value}>
                {t.label}
              </option>
            ))}
          </select>
        </div>
        <div className="space-y-2">
          <Label htmlFor="id_number">Number</Label>
          <Input
            id="id_number"
            value={number}
            onChange={(e) => setNumber(e.target.value)}
            placeholder="As shown on the document"
          />
        </div>
      </div>

      {/* File grid */}
      <div className="space-y-2">
        <Label>Documents ({urls.length} / {MAX_FILES})</Label>
        <div className="grid grid-cols-3 sm:grid-cols-5 gap-2">
          {urls.map((path) => (
            <div
              key={path}
              className="relative group aspect-square rounded-md border bg-muted/40 overflow-hidden"
            >
              {isPdf(path) ? (
                <button
                  type="button"
                  onClick={() => handleView(path)}
                  className="absolute inset-0 flex flex-col items-center justify-center gap-1 hover:bg-muted/70 transition"
                  title="Open PDF"
                >
                  <FileText className="h-7 w-7 text-muted-foreground" />
                  <span className="text-[10px] text-muted-foreground">PDF</span>
                </button>
              ) : thumbs[path] ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={thumbs[path]}
                  alt="ID proof"
                  className="absolute inset-0 w-full h-full object-cover cursor-pointer"
                  onClick={() => handleView(path)}
                />
              ) : (
                <div className="absolute inset-0 flex items-center justify-center">
                  <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                </div>
              )}
              {/* View + delete overlay */}
              <button
                type="button"
                onClick={() => handleRemove(path)}
                disabled={isPending}
                className="absolute top-1 right-1 h-6 w-6 rounded-full bg-background/90 border flex items-center justify-center hover:bg-destructive hover:text-destructive-foreground transition opacity-0 group-hover:opacity-100"
                title="Remove file"
              >
                <X className="h-3 w-3" />
              </button>
              <button
                type="button"
                onClick={() => handleView(path)}
                className="absolute bottom-1 right-1 h-6 w-6 rounded-full bg-background/90 border flex items-center justify-center hover:bg-foreground hover:text-background transition opacity-0 group-hover:opacity-100"
                title="View full"
              >
                <ExternalLink className="h-3 w-3" />
              </button>
            </div>
          ))}

          {canAddMore && (
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              disabled={isUploading || isPending}
              className="aspect-square rounded-md border-2 border-dashed bg-muted/20 hover:bg-muted/50 transition flex flex-col items-center justify-center gap-1"
            >
              {isUploading ? (
                <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
              ) : (
                <>
                  <Plus className="h-5 w-5 text-muted-foreground" />
                  <span className="text-[10px] text-muted-foreground">
                    Add file
                  </span>
                </>
              )}
            </button>
          )}
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <Button
          type="button"
          size="sm"
          onClick={handleSaveDetails}
          disabled={isPending || isUploading}
          className="ml-auto"
        >
          {isPending ? <Loader2 className="animate-spin" /> : null}
          Save details
        </Button>
      </div>

      <input
        ref={fileInputRef}
        type="file"
        accept="image/jpeg,image/jpg,image/png,image/webp,application/pdf"
        multiple
        className="hidden"
        onChange={handleFileUpload}
      />

      <p className="text-xs text-muted-foreground">
        Accepted: JPG, PNG, WebP, PDF. Up to {MAX_FILES} files, max 10 MB each.
        Files are stored privately and only viewable by authenticated staff via
        a signed link.
      </p>
    </div>
  );
}
