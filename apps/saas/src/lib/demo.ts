/**
 * Demo content for the no-backend showcase build. The SaaS shell (login UI,
 * dashboard, project editor) runs without Gitea/Supabase: projects are a fixed
 * list and diagrams live in the browser's localStorage (see browser-host.ts).
 */

export interface DemoProject {
  id: string;
  name: string;
  workspace: string;
}

export const DEMO_PROJECTS: DemoProject[] = [
  { id: "onboarding", name: "Employee Onboarding", workspace: "Operations" },
  { id: "expenses", name: "Expense Approval", workspace: "Finance" },
  { id: "hiring", name: "Hiring Pipeline", workspace: "People" },
];

export function demoProjectName(id: string): string {
  return DEMO_PROJECTS.find((p) => p.id === id)?.name ?? "Project";
}

const onboarding = `@kai-swimlane
/title/
Employee Onboarding
/option/
show-left-gutter: true;
show-right-gutter: true;
/role/
<hr: HR> #blue
<it: IT> #green
<mgr: Manager> #orange
/line/
[hr: Send offer letter]
[hr: Collect documents]
[it: Provision accounts]
[mgr: Assign onboarding buddy]
[hr: Day-1 orientation]
@end
`;

const expenses = `@kai-swimlane
/title/
Expense Approval
/option/
show-left-gutter: true;
show-right-gutter: true;
/role/
<emp: Employee> #blue
<mgr: Manager> #orange
<fin: Finance> #green
/line/
[emp: Submit expense]
if (amount over limit?) is (yes) than
[mgr: Review request]
else
[fin: Auto-approve]
endif
[fin: Reimburse]
@end
`;

const hiring = `@kai-swimlane
/title/
Hiring Pipeline
/option/
show-left-gutter: true;
show-right-gutter: true;
/role/
<rec: Recruiter> #blue
<hm: Hiring Manager> #orange
<cand: Candidate> #green
/line/
[rec: Screen applicants]
[hm: Phone interview]
[hm: On-site interview]
[rec: Make offer]
[cand: Accept offer]
@end
`;

const SEEDS: Record<string, Record<string, string>> = {
  onboarding: { "onboarding.txt": onboarding },
  expenses: { "expenses.txt": expenses },
  hiring: { "hiring.txt": hiring },
};

/** Seed files for a demo project (path → DSL), or a generic blank doc. */
export function demoSeed(projectId: string): Record<string, string> {
  return (
    SEEDS[projectId] ?? {
      "untitled.txt": `@kai-swimlane\n/title/\nUntitled\n/role/\n<role01: Team> #blue\n/line/\n[role01: Start]\n[role01: Done]\n@end\n`,
    }
  );
}
