import { RouteLoading } from "@/components/route-loading";

/** page.tsx is an async Server Component (force-dynamic Supabase query) — this covers that wait. */
export default function Loading() {
  return <RouteLoading />;
}
