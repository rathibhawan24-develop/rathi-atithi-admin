"use client";

import { useEffect, useState, useTransition, useCallback } from "react";
import { useRouter } from "next/navigation";
import { RefreshCw } from "lucide-react";
import { cn } from "@/lib/utils";

function fmtTime(d: Date): string {
  return d.toLocaleTimeString("en-IN", {
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  });
}

// Shows when the page data was last loaded and a manual Refresh button.
// Admin pages are server-rendered and only fetch on navigation/refresh, so this
// gives staff a way to pull the latest (e.g. a booking that just came in from
// the customer site). Pass autoRefreshSeconds to also poll automatically.
export function SyncStatus({
  autoRefreshSeconds,
}: {
  autoRefreshSeconds?: number;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [lastSynced, setLastSynced] = useState<Date | null>(null);

  // Set on mount (client-only) to avoid a server/client hydration mismatch.
  useEffect(() => {
    setLastSynced(new Date());
  }, []);

  const refresh = useCallback(() => {
    startTransition(() => {
      router.refresh();
      setLastSynced(new Date());
    });
  }, [router]);

  useEffect(() => {
    if (!autoRefreshSeconds) return;
    const id = setInterval(refresh, autoRefreshSeconds * 1000);
    return () => clearInterval(id);
  }, [autoRefreshSeconds, refresh]);

  return (
    <div className="flex items-center gap-2.5 text-xs text-muted-foreground">
      <span className="whitespace-nowrap">
        {lastSynced ? `Last synced ${fmtTime(lastSynced)}` : "Syncing…"}
        {autoRefreshSeconds ? ` · auto every ${autoRefreshSeconds}s` : ""}
      </span>
      <button
        type="button"
        onClick={refresh}
        disabled={isPending}
        className="inline-flex items-center gap-1.5 rounded-md border border-input bg-background px-2.5 py-1.5 font-medium text-foreground hover:bg-accent transition-colors disabled:opacity-60"
      >
        <RefreshCw className={cn("h-3.5 w-3.5", isPending && "animate-spin")} />
        {isPending ? "Refreshing…" : "Refresh"}
      </button>
    </div>
  );
}
