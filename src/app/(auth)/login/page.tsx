"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { DEMO_PASSWORD } from "@/lib/constants";
import { Spinner } from "@/components/ui/feedback";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("krish@indra.local");
  const [password, setPassword] = useState(DEMO_PASSWORD);
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setLoading(true);
    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });
      const json = await res.json();
      if (!json.success) {
        throw new Error(json.error || "Login failed");
      }
      toast.success(`Welcome, ${json.data.user.name}`);
      router.push(json.data.redirectTo);
      router.refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Login failed");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="relative flex min-h-screen items-center justify-center overflow-hidden bg-[var(--sidebar)] px-4">
      <div className="pointer-events-none absolute inset-0 display-grid-bg opacity-90" />
      <div className="relative w-full max-w-md rounded-3xl border border-white/10 bg-white/95 p-6 shadow-2xl backdrop-blur sm:p-8">
        <div className="mb-6 text-center sm:mb-8">
          <p className="text-[11px] font-semibold uppercase tracking-[0.28em] text-[var(--brand-gold)]">
            Indra Traders (PVT) LTD
          </p>
          <h1 className="font-display mt-2 text-2xl font-bold text-[var(--foreground)] sm:text-3xl">
            Test Drive Tokens
          </h1>
          <p className="mt-2 text-sm text-[var(--muted)]">
            Sign in to manage the showroom queue
          </p>
        </div>

        <form onSubmit={onSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="email">Email</Label>
            <Input
              id="email"
              type="email"
              autoComplete="username"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="password">Password</Label>
            <Input
              id="password"
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />
          </div>
          <Button type="submit" className="w-full" size="lg" disabled={loading}>
            {loading ? (
              <>
                <Spinner className="text-white" /> Signing in...
              </>
            ) : (
              "Sign In"
            )}
          </Button>
        </form>

        <div className="mt-6 rounded-2xl border border-dashed border-amber-300 bg-amber-50 p-4 text-xs text-amber-900">
          <p className="font-semibold">COLOMBO FLOOR LOGINS</p>
          <ul className="mt-2 space-y-1">
            <li>krish@indra.local</li>
            <li>umesh@indra.local</li>
            <li>imithiyaz@indra.local</li>
            <li>buwaneka@indra.local</li>
            <li>omith@indra.local</li>
            <li>admin@indra.local — admin</li>
            <li>Password: {DEMO_PASSWORD}</li>
          </ul>
          <p className="mt-2 text-amber-800/80">
            Same login works on multiple devices. Floor accounts can issue
            tokens and control the queue.
          </p>
        </div>
      </div>
    </div>
  );
}
