import { z } from "zod";

export const staffRoles = ["admin", "ops_manager", "staff", "kitchen"] as const;

export const assignRoleSchema = z.object({
  email: z.string().trim().email(),
  role: z.enum(staffRoles),
});

export type StaffRole = (typeof staffRoles)[number];

export const roleLabels: Record<StaffRole, string> = {
  admin: "Administrator",
  ops_manager: "Operations Manager",
  staff: "Staff / Reception",
  kitchen: "Kitchen & Bar",
};
