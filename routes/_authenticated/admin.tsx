import { useMemo, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import { supabase } from "@/integrations/supabase/client";
import { useStaffAccess } from "@/hooks/useStaffAccess";
import { SiteHeader } from "@/components/SiteHeader";
import { InventoryEditor } from "@/components/staff/InventoryEditor";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { naira, dateLabel } from "@/lib/format";

export const Route = createFileRoute("/_authenticated/admin")({
  head: () => ({
    meta: [
      { title: "Admin Dashboard — M25" },
      {
        name: "description",
        content:
          "Monitor M25 ticket bookings, lounge sales and stock levels, and edit inventory and menu pricing.",
      },
      { property: "og:title", content: "Admin Dashboard — M25" },
      {
        property: "og:description",
        content: "Bookings, sales and inventory oversight for the M25 arena and lounge.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: AdminDashboard,
});

function daysBack(n: number) {
  const out: string[] = [];
  for (let i = n - 1; i >= 0; i -= 1) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    out.push(d.toISOString().slice(0, 10));
  }
  return out;
}

function AdminDashboard() {
  const { data: access, isLoading } = useStaffAccess();
  const isAdmin = access?.isAdmin ?? false;
  const isOps = access?.isOps ?? false;
  const [range, setRange] = useState(7);
  const days = useMemo(() => daysBack(range), [range]);
  const from = days[0]!;

  const { data, isLoading: loadingStats } = useQuery({
    queryKey: ["admin-overview", range],
    enabled: isOps,
    queryFn: async () => {
      const [bookings, reservations, orders, orderItems, stock] = await Promise.all([
        supabase
          .from("bookings")
          .select(
            "id, amount, payment_status, booking_type, players_count, goalkeepers_count, checked_in_at, created_at",
          )
          .gte("created_at", `${from}T00:00:00`),
        supabase.from("reservations").select("id, amount, created_at").gte("created_at", `${from}T00:00:00`),
        supabase
          .from("orders")
          .select("id, total, status, payment_status, order_type, created_at")
          .gte("created_at", `${from}T00:00:00`),
        supabase
          .from("order_items")
          .select("item_name, quantity, unit_price, orders!inner(created_at)")
          .gte("orders.created_at", `${from}T00:00:00`),
        supabase
          .from("inventory_items")
          .select("id, name, unit, quantity, low_stock_threshold")
          .order("quantity"),
      ]);

      const b = bookings.data ?? [];
      const r = reservations.data ?? [];
      const o = orders.data ?? [];

      const byDay = days.map((day) => {
        const inDay = (created: string | null) => (created ?? "").slice(0, 10) === day;
        const ticketSales = b
          .filter((x) => inDay(x.created_at) && x.payment_status === "paid")
          .reduce((s, x) => s + Number(x.amount ?? 0), 0);
        const loungeSales =
          o
            .filter((x) => inDay(x.created_at) && x.payment_status === "paid")
            .reduce((s, x) => s + Number(x.total ?? 0), 0) +
          r
            .filter((x) => inDay(x.created_at))
            .reduce((s, x) => s + Number(x.amount ?? 0), 0);
        return {
          day,
          label: dateLabel(day),
          tickets: b.filter((x) => inDay(x.created_at)).length,
          orders: o.filter((x) => inDay(x.created_at)).length,
          ticketSales,
          loungeSales,
          total: ticketSales + loungeSales,
        };
      });

      const topItems = Object.values(
        (orderItems.data ?? []).reduce<Record<string, { name: string; qty: number; value: number }>>(
          (acc, row) => {
            const key = row.item_name;
            const entry = acc[key] ?? { name: key, qty: 0, value: 0 };
            entry.qty += Number(row.quantity ?? 0);
            entry.value += Number(row.quantity ?? 0) * Number(row.unit_price ?? 0);
            acc[key] = entry;
            return acc;
          },
          {},
        ),
      )
        .sort((a, z) => z.value - a.value)
        .slice(0, 8);

      const stockRows = stock.data ?? [];

      return {
        byDay,
        topItems,
        lowStock: stockRows.filter((s) => Number(s.quantity) <= Number(s.low_stock_threshold)),
        stockCount: stockRows.length,
        tickets: b.length,
        ticketsPaid: b.filter((x) => x.payment_status === "paid").length,
        ticketsPending: b.filter((x) => x.payment_status !== "paid").length,
        checkedIn: b.filter((x) => x.checked_in_at).length,
        fullPitch: b.filter((x) => x.booking_type === "full_pitch").length,
        keepers: b.reduce((s, x) => s + Number(x.goalkeepers_count ?? 0), 0),
        orders: o.length,
        openOrders: o.filter((x) => ["pending", "preparing"].includes(x.status)).length,
        reservations: r.length,
        ticketRevenue: byDay.reduce((s, d) => s + d.ticketSales, 0),
        loungeRevenue: byDay.reduce((s, d) => s + d.loungeSales, 0),
      };
    },
  });

  if (isLoading) {
    return (
      <div className="min-h-screen">
        <SiteHeader />
        <p className="mx-auto max-w-6xl px-4 py-12 text-sm text-muted-foreground">Checking access…</p>
      </div>
    );
  }

  if (!isOps) {
    return (
      <div className="min-h-screen">
        <SiteHeader />
        <main className="mx-auto max-w-6xl px-4 py-12">
          <h1 className="text-4xl">Admins only</h1>
          <p className="mt-2 text-muted-foreground">
            This dashboard is limited to administrators and operations managers.
          </p>
          <Button asChild className="mt-6" variant="outline">
            <Link to="/staff">Back to staff console</Link>
          </Button>
        </main>
      </div>
    );
  }

  const revenue = (data?.ticketRevenue ?? 0) + (data?.loungeRevenue ?? 0);

  const cards: [string, string, string][] = [
    ["Total sales", naira(revenue), `Last ${range} days`],
    ["Ticket sales", naira(data?.ticketRevenue ?? 0), `${data?.ticketsPaid ?? 0} paid tickets`],
    ["Lounge sales", naira(data?.loungeRevenue ?? 0), `${data?.orders ?? 0} orders`],
    ["Bookings", String(data?.tickets ?? 0), `${data?.checkedIn ?? 0} checked in`],
    ["Awaiting payment", String(data?.ticketsPending ?? 0), "Tickets unpaid"],
    ["Open orders", String(data?.openOrders ?? 0), "Pending or preparing"],
    ["Reservations", String(data?.reservations ?? 0), "Lounge tables"],
    ["Low stock", String(data?.lowStock.length ?? 0), `of ${data?.stockCount ?? 0} items`],
  ];

  return (
    <div className="min-h-screen">
      <SiteHeader />
      <main className="mx-auto max-w-6xl px-4 py-8">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-4xl">Admin dashboard</h1>
            <p className="text-sm text-muted-foreground">
              {access?.email} {isAdmin && <Badge className="ml-1">Admin</Badge>}
            </p>
          </div>
          <div className="flex items-center gap-2">
            {[7, 30, 90].map((n) => (
              <Button
                key={n}
                size="sm"
                variant={range === n ? "default" : "outline"}
                onClick={() => setRange(n)}
              >
                {n}d
              </Button>
            ))}
            <Button asChild size="sm" variant="ghost">
              <Link to="/staff">Staff console</Link>
            </Button>
          </div>
        </div>

        <div className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {cards.map(([label, value, hint]) => (
            <div key={label} className="panel p-4">
              <p className="text-xs uppercase tracking-widest text-muted-foreground">{label}</p>
              <p className="font-display text-3xl text-primary">{value}</p>
              <p className="text-xs text-muted-foreground">{hint}</p>
            </div>
          ))}
        </div>

        <Tabs defaultValue="sales" className="mt-8">
          <TabsList className="flex-wrap">
            <TabsTrigger value="sales">Sales</TabsTrigger>
            <TabsTrigger value="tickets">Tickets</TabsTrigger>
            <TabsTrigger value="inventory">Inventory</TabsTrigger>
          </TabsList>

          <TabsContent value="sales" className="mt-5 space-y-6">
            <section className="panel p-4">
              <h2 className="text-2xl">Daily sales</h2>
              {loadingStats ? (
                <p className="mt-2 text-sm text-muted-foreground">Loading…</p>
              ) : (
                <div className="mt-4 h-72">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={data?.byDay ?? []}>
                      <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                      <XAxis dataKey="label" tick={{ fontSize: 11 }} />
                      <YAxis tick={{ fontSize: 11 }} tickFormatter={(v) => `${Number(v) / 1000}k`} />
                      <Tooltip
                        formatter={(v: number) => naira(v)}
                        contentStyle={{
                          background: "hsl(var(--card))",
                          border: "1px solid hsl(var(--border))",
                          borderRadius: 8,
                          fontSize: 12,
                        }}
                      />
                      <Bar dataKey="ticketSales" name="Tickets" fill="var(--color-primary)" radius={4} />
                      <Bar dataKey="loungeSales" name="Lounge" fill="var(--color-accent)" radius={4} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              )}
            </section>

            <section className="panel p-4">
              <h2 className="text-2xl">Best selling items</h2>
              <ul className="mt-3 space-y-2">
                {(data?.topItems ?? []).map((item) => (
                  <li
                    key={item.name}
                    className="flex items-center justify-between rounded-lg border border-border bg-secondary/40 px-3 py-2 text-sm"
                  >
                    <span>{item.name}</span>
                    <span className="text-muted-foreground">
                      {item.qty} sold · {naira(item.value)}
                    </span>
                  </li>
                ))}
                {(data?.topItems ?? []).length === 0 && (
                  <li className="text-sm text-muted-foreground">No sales in this period yet.</li>
                )}
              </ul>
            </section>
          </TabsContent>

          <TabsContent value="tickets" className="mt-5 space-y-6">
            <section className="panel p-4">
              <h2 className="text-2xl">Tickets booked per day</h2>
              <div className="mt-4 h-72">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={data?.byDay ?? []}>
                    <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                    <XAxis dataKey="label" tick={{ fontSize: 11 }} />
                    <YAxis allowDecimals={false} tick={{ fontSize: 11 }} />
                    <Tooltip
                      contentStyle={{
                        background: "hsl(var(--card))",
                        border: "1px solid hsl(var(--border))",
                        borderRadius: 8,
                        fontSize: 12,
                      }}
                    />
                    <Line
                      type="monotone"
                      dataKey="tickets"
                      name="Tickets"
                      stroke="var(--color-primary)"
                      strokeWidth={2}
                    />
                    <Line
                      type="monotone"
                      dataKey="orders"
                      name="Orders"
                      stroke="var(--color-accent)"
                      strokeWidth={2}
                    />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </section>

            <div className="grid gap-3 sm:grid-cols-4">
              {[
                ["Paid", String(data?.ticketsPaid ?? 0)],
                ["Unpaid", String(data?.ticketsPending ?? 0)],
                ["Full pitch", String(data?.fullPitch ?? 0)],
                ["Goalkeepers", String(data?.keepers ?? 0)],
              ].map(([label, value]) => (
                <div key={label} className="panel p-4">
                  <p className="text-xs uppercase tracking-widest text-muted-foreground">{label}</p>
                  <p className="font-display text-3xl text-primary">{value}</p>
                </div>
              ))}
            </div>
          </TabsContent>

          <TabsContent value="inventory" className="mt-5 space-y-6">
            {(data?.lowStock.length ?? 0) > 0 && (
              <section className="panel p-4">
                <h2 className="text-2xl">Low stock alerts</h2>
                <ul className="mt-3 flex flex-wrap gap-2">
                  {(data?.lowStock ?? []).map((item) => (
                    <Badge key={item.id} variant="destructive">
                      {item.name} · {item.quantity} {item.unit}
                    </Badge>
                  ))}
                </ul>
              </section>
            )}
            <InventoryEditor />
          </TabsContent>
        </Tabs>
      </main>
    </div>
  );
}
