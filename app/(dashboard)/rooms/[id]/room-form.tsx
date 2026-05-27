"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Loader2, Save, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { updateRoom } from "./actions";
import type { Room } from "@/lib/types";

const ROOM_TYPES = ["Supreme", "4 Bed", "Deluxe", "Sudama 6 Bed"];

export function RoomForm({ room }: { room: Room }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  const [formData, setFormData] = useState({
    room_number: room.room_number,
    name: room.name,
    room_type: room.room_type,
    description: room.description ?? "",
    base_price: room.base_price,
    weekend_price: room.weekend_price,
    base_occupancy: room.base_occupancy,
    extra_capacity: room.extra_capacity,
    amenities: room.amenities ?? [],
    is_active: room.is_active,
  });

  const [amenityInput, setAmenityInput] = useState("");

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    startTransition(async () => {
      const result = await updateRoom({
        id: room.id,
        ...formData,
      });
      if (result.success) {
        toast.success("Room saved.");
        router.refresh();
      } else {
        toast.error(result.error);
      }
    });
  };

  const addAmenity = () => {
    const trimmed = amenityInput.trim();
    if (!trimmed) return;
    if (formData.amenities.includes(trimmed)) {
      toast.warning("That amenity is already added.");
      return;
    }
    setFormData((prev) => ({
      ...prev,
      amenities: [...prev.amenities, trimmed],
    }));
    setAmenityInput("");
  };

  const removeAmenity = (a: string) => {
    setFormData((prev) => ({
      ...prev,
      amenities: prev.amenities.filter((x) => x !== a),
    }));
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      {/* Basic info */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label htmlFor="room_number">Room number</Label>
          <Input
            id="room_number"
            value={formData.room_number}
            onChange={(e) =>
              setFormData((prev) => ({
                ...prev,
                room_number: e.target.value,
              }))
            }
            required
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="name">Room name</Label>
          <Input
            id="name"
            value={formData.name}
            onChange={(e) =>
              setFormData((prev) => ({ ...prev, name: e.target.value }))
            }
            required
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="room_type">Type</Label>
          <select
            id="room_type"
            value={formData.room_type}
            onChange={(e) =>
              setFormData((prev) => ({ ...prev, room_type: e.target.value }))
            }
            className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
          >
            {ROOM_TYPES.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
            {!ROOM_TYPES.includes(formData.room_type) && (
              <option value={formData.room_type}>{formData.room_type}</option>
            )}
          </select>
        </div>

        <div className="space-y-2">
          <Label className="block">Status</Label>
          <div className="flex items-center gap-3 h-10">
            <Switch
              id="is_active"
              checked={formData.is_active}
              onCheckedChange={(checked) =>
                setFormData((prev) => ({ ...prev, is_active: checked }))
              }
            />
            <Label htmlFor="is_active" className="cursor-pointer">
              {formData.is_active ? "Active" : "Inactive (hidden from booking)"}
            </Label>
          </div>
        </div>
      </div>

      {/* Pricing */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label htmlFor="base_price">Base price (₹ per night)</Label>
          <Input
            id="base_price"
            type="number"
            min="0"
            step="50"
            value={formData.base_price}
            onChange={(e) =>
              setFormData((prev) => ({
                ...prev,
                base_price: Number(e.target.value),
              }))
            }
            required
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="weekend_price">Weekend price (optional)</Label>
          <Input
            id="weekend_price"
            type="number"
            min="0"
            step="50"
            value={formData.weekend_price ?? ""}
            placeholder="Defaults to base price"
            onChange={(e) =>
              setFormData((prev) => ({
                ...prev,
                weekend_price:
                  e.target.value === "" ? null : Number(e.target.value),
              }))
            }
          />
        </div>
      </div>

      {/* Occupancy */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label htmlFor="base_occupancy">Base occupancy</Label>
          <Input
            id="base_occupancy"
            type="number"
            min="1"
            value={formData.base_occupancy}
            onChange={(e) =>
              setFormData((prev) => ({
                ...prev,
                base_occupancy: Number(e.target.value),
              }))
            }
            required
          />
          <p className="text-xs text-muted-foreground">
            Standard sleeping capacity
          </p>
        </div>

        <div className="space-y-2">
          <Label htmlFor="extra_capacity">Extra capacity</Label>
          <Input
            id="extra_capacity"
            type="number"
            min="0"
            value={formData.extra_capacity}
            onChange={(e) =>
              setFormData((prev) => ({
                ...prev,
                extra_capacity: Number(e.target.value),
              }))
            }
          />
          <p className="text-xs text-muted-foreground">
            Additional bodies with extra bedding (e.g. &quot;2+1&quot; → 1)
          </p>
        </div>
      </div>

      {/* Description */}
      <div className="space-y-2">
        <Label htmlFor="description">Description</Label>
        <Textarea
          id="description"
          rows={3}
          value={formData.description}
          onChange={(e) =>
            setFormData((prev) => ({ ...prev, description: e.target.value }))
          }
          placeholder="Optional description shown to guests on the customer website."
        />
      </div>

      {/* Amenities */}
      <div className="space-y-2">
        <Label>Amenities</Label>
        <div className="flex gap-2">
          <Input
            value={amenityInput}
            onChange={(e) => setAmenityInput(e.target.value)}
            placeholder="e.g. AC, Hot water, Balcony"
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                addAmenity();
              }
            }}
          />
          <Button type="button" variant="outline" onClick={addAmenity}>
            Add
          </Button>
        </div>
        {formData.amenities.length > 0 && (
          <div className="flex flex-wrap gap-2 pt-2">
            {formData.amenities.map((a) => (
              <span
                key={a}
                className="inline-flex items-center gap-1.5 rounded-full bg-accent text-accent-foreground text-xs px-2.5 py-1"
              >
                {a}
                <button
                  type="button"
                  onClick={() => removeAmenity(a)}
                  className="hover:text-destructive"
                  aria-label={`Remove ${a}`}
                >
                  <X className="h-3 w-3" />
                </button>
              </span>
            ))}
          </div>
        )}
      </div>

      {/* Submit */}
      <div className="flex justify-end gap-2 pt-4 border-t">
        <Button
          type="button"
          variant="outline"
          onClick={() => router.push("/rooms")}
          disabled={isPending}
        >
          Cancel
        </Button>
        <Button type="submit" disabled={isPending}>
          {isPending ? <Loader2 className="animate-spin" /> : <Save />}
          Save changes
        </Button>
      </div>
    </form>
  );
}
