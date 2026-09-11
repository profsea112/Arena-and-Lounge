import { supabase } from "@/integrations/supabase/client";

export type AuditAction =
  | "staff.sign_in"
  | "staff.sign_out"
  | "booking.payment_verified"
  | "booking.checked_in"
  | "booking.cancelled"
  | "ticket.verified"
  | "order.status_changed"
  | "order.fulfilled"
  | "order.voided"
  | "order.preparation_started"
  | "order.prepared"
  | "order.assigned"
  | "order.unassigned"
  | "table.status_changed"
  | "reservation.status_changed"
  | "inventory.updated"
  | "role.changed";

export type AuditEntry = {
  action: AuditAction;
  entityType?:
    | "booking"
    | "order"
    | "ticket"
    | "reservation"
    | "inventory"
    | "session"
    | "role"
    | "table";
  entityId?: string | null;
  entityLabel?: string | null;
  details?: Record<string, unknown>;
};

/**
 * Fire-and-forget audit trail write. Never throws — auditing must not break a staff action.
 */
export async function logAudit(entry: AuditEntry) {
  try {
    const { data } = await supabase.auth.getUser();
    const user = data.user;
    if (!user) return;
    await supabase.from("staff_audit_log").insert({
      actor_id: user.id,
      actor_email: user.email ?? "",
      action: entry.action,
      entity_type: entry.entityType ?? "system",
      entity_id: entry.entityId ?? null,
      entity_label: entry.entityLabel ?? null,
      details: (entry.details ?? {}) as never,
    });
  } catch {
    // swallow: audit logging is best-effort
  }
}

export const auditLabels: Record<string, string> = {
  "staff.sign_in": "Signed in",
  "staff.sign_out": "Signed out",
  "booking.payment_verified": "Verified payment",
  "booking.checked_in": "Checked in guest",
  "booking.cancelled": "Cancelled booking",
  "ticket.verified": "Verified ticket",
  "order.status_changed": "Advanced order",
  "order.fulfilled": "Fulfilled order",
  "order.voided": "Voided order",
  "order.preparation_started": "Started preparing order",
  "order.prepared": "Marked order ready",
  "order.assigned": "Assigned waiter",
  "order.unassigned": "Removed waiter",
  "table.status_changed": "Updated table status",
  "reservation.status_changed": "Updated reservation",
  "inventory.updated": "Updated inventory",
  "role.changed": "Changed staff role",
};
