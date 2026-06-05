"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

/**
 * Demo login. The UI is kept for show, but authentication is bypassed — any
 * input (or none) just proceeds to the dashboard. No Supabase call is made.
 */
export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    router.push("/dashboard");
  }

  return (
    <main className="mx-auto flex min-h-screen max-w-sm flex-col justify-center gap-6 px-6">
      <div className="space-y-2 text-center">
        <h1 className="text-2xl font-semibold">Sign in</h1>
        <p className="text-sm text-neutral-500">
          Demo mode — enter anything (or nothing) to continue.
        </p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-4">
        <input
          type="email"
          autoComplete="email"
          placeholder="you@company.com"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className="w-full rounded-md border border-neutral-300 px-3 py-2 text-sm"
        />
        <input
          type="password"
          autoComplete="current-password"
          placeholder="Password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          className="w-full rounded-md border border-neutral-300 px-3 py-2 text-sm"
        />
        <button
          type="submit"
          className="w-full rounded-md bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-500"
        >
          Continue
        </button>
      </form>

      <p className="text-center text-sm text-neutral-500">
        <button
          type="button"
          onClick={() => router.push("/dashboard")}
          className="font-medium text-indigo-600 hover:underline"
        >
          Skip sign-in →
        </button>
      </p>
    </main>
  );
}
