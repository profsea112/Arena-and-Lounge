import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useMutation } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";

import { SiteFooter, SiteHeader } from "@/components/SiteHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { lookupTicket } from "@/lib/public.functions";
import { logAudit } from "@/lib/audit";
import { dateLabel, naira, statusTone, timeLabel } from "@/lib/format";

export const Route = createFileRoute("/ticket")({
  head: () => ({
    meta: [
      { title: "Find My Ticket — M25" },
      {
        name: "description",
        content: "Enter your ticket code to view your pitch slot, lineup, amount paid and check-in status.",
      },
      { property: "og:title", content: "Find My Ticket — M25" },
      { property: "og:description", content: "Look up your arena booking with your ticket code." },
    ],
  }),
  component: TicketPage,
});

function TicketPage() {
  const lookup = useServerFn(lookupTicket);
  const [code, setCode] = useState("");

  const mutation = useMutation({
    mutationFn: (ticketCode: string) => lookup({ data: { ticketCode } }),
    onSuccess: (data) => {
      if (!data) toast.error("No booking found for that code.");
      else
        void logAudit({
          action: "ticket.verified",
          entityType: "ticket",
          entityLabel: data.ticket_code,
          details: { payment_status: data.payment_status },
        });
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const booking = mutation.data;
  const slot = booking?.arena_slots as
    | { slot_date: string; start_time: string; end_time: string }
    | null
    | undefined;

  return (
    <div className="min-h-screen">
      <SiteHeader />
      <main className="mx-auto max-w-2xl px-4 py-12">
        <h1 className="text-4xl md:text-5xl">Find my ticket</h1>
        <form
          className="mt-6 flex gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            if (code.trim().length >= 4) mutation.mutate(code.trim());
          }}
        >
          <Input
            value={code}
            placeholder="e.g. FA-8KX2Q"
            onChange={(e) => setCode(e.target.value.toUpperCase())}
          />
          <Button type="submit" disabled={mutation.isPending}>
            Look up
          </Button>
        </form>

        {booking && (
          <article className="panel mt-8 p-6">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="text-sm text-muted-foreground">Ticket code</p>
                <p className="font-display text-4xl tracking-widest">{booking.ticket_code}</p>
              </div>
              <Badge variant="outline" className={statusTone(booking.payment_status)}>
                {booking.payment_status}
              </Badge>
            </div>

            <dl className="mt-6 grid gap-4 sm:grid-cols-2">
              <div>
                <dt className="text-sm text-muted-foreground">Booked by</dt>
                <dd className="font-medium">{booking.customer_name}</dd>
              </div>
              <div>
                <dt className="text-sm text-muted-foreground">Amount</dt>
                <dd className="font-medium">{naira(booking.amount)}</dd>
              </div>
              <div>
                <dt className="text-sm text-muted-foreground">Session</dt>
                <dd className="font-medium">
                  {slot
                    ? `${dateLabel(slot.slot_date)} · ${timeLabel(slot.start_time)} – ${timeLabel(slot.end_time)}`
                    : "—"}
                </dd>
              </div>
              <div>
                <dt className="text-sm text-muted-foreground">Type</dt>
                <dd className="font-medium capitalize">{booking.booking_type.replace("_", " ")}</dd>
              </div>
            </dl>

            <h2 className="mt-8 text-2xl">Lineup</h2>
            <ul className="mt-2 space-y-2">
              {(booking.booking_players ?? []).map((player, index) => {
                const team = player.teams as { name: string; color: string } | null;
                return (
                  <li
                    key={index}
                    className="flex items-center justify-between rounded-lg border border-border bg-secondary/40 px-3 py-2"
                  >
                    <span>{player.player_name}</span>
                    <span className="flex items-center gap-2 text-sm text-muted-foreground">
                      {player.is_goalkeeper && <Badge variant="outline">GK</Badge>}
                      {team?.name ?? "Unassigned"}
                    </span>
                  </li>
                );
              })}
            </ul>

            <p className="mt-6 text-sm text-muted-foreground">
              {booking.checked_in_at
                ? "Checked in — enjoy the game."
                : "Show this code at the gate to check in."}
            </p>
          </article>
        )}
      </main>
      <SiteFooter />
    </div>
  );
}
