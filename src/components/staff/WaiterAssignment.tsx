import { useEffect, useMemo } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { naira, statusTone } from "@/lib/format";
import { logAudit } from "@/lib/audit";
import { useStaffAccess } from "@/hooks/useStaffAccess";

type AssignOrder = {
  id: string;
  reference_code: string;
  customer_name: string;
  status: string;
  total: number | string;
  created_at: string;
  assigned_staff_id: string | null;
  lounge_tables: { name: string } | null;
};

export function WaiterAssignment() {
  const queryClient = useQueryClient();
  const { data: access } = useStaffAccess();

  const { data, isLoading } = useQuery({
    queryKey: ["waiter-assignment"],
    queryFn: async () => {
      const [orders, staff] = await Promise.all([
        supabase
          .from("orders")
          .select(
            "id, reference_code, customer_name, status, total, created_at, assigned_staff_id, lounge_tables(name)",
          )
          .in("status", ["pending", "preparing", "served"])
          .order("created_at", { ascending: true })
          .limit(80),
        supabase.from("profiles").select("id, full_name").order("full_name"),
      ]);
      if (orders.error) throw orders.error;
      return {
        orders: (orders.data ?? []) as unknown as AssignOrder[],
        staff: (staff.data ?? []) as { id: string; full_name: string }[],
      };
    },
  });

  useEffect(() => {
    const channel = supabase
      .channel("waiter-assignment")
      .on("postgres_changes", { event: "*", schema: "public", table: "orders" }, () => {
        void queryClient.invalidateQueries({ queryKey: ["waiter-assignment"] });
      })
      .subscribe();
    return () => {
      void supabase.removeChannel(channel);
    };
  }, [queryClient]);

  const assign = useMutation({
    mutationFn: async ({
      id,
      staffId,
      reference,
      staffLabel,
    }: {
      id: string;
      staffId: string | null;
      reference: string;
      staffLabel: string;
    }) => {
      const { error } = await supabase
        .from("orders")
        .update({ assigned_staff_id: staffId })
        .eq("id", id);
      if (error) throw error;
      await logAudit({
        action: staffId ? "order.assigned" : "order.unassigned",
        entityType: "order",
        entityId: id,
        entityLabel: reference,
        details: { staffId, staffLabel },
      });
    },
    onSuccess: () => {
      toast.success("Waiter assignment updated");
      void queryClient.invalidateQueries({ queryKey: ["waiter-assignment"] });
      void queryClient.invalidateQueries({ queryKey: ["staff-orders"] });
      void queryClient.invalidateQueries({ queryKey: ["staff-audit-log"] });
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const staffName = (id: string | null) =>
    (data?.staff ?? []).find((s) => s.id === id)?.full_name?.trim() || "Unnamed staff";

  const { unassigned, assigned, workload } = useMemo(() => {
    const orders = data?.orders ?? [];
    const load = new Map<string, number>();
    for (const order of orders) {
      if (order.assigned_staff_id) {
        load.set(order.assigned_staff_id, (load.get(order.assigned_staff_id) ?? 0) + 1);
      }
    }
    return {
      unassigned: orders.filter((o) => !o.assigned_staff_id),
      assigned: orders.filter((o) => o.assigned_staff_id),
      workload: load,
    };
  }, [data]);

  if (isLoading) return <p className="text-sm text-muted-foreground">Loading assignments…</p>;

  const renderRow = (order: AssignOrder) => (
    <article key={order.id} className="panel p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="font-display text-xl tracking-wide">{order.reference_code}</p>
          <p className="text-sm text-muted-foreground">
            {order.lounge_tables?.name ?? "Walk-in"} · {order.customer_name} · {naira(order.total)}
          </p>
        </div>
        <Badge variant="outline" className={statusTone(order.status)}>
          {order.status}
        </Badge>
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-2">
        <Select
          value={order.assigned_staff_id ?? "unassigned"}
          onValueChange={(value) =>
            assign.mutate({
              id: order.id,
              staffId: value === "unassigned" ? null : value,
              reference: order.reference_code,
              staffLabel: value === "unassigned" ? "unassigned" : staffName(value),
            })
          }
        >
          <SelectTrigger className="w-56">
            <SelectValue placeholder="Assign a waiter" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="unassigned">Unassigned</SelectItem>
            {(data?.staff ?? []).map((member) => (
              <SelectItem key={member.id} value={member.id}>
                {member.full_name?.trim() || "Unnamed staff"}
                {workload.get(member.id) ? ` · ${workload.get(member.id)} open` : ""}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        {access?.userId && order.assigned_staff_id !== access.userId && (
          <Button
            size="sm"
            variant="outline"
            onClick={() =>
              assign.mutate({
                id: order.id,
                staffId: access.userId,
                reference: order.reference_code,
                staffLabel: access.email ?? "me",
              })
            }
          >
            Claim
          </Button>
        )}
      </div>
    </article>
  );

  return (
    <div className="space-y-6">
      <div className="grid gap-3 sm:grid-cols-3">
        {[
          ["Unassigned orders", String(unassigned.length)],
          ["Assigned & active", String(assigned.length)],
          ["Waiters on duty", String(workload.size)],
        ].map(([label, value]) => (
          <div key={label} className="panel p-4">
            <p className="text-xs uppercase tracking-widest text-muted-foreground">{label}</p>
            <p className="font-display text-3xl text-primary">{value}</p>
          </div>
        ))}
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <section className="space-y-3">
          <h3 className="text-2xl">Needs a waiter</h3>
          {unassigned.map(renderRow)}
          {unassigned.length === 0 && (
            <p className="text-sm text-muted-foreground">Every open order has a waiter.</p>
          )}
        </section>

        <section className="space-y-3">
          <h3 className="text-2xl">Assigned</h3>
          {assigned.map((order) => (
            <div key={order.id} className="space-y-1">
              <p className="text-xs uppercase tracking-widest text-muted-foreground">
                {staffName(order.assigned_staff_id)}
              </p>
              {renderRow(order)}
            </div>
          ))}
          {assigned.length === 0 && (
            <p className="text-sm text-muted-foreground">No assignments yet.</p>
          )}
        </section>
      </div>
    </div>
  );
}
