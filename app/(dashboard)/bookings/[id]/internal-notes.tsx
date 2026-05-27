"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Loader2, Save } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { updateInternalNotes } from "./actions";

type Props = {
  bookingId: string;
  initial: string | null;
};

export function InternalNotesEditor({ bookingId, initial }: Props) {
  const router = useRouter();
  const [notes, setNotes] = useState(initial ?? "");
  const [isPending, startTransition] = useTransition();

  const handleSave = () => {
    startTransition(async () => {
      const result = await updateInternalNotes(bookingId, notes);
      if (result.success) {
        toast.success("Notes saved.");
        router.refresh();
      } else {
        toast.error(result.error);
      }
    });
  };

  const isDirty = notes !== (initial ?? "");

  return (
    <div className="space-y-3">
      <Textarea
        rows={3}
        value={notes}
        onChange={(e) => setNotes(e.target.value)}
        placeholder="VIP, allergies, group leader, special arrangements, complaints — anything the next staff member should know."
      />
      <div className="flex justify-end">
        <Button
          size="sm"
          onClick={handleSave}
          disabled={isPending || !isDirty}
        >
          {isPending ? <Loader2 className="animate-spin" /> : <Save />}
          Save notes
        </Button>
      </div>
    </div>
  );
}
