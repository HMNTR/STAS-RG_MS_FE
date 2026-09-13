import test from "node:test";
import assert from "node:assert/strict";
import {
  normalizeTaskDivisionFields,
  normalizeDivisionItem,
  filterTasksForBoard,
  getDivisionTabs,
  validateTaskDivision,
  END_SPRINT_CONFIRMATION_MESSAGE,
} from "../../src/app/lib/scrum";

test("normalizeTaskDivisionFields normalizes camelCase task fields", () => {
  const result = normalizeTaskDivisionFields({
    divisionId: "div-1",
    divisionName: "Web",
    divisionIsActive: true,
    sprintId: "sprint-10",
    storyPoints: 5,
  });

  assert.deepEqual(result, {
    divisionId: "div-1",
    divisionName: "Web",
    divisionIsActive: true,
    sprintId: "sprint-10",
    storyPoints: 5,
  });
});

test("normalizeTaskDivisionFields normalizes snake_case backend variants", () => {
  const result = normalizeTaskDivisionFields({
    division_id: "div-2",
    division_name: "IoT",
    division_is_active: false,
    sprint_id: "sprint-20",
    story_points: 8,
  });

  assert.deepEqual(result, {
    divisionId: "div-2",
    divisionName: "IoT",
    divisionIsActive: false,
    sprintId: "sprint-20",
    storyPoints: 8,
  });
});

test("normalizeTaskDivisionFields falls back to null and legacy sp", () => {
  const result = normalizeTaskDivisionFields({
    sp: 3,
  });

  assert.deepEqual(result, {
    divisionId: null,
    divisionName: null,
    divisionIsActive: null,
    sprintId: null,
    storyPoints: 3,
  });
});

test("normalizeDivisionItem normalizes camelCase and snake_case division objects", () => {
  const item1 = normalizeDivisionItem({ id: "1", name: "AI", project_id: "p1", is_active: true, sort_order: 1 });
  assert.deepEqual(item1, { id: "1", name: "AI", projectId: "p1", isActive: true, sortOrder: 1 });

  const item2 = normalizeDivisionItem({ id: "2", name: "Web", projectId: "p1", isActive: false, sortOrder: 2 });
  assert.deepEqual(item2, { id: "2", name: "Web", projectId: "p1", isActive: false, sortOrder: 2 });
});

test("filterTasksForBoard filters by active Sprint when active Sprint exists", () => {
  const tasks = [
    { id: "1", sprintId: "sprint-1", divisionId: "div-web" },
    { id: "2", sprintId: "sprint-2", divisionId: "div-web" },
    { id: "3", sprintId: null, divisionId: "div-web" },
  ];

  const filtered = filterTasksForBoard(tasks, { activeSprintId: "sprint-1" });
  assert.equal(filtered.length, 1);
  assert.equal(filtered[0].id, "1");
});

test("filterTasksForBoard falls back to all project tasks when no active Sprint exists", () => {
  const tasks = [
    { id: "1", sprintId: "sprint-1", divisionId: "div-web" },
    { id: "2", sprintId: null, divisionId: "div-web" },
  ];

  const filtered = filterTasksForBoard(tasks, { activeSprintId: null });
  assert.equal(filtered.length, 2);
});

test("filterTasksForBoard filters by division and unassigned legacy tasks", () => {
  const tasks = [
    { id: "1", sprintId: "sprint-1", divisionId: "div-web" },
    { id: "2", sprintId: "sprint-1", divisionId: "div-iot" },
    { id: "3", sprintId: "sprint-1", divisionId: null },
  ];

  const webOnly = filterTasksForBoard(tasks, { activeSprintId: "sprint-1", selectedDivisionId: "div-web" });
  assert.equal(webOnly.length, 1);
  assert.equal(webOnly[0].id, "1");

  const unassigned = filterTasksForBoard(tasks, { activeSprintId: "sprint-1", selectedDivisionId: "unassigned" });
  assert.equal(unassigned.length, 1);
  assert.equal(unassigned[0].id, "3");

  const all = filterTasksForBoard(tasks, { activeSprintId: "sprint-1", selectedDivisionId: "all" });
  assert.equal(all.length, 3);
});

test("filterTasksForBoard respects 'Tugas Saya Saja' after division filter", () => {
  const tasks = [
    { id: "1", sprintId: "sprint-1", divisionId: "div-web", assigneeUserIds: ["u1"] },
    { id: "2", sprintId: "sprint-1", divisionId: "div-web", assigneeUserIds: ["u2"] },
  ];

  const result = filterTasksForBoard(tasks, {
    activeSprintId: "sprint-1",
    selectedDivisionId: "div-web",
    onlyMyTasks: true,
    currentUserId: "u1",
  });
  assert.equal(result.length, 1);
  assert.equal(result[0].id, "1");
});

test("getDivisionTabs produces counts and conditional Belum Ada Divisi tab", () => {
  const divisions = [
    { id: "div-web", name: "Web", isActive: true },
    { id: "div-iot", name: "IoT", isActive: true },
    { id: "div-archived", name: "Old", isActive: false },
  ];

  const tasksWithUnassigned = [
    { divisionId: "div-web" },
    { divisionId: "div-web" },
    { divisionId: "div-iot" },
    { divisionId: null },
  ];

  const tabsWithUnassigned = getDivisionTabs(tasksWithUnassigned, divisions);
  assert.deepEqual(tabsWithUnassigned, [
    { id: "all", label: "Semua Divisi", count: 4 },
    { id: "div-web", label: "Web", count: 2 },
    { id: "div-iot", label: "IoT", count: 1 },
    { id: "unassigned", label: "Belum Ada Divisi", count: 1 },
  ]);

  const tasksWithoutUnassigned = [
    { divisionId: "div-web" },
    { divisionId: "div-iot" },
  ];

  const tabsWithoutUnassigned = getDivisionTabs(tasksWithoutUnassigned, divisions);
  assert.deepEqual(tabsWithoutUnassigned, [
    { id: "all", label: "Semua Divisi", count: 2 },
    { id: "div-web", label: "Web", count: 1 },
    { id: "div-iot", label: "IoT", count: 1 },
  ]);
});

test("validateTaskDivision requires division when project has active divisions", () => {
  const activeDivisions = [{ id: "div-web", name: "Web", isActive: true }];

  assert.equal(validateTaskDivision("", activeDivisions).valid, false);
  assert.equal(validateTaskDivision(null, activeDivisions).valid, false);
  assert.equal(validateTaskDivision("div-web", activeDivisions).valid, true);

  // Project with 0 divisions allows empty division
  assert.equal(validateTaskDivision("", []).valid, true);
  assert.equal(validateTaskDivision(null, []).valid, true);
});

test("END_SPRINT_CONFIRMATION_MESSAGE matches specification", () => {
  assert.equal(
    END_SPRINT_CONFIRMATION_MESSAGE,
    "Sprint akan masuk ke tahap Review. Summary, rapat, evaluasi anggota, dan keputusan task yang belum selesai akan diproses sebelum Sprint berikutnya dapat dimulai."
  );
});
