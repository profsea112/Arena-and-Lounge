import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { naira } from "@/lib/format";

export function InventoryPanel() {
  const queryClient = useQueryClient();

  const { data, isLoading } = useQuery({
    queryKey: ["staff-inventory"],
    queryFn: async () => {
      const [{ data: stock, error }, { data: items }] = await Promise.all([
        supabase
          .from("inventory_items")
          .select("id, name, quantity, unit, low_stock_threshold")
          .order("name"),
        supabase.from("menu_items").select("id, name, price, is_available").order("name"),
      ]);
      if (error) throw error;
      return { stock: stock ?? [], items: items ?? [] };
    },
  });

  const setQuantity = useMutation({
    mutationFn: async ({ id, quantity }: { id: string; quantity: number }) => {
      const { error } = await supabase.from("inventory_items").update({ quantity }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Stock updated");
      void queryClient.invalidateQueries({ queryKey: ["staff-inventory"] });
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const toggleItem = useMutation({
    mutationFn: async ({ id, isAvailable }: { id: string; isAvailable: boolean }) => {
      const { error } = await supabase
        .from("menu_items")
        .update({ is_available: isAvailable })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Menu updated");
      void queryClient.invalidateQueries({ queryKey: ["staff-inventory"] });
      void queryClient.invalidateQueries({ queryKey: ["menu"] });
    },
    onError: (error: Error) => toast.error(error.message),
  });

  if (isLoading) return <p className="text-sm text-muted-foreground">Loading inventory…</p>;

  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <section>
        <h3 className="text-2xl">Stock levels</h3>
        <ul className="mt-3 space-y-2">
          {(data?.stock ?? []).map((item) => {
            const low = item.quantity <= item.low_stock_threshold;
            return (
              <li
                key={item.id}
                className="flex items-center justify-between gap-3 rounded-lg border border-border bg-secondary/40 px-3 py-2"
              >
                <div>
                  <p className="font-medium">{item.name}</p>
                  <p className="text-xs text-muted-foreground">
                    {item.quantity} {item.unit} · alert at {item.low_stock_threshold}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  {low && <Badge variant="destructive">Low</Badge>}
                  <Input
                    type="number"
                    className="w-24"
                    defaultValue={item.quantity}
                    onBlur={(e) => {
                      const quantity = Number(e.target.value);
                      if (quantity !== item.quantity) setQuantity.mutate({ id: item.id, quantity });
                    }}
                  />
                </div>
              </li>
            );
          })}
        </ul>
      </section>

      <section>
        <h3 className="text-2xl">Menu availability</h3>
        <ul className="mt-3 space-y-2">
          {(data?.items ?? []).map((item) => (
            <li
              key={item.id}
              className="flex items-center justify-between gap-3 rounded-lg border border-border bg-secondary/40 px-3 py-2"
            >
              <div>
                <p className="font-medium">{item.name}</p>
                <p className="text-xs text-muted-foreground">{naira(item.price)}</p>
              </div>
              <Button
                size="sm"
                variant={item.is_available ? "outline" : "default"}
                onClick={() => toggleItem.mutate({ id: item.id, isAvailable: !item.is_available })}
              >
                {item.is_available ? "Mark sold out" : "Make available"}
              </Button>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
