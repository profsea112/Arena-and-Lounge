import { useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Plus, Trash2 } from "lucide-react";

import { SiteFooter, SiteHeader } from "@/components/SiteHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { createArenaBooking, confirmBookingPayment, listArenaAvailability } from "@/lib/public.functions";
import { dateLabel, naira, timeLabel, todayISO } from "@/lib/format";

export const Route = createFileRoute("/book")({
  head: () => ({
    meta: [
      { title: "Book a Pitch Slot — M25" },
      {
        name: "description",
        content:
          "Check live availability, book a player slot, goalkeeper spot or the entire pitch, register your teammates and pay online.",
      },
      { property: "og:title", content: "Book a Pitch Slot — M25" },
      { property: "og:description", content: "Live slot availability, team colours and instant digital tickets." },
    ],
  }),
  component: BookPage,
});

type PlayerRow = { name: string; isGoalkeeper: boolean; teamId: string | null };

function BookPage() {
  const availability = useServerFn(listArenaAvailability);
  const createBooking = useServerFn(createArenaBooking);
  const confirmPayment = useServerFn(confirmBookingPayment);

  const { data: slots, isLoading, refetch } = useQuery({
    queryKey: ["arena-availability"],
    queryFn: () => availability({ data: { fromDate: todayISO() } }),
  });

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [bookingType, setBookingType] = useState<"player" | "group" | "full_pitch">("player");
  const [players, setPlayers] = useState<PlayerRow[]>([{ name: "", isGoalkeeper: false, teamId: null }]);
  const [customer, setCustomer] = useState({ name: "", email: "", phone: "" });
  const [ticket, setTicket] = useState<{ code: string; amount: number } | null>(null);

  const selected = useMemo(() => slots?.find((s) => s.id === selectedId) ?? null, [slots, selectedId]);
  const dates = useMemo(
    () => [...new Set((slots ?? []).map((s) => s.slot_date))].slice(0, 7),
    [slots],
  );
  const [activeDate, setActiveDate] = useState<string | null>(null);
  const currentDate = activeDate ?? dates[0] ?? todayISO();

  const amount = selected
    ? bookingType === "full_pitch"
      ? Number(selected.price_full_pitch)
      : Number(selected.price_per_player) * players.length
    : 0;

  const mutation = useMutation({
    mutationFn: async (payNow: boolean) => {
      if (!selected) throw new Error("Pick a slot first.");
      const result = await createBooking({
        data: {
          slotId: selected.id,
          bookingType,
          customerName: customer.name,
          customerEmail: customer.email,
          customerPhone: customer.phone,
          paymentMethod: payNow ? "paystack" : "cash",
          markPaid: false,
          players: players
            .filter((p) => p.name.trim().length > 0)
            .map((p) => ({ name: p.name.trim(), isGoalkeeper: p.isGoalkeeper, teamId: p.teamId })),
        },
      });
      if (payNow) await confirmPayment({ data: { ticketCode: result.ticketCode } });
      return { ...result, paid: payNow };
    },
    onSuccess: (result) => {
      setTicket({ code: result.ticketCode, amount: result.amount });
      toast.success(
        result.paid ? "Payment confirmed — ticket issued" : "Booking held — pay at reception",
      );
      setPlayers([{ name: "", isGoalkeeper: false, teamId: null }]);
      void refetch();
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const updatePlayer = (index: number, patch: Partial<PlayerRow>) =>
    setPlayers((rows) => rows.map((row, i) => (i === index ? { ...row, ...patch } : row)));

  return (
    <div className="min-h-screen">
      <SiteHeader />
      <main className="mx-auto max-w-6xl px-4 py-10">
        <h1 className="text-4xl md:text-5xl">Book your slot</h1>
        <p className="mt-2 max-w-2xl text-muted-foreground">
          Pick a day and kick-off time, choose how you want to play, then register the players coming
          with you.
        </p>

        <div className="mt-8 grid gap-6 lg:grid-cols-[1.3fr_1fr]">
          <section className="panel p-5">
            <h2 className="text-2xl">1. Choose a slot</h2>

            <div className="mt-4 flex flex-wrap gap-2">
              {dates.map((date) => (
                <Button
                  key={date}
                  size="sm"
                  variant={date === currentDate ? "default" : "outline"}
                  onClick={() => setActiveDate(date)}
                >
                  {dateLabel(date)}
                </Button>
              ))}
            </div>

            {isLoading ? (
              <p className="mt-6 text-sm text-muted-foreground">Loading availability…</p>
            ) : (
              <ul className="mt-5 space-y-2">
                {(slots ?? [])
                  .filter((s) => s.slot_date === currentDate)
                  .map((slot) => {
                    const full = slot.pitchBooked || slot.playersLeft === 0;
                    return (
                      <li key={slot.id}>
                        <button
                          type="button"
                          disabled={full}
                          onClick={() => setSelectedId(slot.id)}
                          className={`w-full rounded-lg border px-4 py-3 text-left transition-colors ${
                            selectedId === slot.id
                              ? "border-primary bg-primary/10"
                              : "border-border bg-secondary/40 hover:border-primary/60"
                          } ${full ? "cursor-not-allowed opacity-50" : ""}`}
                        >
                          <div className="flex flex-wrap items-center justify-between gap-2">
                            <span className="font-display text-2xl">
                              {timeLabel(slot.start_time)} – {timeLabel(slot.end_time)}
                            </span>
                            <span className="text-sm text-primary">
                              {naira(slot.price_per_player)} / player · {naira(slot.price_full_pitch)} pitch
                            </span>
                          </div>
                          <div className="mt-2 flex flex-wrap gap-2 text-xs">
                            <Badge variant="outline">{slot.playersLeft} player slots left</Badge>
                            <Badge variant="outline">{slot.keepersLeft} GK slots left</Badge>
                            {slot.pitchBooked && <Badge variant="destructive">Private match</Badge>}
                          </div>
                        </button>
                      </li>
                    );
                  })}
              </ul>
            )}
          </section>

          <section className="panel space-y-5 p-5">
            <div>
              <h2 className="text-2xl">2. How are you playing?</h2>
              <div className="mt-3 grid gap-2">
                {(
                  [
                    ["player", "Single player slot"],
                    ["group", "Multiple player slots"],
                    ["full_pitch", "Entire pitch (private match)"],
                  ] as const
                ).map(([value, label]) => (
                  <button
                    key={value}
                    type="button"
                    onClick={() => setBookingType(value)}
                    className={`rounded-lg border px-3 py-2 text-left text-sm transition-colors ${
                      bookingType === value
                        ? "border-primary bg-primary/10"
                        : "border-border bg-secondary/40"
                    }`}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <h2 className="text-2xl">3. Players &amp; teams</h2>
              <div className="mt-3 space-y-3">
                {players.map((player, index) => (
                  <div key={index} className="rounded-lg border border-border bg-secondary/40 p-3">
                    <div className="flex gap-2">
                      <Input
                        value={player.name}
                        placeholder={`Player ${index + 1} name`}
                        onChange={(e) => updatePlayer(index, { name: e.target.value })}
                      />
                      <Button
                        type="button"
                        variant="outline"
                        size="icon"
                        aria-label="Remove player"
                        onClick={() => setPlayers((rows) => rows.filter((_, i) => i !== index))}
                      >
                        <Trash2 className="size-4" />
                      </Button>
                    </div>
                    <div className="mt-3 flex flex-wrap items-center gap-4">
                      <Select
                        value={player.teamId ?? "none"}
                        onValueChange={(value) =>
                          updatePlayer(index, { teamId: value === "none" ? null : value })
                        }
                      >
                        <SelectTrigger className="w-[190px]">
                          <SelectValue placeholder="Team" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="none">No team yet</SelectItem>
                          {(selected?.teams ?? []).map((team) => (
                            <SelectItem key={team.id} value={team.id}>
                              {team.name} ({team.taken}/{team.max_players})
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <label className="flex items-center gap-2 text-sm">
                        <Switch
                          checked={player.isGoalkeeper}
                          disabled={
                            !player.isGoalkeeper &&
                            (selected?.keepersLeft ?? 0) <=
                              players.filter((p) => p.isGoalkeeper).length
                          }
                          onCheckedChange={(checked) => updatePlayer(index, { isGoalkeeper: checked })}
                        />
                        Goalkeeper
                        {selected && (
                          <span className="text-xs text-muted-foreground">
                            ({selected.keepersLeft} GK slots free)
                          </span>
                        )}
                      </label>

                    </div>
                  </div>
                ))}
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() =>
                    setPlayers((rows) => [...rows, { name: "", isGoalkeeper: false, teamId: null }])
                  }
                >
                  <Plus className="mr-1 size-4" /> Add player
                </Button>
              </div>
            </div>

            <div className="space-y-3">
              <h2 className="text-2xl">4. Your details</h2>
              <div className="grid gap-3">
                <div>
                  <Label htmlFor="name">Full name</Label>
                  <Input
                    id="name"
                    value={customer.name}
                    onChange={(e) => setCustomer({ ...customer, name: e.target.value })}
                  />
                </div>
                <div>
                  <Label htmlFor="email">Email (ticket is sent here)</Label>
                  <Input
                    id="email"
                    type="email"
                    value={customer.email}
                    onChange={(e) => setCustomer({ ...customer, email: e.target.value })}
                  />
                </div>
                <div>
                  <Label htmlFor="phone">Phone</Label>
                  <Input
                    id="phone"
                    value={customer.phone}
                    onChange={(e) => setCustomer({ ...customer, phone: e.target.value })}
                  />
                </div>
              </div>
            </div>

            <div className="rounded-lg border border-primary/40 bg-primary/10 p-4">
              <div className="flex items-center justify-between">
                <span className="text-sm text-muted-foreground">Total</span>
                <span className="font-display text-3xl text-primary">{naira(amount)}</span>
              </div>
              <div className="mt-3 grid gap-2">
                <Button disabled={!selected || mutation.isPending} onClick={() => mutation.mutate(true)}>
                  Pay online &amp; get ticket
                </Button>
                <Button
                  variant="outline"
                  disabled={!selected || mutation.isPending}
                  onClick={() => mutation.mutate(false)}
                >
                  Hold slot, pay at reception
                </Button>
              </div>
            </div>

            {ticket && (
              <div className="rounded-lg border border-success/50 bg-success/10 p-4">
                <p className="text-sm text-muted-foreground">Your ticket code</p>
                <p className="font-display text-4xl tracking-widest">{ticket.code}</p>
                <p className="mt-1 text-sm">
                  {naira(ticket.amount)} · show this code at the gate to collect your wristband.
                </p>
              </div>
            )}
          </section>
        </div>
      </main>
      <SiteFooter />
    </div>
  );
}
