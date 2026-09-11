export function naira(value: number | string | null | undefined) {
  const n = Number(value ?? 0);
  return `₦${n.toLocaleString("en-NG", { maximumFractionDigits: 0 })}`;
}

export function timeLabel(time: string) {
  const [h, m] = time.split(":");
  const hour = Number(h);
  const suffix = hour >= 12 ? "PM" : "AM";
  const display = hour % 12 === 0 ? 12 : hour % 12;
  return `${display}:${m ?? "00"} ${suffix}`;
}

export function dateLabel(date: string) {
  const d = new Date(`${date}T00:00:00`);
  return d.toLocaleDateString("en-NG", { weekday: "short", day: "numeric", month: "short" });
}

export function todayISO() {
  return new Date().toISOString().slice(0, 10);
}

export function statusTone(status: string) {
  if (["paid", "served", "confirmed", "completed"].includes(status)) return "text-success";
  if (["pending", "preparing"].includes(status)) return "text-warning";
  if (["cancelled", "failed"].includes(status)) return "text-destructive";
  return "text-muted-foreground";
}
