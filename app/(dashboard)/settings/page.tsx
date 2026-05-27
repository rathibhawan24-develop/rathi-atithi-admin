import { Settings as SettingsIcon } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { SettingsForm } from "./settings-form";

export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  const supabase = createClient();
  const { data } = await supabase.from("settings").select("key, value");

  return (
    <div className="space-y-6 max-w-3xl">
      <header>
        <h1 className="font-display text-3xl md:text-4xl tracking-tight flex items-center gap-3">
          <SettingsIcon className="h-7 w-7 text-primary" />
          Settings
        </h1>
        <p className="text-muted-foreground mt-1">
          Hotel information and operational defaults. Only admins can edit
          these.
        </p>
      </header>

      <SettingsForm rows={data ?? []} />
    </div>
  );
}
