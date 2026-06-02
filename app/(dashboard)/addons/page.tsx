import { Sparkles } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { AddonsManager } from "./addons-manager";
import type { Addon } from "@/lib/types";
import { requirePermission } from "@/lib/auth/permissions";
import { canManageContent } from "@/lib/types";

export const dynamic = "force-dynamic";

export default async function AddonsPage() {
  await requirePermission(canManageContent, "/");

  const supabase = createClient();
  const { data } = await supabase
    .from("addons")
    .select("*")
    .order("display_order", { ascending: true })
    .order("name", { ascending: true });

  return (
    <div className="space-y-6 max-w-3xl">
      <header>
        <h1 className="font-display text-3xl md:text-4xl tracking-tight flex items-center gap-3">
          <Sparkles className="h-7 w-7 text-primary" />
          Add-ons
        </h1>
        <p className="text-muted-foreground mt-1">
          Optional extras that can be attached per-room (Extra Bed, Room Heater,
          etc.). Only admins can edit.
        </p>
      </header>

      <AddonsManager addons={(data ?? []) as Addon[]} />
    </div>
  );
}
