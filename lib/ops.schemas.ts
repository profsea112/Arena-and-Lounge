import { z } from "zod";

export const playerSchema = z.object({
  name: z.string().trim().min(1).max(80),
  isGoalkeeper: z.boolean().default(false),
  teamId: z.string().uuid().nullable().optional(),
});

export const bookingSchema = z.object({
  slotId: z.string().uuid(),
  bookingType: z.enum(["player", "group", "full_pitch"]),
  customerName: z.string().trim().min(2).max(90),
  customerEmail: z.string().trim().email(),
  customerPhone: z.string().trim().max(30).optional().default(""),
  players: z.array(playerSchema).max(24).default([]),
  paymentMethod: z.enum(["paystack", "cash"]).default("paystack"),
  markPaid: z.boolean().default(false),
});

export const cartItemSchema = z.object({
  menuItemId: z.string().uuid(),
  quantity: z.number().int().min(1).max(30),
});

export const reservationSchema = z.object({
  tableId: z.string().uuid(),
  customerName: z.string().trim().min(2).max(90),
  customerEmail: z.string().trim().email(),
  customerPhone: z.string().trim().max(30).optional().default(""),
  reservedDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  reservedTime: z.string().regex(/^\d{2}:\d{2}$/),
  partySize: z.number().int().min(1).max(30),
  items: z.array(cartItemSchema).max(40).default([]),
});

export const orderSchema = z.object({
  qrSlug: z.string().trim().min(1).max(40),
  customerName: z.string().trim().min(1).max(90).default("Guest"),
  items: z.array(cartItemSchema).min(1).max(40),
});

export const ticketSchema = z.object({ ticketCode: z.string().trim().min(4).max(20) });

export type BookingInput = z.infer<typeof bookingSchema>;
export type ReservationInput = z.infer<typeof reservationSchema>;
export type CartItem = z.infer<typeof cartItemSchema>;

export const availabilitySchema = z.object({
  fromDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
});
