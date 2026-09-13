import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import {
  normalizeGitHubRepository,
  normalizeTaskRepositoryLink,
  normalizeGitHubActivity,
  normalizeGitHubConfigStatus,
  formatTaskKey,
  generateBranchTemplate,
  formatShortSha,
  getActivityTypeMeta,
  getSuggestedStatusMeta,
  isValidGitHubUrl,
  formatGitHubActor,
  calculateGitHubActivitySummary,
  canApplySuggestedStatus,
  formatGitHubError,
  getResearchProjectsEndpoint,
  normalizeResearchProjectList,
} from "../../src/app/lib/githubIntegration.ts";

test("1. repository normalization handles camelCase and snake_case", () => {
  const camel = normalizeGitHubRepository({
    id: "REPO-1",
    projectId: "PROJ-1",
    divisionId: "DIV-1",
    githubOwner: "stas-rg",
    githubRepo: "orbit-api",
    defaultBranch: "main",
    isPrivate: false,
    isActive: true,
  });

  assert.equal(camel.id, "REPO-1");
  assert.equal(camel.owner, "stas-rg");
  assert.equal(camel.repo, "orbit-api");
  assert.equal(camel.fullName, "stas-rg/orbit-api");
  assert.equal(camel.divisionId, "DIV-1");
  assert.equal(camel.isActive, true);

  const snake = normalizeGitHubRepository({
    id: "REPO-2",
    project_id: "PROJ-2",
    division_id: null,
    github_owner: "stas-rg",
    github_repo: "iot-service",
    default_branch: "master",
    is_private: true,
    is_active: false,
  });

  assert.equal(snake.id, "REPO-2");
  assert.equal(snake.owner, "stas-rg");
  assert.equal(snake.repo, "iot-service");
  assert.equal(snake.fullName, "stas-rg/iot-service");
  assert.equal(snake.divisionId, null);
  assert.equal(snake.defaultBranch, "master");
  assert.equal(snake.isPrivate, true);
  assert.equal(snake.isActive, false);
});

test("2. activity normalization handles camelCase and snake_case", () => {
  const camel = normalizeGitHubActivity({
    id: "GHA-1",
    repositoryId: "REPO-1",
    taskId: "TASK-DB-1",
    deliveryId: "DELIV-1",
    activityType: "push",
    actorLogin: "irhamdev",
    commitSha: "a1b2c3d4e5f6",
    commitMessage: "fix TASK-184 approval validation",
    suggestedTaskStatus: "DOING",
  });

  assert.equal(camel.id, "GHA-1");
  assert.equal(camel.activityType, "push");
  assert.equal(camel.actorLogin, "irhamdev");
  assert.equal(camel.commitSha, "a1b2c3d4e5f6");
  assert.equal(camel.suggestedTaskStatus, "DOING");

  const snake = normalizeGitHubActivity({
    id: "GHA-2",
    repository_id: "REPO-1",
    task_id: "TASK-DB-2",
    delivery_id: "DELIV-2",
    activity_type: "pull_request_opened",
    github_actor_login: "octocat",
    branch_name: "feature/TASK-184",
    pull_request_number: 42,
    pull_request_title: "[TASK-184] Add auth",
    pull_request_state: "open",
    pull_request_merged: false,
    html_url: "https://github.com/stas-rg/orbit-api/pull/42",
    suggested_task_status: "REVIEW",
  });

  assert.equal(snake.id, "GHA-2");
  assert.equal(snake.activityType, "pull_request_opened");
  assert.equal(snake.actorLogin, "octocat");
  assert.equal(snake.prNumber, 42);
  assert.equal(snake.prTitle, "[TASK-184] Add auth");
  assert.equal(snake.suggestedTaskStatus, "REVIEW");
});

test("3. Task Key display helper formats TASK-<number>", () => {
  assert.equal(formatTaskKey("TASK-184"), "TASK-184");
  assert.equal(formatTaskKey("task-184"), "TASK-184");
  assert.equal(formatTaskKey(""), "");
  assert.equal(formatTaskKey(null), "");
  assert.equal(formatTaskKey(undefined), "");
});

test("4. branch template generation creates clean slug", () => {
  assert.equal(
    generateBranchTemplate("TASK-184", "Authentication Flow"),
    "feature/TASK-184-authentication-flow"
  );
  assert.equal(
    generateBranchTemplate("TASK-12", "Fix bug: approval & review!"),
    "feature/TASK-12-fix-bug-approval-review"
  );
  assert.equal(generateBranchTemplate("TASK-5", ""), "feature/TASK-5");
  assert.equal(generateBranchTemplate(null, "Title"), "");
});

test("5. activity type labels return clear Indonesian text", () => {
  assert.equal(getActivityTypeMeta("push").label, "Push / Commit");
  assert.equal(getActivityTypeMeta("pull_request_opened").label, "PR Dibuka");
  assert.equal(getActivityTypeMeta("pull_request_reopened").label, "PR Dibuka Kembali");
  assert.equal(getActivityTypeMeta("pull_request_synchronize").label, "PR Diperbarui");
  assert.equal(getActivityTypeMeta("pull_request_closed", false).label, "PR Ditutup");
  assert.equal(getActivityTypeMeta("pull_request_closed", true).label, "PR Di-merge");
  assert.equal(getActivityTypeMeta("pull_request_merged").label, "PR Di-merge");
});

test("6. suggested status labels map accurately", () => {
  assert.equal(getSuggestedStatusMeta("DOING")?.label, "Disarankan: DOING");
  assert.equal(getSuggestedStatusMeta("REVIEW")?.label, "Disarankan: REVIEW");
  assert.equal(getSuggestedStatusMeta("DONE")?.label, "Disarankan: DONE");
  assert.equal(getSuggestedStatusMeta(null), null);
  assert.equal(getSuggestedStatusMeta("UNKNOWN"), null);
});

test("7. closed-unmerged PR must NEVER have DONE suggestion UI mapping", () => {
  const closedUnmerged = normalizeGitHubActivity({
    id: "GHA-3",
    activity_type: "pull_request_closed",
    pull_request_merged: false,
    suggested_task_status: "DONE", // Invalid backend hallucination safeguard
  });

  assert.equal(closedUnmerged.suggestedTaskStatus, null);
  assert.equal(getSuggestedStatusMeta(closedUnmerged.suggestedTaskStatus), null);
  assert.equal(getActivityTypeMeta(closedUnmerged.activityType, closedUnmerged.prMerged).label, "PR Ditutup");
});

test("8. external GitHub URL validation rejects unsafe URLs", () => {
  assert.equal(isValidGitHubUrl("https://github.com/stas-rg/orbit-api"), true);
  assert.equal(isValidGitHubUrl("https://github.com/stas-rg/orbit-api/pull/42"), true);
  assert.equal(isValidGitHubUrl("https://www.github.com/stas-rg/orbit-api/commit/abc"), true);

  assert.equal(isValidGitHubUrl("javascript:alert(1)"), false);
  assert.equal(isValidGitHubUrl("https://evil-github.com/phishing"), false);
  assert.equal(isValidGitHubUrl("https://google.com"), false);
  assert.equal(isValidGitHubUrl(""), false);
  assert.equal(isValidGitHubUrl(null), false);
});

test("9. GitHub disabled-state normalization provides informative status", () => {
  const disabled = normalizeGitHubConfigStatus({ configured: false });
  assert.equal(disabled.configured, false);
  assert.ok(disabled.message?.includes("belum dikonfigurasi"));

  const enabled = normalizeGitHubConfigStatus({ configured: true });
  assert.equal(enabled.configured, true);
});

test("10. activity counts and summary metrics calculate properly", () => {
  const acts = [
    normalizeGitHubActivity({ repositoryId: "R1", activityType: "push" }),
    normalizeGitHubActivity({ repositoryId: "R1", activityType: "push" }),
    normalizeGitHubActivity({ repositoryId: "R2", activityType: "pull_request_opened" }),
    normalizeGitHubActivity({ repositoryId: "R2", activityType: "pull_request_merged", prMerged: true }),
  ];

  const summary = calculateGitHubActivitySummary(acts);
  assert.equal(summary.totalActivities, 4);
  assert.equal(summary.commitsCount, 2);
  assert.equal(summary.prCount, 2);
  assert.equal(summary.mergedPrCount, 1);
  assert.equal(summary.uniqueRepositoriesCount, 2);
});

test("11. actor display remains strictly GitHub identity", () => {
  assert.equal(formatGitHubActor("irhamdev"), "@irhamdev");
  assert.equal(formatGitHubActor("@octocat"), "@octocat");
  assert.equal(formatGitHubActor(""), "Tidak diketahui");
  assert.equal(formatGitHubActor(null), "Tidak diketahui");
});

test("12. suggestion Apply eligibility helper checks condition", () => {
  // Same status -> not eligible
  const same = canApplySuggestedStatus({
    suggestedStatus: "DOING",
    currentTaskStatus: "DOING",
    isSprintClosed: false,
    canManageTask: true,
  });
  assert.equal(same.eligible, false);
  assert.equal(same.reason, "Status task sudah sesuai");

  // Different status -> eligible
  const diff = canApplySuggestedStatus({
    suggestedStatus: "REVIEW",
    currentTaskStatus: "DOING",
    isSprintClosed: false,
    canManageTask: true,
  });
  assert.equal(diff.eligible, true);
});

test("13. Closed Sprint disallows suggestion Apply", () => {
  const closed = canApplySuggestedStatus({
    suggestedStatus: "DONE",
    currentTaskStatus: "DOING",
    isSprintClosed: true,
    canManageTask: true,
  });
  assert.equal(closed.eligible, false);
  assert.ok(closed.reason?.includes("ditutup"));
});

test("14. student/read-only user without manage permission cannot apply suggestion", () => {
  const readOnly = canApplySuggestedStatus({
    suggestedStatus: "REVIEW",
    currentTaskStatus: "DOING",
    isSprintClosed: false,
    canManageTask: false,
  });
  assert.equal(readOnly.eligible, false);
  assert.equal(readOnly.reason, "Tidak memiliki izin mengubah status task");
});

test("15. formatShortSha formats first 7 chars", () => {
  assert.equal(formatShortSha("a1b2c3d4e5f6g7h8"), "a1b2c3d");
  assert.equal(formatShortSha(""), "");
  assert.equal(formatShortSha(null), "");
});

test("16. formatGitHubError translates business error codes", () => {
  assert.equal(
    formatGitHubError({ code: "SCRUM_REPOSITORY_EXISTS" }),
    "Repository sudah terdaftar pada project ini."
  );
  assert.equal(
    formatGitHubError({ code: "SCRUM_TASK_REPOSITORY_EXISTS" }),
    "Task sudah terhubung ke repository tersebut."
  );
  assert.equal(
    formatGitHubError({ message: "Custom message" }),
    "Custom message"
  );
});

test("17. getResearchProjectsEndpoint resolves /research for operator and never /research/projects", () => {
  const operatorEndpoint = getResearchProjectsEndpoint(false);
  assert.equal(operatorEndpoint, "/research");
  assert.notEqual(operatorEndpoint, "/research/projects");
  assert.ok(!operatorEndpoint.includes("/research/projects"), "Must not contain /research/projects");

  const dosenWithUser = getResearchProjectsEndpoint(true, "DOSEN-001");
  assert.equal(dosenWithUser, "/research/assigned?userId=DOSEN-001");

  const dosenWithoutUser = getResearchProjectsEndpoint(true, null);
  assert.equal(dosenWithoutUser, "/research/assigned");
});

test("18. normalizeResearchProjectList safely handles array, data wrapper, and invalid items", () => {
  // Flat array (standard GET /research response)
  const rawArray = [
    { id: "PROJ-1", title: "Project Alpha", short_title: "Alpha", status: "Aktif" },
    { id: "PROJ-2", title: "Project Beta", shortTitle: "Beta", status: "Aktif" },
  ];
  const list1 = normalizeResearchProjectList(rawArray);
  assert.equal(list1.length, 2);
  assert.equal(list1[0].id, "PROJ-1");
  assert.equal(list1[0].short_title, "Alpha");
  assert.equal(list1[1].id, "PROJ-2");
  assert.equal(list1[1].short_title, "Beta");

  // Wrapped in { data: [...] }
  const wrappedData = { data: [{ id: "PROJ-3", title: "Project Gamma" }] };
  const list2 = normalizeResearchProjectList(wrappedData);
  assert.equal(list2.length, 1);
  assert.equal(list2[0].id, "PROJ-3");
  assert.equal(list2[0].title, "Project Gamma");
  assert.equal(list2[0].status, "Aktif");

  // Wrapped in { projects: [...] }
  const wrappedProjects = { projects: [{ id: "PROJ-4", name: "Project Delta" }] };
  const list3 = normalizeResearchProjectList(wrappedProjects);
  assert.equal(list3.length, 1);
  assert.equal(list3[0].id, "PROJ-4");
  assert.equal(list3[0].title, "Project Delta");

  // Handles null / empty / malformed without throwing
  assert.deepEqual(normalizeResearchProjectList(null), []);
  assert.deepEqual(normalizeResearchProjectList(undefined), []);
  assert.deepEqual(normalizeResearchProjectList({}), []);
  assert.deepEqual(normalizeResearchProjectList([{ title: "No ID" }]), []);
});

test("19. GitHubIntegration.tsx does NOT reference /research/projects and uses valid /research endpoint", () => {
  const rootDir = process.cwd();
  const pagePath = path.join(rootDir, "src/app/components/pages/operator/GitHubIntegration.tsx");
  const content = fs.readFileSync(pagePath, "utf-8");

  assert.ok(
    !content.includes("/research/projects"),
    "GitHubIntegration.tsx must not contain the obsolete /research/projects endpoint"
  );
  assert.ok(
    content.includes("getResearchProjectsEndpoint") || content.includes('"/research"'),
    "GitHubIntegration.tsx must use valid research project loading logic"
  );
});

test("20. GitHub App unconfigured state remains supported and does not crash", () => {
  const unconfigured = normalizeGitHubConfigStatus({ configured: false, repositories: [] });
  assert.equal(unconfigured.configured, false);
  assert.ok(unconfigured.message?.includes("belum dikonfigurasi"));

  const unconfiguredEmpty = normalizeGitHubConfigStatus(null);
  assert.equal(unconfiguredEmpty.configured, false);
});
