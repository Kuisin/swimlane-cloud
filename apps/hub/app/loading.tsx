import { RefreshCw } from "lucide-react";

/**
 * Every page here is an async Server Component (reads straight from GitHub
 * on each request); without this, that fetch renders nothing at all. Placed
 * at the app root so it covers every route below it.
 */
export default function Loading() {
  return (
    <div className="flex h-screen items-center justify-center gap-2 text-sm text-neutral-500">
      <RefreshCw size={16} className="animate-spin" />
      Loading…
    </div>
  );
}
