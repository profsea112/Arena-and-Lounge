import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { dateLabel, naira, statusTone } from "@/lib/format";

export function LoungeDesk() {
  const queryClient = useQueryClient();

  const { data, isLoading } = useQuery({
    queryKey: ["staff-reservations"],
    queryFn: async () => {
      const [{ data: reservations, error }, { data: tables }] = await Promise.all([
        supabase
          .from("reservations")
          .select(
            "id, reference_code, customer_name, customer_phone, reserved_date, reserved_time, party_size, status, amount, lounge_tables(name, seats)",
          )
          .order("reserved_date", { ascending: false })
          .limit(60),
        supabase.from("lounge_tables").select("id, name, seats, status, qr_slug").order("name"),
      ]);
      if (error) throw error;
      return { reservations: reservations ?? [], tables: tables ?? [] };
    },
  });

  const setStatus = useMutation({
    mutationFn: async ({ id, status }: { id: string; status: string }) => {
      const { error } = await supabase.from("reservations").update({ status }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Reservation updated");
      void queryClient.invalidateQueries({ queryKey: ["staff-reservations"] });
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const setTableStatus = useMutation({
    mutationFn: async ({ id, status }: { id: string; status: string }) => {
      const { error } = await supabase.from("lounge_tables").update({ status }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Table updated");
      void queryClient.invalidateQueries({ queryKey: ["staff-reservations"] });
    },
    onError: (error: Error) => toast.error(error.message),
  });

  if (isLoading) return <p className="text-sm text-muted-foreground">Loading lounge data…</p>;

  return (
    <div className="grid gap-6 lg:grid-cols-[1.4fr_1fr]">
      <section className="space-y-3">
        <h3 className="text-2xl">Reservations</h3>
        {(data?.reservations ?? []).map((reservation) => {
          const table = reservation.lounge_tables as { name: string; seats: number } | null;
          return (
            <article key={reservation.id} className="panel p-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="font-display text-2xl tracking-wide">{reservation.reference_code}</p>
                  <p className="text-sm text-muted-foreground">
                    {reservation.customer_name} · {reservation.party_size} guests ·{" "}
                    {table?.name ?? "table removed"}
                  </p>
                  <p className="mt-1 text-sm">
                    {dateLabel(reservation.reserved_date)} ·{" "}
                    {String(reservation.reserved_time).slice(0, 5)}
                  </p>
                </div>
                <div className="text-right">
                  <p className="font-semibold text-primary">{naira(reservation.amount)}</p>
                  <Badge variant="outline" className={statusTone(reservation.status)}>
                    {reservation.status}
                  </Badge>
                </div>
              </div>
              <div className="mt-3 flex flex-wrap gap-2">
                <Button
                  size="sm"
                  onClick={() => setStatus.mutate({ id: reservation.id, status: "seated" })}
                >
                  Seat guests
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => setStatus.mutate({ id: reservation.id, status: "completed" })}
                >
                  Complete
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => setStatus.mutate({ id: reservation.id, status: "cancelled" })}
                >
                  Cancel
                </Button>
              </div>
            </article>
          );
        })}
        {(data?.reservations ?? []).length === 0 && (
          <p className="text-sm text-muted-foreground">No reservations yet.</p>
        )}
      </section>

      <section className="space-y-3">
        <h3 className="text-2xl">Tables</h3>
        {(data?.tables ?? []).map((table) => (
          <article key={table.id} className="panel flex items-center justify-between gap-3 p-4">
            <div>
              <p className="font-display text-xl">{table.name}</p>
              <p className="text-xs text-muted-foreground">
                {table.seats} seats · QR: /order/{table.qr_slug}
              </p>
            </div>
            <div className="flex items-center gap-2">
              <Badge variant="outline" className={statusTone(table.status)}>
                {table.status}
              </Badge>
              <Button
                size="sm"
                variant="outline"
                onClick={() =>
                  setTableStatus.mutate({
                    id: table.id,
                    status: table.status === "available" ? "occupied" : "available",
                  })
                }
              >
                Toggle
              </Button>
            </div>
          </article>
        ))}
      </section>
    </div>
  );
}
