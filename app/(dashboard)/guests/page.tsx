import Link from "next/link";
import { Users, Phone, Mail, Search, History, Fingerprint } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import {
  Card,
  CardContent,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { formatDate, formatMaskedIdProof } from "@/lib/utils";
import { ExcelDownload } from "@/components/excel-download";

export const dynamic = "force-dynamic";

type SearchParams = { search?: string };

type Guest = {
  id: string;
  phone: string;
  name: string | null;
  email: string | null;
  total_bookings: number;
  last_booking_at: string | null;
  created_at: string;
};

export default async function GuestsPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const supabase = createClient();
  const search = (searchParams.search ?? "").trim();

  let query = supabase
    .from("guests")
    .select("*")
    .order("last_booking_at", { ascending: false, nullsFirst: false })
    .limit(200);

  if (search) {
    // Escape % and , to avoid breaking the .or() filter syntax
    const safe = search.replace(/[%,]/g, "");
    query = query.or(
      `name.ilike.%${safe}%,phone.ilike.%${safe}%,email.ilike.%${safe}%`
    );
  }

  const { data } = await query;
  const guests = (data ?? []) as Guest[];

  // ID proof is NOT on the `guests` aggregate view — it lives on `bookings`.
  // For each guest (identity = phone, same key the row link uses), pull the
  // id_proof from their MOST RECENT booking that actually has an id number.
  // Query/UI layer only — no change to the guests view, and search never
  // touches the id number.
  const phones = Array.from(
    new Set(guests.map((g) => g.phone).filter(Boolean))
  );
  const idProofByPhone = new Map<
    string,
    { type: string | null; number: string }
  >();
  if (phones.length > 0) {
    const { data: idRows } = await supabase
      .from("bookings")
      .select("phone, id_proof_type, id_proof_number, created_at")
      .in("phone", phones)
      .not("id_proof_number", "is", null)
      .order("created_at", { ascending: false });
    // Rows arrive newest-first, so the first one seen per phone is the most
    // recent booking with an id number.
    for (const r of (idRows ?? []) as Array<{
      phone: string;
      id_proof_type: string | null;
      id_proof_number: string | null;
      created_at: string;
    }>) {
      const num = (r.id_proof_number ?? "").trim();
      if (!num || idProofByPhone.has(r.phone)) continue;
      idProofByPhone.set(r.phone, { type: r.id_proof_type, number: num });
    }
  }

  // Stats — fetch separately so they reflect the entire dataset, not just the filtered slice
  const [{ count: totalGuests }, { count: repeatGuests }] = await Promise.all([
    supabase.from("guests").select("id", { count: "exact", head: true }),
    supabase
      .from("guests")
      .select("id", { count: "exact", head: true })
      .gt("total_bookings", 1),
  ]);

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="font-display text-3xl md:text-4xl tracking-tight flex items-center gap-3">
            <Users className="h-7 w-7 text-primary" />
            Guests
          </h1>
          <p className="text-muted-foreground mt-1">
            Everyone who has ever booked. Auto-populated from bookings.
          </p>
        </div>
        <ExcelDownload type="guests" filters={{ search }} />
      </header>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <Card>
          <CardContent className="pt-6">
            <p className="text-xs uppercase tracking-wider text-muted-foreground">
              Total guests
            </p>
            <p className="text-2xl font-semibold tabular-nums mt-1">
              {totalGuests ?? 0}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <p className="text-xs uppercase tracking-wider text-muted-foreground">
              Repeat guests
            </p>
            <p className="text-2xl font-semibold tabular-nums mt-1">
              {repeatGuests ?? 0}
            </p>
            <p className="text-[11px] text-muted-foreground mt-0.5">
              2 or more bookings
            </p>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardContent className="pt-6">
          <form method="GET" className="flex flex-wrap items-center gap-2">
            <div className="flex-1 min-w-[200px] relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                name="search"
                defaultValue={search}
                placeholder="Search by name, phone, or email"
                className="pl-9"
              />
            </div>
            <Button type="submit">Search</Button>
            {search && (
              <Button asChild type="button" variant="outline">
                <Link href="/guests">Clear</Link>
              </Button>
            )}
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="p-0">
          {guests.length === 0 ? (
            <div className="py-12 text-center">
              <Users className="h-10 w-10 text-muted-foreground/40 mx-auto mb-3" />
              <p className="text-sm font-medium">
                {search ? "No matches" : "No guests yet"}
              </p>
              <p className="text-xs text-muted-foreground mt-1">
                {search
                  ? "Try a different name, phone, or email."
                  : "Guests will appear here as bookings are created."}
              </p>
            </div>
          ) : (
            <div className="divide-y">
              {guests.map((g) => (
                <Link
                  key={g.id}
                  href={`/bookings?search=${encodeURIComponent(g.phone)}`}
                  className="flex flex-wrap items-center gap-3 px-4 py-3 hover:bg-muted/40 transition-colors"
                >
                  <div className="flex-1 min-w-[200px]">
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="font-medium text-sm">
                        {g.name ?? (
                          <span className="text-muted-foreground italic">
                            Unnamed guest
                          </span>
                        )}
                      </p>
                      {g.total_bookings > 1 && (
                        <Badge variant="muted" className="text-[10px]">
                          Repeat guest
                        </Badge>
                      )}
                    </div>
                    <div className="text-xs text-muted-foreground mt-0.5 flex flex-wrap gap-3">
                      <span className="inline-flex items-center gap-1">
                        <Phone className="h-3 w-3" />
                        {g.phone}
                      </span>
                      {g.email && (
                        <span className="inline-flex items-center gap-1 truncate">
                          <Mail className="h-3 w-3" />
                          {g.email}
                        </span>
                      )}
                      <span
                        className="inline-flex items-center gap-1 tabular-nums"
                        title="Masked — last 4 digits only"
                      >
                        <Fingerprint className="h-3 w-3" />
                        {(() => {
                          const ip = idProofByPhone.get(g.phone);
                          return formatMaskedIdProof(ip?.type, ip?.number);
                        })()}
                      </span>
                    </div>
                  </div>
                  <div className="text-right text-sm">
                    <p className="font-medium tabular-nums">
                      {g.total_bookings} booking
                      {g.total_bookings === 1 ? "" : "s"}
                    </p>
                    {g.last_booking_at && (
                      <p className="text-xs text-muted-foreground inline-flex items-center gap-1">
                        <History className="h-3 w-3" />
                        Last: {formatDate(g.last_booking_at)}
                      </p>
                    )}
                  </div>
                </Link>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {guests.length === 200 && (
        <p className="text-xs text-muted-foreground text-center">
          Showing first 200 results. Refine your search to narrow down.
        </p>
      )}
    </div>
  );
}
