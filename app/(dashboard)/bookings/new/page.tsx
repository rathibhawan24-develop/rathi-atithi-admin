import Link from "next/link";
import { ChevronLeft, Plus } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { WalkInForm } from "./walk-in-form";
import type { Addon } from "@/lib/types";

export const dynamic = "force-dynamic";

export default async function NewWalkInPage() {
  const supabase = createClient();
  const { data: addons } = await supabase
    .from("addons")
    .select("*")
    .eq("is_active", true)
    .order("display_order", { ascending: true });

  return (
    <div className="space-y-6">
      <div>
        <Link
          href="/bookings"
          className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground transition-colors mb-3"
        >
          <ChevronLeft className="h-4 w-4" />
          Back to bookings
        </Link>
        <h1 className="font-display text-3xl tracking-tight flex items-center gap-3">
          <Plus className="h-7 w-7 text-primary" />
          New walk-in booking
        </h1>
        <p className="text-sm text-muted-foreground mt-1">
          Confirms immediately. Records as source &quot;walk-in&quot; with the
          status set to confirmed.
        </p>
      </div>

      <WalkInForm addons={(addons ?? []) as Addon[]} />
    </div>
  );
}
