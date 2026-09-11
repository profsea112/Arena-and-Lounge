import { createServerFn } from "@tanstack/react-start";

import {
  createTeamSchema,
  joinTeamSchema,
  lineupSchema,
  slotIdSchema,
} from "./ops.team-schemas";

export const listSlotTeams = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => slotIdSchema.parse(input))
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { slotSquads } = await import("./teams.server");
    return slotSquads(supabaseAdmin, data.slotId);
  });

export const createSlotTeam = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => createTeamSchema.parse(input))
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { data: existing, error: existingError } = await supabaseAdmin
      .from("teams")
      .select("id, name, color")
      .eq("slot_id", data.slotId);
    if (existingError) throw new Error(existingError.message);
    if ((existing ?? []).length >= 4) throw new Error("This slot already has four teams.");
    if ((existing ?? []).some((t) => t.color === data.color)) {
      throw new Error("Another team already picked that colour for this slot.");
    }
    if ((existing ?? []).some((t) => t.name.toLowerCase() === data.name.toLowerCase())) {
      throw new Error("A team with that name already exists for this slot.");
    }

    const { data: team, error } = await supabaseAdmin
      .from("teams")
      .insert({
        slot_id: data.slotId,
        name: data.name,
        color: data.color,
        max_players: data.maxPlayers,
      })
      .select("id, name, color, max_players")
      .single();
    if (error) throw new Error(error.message);
    return team;
  });

export const joinSlotTeam = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => joinTeamSchema.parse(input))
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { makeCode } = await import("./ops.server");
    const { slotSquads } = await import("./teams.server");

    const squad = await slotSquads(supabaseAdmin, data.slotId);
    if (squad.pitchBooked) throw new Error("This slot is booked for a private match.");
    if (data.isGoalkeeper) {
      if (squad.keepersLeft < 1) throw new Error("All goalkeeper positions are taken for this slot.");
    } else if (squad.playersLeft < 1) {
      throw new Error("This slot is full.");
    }

    if (data.teamId) {
      const team = squad.teams.find((t) => t.id === data.teamId);
      if (!team) throw new Error("That team is not part of this slot.");
      if (team.spacesLeft < 1) throw new Error(`${team.name} is full.`);
      if (data.isGoalkeeper && team.keepers >= 1) {
        throw new Error(`${team.name} already has a goalkeeper.`);
      }
    }

    const amount = Number(squad.slot.price_per_player);
    const { data: booking, error } = await supabaseAdmin
      .from("bookings")
      .insert({
        slot_id: data.slotId,
        booking_type: "player",
        customer_name: data.playerName,
        customer_email: data.customerEmail,
        customer_phone: data.customerPhone || null,
        players_count: 1,
        goalkeepers_count: data.isGoalkeeper ? 1 : 0,
        amount,
        payment_method: data.paymentMethod,
        payment_status: data.paymentMethod === "paystack" ? "paid" : "pending",
        ticket_code: makeCode("FA"),
      })
      .select("id, ticket_code, amount, payment_status")
      .single();
    if (error) throw new Error(error.message);

    const { error: playerError } = await supabaseAdmin.from("booking_players").insert({
      booking_id: booking.id,
      player_name: data.playerName,
      is_goalkeeper: data.isGoalkeeper,
      team_id: data.teamId,
    });
    if (playerError) throw new Error(playerError.message);

    return {
      ticketCode: booking.ticket_code,
      amount: Number(booking.amount),
      paymentStatus: booking.payment_status,
    };
  });

export const updateBookingLineup = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => lineupSchema.parse(input))
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { slotSquads } = await import("./teams.server");

    const code = data.ticketCode.trim().toUpperCase();
    const { data: booking, error } = await supabaseAdmin
      .from("bookings")
      .select("id, slot_id, players_count, goalkeepers_count, booking_type, payment_status, checked_in_at")
      .eq("ticket_code", code)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!booking) throw new Error("No booking found for that ticket code.");
    if (booking.checked_in_at) throw new Error("This ticket is already checked in — see reception.");
    if (booking.payment_status === "cancelled") throw new Error("This booking was cancelled.");
    if (data.players.length !== booking.players_count) {
      throw new Error(`This ticket covers ${booking.players_count} player(s).`);
    }

    const keepers = data.players.filter((p) => p.isGoalkeeper).length;
    if (keepers > booking.goalkeepers_count) {
      const squad = await slotSquads(supabaseAdmin, booking.slot_id);
      const spare = squad.keepersLeft + booking.goalkeepers_count;
      if (keepers > spare) throw new Error("Not enough goalkeeper positions left in this slot.");
    }

    const { error: clearError } = await supabaseAdmin
      .from("booking_players")
      .delete()
      .eq("booking_id", booking.id);
    if (clearError) throw new Error(clearError.message);

    const { error: insertError } = await supabaseAdmin.from("booking_players").insert(
      data.players.map((p) => ({
        booking_id: booking.id,
        player_name: p.name,
        is_goalkeeper: p.isGoalkeeper,
        team_id: p.teamId,
      })),
    );
    if (insertError) throw new Error(insertError.message);

    const { error: countError } = await supabaseAdmin
      .from("bookings")
      .update({ goalkeepers_count: keepers })
      .eq("id", booking.id);
    if (countError) throw new Error(countError.message);

    return { ok: true, players: data.players.length, goalkeepers: keepers };
  });
