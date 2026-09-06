import { RouteLoading } from "@/components/route-loading";

/**
 * Covers every route under this group in one place: the dashboard, /new,
 * /workspaces/new-gitlab, /billing, and — since layouts nest — every
 * /projects/[projectId]/* tab, including the async permission check in
 * projects/[projectId]/layout.tsx that currently runs with nothing shown.
 */
export default function Loading() {
  return <RouteLoading />;
}
