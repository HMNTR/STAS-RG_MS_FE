import test from "node:test";
import assert from "node:assert/strict";
import {
  normalizeSprintSummary,
  selectDefaultSprint,
  getSprintStatusBadge,
  validateEvaluationForm,
  formatScrumError,
} from "../../src/app/lib/scrumSummary";

test("normalizeSprintSummary handles camelCase and snake_case backend payloads", () => {
  const payload = {
    sprint: {
      id: "sprint-1",
      project_id: "proj-1",
      name: "Sprint 1",
      goal: "Ship V2",
      start_date: "2026-09-01",
      end_date: "2026-09-14",
      status: "review",
    },
    overview: {
      total_tasks: 4,
      completed_tasks: 2,
      unfinished_tasks: 2,
      planned_story_points: 20,
      completed_story_points: 10,
      achievement_percent: 50,
    },
    divisionResults: [
      {
        division_id: "div-web",
        division_name: "Web Development",
        total_tasks: 2,
        completed_tasks: 1,
        unfinished_tasks: 1,
        planned_story_points: 10,
        completed_story_points: 5,
        achievement_percent: 50,
      },
      {
        division_id: null,
        division_name: "Belum Ada Divisi",
        total_tasks: 2,
        completed_tasks: 1,
        unfinished_tasks: 1,
        planned_story_points: 10,
        completed_story_points: 5,
        achievement_percent: 50,
      },
    ],
    completedWork: [
      {
        task_id: "t-1",
        title: "Setup API",
        status: "DONE",
        progress: 100,
        division_id: "div-web",
        division_name: "Web Development",
        story_points: 5,
      },
    ],
    unfinishedWork: [
      {
        task_id: "t-2",
        title: "Refactor UI",
        status: "DOING",
        progress: 40,
        division_id: null,
        division_name: "Belum Ada Divisi",
        story_points: 5,
        outcome: "carry_over",
        target_sprint_id: "sprint-2",
      },
    ],
    summary: {
      id: "sum-1",
      summary: "First review draft",
      achievements: "Completed API",
      challenges: "Time crunch",
      lessons_learned: "Start earlier",
      next_sprint_plan: "Complete UI",
      is_finalized: false,
    },
    meeting: {
      meeting_date: "2026-09-14T10:00:00Z",
      start_time: "10:00",
      location: "Lab STAS",
      meeting_link: "https://meet.google.com/abc",
      chair_user_id: "user-mgr",
      agenda: "Sprint review",
      notes: "Reviewed items",
      decisions: "Proceed with carry over",
      attendees: [
        { user_id: "user-1", name_snapshot: "Student One", role_snapshot: "mahasiswa" },
      ],
    },
    requiredEvaluations: [
      { id: "user-1", name: "Student One" },
    ],
    evaluations: [
      {
        evaluated_user_id: "user-1",
        task_completion: 8,
        quality: 9,
        timeliness: 8,
        collaboration: 9,
        initiative: 8,
        overall_score: 8.4,
        notes: "Good performance",
      },
    ],
    memberMetrics: [
      {
        id: "user-1",
        name: "Student One",
        assigned_tasks: 2,
        completed_tasks: 1,
        carry_over_count: 1,
        planned_story_points: 10,
        completed_story_points: 5,
      },
    ],
    planningTargetSprints: [
      {
        id: "sprint-2",
        name: "Sprint 2 Planning",
        status: "planning",
      },
    ],
    canFinalize: true,
    finalizationErrors: [],
  };

  const normalized = normalizeSprintSummary(payload);

  assert.equal(normalized.sprint.id, "sprint-1");
  assert.equal(normalized.sprint.status, "review");
  assert.equal(normalized.overview.plannedStoryPoints, 20);
  assert.equal(normalized.overview.completedStoryPoints, 10);
  assert.equal(normalized.overview.achievementPercent, 50);
  assert.equal(normalized.divisionResults.length, 2);
  assert.equal(normalized.divisionResults[1].divisionName, "Belum Ada Divisi");
  assert.equal(normalized.completedWork[0].taskId, "t-1");
  assert.equal(normalized.unfinishedWork[0].outcome, "carry_over");
  assert.equal(normalized.unfinishedWork[0].targetSprintId, "sprint-2");
  assert.equal(normalized.meeting.meetingDate, "2026-09-14");
  assert.equal(normalized.meeting.attendees[0].name, "Student One");
  assert.equal(normalized.evaluations[0].userId, "user-1");
  assert.equal(normalized.evaluations[0].overallScore, 8.4);
  assert.equal(normalized.canFinalize, true);
});

test("selectDefaultSprint prioritizes review > closed > active > planning", () => {
  const sprints = [
    { id: "s-plan", status: "planning" },
    { id: "s-active", status: "active" },
    { id: "s-closed-old", status: "closed", closedAt: "2026-08-01" },
    { id: "s-closed-new", status: "closed", closedAt: "2026-08-15" },
    { id: "s-review", status: "review" },
  ];

  // 1. When review exists
  assert.equal(selectDefaultSprint(sprints)?.id, "s-review");

  // 2. When review does not exist, latest closed
  const withoutReview = sprints.filter((s) => s.status !== "review");
  assert.equal(selectDefaultSprint(withoutReview)?.id, "s-closed-new");

  // 3. When only active and planning
  const onlyActivePlan = sprints.filter((s) => s.status === "active" || s.status === "planning");
  assert.equal(selectDefaultSprint(onlyActivePlan)?.id, "s-active");

  // 4. When only planning
  const onlyPlanning = sprints.filter((s) => s.status === "planning");
  assert.equal(selectDefaultSprint(onlyPlanning)?.id, "s-plan");

  // 5. Empty
  assert.equal(selectDefaultSprint([]), null);
});

test("validateEvaluationForm enforces integer 1-10 and required notes", () => {
  const valid = validateEvaluationForm({
    taskCompletion: 8,
    quality: 9,
    timeliness: 8,
    collaboration: 9,
    initiative: 8,
    notes: "Kinerja sangat konsisten",
  });
  assert.equal(valid.valid, true);

  const outOfRange = validateEvaluationForm({
    taskCompletion: 11,
    quality: 9,
    timeliness: 8,
    collaboration: 9,
    initiative: 8,
    notes: "Exceeds range",
  });
  assert.equal(outOfRange.valid, false);

  const missingNotes = validateEvaluationForm({
    taskCompletion: 8,
    quality: 9,
    timeliness: 8,
    collaboration: 9,
    initiative: 8,
    notes: "   ",
  });
  assert.equal(missingNotes.valid, false);

  const nullScore = validateEvaluationForm({
    taskCompletion: null,
    quality: 9,
    timeliness: 8,
    collaboration: 9,
    initiative: 8,
    notes: "Unevaluated score should be rejected",
  });
  assert.equal(nullScore.valid, false);
});

test("formatScrumError translates SCRUM_* codes into clear human messages", () => {
  assert.equal(
    formatScrumError({ code: "SCRUM_SELF_EVALUATION_FORBIDDEN" }),
    "Anda tidak dapat mengevaluasi diri sendiri."
  );
  assert.equal(
    formatScrumError({ code: "SCRUM_CARRY_OVER_TARGET_REQUIRED" }),
    "Sprint target planning wajib dipilih untuk carry-over."
  );
  assert.equal(
    formatScrumError({ code: "SCRUM_SPRINT_FINALIZATION_BLOCKED" }),
    "Sprint belum dapat difinalisasi. Harap lengkapi semua syarat di checklist kesiapan."
  );
});

test("getSprintStatusBadge maps statuses with proper labels", () => {
  assert.equal(getSprintStatusBadge("review").label, "MENUNGGU REVIEW");
  assert.equal(getSprintStatusBadge("active").label, "ACTIVE");
  assert.equal(getSprintStatusBadge("closed").label, "CLOSED");
  assert.equal(getSprintStatusBadge("planning").label, "PLANNING");
});
