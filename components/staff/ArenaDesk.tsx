import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { dateLabel, naira, statusTone, timeLabel } from "@/lib/format";
import { logAudit, type AuditAction } from "@/lib/audit";

export function ArenaDesk() {
  const queryClient = useQueryClient();

  const { data: bookings, isLoading } = useQuery({
    queryKey: ["staff-bookings"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("bookings")
        .select(
          "id, ticket_code, customer_name, customer_phone, booking_type, players_count, goalkeepers_count, amount, payment_status, checked_in_at, arena_slots(slot_date, start_time, end_time)",
        )
        .order("created_at", { ascending: false })
        .limit(60);
      if (error) throw error;
      return data ?? [];
    },
  });

  const update = useMutation({
    mutationFn: async ({
      id,
      patch,
      audit,
    }: {
      id: string;
      patch: { payment_status?: string; checked_in_at?: string | null };
      audit: { action: AuditAction; ticketCode: string };
    }) => {
      const { error } = await supabase.from("bookings").update(patch).eq("id", id);
      if (error) throw error;
      await logAudit({
        action: audit.action,
        entityType: "booking",
        entityId: id,
        entityLabel: audit.ticketCode,
        details: patch,
      });
    },
    onSuccess: () => {
      toast.success("Booking updated");
      void queryClient.invalidateQueries({ queryKey: ["staff-bookings"] });
      void queryClient.invalidateQueries({ queryKey: ["staff-audit-log"] });
    },
    onError: (error: Error) => toast.error(error.message),
  });

  if (isLoading) return <p className="text-sm text-muted-foreground">Loading bookings…</p>;

  return (
    <div className="space-y-3">
      {(bookings ?? []).map((booking) => {
        const slot = booking.arena_slots as
          | { slot_date: string; start_time: string; end_time: string }
          | null;
        return (
          <article key={booking.id} className="panel p-4">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <p className="font-display text-2xl tracking-wide">{booking.ticket_code}</p>
                <p className="text-sm text-muted-foreground">
                  {booking.customer_name} · {booking.customer_phone ?? "no phone"}
                </p>
                <p className="mt-1 text-sm">
                  {slot
                    ? `${dateLabel(slot.slot_date)} · ${timeLabel(slot.start_time)} – ${timeLabel(slot.end_time)}`
                    : "—"}
                </p>
              </div>
              <div className="text-right">
                <p className="font-semibold text-primary">{naira(booking.amount)}</p>
                <Badge variant="outline" className={statusTone(booking.payment_status)}>
                  {booking.payment_status}
                </Badge>
              </div>
            </div>

            <div className="mt-3 flex flex-wrap gap-2 text-xs">
              <Badge variant="outline" className="capitalize">
                {booking.booking_type.replace("_", " ")}
              </Badge>
              <Badge variant="outline">{booking.players_count} players</Badge>
              <Badge variant="outline">{booking.goalkeepers_count} GK</Badge>
              {booking.checked_in_at && <Badge>Checked in</Badge>}
            </div>

            <div className="mt-4 flex flex-wrap gap-2">
              {booking.payment_status !== "paid" && (
                <Button
                  size="sm"
                  onClick={() =>
                    update.mutate({
                      id: booking.id,
                      patch: { payment_status: "paid" },
                      audit: {
                        action: "booking.payment_verified",
                        ticketCode: booking.ticket_code,
                      },
                    })
                  }
                >
                  Mark paid
                </Button>
              )}
              {!booking.checked_in_at && (
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() =>
                    update.mutate({
                      id: booking.id,
                      patch: { checked_in_at: new Date().toISOString() },
                      audit: { action: "booking.checked_in", ticketCode: booking.ticket_code },
                    })
                  }
                >
                  Check in
                </Button>
              )}
              {booking.payment_status !== "cancelled" && (
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() =>
                    update.mutate({
                      id: booking.id,
                      patch: { payment_status: "cancelled" },
                      audit: { action: "booking.cancelled", ticketCode: booking.ticket_code },
                    })
                  }
                >
                  Cancel
                </Button>
              )}
            </div>
          </article>
        );
      })}
      {(bookings ?? []).length === 0 && (
        <p className="text-sm text-muted-foreground">No bookings yet.</p>
      )}
    </div>
  );
}
