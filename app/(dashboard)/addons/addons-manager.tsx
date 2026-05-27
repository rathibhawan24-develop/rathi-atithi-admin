"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Plus, Edit2, Trash2, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
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
import { formatCurrency } from "@/lib/utils";
import { createAddon, updateAddon, deleteAddon } from "./actions";
import type { Addon } from "@/lib/types";

type Mode = { type: "new" } | { type: "edit"; addon: Addon } | null;

export function AddonsManager({ addons }: { addons: Addon[] }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [mode, setMode] = useState<Mode>(null);
  const [toDelete, setToDelete] = useState<Addon | null>(null);

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <Button onClick={() => setMode({ type: "new" })}>
          <Plus />
          Add add-on
        </Button>
      </div>

      {addons.length === 0 ? (
        <div className="rounded-md border border-dashed py-12 text-center">
          <p className="text-sm font-medium">No add-ons yet</p>
          <p className="text-xs text-muted-foreground mt-1">
            Add things like Extra Bed, Room Heater, Airport pickup, etc.
          </p>
        </div>
      ) : (
        <div className="rounded-md border divide-y">
          {addons.map((a) => (
            <div
              key={a.id}
              className="flex items-center gap-3 px-4 py-3 hover:bg-muted/40 transition-colors"
            >
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <p className="font-medium text-sm">{a.name}</p>
                  {!a.is_active && (
                    <Badge variant="muted" className="text-[10px]">
                      Inactive
                    </Badge>
                  )}
                </div>
                <div className="text-xs text-muted-foreground mt-0.5 flex flex-wrap gap-3">
                  <span className="tabular-nums">
                    {formatCurrency(a.price)}
                    {a.is_per_night ? " /night" : " (one-time)"}
                  </span>
                  <span>Max {a.max_per_room} per room</span>
                  {a.description && (
                    <span className="truncate">{a.description}</span>
                  )}
                </div>
              </div>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                onClick={() => setMode({ type: "edit", addon: a })}
              >
                <Edit2 />
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                onClick={() => setToDelete(a)}
                className="hover:text-destructive"
              >
                <Trash2 />
              </Button>
            </div>
          ))}
        </div>
      )}

      {/* Add/Edit dialog */}
      {mode && (
        <AddonDialog
          mode={mode}
          onClose={() => setMode(null)}
          onSuccess={() => {
            setMode(null);
            router.refresh();
          }}
        />
      )}

      {/* Delete confirmation */}
      <AlertDialog
        open={toDelete !== null}
        onOpenChange={(open) => !open && setToDelete(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete &quot;{toDelete?.name}&quot;?</AlertDialogTitle>
            <AlertDialogDescription>
              If any past bookings used this add-on, the deletion will fail —
              you&apos;ll be asked to deactivate instead. Otherwise the add-on is
              permanently removed.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => {
                if (!toDelete) return;
                startTransition(async () => {
                  const result = await deleteAddon(toDelete.id);
                  if (result.success) {
                    toast.success("Add-on deleted.");
                    setToDelete(null);
                    router.refresh();
                  } else {
                    toast.error(result.error);
                  }
                });
              }}
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

function AddonDialog({
  mode,
  onClose,
  onSuccess,
}: {
  mode: { type: "new" } | { type: "edit"; addon: Addon };
  onClose: () => void;
  onSuccess: () => void;
}) {
  const editing = mode.type === "edit" ? mode.addon : null;
  const [isPending, startTransition] = useTransition();
  const [name, setName] = useState(editing?.name ?? "");
  const [description, setDescription] = useState(editing?.description ?? "");
  const [price, setPrice] = useState<number>(editing?.price ?? 0);
  const [perNight, setPerNight] = useState(editing?.is_per_night ?? true);
  const [maxPerRoom, setMaxPerRoom] = useState<number>(
    editing?.max_per_room ?? 1
  );
  const [isActive, setIsActive] = useState(editing?.is_active ?? true);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    startTransition(async () => {
      const input = {
        name,
        description: description || null,
        price,
        is_per_night: perNight,
        max_per_room: maxPerRoom,
        is_active: isActive,
      };
      const result = editing
        ? await updateAddon(editing.id, input)
        : await createAddon(input);
      if (result.success) {
        toast.success(editing ? "Add-on updated." : "Add-on created.");
        onSuccess();
      } else {
        toast.error(result.error);
      }
    });
  };

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent>
        <form onSubmit={handleSubmit}>
          <DialogHeader>
            <DialogTitle>{editing ? "Edit add-on" : "New add-on"}</DialogTitle>
            <DialogDescription>
              Add-ons can be attached per-room to a booking (e.g. Extra Bed for
              Room #5).
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label htmlFor="a_name">Name</Label>
              <Input
                id="a_name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                required
                autoFocus
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="a_desc">Description (optional)</Label>
              <Textarea
                id="a_desc"
                rows={2}
                value={description}
                onChange={(e) => setDescription(e.target.value)}
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label htmlFor="a_price">Price (₹)</Label>
                <Input
                  id="a_price"
                  type="number"
                  min="0"
                  step="10"
                  value={price || ""}
                  onChange={(e) => setPrice(Number(e.target.value))}
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="a_max">Max per room</Label>
                <Input
                  id="a_max"
                  type="number"
                  min="1"
                  value={maxPerRoom}
                  onChange={(e) => setMaxPerRoom(Number(e.target.value))}
                  required
                />
              </div>
            </div>
            <div className="flex items-center gap-3">
              <Switch
                id="a_pernight"
                checked={perNight}
                onCheckedChange={setPerNight}
              />
              <Label htmlFor="a_pernight" className="cursor-pointer">
                Charge per night
                <span className="text-xs text-muted-foreground block font-normal">
                  Off = charged once regardless of stay length
                </span>
              </Label>
            </div>
            <div className="flex items-center gap-3">
              <Switch
                id="a_active"
                checked={isActive}
                onCheckedChange={setIsActive}
              />
              <Label htmlFor="a_active" className="cursor-pointer">
                Active
                <span className="text-xs text-muted-foreground block font-normal">
                  Inactive add-ons don&apos;t appear in the walk-in form
                </span>
              </Label>
            </div>
          </div>

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={onClose}
              disabled={isPending}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={isPending}>
              {isPending ? <Loader2 className="animate-spin" /> : null}
              {editing ? "Save" : "Create"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
