import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";

import { supabase } from "@/integrations/supabase/client";
import { MenuPicker, cartTotal, useMenu, type Cart } from "@/components/MenuPicker";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { createTableOrder } from "@/lib/public.functions";
import { naira } from "@/lib/format";

export const Route = createFileRoute("/order/$slug")({
  head: () => ({
    meta: [
      { title: "Order at Your Table — M25 Lounge" },
      {
        name: "description",
        content: "Scan, browse the live lounge menu and send your order straight to the kitchen and bar.",
      },
      { property: "og:title", content: "Order at Your Table — M25 Lounge" },
      { property: "og:description", content: "Table-side ordering for the M25 Lounge." },
    ],
  }),
  component: TableOrderPage,
});

function TableOrderPage() {
  const { slug } = Route.useParams();
  const placeOrder = useServerFn(createTableOrder);
  const { data: menu } = useMenu();

  const [cart, setCart] = useState<Cart>({});
  const [name, setName] = useState("");
  const [code, setCode] = useState<string | null>(null);

  const { data: table } = useQuery({
    queryKey: ["table", slug],
    queryFn: async () => {
      const { data } = await supabase
        .from("lounge_tables")
        .select("id, name, seats")
        .eq("qr_slug", slug)
        .maybeSingle();
      return data;
    },
  });

  const total = cartTotal(cart, menu?.items ?? []);

  const mutation = useMutation({
    mutationFn: () =>
      placeOrder({
        data: {
          qrSlug: slug,
          customerName: name.trim() || "Guest",
          items: Object.entries(cart).map(([menuItemId, quantity]) => ({ menuItemId, quantity })),
        },
      }),
    onSuccess: (result) => {
      setCode(result.referenceCode);
      setCart({});
      toast.success("Order sent to the kitchen");
    },
    onError: (error: Error) => toast.error(error.message),
  });

  return (
    <div className="mx-auto min-h-screen max-w-xl px-4 py-10">
      <p className="text-sm uppercase tracking-[0.3em] text-primary">M25 Lounge</p>
      <h1 className="mt-1 text-4xl">{table?.name ?? "Table"}</h1>
      <p className="mt-1 text-sm text-muted-foreground">
        {table ? `${table.seats} seats · order without waiting` : "Looking up this table…"}
      </p>

      {code ? (
        <div className="panel mt-8 p-6 text-center">
          <p className="text-sm text-muted-foreground">Order reference</p>
          <p className="font-display text-5xl tracking-widest">{code}</p>
          <p className="mt-3 text-sm text-muted-foreground">
            A waiter has been assigned and is on the way with your order.
          </p>
          <Button className="mt-6" variant="outline" onClick={() => setCode(null)}>
            Order something else
          </Button>
        </div>
      ) : (
        <>
          <div className="mt-6">
            <Label htmlFor="guestName">Your name (optional)</Label>
            <Input id="guestName" value={name} onChange={(e) => setName(e.target.value)} />
          </div>

          <div className="mt-8">
            <MenuPicker cart={cart} onChange={setCart} />
          </div>

          <div className="sticky bottom-4 mt-8 rounded-xl border border-primary/40 bg-card/95 p-4 backdrop-blur">
            <div className="flex items-center justify-between">
              <span className="text-sm text-muted-foreground">Total</span>
              <span className="font-display text-3xl text-primary">{naira(total)}</span>
            </div>
            <Button
              className="mt-3 w-full"
              disabled={Object.keys(cart).length === 0 || mutation.isPending || !table}
              onClick={() => mutation.mutate()}
            >
              Send order
            </Button>
          </div>
        </>
      )}
    </div>
  );
}
