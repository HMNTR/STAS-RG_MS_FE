import test from "node:test";
import assert from "node:assert/strict";
import {
  normalizeGitHubRepository,
  normalizeTaskRepositoryLink,
  normalizeGitHubActivity,
  normalizeGitHubConfigStatus,
  formatTaskKey,
  generateBranchTemplate,
  formatGitHubActor,
  canApplySuggestedStatus,
  isValidGitHubUrl,
} from "../../src/app/lib/githubIntegration.ts";
import { GITHUB_E2E_HANDOFF_FIXTURE } from "../fixtures/githubHandoffFixture.ts";

const handoff = GITHUB_E2E_HANDOFF_FIXTURE;

test("Handoff Fixture: Task Key and Branch Template for Task A and Task B", () => {
  assert.equal(handoff.tasks.taskA.taskKey, "TASK-89");
  assert.equal(handoff.tasks.taskB.taskKey, "TASK-90");

  assert.equal(formatTaskKey(handoff.tasks.taskA.taskKey), "TASK-89");
  assert.equal(formatTaskKey(handoff.tasks.taskB.taskKey), "TASK-90");

  const branchTemplateA = generateBranchTemplate(handoff.tasks.taskA.taskKey, "Bridge Feature");
  assert.equal(branchTemplateA, "feature/TASK-89-bridge-feature");

  const branchTemplateB = generateBranchTemplate(handoff.tasks.taskB.taskKey, "Multi Key Test");
  assert.equal(branchTemplateB, "feature/TASK-90-multi-key-test");
});

test("Handoff Fixture: Repositories normalization", () => {
  const reposPayload = handoff.sampleResponses.repositories;
  assert.equal(reposPayload.configured, false);
  const configStatus = normalizeGitHubConfigStatus(reposPayload);
  assert.equal(configStatus.configured, false);

  const repos = reposPayload.repositories.map(normalizeGitHubRepository);
  assert.equal(repos.length, 3);

  const iotRepo = repos.find((r: any) => r.id === "SCRUM-V2-GITHUB-E2E-REPO-IOT");
  assert.ok(iotRepo);
  assert.equal(iotRepo.owner, "stas-rg");
  assert.equal(iotRepo.repo, "iot-service");
  assert.equal(iotRepo.fullName, "stas-rg/iot-service");
  assert.equal(iotRepo.divisionId, "SCRUM-V2-GITHUB-E2E-DIV-IOT");
  assert.equal(iotRepo.defaultBranch, "main");
  assert.equal(iotRepo.isActive, true);

  const sharedRepo = repos.find((r: any) => r.id === "SCRUM-V2-GITHUB-E2E-REPO-SHARED");
  assert.ok(sharedRepo);
  assert.equal(sharedRepo.divisionId, null); // All divisions / shared
  assert.equal(sharedRepo.fullName, "stas-rg/shared-lib");

  const webRepo = repos.find((r: any) => r.id === "SCRUM-V2-GITHUB-E2E-REPO-WEB");
  assert.ok(webRepo);
  assert.equal(webRepo.divisionId, "SCRUM-V2-GITHUB-E2E-DIV-WEB");
});

test("Handoff Fixture: Task Repository Links normalization", () => {
  const rawLinks = handoff.sampleResponses.taskRepositoryLinks;
  const links = rawLinks.map(normalizeTaskRepositoryLink);

  assert.equal(links.length, 1);
  const link = links[0];
  assert.equal(link.id, "TRL-1789135122106-9f1b68e5");
  assert.equal(link.taskId, "SCRUM-V2-GITHUB-E2E-TASK-A");
  assert.equal(link.repositoryId, "SCRUM-V2-GITHUB-E2E-REPO-WEB");
  assert.equal(link.branchName, "feature/task-89-bridge");
  assert.equal(link.githubOwner, "stas-rg");
  assert.equal(link.githubRepo, "web-app");
  assert.equal(link.linkSource, "manual");
});

test("Handoff Fixture: Task GitHub Activities normalization and suggestions", () => {
  const rawActivities = handoff.sampleResponses.taskGithubActivity;
  const activities = rawActivities.map(normalizeGitHubActivity);

  assert.equal(activities.length, 7);

  // 1. Duplicate push
  assert.equal(activities[0].activityType, "push");
  assert.equal(activities[0].suggestedTaskStatus, "DOING");
  assert.equal(formatGitHubActor(activities[0].actorLogin), "@local-e2e-bot");

  // 2. PR merged
  assert.equal(activities[1].activityType, "pull_request_merged");
  assert.equal(activities[1].prMerged, true);
  assert.equal(activities[1].suggestedTaskStatus, "DONE");
  assert.equal(isValidGitHubUrl(activities[1].htmlUrl), true);

  // 3. PR closed unmerged -> MUST NOT suggest DONE or any status
  assert.equal(activities[2].activityType, "pull_request_closed");
  assert.equal(activities[2].prMerged, false);
  assert.equal(activities[2].suggestedTaskStatus, null);

  // 4. PR synchronize
  assert.equal(activities[3].activityType, "pull_request_synchronize");
  assert.equal(activities[3].suggestedTaskStatus, "REVIEW");

  // 5. PR reopened
  assert.equal(activities[4].activityType, "pull_request_reopened");
  assert.equal(activities[4].suggestedTaskStatus, "REVIEW");

  // 6. PR opened
  assert.equal(activities[5].activityType, "pull_request_opened");
  assert.equal(activities[5].suggestedTaskStatus, "REVIEW");

  // 7. Initial push
  assert.equal(activities[6].activityType, "push");
  assert.equal(activities[6].suggestedTaskStatus, "DOING");
});

test("Handoff Fixture: Human Confirmation suggestion applicability logic", () => {
  const prMergedAct = normalizeGitHubActivity(handoff.sampleResponses.taskGithubActivity[1]);
  assert.equal(prMergedAct.suggestedTaskStatus, "DONE");

  // Manager applying to DOING task in open sprint -> Eligible
  const canApply1 = canApplySuggestedStatus({
    suggestedStatus: prMergedAct.suggestedTaskStatus,
    currentTaskStatus: "DOING",
    isSprintClosed: false,
    canManageTask: true,
  });
  assert.equal(canApply1.eligible, true);

  // Task already DONE -> Ineligible (redundant)
  const canApply2 = canApplySuggestedStatus({
    suggestedStatus: prMergedAct.suggestedTaskStatus,
    currentTaskStatus: "DONE",
    isSprintClosed: false,
    canManageTask: true,
  });
  assert.equal(canApply2.eligible, false);

  // Sprint Closed -> Ineligible
  const canApply3 = canApplySuggestedStatus({
    suggestedStatus: prMergedAct.suggestedTaskStatus,
    currentTaskStatus: "DOING",
    isSprintClosed: true,
    canManageTask: true,
  });
  assert.equal(canApply3.eligible, false);

  // Student / Member without manage permission -> Ineligible
  const canApply4 = canApplySuggestedStatus({
    suggestedStatus: prMergedAct.suggestedTaskStatus,
    currentTaskStatus: "DOING",
    isSprintClosed: false,
    canManageTask: false,
  });
  assert.equal(canApply4.eligible, false);
});
