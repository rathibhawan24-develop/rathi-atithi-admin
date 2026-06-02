import { TrendingUp } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { PricingManager } from "./pricing-manager";
import { requirePermission } from "@/lib/auth/permissions";
import { canManageContent } from "@/lib/types";

export const dynamic = "force-dynamic";

export default async function PricingPage() {
  await requirePermission(canManageContent, "/");

  const supabase = createClient();

  const [overridesRes, roomsRes] = await Promise.all([
    supabase
      .from("price_overrides")
      .select("*")
      .order("start_date", { ascending: false }),
    supabase
      .from("rooms")
      .select("id, room_number, name, room_type")
      .eq("is_active", true)
      .order("display_order", { ascending: true }),
  ]);

  const rooms = roomsRes.data ?? [];
  const roomTypes = Array.from(new Set(rooms.map((r) => r.room_type)));

  return (
    <div className="space-y-6 max-w-4xl">
      <header>
        <h1 className="font-display text-3xl md:text-4xl tracking-tight flex items-center gap-3">
          <TrendingUp className="h-7 w-7 text-primary" />
          Pricing overrides
        </h1>
        <p className="text-muted-foreground mt-1">
          Date-range pricing for festivals, weekends, and peak demand. Only
          admins can edit.
        </p>
      </header>

      <PricingManager
        overrides={overridesRes.data ?? []}
        rooms={rooms}
        roomTypes={roomTypes}
      />
    </div>
  );
}
