import { Link } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";

const links = [
  { to: "/", label: "Home" },
  { to: "/book", label: "Book Pitch" },
  { to: "/teams", label: "Teams & GK" },
  { to: "/lounge", label: "Lounge" },
  { to: "/ticket", label: "My Ticket" },
] as const;


export function SiteHeader() {
  return (
    <header className="sticky top-0 z-40 border-b border-border/70 bg-background/85 backdrop-blur">
      <div className="mx-auto flex h-16 max-w-6xl items-center justify-between gap-4 px-4">
        <Link to="/" className="flex items-center gap-2">
          <span className="grid size-9 place-items-center rounded-md bg-primary text-primary-foreground font-display text-xl">
            M
          </span>
          <span className="font-display text-2xl leading-none">
            M25
          </span>
        </Link>

        <nav className="hidden items-center gap-1 md:flex">
          {links.map((link) => (
            <Link
              key={link.to}
              to={link.to}
              activeOptions={{ exact: link.to === "/" }}
              className="rounded-md px-3 py-2 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground"
              activeProps={{ className: "text-primary" }}
            >
              {link.label}
            </Link>
          ))}
        </nav>

        <div className="flex items-center gap-2">
          <Button asChild variant="ghost" size="sm">
            <Link to="/auth">Staff</Link>
          </Button>
          <Button asChild size="sm">
            <Link to="/book">Book now</Link>
          </Button>
        </div>
      </div>
    </header>
  );
}

export function SiteFooter() {
  return (
    <footer className="mt-20 border-t border-border/70 py-10">
      <div className="mx-auto flex max-w-6xl flex-col gap-3 px-4 text-sm text-muted-foreground md:flex-row md:items-center md:justify-between">
        <p className="font-display text-lg text-foreground">M25</p>
        <p>Open daily 8:00 AM – 11:00 PM · Quadri Adebambo, Lagos · +234 800 000 0000</p>
      </div>
    </footer>
  );
}
