"use client";

import { useState, useTransition } from "react";
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
} from "lucide-react";
import { format, parseISO } from "date-fns";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { resendNotification } from "./actions";

type Channel = "email" | "whatsapp";
type Stage = "received" | "confirmed" | "checked_in" | "checked_out" | "cancelled";
type Status = "sent" | "failed" | "skipped";

type LogEntry = {
  status: Status;
  at: string;
  attempts: number;
  error?: string;
  reason?: string;
  jobId?: string;
  messageId?: string;
};

type NotificationLog = Record<string, LogEntry>;

type Props = {
  bookingId: string;
  bookingStatus: string;
  bookingSource: string | null;
  log: NotificationLog;
};

const STAGE_LABELS: Record<Stage, string> = {
  received: "Booking received",
  confirmed: "Booking confirmed",
  checked_in: "Checked in",
  checked_out: "Checked out (thank you)",
  cancelled: "Cancelled",
};

// Decide whether a stage is "expected" to have a notification given the
// current booking status. The customer-site booking flow fires "received" on
// creation; admin walk-in fires "confirmed" directly. Etc.
function expectedStages(status: string, source: string | null): Stage[] {
  const out: Stage[] = [];
  // received fires only for online (customer-site) bookings on creation
  if (source === "online") out.push("received");
  if (status === "cancelled") {
    out.push("cancelled");
    return out;
  }
  if (["confirmed", "checked_in", "checked_out"].includes(status)) {
    out.push("confirmed");
  }
  if (["checked_in", "checked_out"].includes(status)) {
    out.push("checked_in");
  }
  if (status === "checked_out") {
    out.push("checked_out");
  }
  return out;
}

function StatusPill({ status }: { status: Status | "none" }) {
  if (status === "sent") {
    return (
      <Badge
        variant="outline"
        className="text-[10px] gap-1 bg-emerald-500/10 text-emerald-700 border-emerald-500/30"
      >
        <CheckCircle2 className="h-2.5 w-2.5" /> Sent
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
      Not sent yet
    </Badge>
  );
}

function ChannelRow({
  channel,
  stage,
  entry,
  bookingId,
  canResend,
  onResend,
  isResending,
}: {
  channel: Channel;
  stage: Stage;
  entry: LogEntry | null;
  bookingId: string;
  canResend: boolean;
  onResend: () => void;
  isResending: boolean;
}) {
  const Icon = channel === "email" ? Mail : MessageCircle;
  const label = channel === "email" ? "Email" : "WhatsApp";
  const status: Status | "none" = entry?.status ?? "none";

  // Skipped-with-reason gets a short clarifier (no phone, no template, etc.)
  const sublabel = (() => {
    if (!entry) return null;
    if (entry.status === "sent" && entry.attempts > 1) {
      return `succeeded on attempt ${entry.attempts}`;
    }
    if (entry.status === "skipped") {
      const r = entry.reason ?? "";
      if (r === "no_phone_on_booking") return "no phone on booking";
      if (r === "no_email_on_booking") return "no email on booking";
      if (r.startsWith("no_whatsapp_template_for_")) return "no template for this stage";
      if (r === "no_api_key") return "API key not configured";
      if (r === "already_sent") return null;
      return r.replace(/_/g, " ");
    }
    if (entry.status === "failed") {
      return entry.error?.slice(0, 110) ?? "unknown error";
    }
    return null;
  })();

  return (
    <div className="flex items-start gap-2.5 py-1.5">
      <Icon className="h-3.5 w-3.5 text-muted-foreground mt-1 shrink-0" />
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-xs font-medium">{label}</span>
          <StatusPill status={status} />
          {entry && (
            <span className="text-[10px] text-muted-foreground tabular-nums">
              {format(parseISO(entry.at), "d MMM, HH:mm")}
            </span>
          )}
        </div>
        {sublabel && (
          <p className="text-[10px] text-muted-foreground mt-0.5 break-words">
            {sublabel}
          </p>
        )}
      </div>
      {canResend && (status === "failed" || status === "none") && (
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
          {status === "none" ? "Send" : "Retry"}
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
}: Props) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [busyKey, setBusyKey] = useState<string | null>(null);

  const stages = expectedStages(bookingStatus, bookingSource);
  const canResend =
    bookingStatus !== "expired"; // expired bookings are read-only

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
            No notifications have been sent for this booking yet.
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
          const emailEntry = (log[emailKey] as LogEntry | undefined) ?? null;
          const waEntry = (log[waKey] as LogEntry | undefined) ?? null;

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
                  stage={stage}
                  entry={emailEntry}
                  bookingId={bookingId}
                  canResend={canResend}
                  onResend={() => handleResend(stage, "email")}
                  isResending={isPending && busyKey === emailKey}
                />
                <ChannelRow
                  channel="whatsapp"
                  stage={stage}
                  entry={waEntry}
                  bookingId={bookingId}
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
  // Tiny indicator for the booking list — shows red dot if any notification
  // in the log is in "failed" state and hasn't been superseded.
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
