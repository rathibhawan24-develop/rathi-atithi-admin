"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  Mail,
  MessageCircle,
  CheckCircle2,
  XCircle,
  MinusCircle,
  Loader2,
  RefreshCw,
  Bell,
  Clock,
} from "lucide-react";
import { format, parseISO } from "date-fns";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { resendNotification } from "./actions";

type Channel = "email" | "whatsapp";
type Stage = "received" | "confirmed" | "checked_in" | "checked_out" | "cancelled";
type Status = "sent" | "failed" | "skipped";

type LogEntry = {
  status: Status;
  at: string; // ISO timestamp, empty string for legacy entries
  attempts: number;
  error?: string;
  reason?: string;
  jobId?: string;
  messageId?: string;
  legacy?: boolean; // synthesized from notifications_sent
};

type NotificationLog = Record<string, LogEntry>;

type Props = {
  bookingId: string;
  bookingStatus: string;
  bookingSource: string | null;
  log: NotificationLog;
  notificationsSent?: string[]; // legacy idempotency array (read for backfill display)
};

const STAGE_LABELS: Record<Stage, string> = {
  received: "Booking received",
  confirmed: "Booking confirmed",
  checked_in: "Checked in",
  checked_out: "Checked out (thank you)",
  cancelled: "Cancelled",
};

const STAGE_ORDER: Stage[] = [
  "received",
  "confirmed",
  "checked_in",
  "checked_out",
  "cancelled",
];

function isValidStage(s: string): s is Stage {
  return (STAGE_ORDER as string[]).includes(s);
}

/** Parse a notifications_sent key ("received" or "whatsapp_received") into
 *  its stage + channel. Returns null for unrecognized keys. */
function parseSentKey(key: string): { stage: Stage; channel: Channel } | null {
  if (key.startsWith("whatsapp_")) {
    const stage = key.slice("whatsapp_".length);
    if (isValidStage(stage)) return { stage, channel: "whatsapp" };
    return null;
  }
  if (isValidStage(key)) return { stage: key, channel: "email" };
  return null;
}

/** Merge notification_log with legacy notifications_sent. For any (stage,
 *  channel) pair that exists in notifications_sent but NOT in
 *  notification_log, synthesize a "sent" entry marked as legacy. */
function buildMergedLog(
  log: NotificationLog,
  sent: string[]
): NotificationLog {
  const merged: NotificationLog = { ...log };
  for (const key of sent) {
    const parsed = parseSentKey(key);
    if (!parsed) continue;
    const logKey = `${parsed.stage}_${parsed.channel}`;
    if (!(logKey in merged)) {
      merged[logKey] = {
        status: "sent",
        at: "",
        attempts: 1,
        legacy: true,
      };
    }
  }
  return merged;
}

/** Stages to render: union of (a) stages with any data in merged log and
 *  (b) stages expected by current booking lifecycle. */
function getStagesToShow(
  status: string,
  source: string | null,
  mergedLog: NotificationLog
): Stage[] {
  const set = new Set<Stage>();

  // Any stage that has data in the merged log
  for (const key of Object.keys(mergedLog)) {
    const m = key.match(/^(\w+)_(email|whatsapp)$/);
    if (m && isValidStage(m[1])) set.add(m[1] as Stage);
  }

  // Expected stages based on current status
  if (status === "cancelled") {
    set.add("cancelled");
    if (source === "online") set.add("received");
  } else {
    if (source === "online") set.add("received");
    if (["confirmed", "checked_in", "checked_out"].includes(status)) {
      set.add("confirmed");
    }
    if (["checked_in", "checked_out"].includes(status)) {
      set.add("checked_in");
    }
    if (status === "checked_out") set.add("checked_out");
  }

  return STAGE_ORDER.filter((s) => set.has(s));
}

function StatusPill({
  status,
  legacy,
}: {
  status: Status | "none";
  legacy?: boolean;
}) {
  if (status === "sent") {
    return (
      <Badge
        variant="outline"
        className="text-[10px] gap-1 bg-emerald-500/10 text-emerald-700 border-emerald-500/30"
      >
        <CheckCircle2 className="h-2.5 w-2.5" />
        {legacy ? "Sent (legacy)" : "Sent"}
      </Badge>
    );
  }
  if (status === "failed") {
    return (
      <Badge
        variant="outline"
        className="text-[10px] gap-1 bg-destructive/10 text-destructive border-destructive/30"
      >
        <XCircle className="h-2.5 w-2.5" /> Failed
      </Badge>
    );
  }
  if (status === "skipped") {
    return (
      <Badge
        variant="outline"
        className="text-[10px] gap-1 bg-muted text-muted-foreground border-border"
      >
        <MinusCircle className="h-2.5 w-2.5" /> Skipped
      </Badge>
    );
  }
  return (
    <Badge
      variant="outline"
      className="text-[10px] gap-1 text-muted-foreground border-dashed"
    >
      <Clock className="h-2.5 w-2.5" /> Not sent yet
    </Badge>
  );
}

function ChannelRow({
  channel,
  entry,
  canResend,
  onResend,
  isResending,
}: {
  channel: Channel;
  entry: LogEntry | null;
  canResend: boolean;
  onResend: () => void;
  isResending: boolean;
}) {
  const Icon = channel === "email" ? Mail : MessageCircle;
  const label = channel === "email" ? "Email" : "WhatsApp";
  const status: Status | "none" = entry?.status ?? "none";
  const isLegacy = entry?.legacy === true;

  const sublabel = (() => {
    if (!entry) return null;
    if (isLegacy) {
      return "Sent before delivery logging was added — no timestamp.";
    }
    if (entry.status === "sent" && entry.attempts > 1) {
      return `Succeeded on attempt ${entry.attempts}.`;
    }
    if (entry.status === "skipped") {
      const r = entry.reason ?? "";
      if (r === "no_phone_on_booking") return "No phone on booking.";
      if (r === "no_email_on_booking") return "No email on booking.";
      if (r.startsWith("no_whatsapp_template_for_"))
        return "No template configured for this stage.";
      if (r === "no_api_key") return "API key not configured.";
      if (r === "already_sent") return null;
      return r.replace(/_/g, " ");
    }
    if (entry.status === "failed") {
      return entry.error?.slice(0, 140) ?? "Unknown error";
    }
    return null;
  })();

  // Show retry on failures, on never-attempted (none), AND on legacy "sent"
  // (admin may want to resend if they suspect legacy didn't actually deliver).
  // Hide retry on definitively-recorded sent (have timestamp) and skipped.
  const showRetry =
    canResend &&
    (status === "failed" ||
      status === "none" ||
      (status === "sent" && isLegacy));

  const showTime = entry && entry.at && !isLegacy;

  return (
    <div className="flex items-start gap-2.5 py-1.5">
      <Icon className="h-3.5 w-3.5 text-muted-foreground mt-1 shrink-0" />
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-xs font-medium">{label}</span>
          <StatusPill status={status} legacy={isLegacy} />
          {showTime && (
            <span className="text-[10px] text-muted-foreground tabular-nums">
              {format(parseISO(entry!.at), "d MMM, HH:mm")}
            </span>
          )}
        </div>
        {sublabel && (
          <p className="text-[10px] text-muted-foreground mt-0.5 break-words">
            {sublabel}
          </p>
        )}
      </div>
      {showRetry && (
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={onResend}
          disabled={isResending}
          className="h-7 px-2 text-[10px] gap-1 shrink-0"
        >
          {isResending ? (
            <Loader2 className="h-3 w-3 animate-spin" />
          ) : (
            <RefreshCw className="h-3 w-3" />
          )}
          {status === "none"
            ? "Send"
            : isLegacy
            ? "Resend"
            : "Retry"}
        </Button>
      )}
    </div>
  );
}

export function NotificationsCard({
  bookingId,
  bookingStatus,
  bookingSource,
  log,
  notificationsSent,
}: Props) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [busyKey, setBusyKey] = useState<string | null>(null);

  const mergedLog = useMemo(
    () => buildMergedLog(log, notificationsSent ?? []),
    [log, notificationsSent]
  );
  const stages = getStagesToShow(bookingStatus, bookingSource, mergedLog);
  const canResend =
    bookingStatus !== "expired" && bookingStatus !== "cancelled";

  const handleResend = (stage: Stage, channel: Channel) => {
    const key = `${stage}_${channel}`;
    setBusyKey(key);
    startTransition(async () => {
      const result = await resendNotification({
        booking_id: bookingId,
        stage,
        channel,
      });
      if (result.success) {
        toast.success(
          `${channel === "email" ? "Email" : "WhatsApp"} sent.`
        );
      } else {
        toast.error(result.error ?? "Send failed.");
      }
      setBusyKey(null);
      router.refresh();
    });
  };

  if (stages.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Bell className="h-4 w-4 text-primary" />
            Notifications
          </CardTitle>
          <CardDescription>
            No notifications have fired yet for this booking. They'll be sent
            automatically when you confirm, check-in, or check-out the guest.
          </CardDescription>
        </CardHeader>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base flex items-center gap-2">
          <Bell className="h-4 w-4 text-primary" />
          Notifications
        </CardTitle>
        <CardDescription>
          Delivery status for emails and WhatsApp messages on each stage.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {stages.map((stage) => {
          const emailKey = `${stage}_email`;
          const waKey = `${stage}_whatsapp`;
          const emailEntry = (mergedLog[emailKey] as LogEntry | undefined) ?? null;
          const waEntry = (mergedLog[waKey] as LogEntry | undefined) ?? null;

          return (
            <div
              key={stage}
              className="border border-border rounded-md px-3 py-2"
            >
              <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-1">
                {STAGE_LABELS[stage]}
              </p>
              <div className="divide-y divide-border/60">
                <ChannelRow
                  channel="email"
                  entry={emailEntry}
                  canResend={canResend}
                  onResend={() => handleResend(stage, "email")}
                  isResending={isPending && busyKey === emailKey}
                />
                <ChannelRow
                  channel="whatsapp"
                  entry={waEntry}
                  canResend={canResend}
                  onResend={() => handleResend(stage, "whatsapp")}
                  isResending={isPending && busyKey === waKey}
                />
              </div>
            </div>
          );
        })}
        <p className="text-[10px] text-muted-foreground italic">
          Tip: Retry uses the same template and phone number — useful if a
          transient network error caused a failure.
        </p>
      </CardContent>
    </Card>
  );
}

export function NotificationStatusIndicator({ log }: { log: NotificationLog }) {
  const hasFailure = Object.values(log).some((e) => e?.status === "failed");
  if (!hasFailure) return null;
  return (
    <span
      className="inline-flex items-center gap-1 text-[10px] text-destructive"
      title="One or more notifications failed to send"
    >
      <XCircle className="h-3 w-3" /> Notif
    </span>
  );
}
