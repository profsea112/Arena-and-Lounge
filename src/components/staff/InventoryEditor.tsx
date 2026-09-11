import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { naira } from "@/lib/format";
import { logAudit } from "@/lib/audit";

type StockRow = {
  id: string;
  name: string;
  unit: string;
  quantity: number;
  low_stock_threshold: number;
};

type MenuRow = {
  id: string;
  name: string;
  price: number;
  is_available: boolean;
  inventory_item_id: string | null;
};

const emptyDraft = { name: "", unit: "unit", quantity: "0", low_stock_threshold: "10" };

export function InventoryEditor() {
  const queryClient = useQueryClient();
  const [draft, setDraft] = useState(emptyDraft);
  const [edits, setEdits] = useState<Record<string, Partial<StockRow>>>({});
  const [menuEdits, setMenuEdits] = useState<Record<string, { name?: string; price?: string }>>({});

  const invalidate = () => {
    void queryClient.invalidateQueries({ queryKey: ["admin-inventory"] });
    void queryClient.invalidateQueries({ queryKey: ["staff-inventory"] });
    void queryClient.invalidateQueries({ queryKey: ["menu"] });
  };

  const { data, isLoading } = useQuery({
    queryKey: ["admin-inventory"],
    queryFn: async () => {
      const [stock, menu] = await Promise.all([
        supabase
          .from("inventory_items")
          .select("id, name, unit, quantity, low_stock_threshold")
          .order("name"),
        supabase
          .from("menu_items")
          .select("id, name, price, is_available, inventory_item_id")
          .order("name"),
      ]);
      if (stock.error) throw stock.error;
      if (menu.error) throw menu.error;
      return { stock: (stock.data ?? []) as StockRow[], menu: (menu.data ?? []) as MenuRow[] };
    },
  });

  const addItem = useMutation({
    mutationFn: async () => {
      const name = draft.name.trim();
      if (!name) throw new Error("Give the item a name");
      const { error } = await supabase.from("inventory_items").insert({
        name,
        unit: draft.unit.trim() || "unit",
        quantity: Number(draft.quantity) || 0,
        low_stock_threshold: Number(draft.low_stock_threshold) || 0,
      });
      if (error) throw error;
      await logAudit({
        action: "inventory.updated",
        entityType: "inventory",
        entityLabel: name,
        details: { change: "created" },
      });
    },
    onSuccess: () => {
      toast.success("Item added");
      setDraft(emptyDraft);
      invalidate();
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const saveItem = useMutation({
    mutationFn: async (row: StockRow) => {
      const patch = edits[row.id];
      if (!patch) return;
      const next = {
        name: (patch.name ?? row.name).toString().trim() || row.name,
        unit: (patch.unit ?? row.unit).toString().trim() || row.unit,
        quantity: Number(patch.quantity ?? row.quantity),
        low_stock_threshold: Number(patch.low_stock_threshold ?? row.low_stock_threshold),
      };
      const { error } = await supabase.from("inventory_items").update(next).eq("id", row.id);
      if (error) throw error;
      await logAudit({
        action: "inventory.updated",
        entityType: "inventory",
        entityId: row.id,
        entityLabel: next.name,
        details: { quantity: next.quantity, threshold: next.low_stock_threshold },
      });
    },
    onSuccess: (_res, row) => {
      toast.success("Saved");
      setEdits((prev) => {
        const copy = { ...prev };
        delete copy[row.id];
        return copy;
      });
      invalidate();
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const deleteItem = useMutation({
    mutationFn: async (row: StockRow) => {
      const { error } = await supabase.from("inventory_items").delete().eq("id", row.id);
      if (error) throw error;
      await logAudit({
        action: "inventory.updated",
        entityType: "inventory",
        entityId: row.id,
        entityLabel: row.name,
        details: { change: "deleted" },
      });
    },
    onSuccess: () => {
      toast.success("Item removed");
      invalidate();
    },
    onError: (error: Error) =>
      toast.error(
        error.message.includes("foreign key")
          ? "This item is linked to a menu item — unlink it first."
          : error.message,
      ),
  });

  const saveMenu = useMutation({
    mutationFn: async (row: MenuRow) => {
      const patch = menuEdits[row.id];
      if (!patch) return;
      const next = {
        name: (patch.name ?? row.name).trim() || row.name,
        price: Number(patch.price ?? row.price),
      };
      const { error } = await supabase.from("menu_items").update(next).eq("id", row.id);
      if (error) throw error;
      await logAudit({
        action: "inventory.updated",
        entityType: "inventory",
        entityId: row.id,
        entityLabel: next.name,
        details: { price: next.price },
      });
    },
    onSuccess: (_res, row) => {
      toast.success("Menu item saved");
      setMenuEdits((prev) => {
        const copy = { ...prev };
        delete copy[row.id];
        return copy;
      });
      invalidate();
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const toggleAvailable = useMutation({
    mutationFn: async (row: MenuRow) => {
      const { error } = await supabase
        .from("menu_items")
        .update({ is_available: !row.is_available })
        .eq("id", row.id);
      if (error) throw error;
    },
    onSuccess: () => invalidate(),
    onError: (error: Error) => toast.error(error.message),
  });

  if (isLoading) return <p className="text-sm text-muted-foreground">Loading inventory…</p>;

  return (
    <div className="space-y-8">
      <section className="panel p-4">
        <h3 className="text-2xl">Add stock item</h3>
        <div className="mt-3 grid gap-3 sm:grid-cols-5">
          <div className="sm:col-span-2">
            <Label htmlFor="inv-name">Name</Label>
            <Input
              id="inv-name"
              value={draft.name}
              placeholder="Bottled water"
              onChange={(e) => setDraft({ ...draft, name: e.target.value })}
            />
          </div>
          <div>
            <Label htmlFor="inv-unit">Unit</Label>
            <Input
              id="inv-unit"
              value={draft.unit}
              onChange={(e) => setDraft({ ...draft, unit: e.target.value })}
            />
          </div>
          <div>
            <Label htmlFor="inv-qty">Quantity</Label>
            <Input
              id="inv-qty"
              type="number"
              value={draft.quantity}
              onChange={(e) => setDraft({ ...draft, quantity: e.target.value })}
            />
          </div>
          <div>
            <Label htmlFor="inv-low">Low alert</Label>
            <Input
              id="inv-low"
              type="number"
              value={draft.low_stock_threshold}
              onChange={(e) => setDraft({ ...draft, low_stock_threshold: e.target.value })}
            />
          </div>
        </div>
        <Button className="mt-3" onClick={() => addItem.mutate()} disabled={addItem.isPending}>
          Add item
        </Button>
      </section>

      <section>
        <h3 className="text-2xl">Stock items</h3>
        <ul className="mt-3 space-y-2">
          {(data?.stock ?? []).map((row) => {
            const patch = edits[row.id] ?? {};
            const dirty = Object.keys(patch).length > 0;
            const low = Number(patch.quantity ?? row.quantity) <= Number(row.low_stock_threshold);
            return (
              <li
                key={row.id}
                className="grid gap-2 rounded-lg border border-border bg-secondary/40 p-3 sm:grid-cols-[2fr_1fr_1fr_1fr_auto] sm:items-end"
              >
                <div>
                  <Label className="text-xs text-muted-foreground">Name</Label>
                  <Input
                    value={String(patch.name ?? row.name)}
                    onChange={(e) =>
                      setEdits((p) => ({ ...p, [row.id]: { ...patch, name: e.target.value } }))
                    }
                  />
                </div>
                <div>
                  <Label className="text-xs text-muted-foreground">Unit</Label>
                  <Input
                    value={String(patch.unit ?? row.unit)}
                    onChange={(e) =>
                      setEdits((p) => ({ ...p, [row.id]: { ...patch, unit: e.target.value } }))
                    }
                  />
                </div>
                <div>
                  <Label className="text-xs text-muted-foreground">Qty</Label>
                  <Input
                    type="number"
                    value={String(patch.quantity ?? row.quantity)}
                    onChange={(e) =>
                      setEdits((p) => ({
                        ...p,
                        [row.id]: { ...patch, quantity: Number(e.target.value) },
                      }))
                    }
                  />
                </div>
                <div>
                  <Label className="text-xs text-muted-foreground">Low alert</Label>
                  <Input
                    type="number"
                    value={String(patch.low_stock_threshold ?? row.low_stock_threshold)}
                    onChange={(e) =>
                      setEdits((p) => ({
                        ...p,
                        [row.id]: { ...patch, low_stock_threshold: Number(e.target.value) },
                      }))
                    }
                  />
                </div>
                <div className="flex items-center gap-2">
                  {low && <Badge variant="destructive">Low</Badge>}
                  <Button size="sm" disabled={!dirty} onClick={() => saveItem.mutate(row)}>
                    Save
                  </Button>
                  <Button size="sm" variant="outline" onClick={() => deleteItem.mutate(row)}>
                    Delete
                  </Button>
                </div>
              </li>
            );
          })}
        </ul>
      </section>

      <section>
        <h3 className="text-2xl">Menu prices &amp; availability</h3>
        <ul className="mt-3 space-y-2">
          {(data?.menu ?? []).map((row) => {
            const patch = menuEdits[row.id] ?? {};
            const dirty = Object.keys(patch).length > 0;
            return (
              <li
                key={row.id}
                className="grid gap-2 rounded-lg border border-border bg-secondary/40 p-3 sm:grid-cols-[2fr_1fr_auto] sm:items-end"
              >
                <div>
                  <Label className="text-xs text-muted-foreground">Item</Label>
                  <Input
                    value={patch.name ?? row.name}
                    onChange={(e) =>
                      setMenuEdits((p) => ({ ...p, [row.id]: { ...patch, name: e.target.value } }))
                    }
                  />
                </div>
                <div>
                  <Label className="text-xs text-muted-foreground">
                    Price ({naira(row.price)})
                  </Label>
                  <Input
                    type="number"
                    value={patch.price ?? String(row.price)}
                    onChange={(e) =>
                      setMenuEdits((p) => ({ ...p, [row.id]: { ...patch, price: e.target.value } }))
                    }
                  />
                </div>
                <div className="flex items-center gap-2">
                  <Button size="sm" disabled={!dirty} onClick={() => saveMenu.mutate(row)}>
                    Save
                  </Button>
                  <Button
                    size="sm"
                    variant={row.is_available ? "outline" : "default"}
                    onClick={() => toggleAvailable.mutate(row)}
                  >
                    {row.is_available ? "Mark sold out" : "Make available"}
                  </Button>
                </div>
              </li>
            );
          })}
        </ul>
      </section>
    </div>
  );
}
