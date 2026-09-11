import { createServerFn } from "@tanstack/react-start";

import {
  availabilitySchema,
  bookingSchema,
  orderSchema,
  reservationSchema,
  ticketSchema,
} from "./ops.schemas";

export const createArenaBooking = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => bookingSchema.parse(input))
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { makeCode } = await import("./ops.server");

    const { data: slot, error: slotError } = await supabaseAdmin
      .from("arena_slots")
      .select("*")
      .eq("id", data.slotId)
      .maybeSingle();
    if (slotError) throw new Error(slotError.message);
    if (!slot) throw new Error("This slot is no longer available.");

    const { data: existing, error: existingError } = await supabaseAdmin
      .from("bookings")
      .select("players_count, goalkeepers_count, booking_type")
      .eq("slot_id", data.slotId)
      .neq("payment_status", "cancelled");
    if (existingError) throw new Error(existingError.message);

    const takenPlayers = (existing ?? []).reduce((sum, b) => sum + (b.players_count ?? 0), 0);
    const takenKeepers = (existing ?? []).reduce((sum, b) => sum + (b.goalkeepers_count ?? 0), 0);
    if ((existing ?? []).some((b) => b.booking_type === "full_pitch")) {
      throw new Error("This slot is booked for a private match.");
    }

    const isFullPitch = data.bookingType === "full_pitch";
    const keepers = data.players.filter((p) => p.isGoalkeeper).length;
    const playerCount = data.players.length;

    if (!isFullPitch) {
      if (playerCount < 1) throw new Error("Add at least one player.");
      if (takenPlayers + playerCount > slot.player_capacity) {
        throw new Error(`Only ${Math.max(slot.player_capacity - takenPlayers, 0)} player slots left.`);
      }
      if (takenKeepers + keepers > slot.gk_capacity) {
        throw new Error(`Only ${Math.max(slot.gk_capacity - takenKeepers, 0)} goalkeeper slots left.`);
      }
    } else if (takenPlayers > 0) {
      throw new Error("Individual players have already booked this slot.");
    }

    const amount = isFullPitch
      ? Number(slot.price_full_pitch)
      : Number(slot.price_per_player) * playerCount;

    const { data: booking, error } = await supabaseAdmin
      .from("bookings")
      .insert({
        slot_id: data.slotId,
        booking_type: data.bookingType,
        customer_name: data.customerName,
        customer_email: data.customerEmail,
        customer_phone: data.customerPhone || null,
        players_count: playerCount,
        goalkeepers_count: keepers,
        amount,
        payment_method: data.paymentMethod,
        payment_status: data.markPaid ? "paid" : "pending",
        ticket_code: makeCode("FA"),
      })
      .select("id, ticket_code, amount, payment_status")
      .single();
    if (error) throw new Error(error.message);

    if (data.players.length > 0) {
      const { error: playersError } = await supabaseAdmin.from("booking_players").insert(
        data.players.map((p) => ({
          booking_id: booking.id,
          player_name: p.name,
          is_goalkeeper: p.isGoalkeeper,
          team_id: p.teamId ?? null,
        })),
      );
      if (playersError) throw new Error(playersError.message);
    }

    return {
      ticketCode: booking.ticket_code,
      amount: Number(booking.amount),
      paymentStatus: booking.payment_status,
    };
  });

export const confirmBookingPayment = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => ticketSchema.parse(input))
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin
      .from("bookings")
      .update({ payment_status: "paid" })
      .eq("ticket_code", data.ticketCode.toUpperCase());
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const lookupTicket = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => ticketSchema.parse(input))
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: booking, error } = await supabaseAdmin
      .from("bookings")
      .select(
        "ticket_code, customer_name, booking_type, players_count, goalkeepers_count, amount, payment_status, checked_in_at, arena_slots(slot_date, start_time, end_time), booking_players(player_name, is_goalkeeper, teams(name, color))",
      )
      .eq("ticket_code", data.ticketCode.trim().toUpperCase())
      .maybeSingle();
    if (error) throw new Error(error.message);
    return booking ?? null;
  });

export const createLoungeReservation = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => reservationSchema.parse(input))
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { makeCode, priceItems, placeOrder } = await import("./ops.server");

    const { data: clash, error: clashError } = await supabaseAdmin
      .from("reservations")
      .select("id")
      .eq("table_id", data.tableId)
      .eq("reserved_date", data.reservedDate)
      .eq("reserved_time", `${data.reservedTime}:00`)
      .neq("status", "cancelled");
    if (clashError) throw new Error(clashError.message);
    if ((clash ?? []).length > 0) throw new Error("That table is already reserved for this time.");

    const priced = await priceItems(data.items);

    const { data: reservation, error } = await supabaseAdmin
      .from("reservations")
      .insert({
        table_id: data.tableId,
        customer_name: data.customerName,
        customer_email: data.customerEmail,
        customer_phone: data.customerPhone || null,
        reserved_date: data.reservedDate,
        reserved_time: `${data.reservedTime}:00`,
        party_size: data.partySize,
        reference_code: makeCode("LG"),
        amount: priced.total,
        payment_status: priced.total > 0 ? "paid" : "pending",
      })
      .select("id, reference_code, amount")
      .single();
    if (error) throw new Error(error.message);

    if (priced.rows.length > 0) {
      await placeOrder({
        tableId: data.tableId,
        reservationId: reservation.id,
        customerName: data.customerName,
        orderType: "pre_order",
        rows: priced.rows,
        total: priced.total,
      });
    }

    return { referenceCode: reservation.reference_code, amount: Number(reservation.amount) };
  });

export const createTableOrder = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => orderSchema.parse(input))
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { priceItems, placeOrder } = await import("./ops.server");

    const { data: table, error: tableError } = await supabaseAdmin
      .from("lounge_tables")
      .select("id, name")
      .eq("qr_slug", data.qrSlug)
      .maybeSingle();
    if (tableError) throw new Error(tableError.message);
    if (!table) throw new Error("Unknown table code.");

    const priced = await priceItems(data.items);
    if (priced.rows.length === 0) throw new Error("Your order is empty.");

    const result = await placeOrder({
      tableId: table.id,
      reservationId: null,
      customerName: data.customerName,
      orderType: "qr",
      rows: priced.rows,
      total: priced.total,
    });

    return { referenceCode: result.referenceCode, total: priced.total, tableName: table.name };
  });

export const listArenaAvailability = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => availabilitySchema.parse(input))
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { data: slots, error } = await supabaseAdmin
      .from("arena_slots")
      .select("id, slot_date, start_time, end_time, player_capacity, gk_capacity, price_per_player, price_full_pitch, status, teams(id, name, color, max_players)")
      .gte("slot_date", data.fromDate)
      .order("slot_date")
      .order("start_time");
    if (error) throw new Error(error.message);

    const ids = (slots ?? []).map((s) => s.id);
    const { data: bookings } = ids.length
      ? await supabaseAdmin
          .from("bookings")
          .select("slot_id, players_count, goalkeepers_count, booking_type, payment_status")
          .in("slot_id", ids)
          .neq("payment_status", "cancelled")
      : { data: [] };

    const { data: lineups } = ids.length
      ? await supabaseAdmin.from("booking_players").select("team_id, is_goalkeeper, bookings!inner(slot_id)")
      : { data: [] };

    return (slots ?? []).map((slot) => {
      const mine = (bookings ?? []).filter((b) => b.slot_id === slot.id);
      const takenPlayers = mine.reduce((s, b) => s + (b.players_count ?? 0), 0);
      const takenKeepers = mine.reduce((s, b) => s + (b.goalkeepers_count ?? 0), 0);
      const pitchBooked = mine.some((b) => b.booking_type === "full_pitch");
      const teams = (slot.teams ?? []).map((team) => ({
        ...team,
        taken: (lineups ?? []).filter(
          (l) => l.team_id === team.id && (l.bookings as { slot_id: string } | null)?.slot_id === slot.id,
        ).length,
      }));
      return {
        ...slot,
        teams,
        takenPlayers,
        takenKeepers,
        pitchBooked,
        playersLeft: Math.max(slot.player_capacity - takenPlayers, 0),
        keepersLeft: Math.max(slot.gk_capacity - takenKeepers, 0),
      };
    });
  });

export const listLoungeAvailability = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => availabilitySchema.parse(input))
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: tables, error } = await supabaseAdmin
      .from("lounge_tables")
      .select("id, name, seats, qr_slug, status")
      .order("name");
    if (error) throw new Error(error.message);

    const { data: reservations } = await supabaseAdmin
      .from("reservations")
      .select("table_id, reserved_time")
      .eq("reserved_date", data.fromDate)
      .neq("status", "cancelled");

    return (tables ?? []).map((t) => ({
      ...t,
      bookedTimes: (reservations ?? [])
        .filter((r) => r.table_id === t.id)
        .map((r) => String(r.reserved_time).slice(0, 5)),
    }));
  });
