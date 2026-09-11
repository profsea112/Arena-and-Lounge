import { supabaseAdmin } from "@/integrations/supabase/client.server";
import type { CartItem } from "./ops.schemas";

export type PricedRow = {
  menu_item_id: string;
  item_name: string;
  quantity: number;
  unit_price: number;
  inventory_item_id: string | null;
};

export function makeCode(prefix: string) {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let out = "";
  for (let i = 0; i < 6; i += 1) out += chars[Math.floor(Math.random() * chars.length)];
  return `${prefix}-${out}`;
}

export async function priceItems(items: CartItem[]) {
  if (items.length === 0) return { rows: [] as PricedRow[], total: 0 };
  const { data: menu, error } = await supabaseAdmin
    .from("menu_items")
    .select("id, name, price, is_available, inventory_item_id")
    .in(
      "id",
      items.map((i) => i.menuItemId),
    );
  if (error) throw new Error(error.message);

  const rows: PricedRow[] = [];
  for (const i of items) {
    const item = (menu ?? []).find((m) => m.id === i.menuItemId);
    if (!item) continue;
    if (!item.is_available) throw new Error(`${item.name} is out of stock.`);
    rows.push({
      menu_item_id: item.id,
      item_name: item.name,
      quantity: i.quantity,
      unit_price: Number(item.price),
      inventory_item_id: item.inventory_item_id,
    });
  }
  const total = rows.reduce((sum, r) => sum + r.unit_price * r.quantity, 0);
  return { rows, total };
}

export async function placeOrder(input: {
  tableId: string | null;
  reservationId: string | null;
  customerName: string;
  orderType: "qr" | "pre_order";
  rows: PricedRow[];
  total: number;
}) {
  const assignedStaffId = await pickWaiter();
  const reference = makeCode("ORD");

  const { data: order, error } = await supabaseAdmin
    .from("orders")
    .insert({
      table_id: input.tableId,
      reservation_id: input.reservationId,
      order_type: input.orderType,
      customer_name: input.customerName,
      total: input.total,
      payment_status: "paid",
      reference_code: reference,
      assigned_staff_id: assignedStaffId,
    })
    .select("id, reference_code")
    .single();
  if (error) throw new Error(error.message);

  const { error: itemsError } = await supabaseAdmin.from("order_items").insert(
    input.rows.map((r) => ({
      order_id: order.id,
      menu_item_id: r.menu_item_id,
      item_name: r.item_name,
      quantity: r.quantity,
      unit_price: r.unit_price,
    })),
  );
  if (itemsError) throw new Error(itemsError.message);

  await consumeStock(input.rows);
  return { referenceCode: order.reference_code };
}

export async function consumeStock(rows: PricedRow[]) {
  for (const row of rows) {
    if (!row.inventory_item_id) continue;
    const { data: stock } = await supabaseAdmin
      .from("inventory_items")
      .select("id, quantity")
      .eq("id", row.inventory_item_id)
      .maybeSingle();
    if (!stock) continue;
    const next = Math.max(Number(stock.quantity) - row.quantity, 0);
    await supabaseAdmin.from("inventory_items").update({ quantity: next }).eq("id", stock.id);
    if (next <= 0) {
      await supabaseAdmin
        .from("menu_items")
        .update({ is_available: false })
        .eq("inventory_item_id", stock.id);
    }
  }
}

export async function pickWaiter() {
  const { data: staff } = await supabaseAdmin.from("user_roles").select("user_id").eq("role", "staff");
  const ids = (staff ?? []).map((s) => s.user_id);
  if (ids.length === 0) return null;

  const { data: open } = await supabaseAdmin
    .from("orders")
    .select("assigned_staff_id")
    .in("status", ["pending", "preparing", "ready"]);

  const load = new Map<string, number>(ids.map((id) => [id, 0]));
  for (const order of open ?? []) {
    const id = order.assigned_staff_id;
    if (id && load.has(id)) load.set(id, (load.get(id) ?? 0) + 1);
  }
  return [...load.entries()].sort((a, b) => a[1] - b[1])[0]?.[0] ?? null;
}
