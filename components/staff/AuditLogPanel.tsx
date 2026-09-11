import { useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";

import { supabase } from "@/integrations/supabase/client";
import { Badge } from "@/components/ui/badge";
import { auditLabels } from "@/lib/audit";

export function AuditLogPanel() {
  const queryClient = useQueryClient();

  const { data: entries, isLoading } = useQuery({
    queryKey: ["staff-audit-log"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("staff_audit_log")
        .select("id, actor_email, action, entity_type, entity_label, details, created_at")
        .order("created_at", { ascending: false })
        .limit(120);
      if (error) throw error;
      return data ?? [];
    },
  });

  useEffect(() => {
    const channel = supabase
      .channel("audit-log-feed")
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "staff_audit_log" },
        () => {
          void queryClient.invalidateQueries({ queryKey: ["staff-audit-log"] });
        },
      )
      .subscribe();
    return () => {
      void supabase.removeChannel(channel);
    };
  }, [queryClient]);

  if (isLoading) return <p className="text-sm text-muted-foreground">Loading activity…</p>;

  return (
    <div className="panel divide-y divide-border/60">
      {(entries ?? []).map((entry) => (
        <div key={entry.id} className="flex flex-wrap items-center justify-between gap-2 p-4">
          <div>
            <p className="text-sm font-medium">
              {auditLabels[entry.action] ?? entry.action}
              {entry.entity_label && (
                <span className="ml-2 font-display text-lg tracking-wide text-primary">
                  {entry.entity_label}
                </span>
              )}
            </p>
            <p className="text-xs text-muted-foreground">{entry.actor_email || "system"}</p>
          </div>
          <div className="flex items-center gap-2">
            <Badge variant="outline" className="capitalize">
              {entry.entity_type}
            </Badge>
            <span className="text-xs text-muted-foreground">
              {new Date(entry.created_at).toLocaleString()}
            </span>
          </div>
        </div>
      ))}
      {(entries ?? []).length === 0 && (
        <p className="p-4 text-sm text-muted-foreground">No staff activity recorded yet.</p>
      )}
    </div>
  );
}
