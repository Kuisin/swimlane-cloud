/**
 * Human labels for the three branches an end user actually thinks about.
 * Everywhere a branch name reaches the UI it should go through here first, so
 * "preview" and "main" never appear as bare git vocabulary to a non-technical
 * user — they see 承認済み (Approved) and 公開済み (Published) instead, with the
 * raw name kept around only as secondary, monospace detail.
 */
import {
  editBranchOwner,
  INTEGRATION_BRANCH,
  isEditBranch,
  PROD_BRANCH,
} from "@swimlane-cloud/github-client";

export type BranchKindLabel = "preview" | "main" | "edit" | "other";

export function branchKindOf(name: string): BranchKindLabel {
  if (name === PROD_BRANCH) return "main";
  if (name === INTEGRATION_BRANCH) return "preview";
  if (isEditBranch(name)) return "edit";
  return "other";
}

/** `t` is the SaaS i18n `useT().t`, taking a dotted key and optional interpolation vars. */
export function branchLabel(
  name: string,
  t: (key: string, vars?: Record<string, string>) => string,
): string {
  switch (branchKindOf(name)) {
    case "main":
      return t("branch.main");
    case "preview":
      return t("branch.preview");
    case "edit":
      return t("branch.edit", { user: editBranchOwner(name) ?? name });
    default:
      return name;
  }
}
