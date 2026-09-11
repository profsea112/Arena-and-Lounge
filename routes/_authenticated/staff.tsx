import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";

import { supabase } from "@/integrations/supabase/client";
import { useStaffAccess } from "@/hooks/useStaffAccess";
import { SiteHeader } from "@/components/SiteHeader";
import { ArenaDesk } from "@/components/staff/ArenaDesk";
import { LoungeDesk } from "@/components/staff/LoungeDesk";
import { LoungeOperations } from "@/components/staff/LoungeOperations";
import { KitchenQueue } from "@/components/staff/KitchenQueue";
import { WaiterAssignment } from "@/components/staff/WaiterAssignment";
import { OrdersBoard } from "@/components/staff/OrdersBoard";
import { InventoryPanel } from "@/components/staff/InventoryPanel";
import { TeamPanel } from "@/components/staff/TeamPanel";
import { AuditLogPanel } from "@/components/staff/AuditLogPanel";
import { logAudit } from "@/lib/audit";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { naira, todayISO } from "@/lib/format";

export const Route = createFileRoute("/_authenticated/staff")({
  head: () => ({
    meta: [
      { title: "Staff Console — M25" },
      {
        name: "description",
        content: "Manage pitch bookings, check-ins, lounge tables, live orders, inventory and staff roles.",
      },
    ],
  }),
  component: StaffConsole,
});

function StaffConsole() {
  const navigate = useNavigate();
  const { data: access, isLoading: loading } = useStaffAccess();
  const isAdmin = access?.isAdmin ?? false;
  const isStaff = (access?.hasAnyRole ?? false);
  const email = access?.email ?? "";

  const { data: today } = useQuery({
    queryKey: ["staff-today"],
    queryFn: async () => {
      const date = todayISO();
      const [bookings, reservations, orders] = await Promise.all([
        supabase
          .from("bookings")
          .select("amount, arena_slots!inner(slot_date)")
          .eq("arena_slots.slot_date", date),
        supabase.from("reservations").select("id").eq("reserved_date", date),
        supabase.from("orders").select("total, created_at").gte("created_at", `${date}T00:00:00`),
      ]);
      const bookingRevenue = (bookings.data ?? []).reduce((s, b) => s + Number(b.amount ?? 0), 0);
      const orderRevenue = (orders.data ?? []).reduce((s, o) => s + Number(o.total ?? 0), 0);
      return {
        bookings: (bookings.data ?? []).length,
        reservations: (reservations.data ?? []).length,
        orders: (orders.data ?? []).length,
        revenue: bookingRevenue + orderRevenue,
      };
    },
    enabled: isStaff,
  });

  const signOut = async () => {
    await logAudit({ action: "staff.sign_out", entityType: "session" });
    await supabase.auth.signOut();
    void navigate({ to: "/auth" });
  };

  if (loading) {
    return (
      <div className="min-h-screen">
        <SiteHeader />
        <p className="mx-auto max-w-6xl px-4 py-12 text-sm text-muted-foreground">Checking access…</p>
      </div>
    );
  }

  if (!isStaff) {
    return (
      <div className="min-h-screen">
        <SiteHeader />
        <main className="mx-auto max-w-6xl px-4 py-12">
          <h1 className="text-4xl">Waiting for access</h1>
          <p className="mt-2 max-w-lg text-muted-foreground">
            You're signed in as {email}, but no staff role has been assigned yet. Ask an administrator
            to grant you access.
          </p>
          <div className="mt-6">
            <TeamPanel isAdmin={false} />
          </div>
          <Button className="mt-6" variant="outline" onClick={signOut}>
            Sign out
          </Button>
        </main>
      </div>
    );
  }

  return (
    <div className="min-h-screen">
      <SiteHeader />
      <main className="mx-auto max-w-6xl px-4 py-8">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-4xl">Staff console</h1>
            <p className="text-sm text-muted-foreground">
              {email} {isAdmin && <Badge className="ml-1">Admin</Badge>}
            </p>
          </div>
          <div className="flex items-center gap-2">
            {access?.isOps && (
              <Button asChild size="sm">
                <Link to="/admin">Admin dashboard</Link>
              </Button>
            )}
            <Button variant="outline" onClick={signOut}>
              Sign out
            </Button>
          </div>
        </div>

        <div className="mt-6 grid gap-3 sm:grid-cols-4">
          {[
            ["Today's bookings", String(today?.bookings ?? 0)],
            ["Reservations", String(today?.reservations ?? 0)],
            ["Orders", String(today?.orders ?? 0)],
            ["Revenue", naira(today?.revenue ?? 0)],
          ].map(([label, value]) => (
            <div key={label} className="panel p-4">
              <p className="text-xs uppercase tracking-widest text-muted-foreground">{label}</p>
              <p className="font-display text-3xl text-primary">{value}</p>
            </div>
          ))}
        </div>

        <Tabs defaultValue="arena" className="mt-8">
          <TabsList className="flex-wrap">
            <TabsTrigger value="arena">Arena desk</TabsTrigger>
            <TabsTrigger value="lounge">Lounge ops</TabsTrigger>
            <TabsTrigger value="kitchen">Kitchen</TabsTrigger>
            <TabsTrigger value="waiters">Waiters</TabsTrigger>
            <TabsTrigger value="orders">Orders</TabsTrigger>
            <TabsTrigger value="inventory">Inventory</TabsTrigger>
            <TabsTrigger value="team">Team</TabsTrigger>
            <TabsTrigger value="activity">Activity log</TabsTrigger>
          </TabsList>
          <TabsContent value="arena" className="mt-5">
            <ArenaDesk />
          </TabsContent>
          <TabsContent value="lounge" className="mt-5 space-y-8">
            <LoungeOperations />
            <LoungeDesk />
          </TabsContent>
          <TabsContent value="kitchen" className="mt-5">
            <KitchenQueue />
          </TabsContent>
          <TabsContent value="waiters" className="mt-5">
            <WaiterAssignment />
          </TabsContent>
          <TabsContent value="orders" className="mt-5">
            <OrdersBoard />
          </TabsContent>
          <TabsContent value="inventory" className="mt-5">
            <InventoryPanel />
          </TabsContent>
          <TabsContent value="team" className="mt-5">
            <TeamPanel isAdmin={isAdmin} />
          </TabsContent>
          <TabsContent value="activity" className="mt-5">
            <AuditLogPanel />
          </TabsContent>
        </Tabs>
      </main>
    </div>
  );
}
