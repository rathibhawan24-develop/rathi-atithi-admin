import Link from "next/link";
import Image from "next/image";
import { createClient } from "@/lib/supabase/server";
import { ROOM_PHOTOS_BUCKET, storagePublicUrl } from "@/lib/storage";
import { formatCurrency } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/components/ui/tabs";
import { BedDouble, Users, ImageOff } from "lucide-react";
import type { Room } from "@/lib/types";

export const dynamic = "force-dynamic";

const TYPE_ORDER = ["Supreme", "4 Bed", "Deluxe", "Sudama 6 Bed"];

async function getRooms() {
  const supabase = createClient();
  const { data, error } = await supabase
    .from("rooms")
    .select("*")
    .order("display_order", { ascending: true });

  if (error) {
    console.error("Failed to load rooms:", error);
    return [];
  }
  return (data ?? []) as Room[];
}

function groupByType(rooms: Room[]): Record<string, Room[]> {
  const grouped: Record<string, Room[]> = {};
  for (const room of rooms) {
    if (!grouped[room.room_type]) grouped[room.room_type] = [];
    grouped[room.room_type].push(room);
  }
  return grouped;
}

function RoomCard({ room }: { room: Room }) {
  const firstPhoto = room.photos?.[0];
  const photoUrl = firstPhoto
    ? storagePublicUrl(ROOM_PHOTOS_BUCKET, firstPhoto)
    : null;

  return (
    <Link
      href={`/rooms/${room.id}`}
      className="group block rounded-lg border border-border bg-card overflow-hidden hover:border-primary/40 hover:shadow-md transition-all"
    >
      {/* Photo */}
      <div className="relative aspect-[4/3] bg-muted overflow-hidden">
        {photoUrl ? (
          <Image
            src={photoUrl}
            alt={room.name}
            fill
            sizes="(max-width: 768px) 100vw, (max-width: 1200px) 50vw, 33vw"
            className="object-cover transition-transform group-hover:scale-105"
          />
        ) : (
          <div className="absolute inset-0 flex flex-col items-center justify-center text-muted-foreground gap-2">
            <ImageOff className="h-8 w-8" />
            <span className="text-xs">No photos yet</span>
          </div>
        )}
        {!room.is_active && (
          <div className="absolute top-2 right-2">
            <Badge variant="warning">Inactive</Badge>
          </div>
        )}
        <div className="absolute top-2 left-2">
          <Badge variant="secondary" className="bg-background/90 backdrop-blur">
            #{room.room_number}
          </Badge>
        </div>
      </div>

      {/* Info */}
      <div className="p-4 space-y-2">
        <div>
          <h3 className="font-medium leading-tight">{room.name}</h3>
          <p className="text-xs text-muted-foreground mt-0.5">
            {room.room_type}
          </p>
        </div>

        <div className="flex items-center justify-between pt-2 border-t border-border/50">
          <div className="flex items-center gap-1 text-sm text-muted-foreground">
            <Users className="h-3.5 w-3.5" />
            <span className="tabular-nums">
              {room.extra_capacity > 0
                ? `${room.base_occupancy}+${room.extra_capacity}`
                : room.base_occupancy}
            </span>
          </div>
          <div className="text-right">
            <p className="text-sm font-semibold tabular-nums">
              {formatCurrency(room.base_price)}
            </p>
            <p className="text-[10px] text-muted-foreground -mt-0.5">
              per night
            </p>
          </div>
        </div>
      </div>
    </Link>
  );
}

function RoomGrid({ rooms }: { rooms: Room[] }) {
  if (rooms.length === 0) {
    return (
      <div className="text-center py-12 text-muted-foreground text-sm">
        No rooms in this category.
      </div>
    );
  }
  return (
    <div className="grid gap-4 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
      {rooms.map((room) => (
        <RoomCard key={room.id} room={room} />
      ))}
    </div>
  );
}

export default async function RoomsPage() {
  const rooms = await getRooms();
  const grouped = groupByType(rooms);

  // Active type names in the configured order, then any extras alphabetically
  const types = [
    ...TYPE_ORDER.filter((t) => grouped[t]),
    ...Object.keys(grouped)
      .filter((t) => !TYPE_ORDER.includes(t))
      .sort(),
  ];

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="font-display text-3xl md:text-4xl tracking-tight flex items-center gap-3">
            <BedDouble className="h-7 w-7 text-primary" />
            Rooms
          </h1>
          <p className="text-muted-foreground mt-1">
            {rooms.length} rooms · {types.length} categories
          </p>
        </div>
      </header>

      <Tabs defaultValue="all">
        <TabsList className="flex-wrap h-auto">
          <TabsTrigger value="all">
            All <span className="ml-1.5 text-xs opacity-60">({rooms.length})</span>
          </TabsTrigger>
          {types.map((type) => (
            <TabsTrigger key={type} value={type}>
              {type}{" "}
              <span className="ml-1.5 text-xs opacity-60">
                ({grouped[type].length})
              </span>
            </TabsTrigger>
          ))}
        </TabsList>

        <TabsContent value="all" className="space-y-8">
          {types.map((type) => (
            <section key={type}>
              <h2 className="font-display text-xl mb-3 text-foreground/80">
                {type}
              </h2>
              <RoomGrid rooms={grouped[type]} />
            </section>
          ))}
        </TabsContent>

        {types.map((type) => (
          <TabsContent key={type} value={type}>
            <RoomGrid rooms={grouped[type]} />
          </TabsContent>
        ))}
      </Tabs>
    </div>
  );
}
