import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { naira } from "@/lib/format";
import { logAudit } from "@/lib/audit";

type QueueOrder = {
  id: string;
  reference_code: string;
  customer_name: string;
  status: string;
  total: number | string;
  order_type: string;
  created_at: string;
  lounge_tables: { name: string } | null;
  order_items: { quantity: number; item_name: string; unit_price: number | string }[] | null;
};

const lanes = [
  { key: "pending", title: "New tickets", hint: "Waiting for the kitchen to start" },
  { key: "preparing", title: "In preparation", hint: "Being cooked or poured now" },
  { key: "served", title: "Ready / served", hint: "Handed to a waiter" },
] as const;

function minutesSince(iso: string) {
  return Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 60000));
}

function waitTone(minutes: number) {
  if (minutes >= 20) return "text-destructive";
  if (minutes >= 10) return "text-warning";
  return "text-muted-foreground";
}

export function KitchenQueue() {
  const queryClient = useQueryClient();
  const [tick, setTick] = useState(0);

  useEffect(() => {
    const timer = setInterval(() => setTick((t) => t + 1), 30_000);
    return () => clearInterval(timer);
  }, []);

  const { data: orders, isLoading } = useQuery({
    queryKey: ["kitchen-queue"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("orders")
        .select(
          "id, reference_code, customer_name, status, total, order_type, created_at, lounge_tables(name), order_items(quantity, unit_price, item_name)",
        )
        .in("status", ["pending", "preparing", "served"])
        .order("created_at", { ascending: true })
        .limit(80);
      if (error) throw error;
      return (data ?? []) as unknown as QueueOrder[];
    },
    refetchInterval: 60_000,
  });

  useEffect(() => {
    const channel = supabase
      .channel("kitchen-queue")
      .on("postgres_changes", { event: "*", schema: "public", table: "orders" }, (payload) => {
        const next = payload.new as { status?: string; reference_code?: string } | null;
        if (payload.eventType === "INSERT" && next) {
          toast.info(`Kitchen ticket ${next.reference_code ?? ""}`, {
            description: "New order added to the preparation queue",
          });
        }
        void queryClient.invalidateQueries({ queryKey: ["kitchen-queue"] });
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "order_items" }, () => {
        void queryClient.invalidateQueries({ queryKey: ["kitchen-queue"] });
      })
      .subscribe();
    return () => {
      void supabase.removeChannel(channel);
    };
  }, [queryClient]);

  const setStatus = useMutation({
    mutationFn: async ({
      id,
      status,
      reference,
    }: {
      id: string;
      status: string;
      reference: string;
    }) => {
      const { error } = await supabase.from("orders").update({ status }).eq("id", id);
      if (error) throw error;
      await logAudit({
        action: status === "preparing" ? "order.preparation_started" : "order.prepared",
        entityType: "order",
        entityId: id,
        entityLabel: reference,
        details: { status },
      });
    },
    onSuccess: () => {
      toast.success("Kitchen ticket updated");
      void queryClient.invalidateQueries({ queryKey: ["kitchen-queue"] });
      void queryClient.invalidateQueries({ queryKey: ["staff-orders"] });
      void queryClient.invalidateQueries({ queryKey: ["staff-audit-log"] });
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const grouped = useMemo(() => {
    const map: Record<string, QueueOrder[]> = { pending: [], preparing: [], served: [] };
    for (const order of orders ?? []) {
      (map[order.status] ??= []).push(order);
    }
    return map;
  }, [orders]);

  const waiting = (grouped["pending"]?.length ?? 0) + (grouped["preparing"]?.length ?? 0);
  const oldest = (orders ?? [])
    .filter((o) => o.status !== "served")
    .reduce((max, o) => Math.max(max, minutesSince(o.created_at)), 0);

  if (isLoading) return <p className="text-sm text-muted-foreground">Loading kitchen queue…</p>;

  return (
    <div className="space-y-5" key={tick}>
      <div className="grid gap-3 sm:grid-cols-3">
        {[
          ["Tickets open", String(waiting)],
          ["Longest wait", `${oldest} min`],
          ["Ready for pickup", String(grouped["served"]?.length ?? 0)],
        ].map(([label, value]) => (
          <div key={label} className="panel p-4">
            <p className="text-xs uppercase tracking-widest text-muted-foreground">{label}</p>
            <p className="font-display text-3xl text-primary">{value}</p>
          </div>
        ))}
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        {lanes.map((lane) => {
          const items = grouped[lane.key] ?? [];
          return (
            <section key={lane.key} className="space-y-3">
              <header>
                <h3 className="text-2xl">
                  {lane.title}{" "}
                  <span className="font-display text-lg text-primary">({items.length})</span>
                </h3>
                <p className="text-xs text-muted-foreground">{lane.hint}</p>
              </header>

              {items.map((order) => {
                const minutes = minutesSince(order.created_at);
                return (
                  <article key={order.id} className="panel p-4">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="font-display text-xl tracking-wide">{order.reference_code}</p>
                        <p className="text-sm text-muted-foreground">
                          {order.lounge_tables?.name ?? "Walk-in"} · {order.customer_name}
                        </p>
                      </div>
                      <span className={`text-sm font-semibold ${waitTone(minutes)}`}>
                        {minutes}m
                      </span>
                    </div>

                    <ul className="mt-3 space-y-1 text-sm">
                      {(order.order_items ?? []).map((item, index) => (
                        <li key={index} className="flex justify-between gap-2">
                          <span>
                            <span className="font-display text-primary">{item.quantity}×</span>{" "}
                            {item.item_name}
                          </span>
                        </li>
                      ))}
                      {(order.order_items ?? []).length === 0 && (
                        <li className="text-muted-foreground">No items recorded</li>
                      )}
                    </ul>

                    <div className="mt-3 flex items-center justify-between gap-2">
                      <Badge variant="outline">{naira(order.total)}</Badge>
                      {lane.key === "pending" && (
                        <Button
                          size="sm"
                          onClick={() =>
                            setStatus.mutate({
                              id: order.id,
                              status: "preparing",
                              reference: order.reference_code,
                            })
                          }
                        >
                          Start preparing
                        </Button>
                      )}
                      {lane.key === "preparing" && (
                        <Button
                          size="sm"
                          onClick={() =>
                            setStatus.mutate({
                              id: order.id,
                              status: "served",
                              reference: order.reference_code,
                            })
                          }
                        >
                          Mark ready
                        </Button>
                      )}
                      {lane.key === "served" && (
                        <span className="text-xs text-muted-foreground">Awaiting delivery</span>
                      )}
                    </div>
                  </article>
                );
              })}

              {items.length === 0 && (
                <p className="text-sm text-muted-foreground">Nothing here right now.</p>
              )}
            </section>
          );
        })}
      </div>
    </div>
  );
}
