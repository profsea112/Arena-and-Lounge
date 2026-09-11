import { useEffect, useState } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { toast } from "sonner";

import { supabase } from "@/integrations/supabase/client";
import { lovable } from "@/integrations/lovable/index";
import { SiteFooter, SiteHeader } from "@/components/SiteHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { logAudit } from "@/lib/audit";

export const Route = createFileRoute("/auth")({
  head: () => ({
    meta: [
      { title: "Staff Sign In — M25" },
      {
        name: "description",
        content: "Sign in to the staff console to manage pitch bookings, lounge tables, orders and inventory.",
      },
      { property: "og:title", content: "Staff Sign In — M25" },
      { property: "og:description", content: "Staff access to the arena and lounge operations console." },
    ],
  }),
  component: AuthPage,
});

function AuthPage() {
  const navigate = useNavigate();
  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [fullName, setFullName] = useState("");
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  useEffect(() => {
    const { data } = supabase.auth.onAuthStateChange((event) => {
      if (event === "SIGNED_IN") {
        void logAudit({ action: "staff.sign_in", entityType: "session" });
        void navigate({ to: "/staff" });
      }
    });
    void supabase.auth.getSession().then(({ data: session }) => {
      if (session.session) void navigate({ to: "/staff" });
    });
    return () => data.subscription.unsubscribe();
  }, [navigate]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setNotice(null);
    try {
      if (mode === "signup") {
        const { data, error } = await supabase.auth.signUp({
          email,
          password,
          options: {
            emailRedirectTo: window.location.origin,
            data: { full_name: fullName },
          },
        });
        if (error) throw error;
        // Supabase returns a user with no identities when the email already exists.
        if (data.user && (data.user.identities?.length ?? 0) === 0) {
          setMode("signin");
          setNotice(
            "An account already exists for this email. Sign in with your password, use “Continue with Google”, or send yourself a reset link below to set a new password.",
          );
          return;
        }
        if (data.session) {
          return;
        }
        setNotice("Account created. Check your email for the confirmation link, then sign in.");
        setMode("signin");
      } else {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) {
          if (error.message.toLowerCase().includes("invalid login credentials")) {
            setNotice(
              "That email and password don't match. If you first joined with Google, use “Continue with Google”, or send a reset link below to set a password.",
            );
            return;
          }
          if (error.message.toLowerCase().includes("not confirmed")) {
            setNotice("Your email isn't confirmed yet. Open the confirmation link we emailed you, then sign in.");
            return;
          }
          throw error;
        }
      }
    } catch (error) {
      toast.error((error as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const sendReset = async () => {
    if (!email) {
      toast.error("Enter your work email first.");
      return;
    }
    setBusy(true);
    try {
      const { error } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: `${window.location.origin}/reset-password`,
      });
      if (error) throw error;
      setNotice(`Reset link sent to ${email}. Open it to set a new password.`);
    } catch (error) {
      toast.error((error as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const google = async () => {
    const result = await lovable.auth.signInWithOAuth("google", {
      redirect_uri: window.location.origin,
    });
    if (result.error) {
      toast.error("Google sign-in failed. Try email instead.");
      return;
    }
    if (result.redirected) return;
    void navigate({ to: "/staff" });
  };

  return (
    <div className="min-h-screen">
      <SiteHeader />
      <main className="mx-auto max-w-md px-4 py-16">
        <h1 className="text-4xl">Staff console</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Reception, waiters, kitchen and management sign in here.
        </p>

        {notice && (
          <p className="mt-6 rounded-md border border-primary/40 bg-primary/10 p-3 text-sm text-foreground">
            {notice}
          </p>
        )}

        <form onSubmit={submit} className="panel mt-8 space-y-4 p-6">
          {mode === "signup" && (
            <div>
              <Label htmlFor="fullName">Full name</Label>
              <Input id="fullName" value={fullName} onChange={(e) => setFullName(e.target.value)} />
            </div>
          )}
          <div>
            <Label htmlFor="email">Work email</Label>
            <Input
              id="email"
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </div>
          <div>
            <Label htmlFor="password">Password</Label>
            <Input
              id="password"
              type="password"
              required
              minLength={6}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </div>
          <Button type="submit" className="w-full" disabled={busy}>
            {mode === "signin" ? "Sign in" : "Create account"}
          </Button>
          <Button type="button" variant="outline" className="w-full" onClick={google}>
            Continue with Google
          </Button>
          <button
            type="button"
            className="w-full text-sm text-muted-foreground underline"
            onClick={() => setMode(mode === "signin" ? "signup" : "signin")}
          >
            {mode === "signin" ? "Need a staff account? Sign up" : "Already have an account? Sign in"}
          </button>
          <button
            type="button"
            className="w-full text-sm text-muted-foreground underline"
            disabled={busy}
            onClick={sendReset}
          >
            Forgot password? Send a reset link
          </button>
        </form>
      </main>
      <SiteFooter />
    </div>
  );
}
