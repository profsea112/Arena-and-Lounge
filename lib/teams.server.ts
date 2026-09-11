import type { supabaseAdmin as AdminClient } from "@/integrations/supabase/client.server";

type Admin = typeof AdminClient;

export async function slotSquads(supabaseAdmin: Admin, slotId: string) {
  const { data: slot, error: slotError } = await supabaseAdmin
    .from("arena_slots")
    .select(
      "id, slot_date, start_time, end_time, player_capacity, gk_capacity, price_per_player, price_full_pitch, status",
    )
    .eq("id", slotId)
    .maybeSingle();
  if (slotError) throw new Error(slotError.message);
  if (!slot) throw new Error("Slot not found.");

  const { data: teams, error: teamsError } = await supabaseAdmin
    .from("teams")
    .select("id, name, color, max_players")
    .eq("slot_id", slotId)
    .order("created_at");
  if (teamsError) throw new Error(teamsError.message);

  const { data: bookings, error: bookingsError } = await supabaseAdmin
    .from("bookings")
    .select("id, players_count, goalkeepers_count, booking_type")
    .eq("slot_id", slotId)
    .neq("payment_status", "cancelled");
  if (bookingsError) throw new Error(bookingsError.message);

  const bookingIds = (bookings ?? []).map((b) => b.id);
  const { data: lineup } = bookingIds.length
    ? await supabaseAdmin
        .from("booking_players")
        .select("id, player_name, is_goalkeeper, team_id, booking_id")
        .in("booking_id", bookingIds)
    : { data: [] as { id: string; player_name: string; is_goalkeeper: boolean; team_id: string | null; booking_id: string }[] };

  const rows = lineup ?? [];
  const takenPlayers = (bookings ?? []).reduce((s, b) => s + (b.players_count ?? 0), 0);
  const takenKeepers = (bookings ?? []).reduce((s, b) => s + (b.goalkeepers_count ?? 0), 0);

  return {
    slot,
    pitchBooked: (bookings ?? []).some((b) => b.booking_type === "full_pitch"),
    takenPlayers,
    takenKeepers,
    playersLeft: Math.max(slot.player_capacity - takenPlayers, 0),
    keepersLeft: Math.max(slot.gk_capacity - takenKeepers, 0),
    freeAgents: rows
      .filter((r) => !r.team_id)
      .map((r) => ({ name: r.player_name, isGoalkeeper: r.is_goalkeeper })),
    teams: (teams ?? []).map((team) => {
      const members = rows.filter((r) => r.team_id === team.id);
      return {
        ...team,
        players: members.map((m) => ({ name: m.player_name, isGoalkeeper: m.is_goalkeeper })),
        taken: members.length,
        keepers: members.filter((m) => m.is_goalkeeper).length,
        spacesLeft: Math.max(team.max_players - members.length, 0),
      };
    }),
  };
}
