import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { StaffRole } from "@/lib/ops.staff-schemas";

export type StaffAccess = {
  userId: string | null;
  email: string | null;
  roles: StaffRole[];
  isAdmin: boolean;
  isOps: boolean;
  isStaff: boolean;
  isKitchen: boolean;
  hasAnyRole: boolean;
};

export function useStaffAccess() {
  return useQuery<StaffAccess>({
    queryKey: ["staff-access"],
    queryFn: async () => {
      const { data: userData } = await supabase.auth.getUser();
      const user = userData.user;
      if (!user) {
        return {
          userId: null,
          email: null,
          roles: [],
          isAdmin: false,
          isOps: false,
          isStaff: false,
          isKitchen: false,
          hasAnyRole: false,
        };
      }
      const { data } = await supabase.from("user_roles").select("role").eq("user_id", user.id);
      const roles = (data ?? []).map((r) => r.role as StaffRole);
      return {
        userId: user.id,
        email: user.email ?? null,
        roles,
        isAdmin: roles.includes("admin"),
        isOps: roles.includes("admin") || roles.includes("ops_manager"),
        isStaff: roles.includes("admin") || roles.includes("ops_manager") || roles.includes("staff"),
        isKitchen: roles.includes("admin") || roles.includes("kitchen"),
        hasAnyRole: roles.length > 0,
      };
    },
    staleTime: 30_000,
  });
}
