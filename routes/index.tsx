import { createFileRoute, Link } from "@tanstack/react-router";
import { CalendarCheck, QrCode, ShieldCheck, Ticket, Users, Utensils } from "lucide-react";

import arenaHero from "@/assets/arena-hero.jpg";
import loungeHero from "@/assets/lounge-hero.jpg";
import { SiteFooter, SiteHeader } from "@/components/SiteHeader";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "M25 — Book Five-a-Side Pitch & Lounge Tables" },
      {
        name: "description",
        content:
          "Reserve player slots, goalkeeper spots or the whole pitch, then pre-order food and drinks at the lounge. Instant digital tickets, no account needed.",
      },
      { property: "og:title", content: "M25" },
      {
        property: "og:description",
        content: "Book pitch slots, pick your team colour and pre-order from the lounge menu.",
      },
    ],
  }),
  component: Home,
});

const arenaFeatures = [
  { icon: CalendarCheck, title: "Live slot availability", body: "See open player, goalkeeper and full-pitch slots for the next 7 days." },
  { icon: Users, title: "Team & colour picking", body: "Join a team, register teammates and build your lineup before you arrive." },
  { icon: Ticket, title: "Instant digital ticket", body: "A unique code is generated on payment and verified at the gate." },
];

const loungeFeatures = [
  { icon: Utensils, title: "Table reservations", body: "Pick a table, date and time, then pre-order your food and drinks." },
  { icon: QrCode, title: "QR ordering at table", body: "Scan the table code, browse the live menu and order without waiting." },
  { icon: ShieldCheck, title: "Smart staff assignment", body: "Orders are shared evenly across available waiters automatically." },
];

function Home() {
  return (
    <div className="min-h-screen">
      <SiteHeader />

      <section className="relative overflow-hidden border-b border-border">
        <img
          src={arenaHero}
          alt="Floodlit five-a-side pitch at night with players in motion"
          width={1600}
          height={912}
          className="absolute inset-0 size-full object-cover opacity-40"
        />
        <div className="relative mx-auto max-w-6xl px-4 py-24 md:py-32">
          <p className="mb-3 text-sm font-semibold uppercase tracking-[0.3em] text-primary">
            Quadri Adebambo · Lagos
          </p>
          <h1 className="max-w-3xl text-5xl leading-[0.95] md:text-7xl">
            Book the pitch. Pick your team. Eat after the whistle.
          </h1>
          <p className="mt-5 max-w-xl text-lg text-muted-foreground">
            One platform for arena bookings, goalkeeper slots, digital tickets, lounge reservations and
            table-side ordering — no account required.
          </p>
          <div className="mt-8 flex flex-wrap gap-3">
            <Button asChild size="lg">
              <Link to="/book">Book a pitch slot</Link>
            </Button>
            <Button asChild size="lg" variant="outline">
              <Link to="/lounge">Reserve a lounge table</Link>
            </Button>
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-4 py-16">
        <h2 className="text-3xl md:text-4xl">The arena</h2>
        <div className="mt-6 grid gap-4 md:grid-cols-3">
          {arenaFeatures.map((f) => (
            <article key={f.title} className="panel p-5">
              <f.icon className="size-6 text-primary" />
              <h3 className="mt-4 text-2xl">{f.title}</h3>
              <p className="mt-1 text-sm text-muted-foreground">{f.body}</p>
            </article>
          ))}
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-4 pb-16">
        <div className="panel grid gap-0 overflow-hidden md:grid-cols-2">
          <img
            src={loungeHero}
            alt="Dark green sports lounge with leather booths and big screens"
            width={1200}
            height={800}
            loading="lazy"
            className="h-full w-full object-cover"
          />
          <div className="p-6 md:p-10">
            <h2 className="text-3xl md:text-4xl">The lounge</h2>
            <ul className="mt-6 space-y-5">
              {loungeFeatures.map((f) => (
                <li key={f.title} className="flex gap-3">
                  <f.icon className="mt-1 size-5 shrink-0 text-accent" />
                  <div>
                    <p className="font-semibold">{f.title}</p>
                    <p className="text-sm text-muted-foreground">{f.body}</p>
                  </div>
                </li>
              ))}
            </ul>
            <Button asChild className="mt-8" variant="outline">
              <Link to="/lounge">Browse menu &amp; reserve</Link>
            </Button>
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-4 pb-8">
        <div className="panel flex flex-col items-start justify-between gap-4 p-6 md:flex-row md:items-center">
          <div>
            <h2 className="text-2xl">Already booked?</h2>
            <p className="text-sm text-muted-foreground">
              Look up your ticket code to check your slot, lineup and payment status.
            </p>
          </div>
          <Button asChild>
            <Link to="/ticket">Find my ticket</Link>
          </Button>
        </div>
      </section>

      <SiteFooter />
    </div>
  );
}
