import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  assignStaffRole,
  claimFirstAdmin,
  listStaffRoster,
  revokeStaffRole,
} from "@/lib/staff.functions";
import { roleLabels, staffRoles, type StaffRole } from "@/lib/ops.staff-schemas";

export function TeamPanel({ isAdmin }: { isAdmin: boolean }) {
  const queryClient = useQueryClient();
  const roster = useServerFn(listStaffRoster);
  const assign = useServerFn(assignStaffRole);
  const revoke = useServerFn(revokeStaffRole);
  const claim = useServerFn(claimFirstAdmin);

  const [email, setEmail] = useState("");
  const [role, setRole] = useState<StaffRole>("staff");

  const { data, error } = useQuery({
    queryKey: ["staff-roster"],
    queryFn: () => roster(),
    enabled: isAdmin,
    retry: false,
  });

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ["staff-roster"] });

  const assignMutation = useMutation({
    mutationFn: () => assign({ data: { email, role } }),
    onSuccess: () => {
      toast.success("Role granted");
      setEmail("");
      void invalidate();
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const revokeMutation = useMutation({
    mutationFn: (id: string) => revoke({ data: { id } }),
    onSuccess: () => {
      toast.success("Role revoked");
      void invalidate();
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const claimMutation = useMutation({
    mutationFn: () => claim(),
    onSuccess: () => {
      toast.success("You are now the administrator. Reloading…");
      window.location.reload();
    },
    onError: (err: Error) => toast.error(err.message),
  });

  if (!isAdmin) {
    return (
      <div className="panel max-w-lg p-6">
        <h3 className="text-2xl">No admin access</h3>
        <p className="mt-2 text-sm text-muted-foreground">
          Only an administrator can manage staff roles. If this arena has no administrator yet, you
          can claim the role now.
        </p>
        <Button className="mt-4" onClick={() => claimMutation.mutate()} disabled={claimMutation.isPending}>
          Claim administrator access
        </Button>
      </div>
    );
  }

  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <section className="panel space-y-4 p-5">
        <h3 className="text-2xl">Grant a role</h3>
        <div>
          <Label htmlFor="staffEmail">Staff email</Label>
          <Input
            id="staffEmail"
            type="email"
            value={email}
            placeholder="waiter@ninetyarena.com"
            onChange={(e) => setEmail(e.target.value)}
          />
        </div>
        <div>
          <Label>Role</Label>
          <Select value={role} onValueChange={(value) => setRole(value as StaffRole)}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {staffRoles.map((value) => (
                <SelectItem key={value} value={value}>
                  {roleLabels[value]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <Button
          disabled={email.length < 5 || assignMutation.isPending}
          onClick={() => assignMutation.mutate()}
        >
          Grant access
        </Button>
        <p className="text-xs text-muted-foreground">
          The person must have signed up on the staff sign-in page first.
        </p>
      </section>

      <section className="space-y-3">
        <h3 className="text-2xl">Roster</h3>
        {error && <p className="text-sm text-destructive">{(error as Error).message}</p>}
        {(data ?? []).map((entry) => (
          <div
            key={entry.id}
            className="flex items-center justify-between gap-3 rounded-lg border border-border bg-secondary/40 px-3 py-2"
          >
            <div>
              <p className="font-medium">{entry.email}</p>
              <Badge variant="outline">{roleLabels[entry.role as StaffRole] ?? entry.role}</Badge>
            </div>
            <Button size="sm" variant="outline" onClick={() => revokeMutation.mutate(entry.id)}>
              Revoke
            </Button>
          </div>
        ))}
      </section>
    </div>
  );
}
