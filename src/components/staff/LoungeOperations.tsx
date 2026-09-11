import { useEffect, useMemo } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { naira, statusTone, timeLabel, todayISO } from "@/lib/format";
import { logAudit } from "@/lib/audit";

type TableRow = { id: string; name: string; seats: number; status: string; qr_slug: string };
type OpenOrder = {
  id: string;
  reference_code: string;
  status: string;
  total: number | string;
  table_id: string | null;
  assigned_staff_id: string | null;
  created_at: string;
};
type Reservation = {
  id: string;
  reference_code: string;
  customer_name: string;
  party_size: number;
  reserved_time: string;
  status: string;
  table_id: string | null;
};

export function LoungeOperations() {
  const queryClient = useQueryClient();

  const { data, isLoading } = useQuery({
    queryKey: ["lounge-operations"],
    queryFn: async () => {
      const date = todayISO();
      const [tables, orders, reservations] = await Promise.all([
        supabase.from("lounge_tables").select("id, name, seats, status, qr_slug").order("name"),
        supabase
          .from("orders")
          .select("id, reference_code, status, total, table_id, assigned_staff_id, created_at")
          .in("status", ["pending", "preparing", "served"])
          .order("created_at", { ascending: true }),
        supabase
          .from("reservations")
          .select(
            "id, reference_code, customer_name, party_size, reserved_time, status, table_id",
          )
          .eq("reserved_date", date)
          .order("reserved_time"),
      ]);
      if (tables.error) throw tables.error;
      return {
        tables: (tables.data ?? []) as TableRow[],
        orders: (orders.data ?? []) as unknown as OpenOrder[],
        reservations: (reservations.data ?? []) as unknown as Reservation[],
      };
    },
  });

  useEffect(() => {
    const channel = supabase
      .channel("lounge-operations")
      .on("postgres_changes", { event: "*", schema: "public", table: "orders" }, () => {
        void queryClient.invalidateQueries({ queryKey: ["lounge-operations"] });
      })
      .subscribe();
    return () => {
      void supabase.removeChannel(channel);
    };
  }, [queryClient]);

  const setTableStatus = useMutation({
    mutationFn: async ({ id, status, name }: { id: string; status: string; name: string }) => {
      const { error } = await supabase.from("lounge_tables").update({ status }).eq("id", id);
      if (error) throw error;
      await logAudit({
        action: "table.status_changed",
        entityType: "table",
        entityId: id,
        entityLabel: name,
        details: { status },
      });
    },
    onSuccess: () => {
      toast.success("Table updated");
      void queryClient.invalidateQueries({ queryKey: ["lounge-operations"] });
      void queryClient.invalidateQueries({ queryKey: ["staff-reservations"] });
      void queryClient.invalidateQueries({ queryKey: ["staff-audit-log"] });
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const summary = useMemo(() => {
    const orders = data?.orders ?? [];
    return {
      openOrders: orders.length,
      openValue: orders.reduce((sum, o) => sum + Number(o.total ?? 0), 0),
      unassigned: orders.filter((o) => !o.assigned_staff_id).length,
      readyToServe: orders.filter((o) => o.status === "served").length,
      occupied: (data?.tables ?? []).filter((t) => t.status !== "available").length,
      arrivals: (data?.reservations ?? []).filter((r) => r.status === "confirmed").length,
    };
  }, [data]);

  if (isLoading) return <p className="text-sm text-muted-foreground">Loading lounge floor…</p>;

  return (
    <div className="space-y-6">
      <div className="grid gap-3 sm:grid-cols-3 lg:grid-cols-6">
        {[
          ["Open orders", String(summary.openOrders)],
          ["Open value", naira(summary.openValue)],
          ["No waiter", String(summary.unassigned)],
          ["Ready to serve", String(summary.readyToServe)],
          ["Tables in use", String(summary.occupied)],
          ["Arrivals due", String(summary.arrivals)],
        ].map(([label, value]) => (
          <div key={label} className="panel p-4">
            <p className="text-xs uppercase tracking-widest text-muted-foreground">{label}</p>
            <p className="font-display text-2xl text-primary">{value}</p>
          </div>
        ))}
      </div>

      <section className="space-y-3">
        <h3 className="text-2xl">Floor plan</h3>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {(data?.tables ?? []).map((table) => {
            const tableOrders = (data?.orders ?? []).filter((o) => o.table_id === table.id);
            const tableReservations = (data?.reservations ?? []).filter(
              (r) => r.table_id === table.id,
            );
            const value = tableOrders.reduce((sum, o) => sum + Number(o.total ?? 0), 0);
            return (
              <article key={table.id} className="panel space-y-3 p-4">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <p className="font-display text-xl">{table.name}</p>
                    <p className="text-xs text-muted-foreground">{table.seats} seats</p>
                  </div>
                  <Badge variant="outline" className={statusTone(table.status)}>
                    {table.status}
                  </Badge>
                </div>

                <div className="text-sm">
                  {tableOrders.length > 0 ? (
                    <ul className="space-y-1">
                      {tableOrders.map((order) => (
                        <li key={order.id} className="flex justify-between gap-2">
                          <span>{order.reference_code}</span>
                          <span className={statusTone(order.status)}>{order.status}</span>
                        </li>
                      ))}
                      <li className="flex justify-between border-t border-border pt-1 font-semibold text-primary">
                        <span>Running tab</span>
                        <span>{naira(value)}</span>
                      </li>
                    </ul>
                  ) : (
                    <p className="text-muted-foreground">No open orders</p>
                  )}
                </div>

                {tableReservations.length > 0 && (
                  <ul className="space-y-1 text-xs text-muted-foreground">
                    {tableReservations.map((r) => (
                      <li key={r.id}>
                        {timeLabel(String(r.reserved_time).slice(0, 5))} · {r.customer_name} ·{" "}
                        {r.party_size} guests · {r.status}
                      </li>
                    ))}
                  </ul>
                )}

                <div className="flex flex-wrap gap-2">
                  {["available", "occupied", "reserved"].map((status) => (
                    <Button
                      key={status}
                      size="sm"
                      variant={table.status === status ? "default" : "outline"}
                      onClick={() =>
                        setTableStatus.mutate({ id: table.id, status, name: table.name })
                      }
                    >
                      {status}
                    </Button>
                  ))}
                </div>
              </article>
            );
          })}
        </div>
        {(data?.tables ?? []).length === 0 && (
          <p className="text-sm text-muted-foreground">No lounge tables configured yet.</p>
        )}
      </section>
    </div>
  );
}
