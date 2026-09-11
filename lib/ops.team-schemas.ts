import { z } from "zod";

export const teamColors = [
  { value: "white", label: "White", hex: "#f4f4f5" },
  { value: "lime", label: "Lime", hex: "#a3e635" },
  { value: "black", label: "Black", hex: "#18181b" },
  { value: "red", label: "Red", hex: "#ef4444" },
  { value: "blue", label: "Blue", hex: "#3b82f6" },
  { value: "orange", label: "Orange", hex: "#f97316" },
  { value: "purple", label: "Purple", hex: "#a855f7" },
  { value: "yellow", label: "Yellow", hex: "#facc15" },
] as const;

export type TeamColor = (typeof teamColors)[number]["value"];

export function colorHex(color: string) {
  return teamColors.find((c) => c.value === color)?.hex ?? "#a3e635";
}

export const slotIdSchema = z.object({ slotId: z.string().uuid() });

export const createTeamSchema = z.object({
  slotId: z.string().uuid(),
  name: z.string().trim().min(2).max(40),
  color: z.enum(teamColors.map((c) => c.value) as [TeamColor, ...TeamColor[]]),
  maxPlayers: z.number().int().min(4).max(11).default(10),
});

export const joinTeamSchema = z.object({
  slotId: z.string().uuid(),
  teamId: z.string().uuid().nullable().default(null),
  playerName: z.string().trim().min(2).max(80),
  isGoalkeeper: z.boolean().default(false),
  customerEmail: z.string().trim().email(),
  customerPhone: z.string().trim().max(30).optional().default(""),
  paymentMethod: z.enum(["paystack", "cash"]).default("paystack"),
});

export const lineupSchema = z.object({
  ticketCode: z.string().trim().min(4).max(20),
  players: z
    .array(
      z.object({
        name: z.string().trim().min(1).max(80),
        isGoalkeeper: z.boolean().default(false),
        teamId: z.string().uuid().nullable().default(null),
      }),
    )
    .min(1)
    .max(24),
});

export type CreateTeamInput = z.infer<typeof createTeamSchema>;
export type JoinTeamInput = z.infer<typeof joinTeamSchema>;
