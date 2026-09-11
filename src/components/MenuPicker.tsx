import { useQuery } from "@tanstack/react-query";
import { Minus, Plus } from "lucide-react";

import { supabase } from "@/integrations/supabase/client";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { naira } from "@/lib/format";

export type Cart = Record<string, number>;

export function useMenu() {
  return useQuery({
    queryKey: ["menu"],
    queryFn: async () => {
      const [{ data: categories }, { data: items }] = await Promise.all([
        supabase.from("menu_categories").select("id, name, sort_order").order("sort_order"),
        supabase
          .from("menu_items")
          .select("id, name, description, price, is_available, category_id, kind")
          .order("name"),
      ]);
      return { categories: categories ?? [], items: items ?? [] };
    },
  });
}

export function cartTotal(cart: Cart, items: { id: string; price: number }[]) {
  return Object.entries(cart).reduce((sum, [id, qty]) => {
    const item = items.find((i) => i.id === id);
    return sum + (item ? Number(item.price) * qty : 0);
  }, 0);
}

export function MenuPicker({ cart, onChange }: { cart: Cart; onChange: (next: Cart) => void }) {
  const { data, isLoading } = useMenu();

  const bump = (id: string, delta: number) => {
    const next = { ...cart };
    const qty = (next[id] ?? 0) + delta;
    if (qty <= 0) delete next[id];
    else next[id] = qty;
    onChange(next);
  };

  if (isLoading) return <p className="text-sm text-muted-foreground">Loading menu…</p>;

  return (
    <div className="space-y-6">
      {(data?.categories ?? []).map((category) => {
        const items = (data?.items ?? []).filter((i) => i.category_id === category.id);
        if (items.length === 0) return null;
        return (
          <div key={category.id}>
            <h3 className="mb-3 text-xl">{category.name}</h3>
            <ul className="space-y-2">
              {items.map((item) => (
                <li
                  key={item.id}
                  className="flex items-center justify-between gap-3 rounded-lg border border-border bg-secondary/40 px-3 py-2"
                >
                  <div className="min-w-0">
                    <p className="truncate font-medium">
                      {item.name}{" "}
                      {!item.is_available && (
                        <Badge variant="outline" className="ml-1 text-destructive">
                          Sold out
                        </Badge>
                      )}
                    </p>
                    <p className="truncate text-xs text-muted-foreground">{item.description}</p>
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    <span className="text-sm font-semibold text-primary">{naira(item.price)}</span>
                    {item.is_available ? (
                      <div className="flex items-center gap-1">
                        <Button
                          type="button"
                          size="icon"
                          variant="outline"
                          className="size-8"
                          onClick={() => bump(item.id, -1)}
                          aria-label={`Remove one ${item.name}`}
                        >
                          <Minus className="size-3.5" />
                        </Button>
                        <span className="w-6 text-center text-sm">{cart[item.id] ?? 0}</span>
                        <Button
                          type="button"
                          size="icon"
                          variant="outline"
                          className="size-8"
                          onClick={() => bump(item.id, 1)}
                          aria-label={`Add one ${item.name}`}
                        >
                          <Plus className="size-3.5" />
                        </Button>
                      </div>
                    ) : null}
                  </div>
                </li>
              ))}
            </ul>
          </div>
        );
      })}
    </div>
  );
}
