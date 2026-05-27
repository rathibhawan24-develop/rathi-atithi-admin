import Link from "next/link";
import { notFound } from "next/navigation";
import { ChevronLeft } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { RoomForm } from "./room-form";
import { PhotoManager } from "./photo-manager";
import type { Room } from "@/lib/types";

export const dynamic = "force-dynamic";

export default async function RoomEditPage({
  params,
}: {
  params: { id: string };
}) {
  const supabase = createClient();
  const { data: room, error } = await supabase
    .from("rooms")
    .select("*")
    .eq("id", params.id)
    .single();

  if (error || !room) {
    notFound();
  }

  const typed = room as Room;

  return (
    <div className="space-y-6">
      <div>
        <Link
          href="/rooms"
          className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground transition-colors mb-3"
        >
          <ChevronLeft className="h-4 w-4" />
          Back to rooms
        </Link>
        <h1 className="font-display text-3xl tracking-tight">
          {typed.name}
        </h1>
        <p className="text-sm text-muted-foreground mt-1">
          Room #{typed.room_number} · {typed.room_type}
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2">
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Room details</CardTitle>
            </CardHeader>
            <CardContent>
              <RoomForm room={typed} />
            </CardContent>
          </Card>
        </div>

        <div className="lg:col-span-1">
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Photos</CardTitle>
            </CardHeader>
            <CardContent>
              <PhotoManager
                roomId={typed.id}
                initialPhotos={typed.photos ?? []}
              />
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
