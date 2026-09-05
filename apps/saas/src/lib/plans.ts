/**
 * Plan limits. Billing itself is deferred; this is the gate the Stripe
 * webhook (which only ever updates `workspaces.plan`) will eventually feed.
 */
import { ApiError } from "./api";
import { getServiceSupabase } from "./supabase/server";

export type Plan = "free" | "team" | "enterprise";

export const PLAN_LIMITS: Record<Plan, { projects: number }> = {
  free: { projects: 3 },
  team: { projects: 50 },
  enterprise: { projects: Number.POSITIVE_INFINITY },
};

/** 402 `{upgrade:true}` when the workspace (a GitHub owner) is at its project cap. */
export async function assertPlanAllowsProject(workspaceId: string, plan: Plan): Promise<void> {
  const limit = PLAN_LIMITS[plan]?.projects ?? PLAN_LIMITS.free.projects;
  if (!Number.isFinite(limit)) return;
  const supabase = getServiceSupabase();
  const { count } = await supabase
    .from("projects")
    .select("id", { count: "exact", head: true })
    .eq("workspace_id", workspaceId);
  if ((count ?? 0) >= limit) {
    throw new ApiError(
      402,
      `The ${plan} plan allows ${limit} projects per GitHub owner. Upgrade to open more.`,
      { upgrade: true, plan, limit, workspaceId },
    );
  }
}

/**
 * Whether a workspace on this plan may *initialise a brand-new repository*
 * through the app (mode: "create" — a seeded private repo, branches, sample
 * diagram, templates). Free-plan workspaces can still use Swimlane Cloud on
 * repositories they already have — via "mark an existing repository" — but
 * spinning up new ones is a paid-plan action.
 */
export function planAllowsRepoCreation(plan: Plan): boolean {
  return plan !== "free";
}

/** 402 `{upgrade:true}` unless the workspace's plan allows creating new repositories. */
export function assertPlanAllowsRepoCreation(plan: Plan): void {
  if (planAllowsRepoCreation(plan)) return;
  throw new ApiError(
    402,
    "Creating a new repository needs a team or enterprise plan. Free-plan workspaces can mark an existing repository instead.",
    { upgrade: true, plan },
  );
}
