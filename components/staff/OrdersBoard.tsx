import { useEffect } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { naira, statusTone } from "@/lib/format";
import { logAudit } from "@/lib/audit";

const flow = ["pending", "preparing", "served", "completed"] as const;

type OrderRow = {
  reference_code?: string | null;
  order_type?: string | null;
  total?: number | string | null;
  payment_status?: string | null;
  status?: string | null;
};

type BookingRow = {
  ticket_code?: string | null;
  customer_name?: string | null;
  payment_status?: string | null;
  checked_in_at?: string | null;
};

export function OrdersBoard() {
  const queryClient = useQueryClient();


  const { data: orders, isLoading } = useQuery({
    queryKey: ["staff-orders"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("orders")
        .select(
          "id, reference_code, customer_name, status, total, order_type, created_at, assigned_staff_id, lounge_tables(name), profiles(full_name), order_items(quantity, unit_price, item_name)",
        )
        .order("created_at", { ascending: false })
        .limit(50);
      if (error) throw error;
      return data ?? [];
    },
  });

  useEffect(() => {
    const channel = supabase
      .channel("orders-board")
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "orders" }, (payload) => {
        const order = payload.new as OrderRow;
        toast.success(
          `New ${order.order_type === "qr" ? "table" : "lounge"} order ${order.reference_code ?? ""}`,
          { description: `${naira(Number(order.total ?? 0))} · needs preparing` },
        );
        void queryClient.invalidateQueries({ queryKey: ["staff-orders"] });
      })
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "orders" }, (payload) => {
        const next = payload.new as OrderRow;
        const prev = payload.old as OrderRow;
        if (next.payment_status === "paid" && prev.payment_status !== "paid") {
          toast.success(`Payment received · ${next.reference_code ?? "order"}`, {
            description: naira(Number(next.total ?? 0)),
          });
        }
        void queryClient.invalidateQueries({ queryKey: ["staff-orders"] });
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "bookings" }, (payload) => {
        const next = payload.new as BookingRow | null;
        const prev = payload.old as BookingRow | null;
        if (!next) return;
        if (payload.eventType === "INSERT") {
          toast.info(`New pitch booking ${next.ticket_code ?? ""}`, {
            description: next.customer_name ?? undefined,
          });
          return;
        }
        if (next.payment_status === "paid" && prev?.payment_status !== "paid") {
          toast.success(`Booking payment verified · ${next.ticket_code ?? ""}`);
        }
        if (next.checked_in_at && !prev?.checked_in_at) {
          toast.info(`Ticket checked in · ${next.ticket_code ?? ""}`, {
            description: next.customer_name ?? undefined,
          });
        }
      })
      .subscribe();
    return () => {
      void supabase.removeChannel(channel);
    };
  }, [queryClient]);

  const advance = useMutation({
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
        action:
          status === "completed"
            ? "order.fulfilled"
            : status === "cancelled"
              ? "order.voided"
              : "order.status_changed",
        entityType: "order",
        entityId: id,
        entityLabel: reference,
        details: { status },
      });
    },
    onSuccess: () => {
      toast.success("Order updated");
      void queryClient.invalidateQueries({ queryKey: ["staff-orders"] });
      void queryClient.invalidateQueries({ queryKey: ["kitchen-queue"] });
      void queryClient.invalidateQueries({ queryKey: ["waiter-assignment"] });
      void queryClient.invalidateQueries({ queryKey: ["lounge-operations"] });
      void queryClient.invalidateQueries({ queryKey: ["staff-audit-log"] });
    },
    onError: (error: Error) => toast.error(error.message),
  });

  if (isLoading) return <p className="text-sm text-muted-foreground">Loading orders…</p>;

  return (
    <div className="grid gap-3 md:grid-cols-2">
      {(orders ?? []).map((order) => {
        const table = order.lounge_tables as { name: string } | null;
        const nextIndex = flow.indexOf(order.status as (typeof flow)[number]) + 1;
        const next = nextIndex > 0 && nextIndex < flow.length ? flow[nextIndex] : null;
        return (
          <article key={order.id} className="panel p-4">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="font-display text-2xl tracking-wide">{order.reference_code}</p>
                <p className="text-sm text-muted-foreground">
                  {table?.name ?? "Walk-in"} · {order.customer_name} · {order.order_type}
                </p>
                <p className="text-xs text-muted-foreground">
                  Waiter:{" "}
                  {(order.profiles as { full_name: string } | null)?.full_name?.trim() ||
                    "unassigned"}
                </p>
              </div>
              <Badge variant="outline" className={statusTone(order.status)}>
                {order.status}
              </Badge>
            </div>

            <ul className="mt-3 space-y-1 text-sm">
              {(order.order_items ?? []).map((item, index) => {
                return (
                  <li key={index} className="flex justify-between">
                    <span>
                      {item.quantity}× {item.item_name}
                    </span>
                    <span className="text-muted-foreground">
                      {naira(Number(item.unit_price) * item.quantity)}
                    </span>
                  </li>
                );
              })}
            </ul>

            <div className="mt-3 flex items-center justify-between">
              <span className="font-semibold text-primary">{naira(order.total)}</span>
              <div className="flex gap-2">
                {next && (
                  <Button
                    size="sm"
                    onClick={() =>
                      advance.mutate({
                        id: order.id,
                        status: next,
                        reference: order.reference_code,
                      })
                    }
                  >
                    Mark {next}
                  </Button>
                )}
                {order.status !== "cancelled" && order.status !== "completed" && (
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() =>
                      advance.mutate({
                        id: order.id,
                        status: "cancelled",
                        reference: order.reference_code,
                      })
                    }
                  >
                    Void
                  </Button>
                )}
              </div>
            </div>
          </article>
        );
      })}
      {(orders ?? []).length === 0 && <p className="text-sm text-muted-foreground">No orders yet.</p>}
    </div>
  );
}
