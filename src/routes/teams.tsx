import { useEffect, useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Hand, Plus, Shield, Trash2, Users } from "lucide-react";

import { SiteFooter, SiteHeader } from "@/components/SiteHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { listArenaAvailability } from "@/lib/public.functions";
import {
  createSlotTeam,
  joinSlotTeam,
  listSlotTeams,
  updateBookingLineup,
} from "@/lib/teams.functions";
import { colorHex, teamColors, type TeamColor } from "@/lib/ops.team-schemas";
import { dateLabel, naira, timeLabel, todayISO } from "@/lib/format";

export const Route = createFileRoute("/teams")({
  head: () => ({
    meta: [
      { title: "Teams & Goalkeeper Slots — M25" },
      {
        name: "description",
        content:
          "Create a team in your kit colour, join an existing squad, see how many spaces are left, reserve a dedicated goalkeeper position and build your lineup before kick-off.",
      },
      { property: "og:title", content: "Teams & Goalkeeper Slots — M25" },
      {
        property: "og:description",
        content: "Team colours, live squad spaces, goalkeeper availability and pre-arrival lineups.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: TeamsPage,
});

type LineupRow = { name: string; isGoalkeeper: boolean; teamId: string | null };

function TeamsPage() {
  const queryClient = useQueryClient();
  const availability = useServerFn(listArenaAvailability);
  const squads = useServerFn(listSlotTeams);
  const createTeam = useServerFn(createSlotTeam);
  const joinTeam = useServerFn(joinSlotTeam);
  const saveLineup = useServerFn(updateBookingLineup);

  const { data: slots } = useQuery({
    queryKey: ["arena-availability"],
    queryFn: () => availability({ data: { fromDate: todayISO() } }),
  });

  const [slotId, setSlotId] = useState<string | null>(null);
  useEffect(() => {
    if (!slotId && slots && slots.length > 0) setSlotId(slots[0]!.id);
  }, [slots, slotId]);

  const { data: squad, isLoading } = useQuery({
    queryKey: ["slot-squads", slotId],
    queryFn: () => squads({ data: { slotId: slotId! } }),
    enabled: Boolean(slotId),
  });

  const refresh = () => {
    void queryClient.invalidateQueries({ queryKey: ["slot-squads", slotId] });
    void queryClient.invalidateQueries({ queryKey: ["arena-availability"] });
  };

  const usedColors = useMemo(() => new Set((squad?.teams ?? []).map((t) => t.color)), [squad]);

  const [teamName, setTeamName] = useState("");
  const [teamColor, setTeamColor] = useState<TeamColor>("lime");
  const [maxPlayers, setMaxPlayers] = useState(10);

  const [join, setJoin] = useState({
    playerName: "",
    email: "",
    phone: "",
    teamId: "none",
    isGoalkeeper: false,
    payNow: true,
  });
  const [issued, setIssued] = useState<{ code: string; amount: number } | null>(null);

  const [ticketCode, setTicketCode] = useState("");
  const [lineup, setLineup] = useState<LineupRow[]>([{ name: "", isGoalkeeper: false, teamId: null }]);

  const createMutation = useMutation({
    mutationFn: () =>
      createTeam({ data: { slotId: slotId!, name: teamName, color: teamColor, maxPlayers } }),
    onSuccess: () => {
      toast.success("Team created — share the slot with your mates");
      setTeamName("");
      refresh();
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const joinMutation = useMutation({
    mutationFn: () =>
      joinTeam({
        data: {
          slotId: slotId!,
          teamId: join.teamId === "none" ? null : join.teamId,
          playerName: join.playerName,
          isGoalkeeper: join.isGoalkeeper,
          customerEmail: join.email,
          customerPhone: join.phone,
          paymentMethod: join.payNow ? "paystack" : "cash",
        },
      }),
    onSuccess: (result) => {
      setIssued({ code: result.ticketCode, amount: result.amount });
      toast.success(
        join.isGoalkeeper ? "Goalkeeper position reserved" : "You're in — ticket issued",
      );
      setJoin({ ...join, playerName: "", isGoalkeeper: false });
      refresh();
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const lineupMutation = useMutation({
    mutationFn: () =>
      saveLineup({
        data: {
          ticketCode,
          players: lineup
            .filter((row) => row.name.trim().length > 0)
            .map((row) => ({
              name: row.name.trim(),
              isGoalkeeper: row.isGoalkeeper,
              teamId: row.teamId,
            })),
        },
      }),
    onSuccess: (result) => {
      toast.success(`Lineup saved — ${result.players} player(s), ${result.goalkeepers} GK`);
      refresh();
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const selectedSlot = slots?.find((s) => s.id === slotId) ?? null;

  return (
    <div className="min-h-screen">
      <SiteHeader />
      <main className="mx-auto max-w-6xl px-4 py-10">
        <h1 className="text-4xl md:text-5xl">Teams &amp; goalkeepers</h1>
        <p className="mt-2 max-w-2xl text-muted-foreground">
          Pick a session, start a squad in your kit colour or join one that already has space. Dedicated
          goalkeeper positions are reserved separately so every team walks out with a keeper.
        </p>

        <div className="mt-6">
          <Label>Session</Label>
          <Select value={slotId ?? ""} onValueChange={setSlotId}>
            <SelectTrigger className="mt-1 w-full max-w-md">
              <SelectValue placeholder="Choose a session" />
            </SelectTrigger>
            <SelectContent>
              {(slots ?? []).map((slot) => (
                <SelectItem key={slot.id} value={slot.id}>
                  {dateLabel(slot.slot_date)} · {timeLabel(slot.start_time)} –{" "}
                  {timeLabel(slot.end_time)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {squad && (
          <div className="mt-6 grid gap-3 sm:grid-cols-3">
            <div className="panel p-4">
              <p className="flex items-center gap-2 text-sm text-muted-foreground">
                <Users className="size-4" /> Outfield spaces
              </p>
              <p className="font-display text-4xl text-primary">{squad.playersLeft}</p>
              <p className="text-xs text-muted-foreground">
                of {squad.slot.player_capacity} · {naira(squad.slot.price_per_player)} per player
              </p>
            </div>
            <div className="panel p-4">
              <p className="flex items-center gap-2 text-sm text-muted-foreground">
                <Hand className="size-4" /> Goalkeeper positions
              </p>
              <p className="font-display text-4xl text-primary">{squad.keepersLeft}</p>
              <p className="text-xs text-muted-foreground">
                of {squad.slot.gk_capacity} dedicated GK slots
              </p>
            </div>
            <div className="panel p-4">
              <p className="flex items-center gap-2 text-sm text-muted-foreground">
                <Shield className="size-4" /> Teams registered
              </p>
              <p className="font-display text-4xl text-primary">{squad.teams.length}</p>
              <p className="text-xs text-muted-foreground">
                {squad.freeAgents.length} player(s) still without a team
              </p>
            </div>
          </div>
        )}

        <section className="mt-10">
          <h2 className="text-2xl">Squads &amp; available spaces</h2>
          {isLoading && <p className="mt-3 text-sm text-muted-foreground">Loading squads…</p>}
          {squad?.pitchBooked && (
            <p className="mt-3 text-sm text-destructive">
              This session is booked as a private match — pick another session.
            </p>
          )}
          <div className="mt-4 grid gap-4 md:grid-cols-2">
            {(squad?.teams ?? []).map((team) => (
              <div key={team.id} className="panel p-4">
                <div className="flex items-center justify-between gap-3">
                  <div className="flex items-center gap-3">
                    <span
                      className="size-6 rounded-full border border-border"
                      style={{ backgroundColor: colorHex(team.color) }}
                      aria-hidden
                    />
                    <div>
                      <p className="font-display text-2xl leading-none">{team.name}</p>
                      <p className="text-xs capitalize text-muted-foreground">{team.color} kit</p>
                    </div>
                  </div>
                  <Badge variant={team.spacesLeft > 0 ? "outline" : "destructive"}>
                    {team.spacesLeft > 0 ? `${team.spacesLeft} spaces left` : "Full"}
                  </Badge>
                </div>
                <div className="mt-3 flex flex-wrap gap-2 text-xs">
                  {team.players.length === 0 && (
                    <span className="text-muted-foreground">No players registered yet.</span>
                  )}
                  {team.players.map((player, index) => (
                    <span
                      key={`${team.id}-${index}`}
                      className="rounded-full border border-border bg-secondary/50 px-3 py-1"
                    >
                      {player.name}
                      {player.isGoalkeeper ? " · GK" : ""}
                    </span>
                  ))}
                </div>
                <p className="mt-3 text-xs text-muted-foreground">
                  {team.keepers > 0 ? "Goalkeeper confirmed" : "Still needs a goalkeeper"}
                </p>
              </div>
            ))}
            {squad && squad.teams.length === 0 && !isLoading && (
              <p className="text-sm text-muted-foreground">
                No teams yet for this session — be the first to create one.
              </p>
            )}
          </div>
        </section>

        <div className="mt-10 grid gap-6 lg:grid-cols-2">
          <section className="panel space-y-4 p-5">
            <h2 className="text-2xl">Create a team</h2>
            <div>
              <Label htmlFor="teamName">Team name</Label>
              <Input
                id="teamName"
                value={teamName}
                placeholder="Lekki Lions"
                onChange={(e) => setTeamName(e.target.value)}
              />
            </div>
            <div>
              <Label>Team colour</Label>
              <div className="mt-2 flex flex-wrap gap-2">
                {teamColors.map((color) => {
                  const taken = usedColors.has(color.value);
                  return (
                    <button
                      key={color.value}
                      type="button"
                      disabled={taken}
                      onClick={() => setTeamColor(color.value)}
                      aria-label={`${color.label} kit${taken ? " (taken)" : ""}`}
                      className={`flex items-center gap-2 rounded-full border px-3 py-1.5 text-xs transition-colors ${
                        teamColor === color.value
                          ? "border-primary bg-primary/10"
                          : "border-border bg-secondary/40"
                      } ${taken ? "cursor-not-allowed opacity-40" : ""}`}
                    >
                      <span
                        className="size-4 rounded-full border border-border"
                        style={{ backgroundColor: color.hex }}
                      />
                      {color.label}
                    </button>
                  );
                })}
              </div>
            </div>
            <div>
              <Label htmlFor="maxPlayers">Squad size</Label>
              <Input
                id="maxPlayers"
                type="number"
                min={4}
                max={11}
                value={maxPlayers}
                onChange={(e) => setMaxPlayers(Number(e.target.value))}
              />
            </div>
            <Button
              disabled={!slotId || teamName.trim().length < 2 || createMutation.isPending}
              onClick={() => createMutation.mutate()}
            >
              Create team
            </Button>
          </section>

          <section className="panel space-y-4 p-5">
            <h2 className="text-2xl">Join a team</h2>
            <div>
              <Label htmlFor="playerName">Your name</Label>
              <Input
                id="playerName"
                value={join.playerName}
                onChange={(e) => setJoin({ ...join, playerName: e.target.value })}
              />
            </div>
            <div>
              <Label htmlFor="joinEmail">Email (ticket is sent here)</Label>
              <Input
                id="joinEmail"
                type="email"
                value={join.email}
                onChange={(e) => setJoin({ ...join, email: e.target.value })}
              />
            </div>
            <div>
              <Label htmlFor="joinPhone">Phone</Label>
              <Input
                id="joinPhone"
                value={join.phone}
                onChange={(e) => setJoin({ ...join, phone: e.target.value })}
              />
            </div>
            <div>
              <Label>Team</Label>
              <Select value={join.teamId} onValueChange={(value) => setJoin({ ...join, teamId: value })}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">No team yet (free agent)</SelectItem>
                  {(squad?.teams ?? []).map((team) => (
                    <SelectItem key={team.id} value={team.id} disabled={team.spacesLeft < 1}>
                      {team.name} — {team.spacesLeft} space(s)
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <label className="flex items-center justify-between rounded-lg border border-border bg-secondary/40 px-3 py-2 text-sm">
              <span>
                Register as goalkeeper
                <span className="block text-xs text-muted-foreground">
                  {squad ? `${squad.keepersLeft} GK position(s) available` : "Checking availability…"}
                </span>
              </span>
              <Switch
                checked={join.isGoalkeeper}
                disabled={Boolean(squad) && squad!.keepersLeft < 1}
                onCheckedChange={(checked) => setJoin({ ...join, isGoalkeeper: checked })}
              />
            </label>
            <label className="flex items-center justify-between rounded-lg border border-border bg-secondary/40 px-3 py-2 text-sm">
              <span>Pay online now</span>
              <Switch
                checked={join.payNow}
                onCheckedChange={(checked) => setJoin({ ...join, payNow: checked })}
              />
            </label>
            <Button
              disabled={
                !slotId ||
                join.playerName.trim().length < 2 ||
                join.email.trim().length < 5 ||
                joinMutation.isPending
              }
              onClick={() => joinMutation.mutate()}
            >
              {join.isGoalkeeper ? "Reserve goalkeeper position" : "Join session"}
            </Button>
            {issued && (
              <div className="rounded-lg border border-success/50 bg-success/10 p-4">
                <p className="text-sm text-muted-foreground">Your ticket code</p>
                <p className="font-display text-4xl tracking-widest">{issued.code}</p>
                <p className="mt-1 text-sm">{naira(issued.amount)} · show this at the gate.</p>
              </div>
            )}
          </section>
        </div>

        <section className="panel mt-10 space-y-4 p-5">
          <div>
            <h2 className="text-2xl">Build your lineup before arrival</h2>
            <p className="text-sm text-muted-foreground">
              Already booked? Enter your ticket code to name every player, assign them to a team colour
              and mark your goalkeeper.
            </p>
          </div>
          <div className="grid gap-3 sm:grid-cols-[220px_1fr] sm:items-end">
            <div>
              <Label htmlFor="lineupTicket">Ticket code</Label>
              <Input
                id="lineupTicket"
                value={ticketCode}
                placeholder="FA-XXXXXX"
                onChange={(e) => setTicketCode(e.target.value.toUpperCase())}
              />
            </div>
            <p className="text-xs text-muted-foreground">
              The number of names must match the players on your ticket.
            </p>
          </div>

          <div className="space-y-3">
            {lineup.map((row, index) => (
              <div
                key={index}
                className="flex flex-wrap items-center gap-3 rounded-lg border border-border bg-secondary/40 p-3"
              >
                <Input
                  className="max-w-xs"
                  value={row.name}
                  placeholder={`Player ${index + 1}`}
                  onChange={(e) =>
                    setLineup((rows) =>
                      rows.map((r, i) => (i === index ? { ...r, name: e.target.value } : r)),
                    )
                  }
                />
                <Select
                  value={row.teamId ?? "none"}
                  onValueChange={(value) =>
                    setLineup((rows) =>
                      rows.map((r, i) =>
                        i === index ? { ...r, teamId: value === "none" ? null : value } : r,
                      ),
                    )
                  }
                >
                  <SelectTrigger className="w-[200px]">
                    <SelectValue placeholder="Team" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">No team</SelectItem>
                    {(squad?.teams ?? []).map((team) => (
                      <SelectItem key={team.id} value={team.id}>
                        {team.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <label className="flex items-center gap-2 text-sm">
                  <Switch
                    checked={row.isGoalkeeper}
                    onCheckedChange={(checked) =>
                      setLineup((rows) =>
                        rows.map((r, i) => (i === index ? { ...r, isGoalkeeper: checked } : r)),
                      )
                    }
                  />
                  Goalkeeper
                </label>
                <Button
                  variant="outline"
                  size="icon"
                  aria-label="Remove player"
                  onClick={() => setLineup((rows) => rows.filter((_, i) => i !== index))}
                >
                  <Trash2 className="size-4" />
                </Button>
              </div>
            ))}
            <div className="flex flex-wrap gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() =>
                  setLineup((rows) => [...rows, { name: "", isGoalkeeper: false, teamId: null }])
                }
              >
                <Plus className="mr-1 size-4" /> Add player
              </Button>
              <Button
                disabled={ticketCode.trim().length < 4 || lineupMutation.isPending}
                onClick={() => lineupMutation.mutate()}
              >
                Save lineup
              </Button>
            </div>
          </div>
        </section>
      </main>
      <SiteFooter />
    </div>
  );
}
