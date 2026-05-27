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
    url: string | null;
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

export function IdProofSection({ bookingId, initial }: Props) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [isUploading, setIsUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [type, setType] = useState(initial.type ?? "aadhaar");
  const [number, setNumber] = useState(initial.number ?? "");
  const [proofUrl, setProofUrl] = useState<string | null>(initial.url);
  const [viewUrl, setViewUrl] = useState<string | null>(null);

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (fileInputRef.current) fileInputRef.current.value = "";

    if (!ACCEPTED_TYPES.includes(file.type)) {
      toast.error("Only JPG, PNG, WebP, or PDF allowed.");
      return;
    }
    if (file.size > 10 * 1024 * 1024) {
      toast.error("File too large (max 10 MB).");
      return;
    }

    setIsUploading(true);
    try {
      // Compress images, leave PDFs as-is
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

      const supabase = createClient();
      const { error: uploadErr } = await supabase.storage
        .from(GUEST_ID_PROOFS_BUCKET)
        .upload(path, toUpload, {
          cacheControl: "3600",
          upsert: false,
        });

      if (uploadErr) {
        toast.error(uploadErr.message);
        return;
      }

      setProofUrl(path);
      // Save path to DB along with current type/number
      const result = await updateIdProof({
        booking_id: bookingId,
        id_proof_type: type as
          | "aadhaar"
          | "passport"
          | "driving_license"
          | "voter_id"
          | "other",
        id_proof_number: number || "(pending)",
        id_proof_url: path,
      });
      if (result.success) {
        toast.success("ID proof uploaded.");
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
        id_proof_url: proofUrl ?? undefined,
      });
      if (result.success) {
        toast.success("ID proof details saved.");
        router.refresh();
      } else {
        toast.error(result.error);
      }
    });
  };

  const handleView = async () => {
    if (!proofUrl) return;
    const result = await getIdProofSignedUrl(proofUrl);
    if (result.url) {
      setViewUrl(result.url);
      window.open(result.url, "_blank", "noopener,noreferrer");
    } else {
      toast.error(result.error ?? "Could not generate view URL");
    }
  };

  const isComplete = !!(initial.type && initial.number);

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2 text-sm">
        {isComplete ? (
          <>
            <CheckCircle2 className="h-4 w-4 text-success" />
            <span className="text-muted-foreground">ID proof recorded</span>
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

      <div className="flex flex-wrap items-center gap-2">
        <Button
          variant="outline"
          size="sm"
          onClick={() => fileInputRef.current?.click()}
          disabled={isUploading || isPending}
        >
          {isUploading ? (
            <Loader2 className="animate-spin" />
          ) : (
            <Upload />
          )}
          {proofUrl ? "Replace file" : "Upload file"}
        </Button>
        {proofUrl && (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={handleView}
            disabled={isPending}
          >
            <ExternalLink />
            View
          </Button>
        )}
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
        className="hidden"
        onChange={handleFileUpload}
      />

      <p className="text-xs text-muted-foreground">
        Accepted: JPG, PNG, WebP, PDF. Max 10 MB. File is stored privately and
        only viewable by authenticated staff via a signed link.
      </p>
    </div>
  );
}
