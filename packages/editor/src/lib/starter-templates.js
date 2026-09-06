/**
 * Curated whole-diagram starters offered from the GUI empty state, so a
 * first-time user can pick a recognizable shape instead of starting from a
 * single blank step. Each is a complete, independently valid `.txt` — every
 * entry is asserted to parse with zero errors (starter-templates.test.js), so
 * a broken starter never becomes a new user's first impression.
 */

const SIMPLE_APPROVAL = `@kai-swimlane

/title/
Simple approval

/role/

<applicant>
label: Applicant;

<approver>
label: Approver;

/line/

[applicant: Submit request]
[approver: Review request]
[approver: Approve request]

@end
`;

const YES_NO_DECISION = `@kai-swimlane

/title/
Yes or no decision

/role/

<applicant>
label: Applicant;

<approver>
label: Approver;

/line/

[applicant: Submit request]
if (approved?) is (yes) than #green
  [approver: Approve request]
elseif (no) than #red
  [approver: Reject request]
endif

@end
`;

const PARALLEL_TASKS = `@kai-swimlane

/title/
Parallel tasks

/role/

<system>
label: System;

<accounting>
label: Accounting;

<hr_team>
label: HR;

/line/

[system: Receive order]
fork
  [system: Send confirmation email]
and
  [accounting: Update ledger]
and
  [hr_team: Save record]
endfork

@end
`;

export const STARTER_TEMPLATES = [
  {
    id: "simple-approval",
    titleKey: "starter.simpleApproval",
    descriptionKey: "starter.simpleApprovalDesc",
    dsl: SIMPLE_APPROVAL,
  },
  {
    id: "yes-no-decision",
    titleKey: "starter.yesNoDecision",
    descriptionKey: "starter.yesNoDecisionDesc",
    dsl: YES_NO_DECISION,
  },
  {
    id: "parallel-tasks",
    titleKey: "starter.parallelTasks",
    descriptionKey: "starter.parallelTasksDesc",
    dsl: PARALLEL_TASKS,
  },
];
