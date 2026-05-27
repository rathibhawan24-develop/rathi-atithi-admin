"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Loader2, Save, Building2, Clock, IndianRupee } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { updateSettings } from "./actions";

type SettingsRow = { key: string; value: unknown };

function str(rows: SettingsRow[], key: string, fallback = ""): string {
  const v = rows.find((r) => r.key === key)?.value;
  if (v == null) return fallback;
  if (typeof v === "string") return v;
  return String(v);
}

function num(rows: SettingsRow[], key: string, fallback: number): number {
  const v = rows.find((r) => r.key === key)?.value;
  if (typeof v === "number") return v;
  if (typeof v === "string" && v) return Number(v);
  return fallback;
}

function bool(rows: SettingsRow[], key: string, fallback: boolean): boolean {
  const v = rows.find((r) => r.key === key)?.value;
  if (typeof v === "boolean") return v;
  return fallback;
}

function weekendArr(rows: SettingsRow[]): number[] {
  const v = rows.find((r) => r.key === "weekend_days")?.value;
  if (Array.isArray(v))
    return v.filter((n): n is number => typeof n === "number");
  return [0, 6];
}

export function SettingsForm({ rows }: { rows: SettingsRow[] }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  // Hotel info
  const [hotelName, setHotelName] = useState(str(rows, "hotel_name"));
  const [tagline, setTagline] = useState(str(rows, "hotel_tagline"));
  const [address, setAddress] = useState(str(rows, "hotel_address"));
  const [phone, setPhone] = useState(str(rows, "contact_phone"));
  const [email, setEmail] = useState(str(rows, "contact_email"));
  const [whatsapp, setWhatsapp] = useState(str(rows, "whatsapp_number"));

  // Operations
  const [checkInTime, setCheckInTime] = useState(
    str(rows, "check_in_time", "12:00")
  );
  const [checkOutTime, setCheckOutTime] = useState(
    str(rows, "check_out_time", "11:00")
  );
  const [autoExpire, setAutoExpire] = useState<number>(
    num(rows, "auto_expire_hours", 24)
  );
  const [weekend, setWeekend] = useState<number[]>(weekendArr(rows));

  // Tax / currency
  const [taxInclusive, setTaxInclusive] = useState(
    bool(rows, "tax_inclusive", true)
  );
  const [currencySymbol, setCurrencySymbol] = useState(
    str(rows, "currency_symbol", "₹")
  );

  const toggleWeekendDay = (day: number) => {
    setWeekend((prev) =>
      prev.includes(day) ? prev.filter((d) => d !== day) : [...prev, day]
    );
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    startTransition(async () => {
      const result = await updateSettings({
        hotel_name: hotelName.trim(),
        hotel_tagline: tagline.trim(),
        hotel_address: address.trim(),
        contact_phone: phone.trim(),
        contact_email: email.trim().toLowerCase(),
        whatsapp_number: whatsapp.trim(),
        check_in_time: checkInTime,
        check_out_time: checkOutTime,
        auto_expire_hours: autoExpire,
        weekend_days: weekend.sort((a, b) => a - b),
        tax_inclusive: taxInclusive,
        currency_symbol: currencySymbol,
      });
      if (result.success) {
        toast.success("Settings saved.");
        router.refresh();
      } else {
        toast.error(result.error);
      }
    });
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Building2 className="h-4 w-4 text-primary" />
            Hotel information
          </CardTitle>
        </CardHeader>
        <CardContent className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="space-y-2 sm:col-span-2">
            <Label htmlFor="hotel_name">Hotel name</Label>
            <Input
              id="hotel_name"
              value={hotelName}
              onChange={(e) => setHotelName(e.target.value)}
              required
            />
          </div>
          <div className="space-y-2 sm:col-span-2">
            <Label htmlFor="tagline">Tagline</Label>
            <Input
              id="tagline"
              value={tagline}
              onChange={(e) => setTagline(e.target.value)}
              placeholder="Shown on the customer landing page"
            />
          </div>
          <div className="space-y-2 sm:col-span-2">
            <Label htmlFor="address">Address</Label>
            <Textarea
              id="address"
              rows={2}
              value={address}
              onChange={(e) => setAddress(e.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="phone">Contact phone</Label>
            <Input
              id="phone"
              type="tel"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="email">Contact email</Label>
            <Input
              id="email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </div>
          <div className="space-y-2 sm:col-span-2">
            <Label htmlFor="whatsapp">WhatsApp number</Label>
            <Input
              id="whatsapp"
              value={whatsapp}
              onChange={(e) => setWhatsapp(e.target.value)}
              placeholder="With country code, no spaces (e.g. 919123456789)"
            />
            <p className="text-xs text-muted-foreground">
              Used for wa.me click-to-chat links on the customer site.
            </p>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Clock className="h-4 w-4 text-primary" />
            Operations
          </CardTitle>
        </CardHeader>
        <CardContent className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label htmlFor="check_in_time">Check-in time</Label>
            <Input
              id="check_in_time"
              type="time"
              value={checkInTime}
              onChange={(e) => setCheckInTime(e.target.value)}
              required
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="check_out_time">Check-out time</Label>
            <Input
              id="check_out_time"
              type="time"
              value={checkOutTime}
              onChange={(e) => setCheckOutTime(e.target.value)}
              required
            />
          </div>
          <div className="space-y-2 sm:col-span-2">
            <Label htmlFor="auto_expire">
              Auto-expire pending bookings after
            </Label>
            <select
              id="auto_expire"
              value={autoExpire}
              onChange={(e) => setAutoExpire(Number(e.target.value))}
              className="flex h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
            >
              <option value={24}>24 hours</option>
              <option value={48}>48 hours</option>
              <option value={72}>72 hours</option>
              <option value={168}>1 week</option>
              <option value={0}>Never (manual cancellation only)</option>
            </select>
            <p className="text-xs text-muted-foreground">
              Web bookings that aren&apos;t confirmed by staff within this
              window will auto-expire and release the rooms.
            </p>
          </div>
          <div className="space-y-2 sm:col-span-2">
            <Label>Weekend days (for weekend pricing)</Label>
            <div className="flex flex-wrap gap-2 pt-1">
              {[
                { value: 0, label: "Sun" },
                { value: 1, label: "Mon" },
                { value: 2, label: "Tue" },
                { value: 3, label: "Wed" },
                { value: 4, label: "Thu" },
                { value: 5, label: "Fri" },
                { value: 6, label: "Sat" },
              ].map((d) => (
                <label
                  key={d.value}
                  className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-md border text-sm cursor-pointer transition-colors ${
                    weekend.includes(d.value)
                      ? "bg-primary text-primary-foreground border-primary"
                      : "border-input bg-background"
                  }`}
                >
                  <input
                    type="checkbox"
                    checked={weekend.includes(d.value)}
                    onChange={() => toggleWeekendDay(d.value)}
                    className="sr-only"
                  />
                  {d.label}
                </label>
              ))}
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <IndianRupee className="h-4 w-4 text-primary" />
            Tax &amp; currency
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-start gap-3">
            <Switch
              id="tax_inclusive"
              checked={taxInclusive}
              onCheckedChange={setTaxInclusive}
            />
            <div className="space-y-0.5">
              <Label htmlFor="tax_inclusive" className="cursor-pointer">
                Prices include all taxes
              </Label>
              <p className="text-xs text-muted-foreground">
                When on, displayed prices are tax-inclusive (no extra tax line
                on invoices).
              </p>
            </div>
          </div>
          <div className="space-y-2 max-w-[150px]">
            <Label htmlFor="currency">Currency symbol</Label>
            <Input
              id="currency"
              value={currencySymbol}
              onChange={(e) => setCurrencySymbol(e.target.value)}
              maxLength={3}
            />
          </div>
        </CardContent>
      </Card>

      <div className="sticky bottom-4 flex justify-end">
        <Button type="submit" disabled={isPending} size="lg" className="shadow-lg">
          {isPending ? <Loader2 className="animate-spin" /> : <Save />}
          Save settings
        </Button>
      </div>
    </form>
  );
}
