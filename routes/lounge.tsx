import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";

import { SiteFooter, SiteHeader } from "@/components/SiteHeader";
import { MenuPicker, cartTotal, useMenu, type Cart } from "@/components/MenuPicker";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { createLoungeReservation, listLoungeAvailability } from "@/lib/public.functions";
import { naira, todayISO } from "@/lib/format";

export const Route = createFileRoute("/lounge")({
  head: () => ({
    meta: [
      { title: "Lounge Reservations & Menu — M25 Lounge" },
      {
        name: "description",
        content:
          "Reserve a lounge table, browse the live food and drinks menu and pre-order so everything is ready when you arrive.",
      },
      { property: "og:title", content: "Lounge Reservations & Menu — M25 Lounge" },
      { property: "og:description", content: "Reserve a table and pre-order food and drinks." },
    ],
  }),
  component: LoungePage,
});

const times = ["12:00", "14:00", "16:00", "18:00", "20:00", "22:00"];

function LoungePage() {
  const availability = useServerFn(listLoungeAvailability);
  const reserve = useServerFn(createLoungeReservation);
  const { data: menu } = useMenu();

  const [date, setDate] = useState(todayISO());
  const [time, setTime] = useState(times[2]!);
  const [tableId, setTableId] = useState<string | null>(null);
  const [guests, setGuests] = useState(2);
  const [customer, setCustomer] = useState({ name: "", email: "", phone: "" });
  const [cart, setCart] = useState<Cart>({});
  const [code, setCode] = useState<string | null>(null);

  const { data: tables, refetch } = useQuery({
    queryKey: ["lounge-availability", date],
    queryFn: () => availability({ data: { fromDate: date } }),
  });

  const preorderTotal = cartTotal(cart, menu?.items ?? []);

  const mutation = useMutation({
    mutationFn: async () => {
      if (!tableId) throw new Error("Pick a table first.");
      return reserve({
        data: {
          tableId,
          reservedDate: date,
          reservedTime: time,
          partySize: guests,
          customerName: customer.name,
          customerEmail: customer.email,
          customerPhone: customer.phone,
          items: Object.entries(cart).map(([menuItemId, quantity]) => ({ menuItemId, quantity })),
        },
      });
    },
    onSuccess: (result) => {
      setCode(result.referenceCode);
      setCart({});
      toast.success("Table reserved");
      void refetch();
    },
    onError: (error: Error) => toast.error(error.message),
  });

  return (
    <div className="min-h-screen">
      <SiteHeader />
      <main className="mx-auto max-w-6xl px-4 py-10">
        <h1 className="text-4xl md:text-5xl">The lounge</h1>
        <p className="mt-2 max-w-2xl text-muted-foreground">
          Reserve a table for after the match and pre-order from the kitchen and bar.
        </p>

        <div className="mt-8 grid gap-6 lg:grid-cols-[1fr_1fr]">
          <section className="panel space-y-5 p-5">
            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <Label htmlFor="date">Date</Label>
                <Input
                  id="date"
                  type="date"
                  min={todayISO()}
                  value={date}
                  onChange={(e) => setDate(e.target.value)}
                />
              </div>
              <div>
                <Label htmlFor="guests">Guests</Label>
                <Input
                  id="guests"
                  type="number"
                  min={1}
                  value={guests}
                  onChange={(e) => setGuests(Number(e.target.value))}
                />
              </div>
            </div>

            <div>
              <Label>Time</Label>
              <div className="mt-2 flex flex-wrap gap-2">
                {times.map((value) => (
                  <Button
                    key={value}
                    size="sm"
                    variant={value === time ? "default" : "outline"}
                    onClick={() => setTime(value)}
                  >
                    {value}
                  </Button>
                ))}
              </div>
            </div>

            <div>
              <Label>Tables</Label>
              <ul className="mt-2 grid gap-2 sm:grid-cols-2">
                {(tables ?? []).map((table) => {
                  const taken = table.bookedTimes.includes(time) || table.status !== "available";
                  return (
                    <li key={table.id}>
                      <button
                        type="button"
                        disabled={taken}
                        onClick={() => setTableId(table.id)}
                        className={`w-full rounded-lg border px-3 py-3 text-left transition-colors ${
                          tableId === table.id
                            ? "border-primary bg-primary/10"
                            : "border-border bg-secondary/40 hover:border-primary/60"
                        } ${taken ? "cursor-not-allowed opacity-45" : ""}`}
                      >
                        <p className="font-display text-xl">{table.name}</p>
                        <div className="mt-1 flex gap-2 text-xs">
                          <Badge variant="outline">{table.seats} seats</Badge>
                          {taken && <Badge variant="destructive">Taken</Badge>}
                        </div>
                      </button>
                    </li>
                  );
                })}
              </ul>
            </div>

            <div className="grid gap-3">
              <div>
                <Label htmlFor="lname">Full name</Label>
                <Input
                  id="lname"
                  value={customer.name}
                  onChange={(e) => setCustomer({ ...customer, name: e.target.value })}
                />
              </div>
              <div>
                <Label htmlFor="lemail">Email</Label>
                <Input
                  id="lemail"
                  type="email"
                  value={customer.email}
                  onChange={(e) => setCustomer({ ...customer, email: e.target.value })}
                />
              </div>
              <div>
                <Label htmlFor="lphone">Phone</Label>
                <Input
                  id="lphone"
                  value={customer.phone}
                  onChange={(e) => setCustomer({ ...customer, phone: e.target.value })}
                />
              </div>
            </div>

            <div className="rounded-lg border border-primary/40 bg-primary/10 p-4">
              <div className="flex items-center justify-between">
                <span className="text-sm text-muted-foreground">Pre-order total</span>
                <span className="font-display text-3xl text-primary">{naira(preorderTotal)}</span>
              </div>
              <Button
                className="mt-3 w-full"
                disabled={!tableId || mutation.isPending}
                onClick={() => mutation.mutate()}
              >
                Confirm reservation
              </Button>
            </div>

            {code && (
              <div className="rounded-lg border border-success/50 bg-success/10 p-4">
                <p className="text-sm text-muted-foreground">Reservation code</p>
                <p className="font-display text-4xl tracking-widest">{code}</p>
              </div>
            )}
          </section>

          <section className="panel p-5">
            <h2 className="text-2xl">Menu &amp; pre-order</h2>
            <p className="mb-4 text-sm text-muted-foreground">
              Optional — add anything you want waiting on the table.
            </p>
            <MenuPicker cart={cart} onChange={setCart} />
          </section>
        </div>
      </main>
      <SiteFooter />
    </div>
  );
}
