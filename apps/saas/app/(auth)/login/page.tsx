"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { getBrowserSupabase } from "@/lib/supabase/client";

type Mode = "signin" | "signup";

export default function LoginPage() {
  const router = useRouter();
  const [mode, setMode] = useState<Mode>("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const supabase = getBrowserSupabase();
      const { error } =
        mode === "signup"
          ? await supabase.auth.signUp({ email, password })
          : await supabase.auth.signInWithPassword({ email, password });
      if (error) throw error;
      // Email confirmation is disabled (auto-confirm), so both paths return a
      // session immediately. The browser client persists it to cookies, so the
      // server sees the session on the next navigation.
      router.push("/dashboard");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Authentication failed");
      setBusy(false);
    }
  }

  return (
    <main className="mx-auto flex min-h-screen max-w-sm flex-col justify-center gap-6 px-6">
      <div className="space-y-2 text-center">
        <h1 className="text-2xl font-semibold">
          {mode === "signup" ? "Create account" : "Sign in"}
        </h1>
        <p className="text-sm text-neutral-500">Email and password.</p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-4">
        <input
          type="email"
          required
          autoComplete="email"
          placeholder="you@company.com"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className="w-full rounded-md border border-neutral-300 px-3 py-2 text-sm"
        />
        <input
          type="password"
          required
          minLength={6}
          autoComplete={mode === "signup" ? "new-password" : "current-password"}
          placeholder="Password (min 6 chars)"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          className="w-full rounded-md border border-neutral-300 px-3 py-2 text-sm"
        />
        <button
          type="submit"
          disabled={busy}
          className="w-full rounded-md bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-500 disabled:opacity-60"
        >
          {busy
            ? "Please wait…"
            : mode === "signup"
              ? "Create account"
              : "Sign in"}
        </button>
        {error && <p className="text-sm text-red-600">{error}</p>}
      </form>

      <p className="text-center text-sm text-neutral-500">
        {mode === "signup" ? "Already have an account?" : "No account yet?"}{" "}
        <button
          type="button"
          className="font-medium text-indigo-600 hover:underline"
          onClick={() => {
            setMode(mode === "signup" ? "signin" : "signup");
            setError(null);
          }}
        >
          {mode === "signup" ? "Sign in" : "Create one"}
        </button>
      </p>
    </main>
  );
}
