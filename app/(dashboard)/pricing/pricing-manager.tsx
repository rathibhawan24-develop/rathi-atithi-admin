"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { format, parseISO } from "date-fns";
import {
  Plus,
  Edit2,
  Trash2,
  Loader2,
  CalendarDays,
  Tag,
  TrendingUp,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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
import { formatCurrency, cn } from "@/lib/utils";
import { createOverride, updateOverride, deleteOverride } from "./actions";
import type { OverrideInput } from "./actions";

type Override = {
  id: string;
  name: string;
  start_date: string;
  end_date: string;
  multiplier: number | null;
  flat_rate: number | null;
  applies_to_room_id: string | null;
  applies_to_room_type: string | null;
  priority: number;
  is_active: boolean;
};

type RoomLite = { id: string; room_number: string; name: string; room_type: string };

type Mode =
  | { type: "new" }
  | { type: "edit"; override: Override }
  | null;

export function PricingManager({
  overrides,
  rooms,
  roomTypes,
}: {
  overrides: Override[];
  rooms: RoomLite[];
  roomTypes: string[];
}) {
  const router = useRouter();
  const [mode, setMode] = useState<Mode>(null);
  const [toDelete, setToDelete] = useState<Override | null>(null);
  const [isPending, startTransition] = useTransition();

  const todayStr = format(new Date(), "yyyy-MM-dd");

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <Button onClick={() => setMode({ type: "new" })}>
          <Plus />
          New override
        </Button>
      </div>

      {overrides.length === 0 ? (
        <div className="rounded-md border border-dashed py-12 text-center">
          <p className="text-sm font-medium">No pricing overrides yet</p>
          <p className="text-xs text-muted-foreground mt-1 max-w-md mx-auto">
            Create overrides for festival weeks (Janmashtami, Holi, Kartik
            Purnima), peak weekends, or any date range needing a different rate.
          </p>
        </div>
      ) : (
        <div className="rounded-md border divide-y">
          {overrides.map((o) => {
            const ended = o.end_date < todayStr;
            const upcoming = o.start_date > todayStr;
            const room = o.applies_to_room_id
              ? rooms.find((r) => r.id === o.applies_to_room_id)
              : null;
            const scopeLabel = room
              ? `Room #${room.room_number}`
              : o.applies_to_room_type
              ? o.applies_to_room_type
              : "All rooms";
            return (
              <div
                key={o.id}
                className="flex items-center gap-3 px-4 py-3 hover:bg-muted/40 transition-colors"
              >
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <p className="font-medium text-sm">{o.name}</p>
                    {!o.is_active && (
                      <Badge variant="muted" className="text-[10px]">
                        Inactive
                      </Badge>
                    )}
                    {ended && (
                      <Badge variant="muted" className="text-[10px]">
                        Ended
                      </Badge>
                    )}
                    {upcoming && (
                      <Badge variant="outline" className="text-[10px]">
                        Upcoming
                      </Badge>
                    )}
                    {o.priority > 0 && (
                      <span className="text-[10px] text-muted-foreground">
                        Priority {o.priority}
                      </span>
                    )}
                  </div>
                  <div className="text-xs text-muted-foreground mt-0.5 flex flex-wrap gap-3">
                    <span className="inline-flex items-center gap-1">
                      <CalendarDays className="h-3 w-3" />
                      {format(parseISO(o.start_date), "d MMM yyyy")} —{" "}
                      {format(parseISO(o.end_date), "d MMM yyyy")}
                    </span>
                    <span className="inline-flex items-center gap-1">
                      <Tag className="h-3 w-3" />
                      {scopeLabel}
                    </span>
                    <span className="inline-flex items-center gap-1 tabular-nums">
                      <TrendingUp className="h-3 w-3" />
                      {o.multiplier != null
                        ? `× ${o.multiplier}`
                        : o.flat_rate != null
                        ? `${formatCurrency(o.flat_rate)} /night`
                        : "—"}
                    </span>
                  </div>
                </div>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  onClick={() => setMode({ type: "edit", override: o })}
                >
                  <Edit2 />
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  onClick={() => setToDelete(o)}
                  className="hover:text-destructive"
                >
                  <Trash2 />
                </Button>
              </div>
            );
          })}
        </div>
      )}

      <p className="text-xs text-muted-foreground">
        Note: pricing overrides are <span className="font-medium">reference data</span>{" "}
        right now. The walk-in form still uses each room&apos;s base price; staff
        can manually adjust rates per booking. Auto-application to bookings ships
        in a later phase.
      </p>

      {mode && (
        <OverrideDialog
          mode={mode}
          rooms={rooms}
          roomTypes={roomTypes}
          onClose={() => setMode(null)}
          onSuccess={() => {
            setMode(null);
            router.refresh();
          }}
        />
      )}

      <AlertDialog
        open={toDelete !== null}
        onOpenChange={(open) => !open && setToDelete(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete &quot;{toDelete?.name}&quot;?</AlertDialogTitle>
            <AlertDialogDescription>
              This removes the override permanently. Past bookings keep their
              snapshot rates and are unaffected.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => {
                if (!toDelete) return;
                startTransition(async () => {
                  const result = await deleteOverride(toDelete.id);
                  if (result.success) {
                    toast.success("Override deleted.");
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

function OverrideDialog({
  mode,
  rooms,
  roomTypes,
  onClose,
  onSuccess,
}: {
  mode: { type: "new" } | { type: "edit"; override: Override };
  rooms: RoomLite[];
  roomTypes: string[];
  onClose: () => void;
  onSuccess: () => void;
}) {
  const editing = mode.type === "edit" ? mode.override : null;
  const [isPending, startTransition] = useTransition();

  const [name, setName] = useState(editing?.name ?? "");
  const [startDate, setStartDate] = useState(
    editing?.start_date ?? format(new Date(), "yyyy-MM-dd")
  );
  const [endDate, setEndDate] = useState(
    editing?.end_date ?? format(new Date(), "yyyy-MM-dd")
  );
  const [pricingMode, setPricingMode] = useState<"multiplier" | "flat_rate">(
    editing?.flat_rate != null ? "flat_rate" : "multiplier"
  );
  const [multiplier, setMultiplier] = useState<number>(
    editing?.multiplier ?? 1.5
  );
  const [flatRate, setFlatRate] = useState<number>(editing?.flat_rate ?? 0);

  const initialScope: "all" | "room" | "type" = editing
    ? editing.applies_to_room_id
      ? "room"
      : editing.applies_to_room_type
      ? "type"
      : "all"
    : "all";
  const [scope, setScope] = useState(initialScope);
  const [roomId, setRoomId] = useState<string>(
    editing?.applies_to_room_id ?? rooms[0]?.id ?? ""
  );
  const [roomType, setRoomType] = useState<string>(
    editing?.applies_to_room_type ?? roomTypes[0] ?? ""
  );

  const [priority, setPriority] = useState<number>(editing?.priority ?? 0);
  const [isActive, setIsActive] = useState(editing?.is_active ?? true);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const input: OverrideInput = {
      name,
      start_date: startDate,
      end_date: endDate,
      pricing_mode: pricingMode,
      multiplier: pricingMode === "multiplier" ? multiplier : null,
      flat_rate: pricingMode === "flat_rate" ? flatRate : null,
      scope,
      applies_to_room_id: scope === "room" ? roomId : null,
      applies_to_room_type: scope === "type" ? roomType : null,
      priority,
      is_active: isActive,
    };
    startTransition(async () => {
      const result = editing
        ? await updateOverride(editing.id, input)
        : await createOverride(input);
      if (result.success) {
        toast.success(editing ? "Override updated." : "Override created.");
        onSuccess();
      } else {
        toast.error(result.error);
      }
    });
  };

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-xl">
        <form onSubmit={handleSubmit}>
          <DialogHeader>
            <DialogTitle>
              {editing ? "Edit override" : "New pricing override"}
            </DialogTitle>
            <DialogDescription>
              For festivals, weekends, or any custom rate adjustment over a date
              range.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-2 max-h-[60vh] overflow-y-auto pr-1">
            <div className="space-y-2">
              <Label htmlFor="po_name">Name</Label>
              <Input
                id="po_name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g. Janmashtami 2026"
                required
                autoFocus
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label htmlFor="po_start">Start date</Label>
                <Input
                  id="po_start"
                  type="date"
                  value={startDate}
                  onChange={(e) => setStartDate(e.target.value)}
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="po_end">End date</Label>
                <Input
                  id="po_end"
                  type="date"
                  value={endDate}
                  onChange={(e) => setEndDate(e.target.value)}
                  required
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label>Pricing mode</Label>
              <div className="flex gap-2">
                {(["multiplier", "flat_rate"] as const).map((m) => (
                  <button
                    key={m}
                    type="button"
                    onClick={() => setPricingMode(m)}
                    className={cn(
                      "flex-1 rounded-md border px-3 py-2 text-sm transition-colors",
                      pricingMode === m
                        ? "bg-primary text-primary-foreground border-primary"
                        : "border-input bg-background hover:bg-muted/40"
                    )}
                  >
                    {m === "multiplier" ? "Multiplier (e.g. 1.5×)" : "Flat nightly rate"}
                  </button>
                ))}
              </div>
            </div>

            {pricingMode === "multiplier" ? (
              <div className="space-y-2">
                <Label htmlFor="po_mult">Multiplier</Label>
                <Input
                  id="po_mult"
                  type="number"
                  min="0.1"
                  step="0.1"
                  value={multiplier || ""}
                  onChange={(e) => setMultiplier(Number(e.target.value))}
                  required
                />
                <p className="text-xs text-muted-foreground">
                  e.g. 1.5 = 50% higher than the room&apos;s base rate.
                </p>
              </div>
            ) : (
              <div className="space-y-2">
                <Label htmlFor="po_flat">Flat rate per night (₹)</Label>
                <Input
                  id="po_flat"
                  type="number"
                  min="0"
                  step="100"
                  value={flatRate || ""}
                  onChange={(e) => setFlatRate(Number(e.target.value))}
                  required
                />
              </div>
            )}

            <div className="space-y-2">
              <Label>Applies to</Label>
              <div className="flex gap-2 flex-wrap">
                {(["all", "type", "room"] as const).map((s) => (
                  <button
                    key={s}
                    type="button"
                    onClick={() => setScope(s)}
                    className={cn(
                      "rounded-md border px-3 py-1.5 text-sm transition-colors",
                      scope === s
                        ? "bg-primary text-primary-foreground border-primary"
                        : "border-input bg-background hover:bg-muted/40"
                    )}
                  >
                    {s === "all"
                      ? "All rooms"
                      : s === "type"
                      ? "A room type"
                      : "Specific room"}
                  </button>
                ))}
              </div>
            </div>

            {scope === "type" && (
              <div className="space-y-2">
                <Label htmlFor="po_type">Room type</Label>
                <select
                  id="po_type"
                  value={roomType}
                  onChange={(e) => setRoomType(e.target.value)}
                  className="flex h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
                >
                  {roomTypes.map((t) => (
                    <option key={t} value={t}>
                      {t}
                    </option>
                  ))}
                </select>
              </div>
            )}

            {scope === "room" && (
              <div className="space-y-2">
                <Label htmlFor="po_room">Room</Label>
                <select
                  id="po_room"
                  value={roomId}
                  onChange={(e) => setRoomId(e.target.value)}
                  className="flex h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
                >
                  {rooms.map((r) => (
                    <option key={r.id} value={r.id}>
                      #{r.room_number} · {r.name}
                    </option>
                  ))}
                </select>
              </div>
            )}

            <div className="grid grid-cols-2 gap-3 items-end">
              <div className="space-y-2">
                <Label htmlFor="po_priority">Priority</Label>
                <Input
                  id="po_priority"
                  type="number"
                  min="0"
                  value={priority}
                  onChange={(e) => setPriority(Number(e.target.value))}
                />
                <p className="text-xs text-muted-foreground">
                  Higher wins when overrides overlap.
                </p>
              </div>
              <div className="flex items-center gap-3 pb-2">
                <Switch
                  id="po_active"
                  checked={isActive}
                  onCheckedChange={setIsActive}
                />
                <Label htmlFor="po_active" className="cursor-pointer">
                  Active
                </Label>
              </div>
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
