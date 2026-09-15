import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import {
  calculateSprintEndDate,
  getSprintInclusiveDays,
  inferSprintDurationPreset,
  formatSprintDurationLabel,
  formatPeriodLabel,
  validateSprintDates,
  getSprintTimingState,
  addCalendarDays,
  type SprintDurationPreset
} from "../../src/app/lib/sprintDuration.ts";

test("1. Date Calculation: calculates exact inclusive end dates for 1, 2, and 4 weeks", () => {
  // Start 2026-09-15
  // 1 Week (7 calendar days total, end = start + 6)
  assert.equal(calculateSprintEndDate("2026-09-15", "1_week"), "2026-09-21");
  assert.equal(getSprintInclusiveDays("2026-09-15", "2026-09-21"), 7);

  // 2 Weeks (14 calendar days total, end = start + 13)
  assert.equal(calculateSprintEndDate("2026-09-15", "2_weeks"), "2026-09-28");
  assert.equal(getSprintInclusiveDays("2026-09-15", "2026-09-28"), 14);

  // 4 Weeks (28 calendar days total, end = start + 27)
  assert.equal(calculateSprintEndDate("2026-09-15", "4_weeks"), "2026-10-12");
  assert.equal(getSprintInclusiveDays("2026-09-15", "2026-10-12"), 28);
});

test("2. Date Calculation: handles month boundaries, year boundaries, and leap years", () => {
  // Month boundary: 2026-09-28 + 1 Week -> 2026-10-04
  assert.equal(calculateSprintEndDate("2026-09-28", "1_week"), "2026-10-04");
  assert.equal(getSprintInclusiveDays("2026-09-28", "2026-10-04"), 7);

  // Year boundary: 2026-12-28 + 1 Week -> 2027-01-03
  assert.equal(calculateSprintEndDate("2026-12-28", "1_week"), "2027-01-03");
  assert.equal(getSprintInclusiveDays("2026-12-28", "2027-01-03"), 7);

  // Leap year boundary: 2024-02-26 + 1 Week -> 2024-03-03 (2024 is leap year, Feb has 29 days)
  assert.equal(calculateSprintEndDate("2024-02-26", "1_week"), "2024-03-03");
  assert.equal(getSprintInclusiveDays("2024-02-26", "2024-03-03"), 7);

  // Non-leap year: 2025-02-26 + 1 Week -> 2025-03-04 (Feb has 28 days)
  assert.equal(calculateSprintEndDate("2025-02-26", "1_week"), "2025-03-04");
  assert.equal(getSprintInclusiveDays("2025-02-26", "2025-03-04"), 7);
});

test("3. Inference: maps inclusive days back to appropriate presets", () => {
  assert.equal(inferSprintDurationPreset("2026-09-15", "2026-09-21"), "1_week");
  assert.equal(inferSprintDurationPreset("2026-09-15", "2026-09-28"), "2_weeks");
  assert.equal(inferSprintDurationPreset("2026-09-15", "2026-10-12"), "4_weeks");
  assert.equal(inferSprintDurationPreset("2026-09-15", "2026-09-25"), "custom"); // 11 days
  assert.equal(inferSprintDurationPreset("2026-09-15", "2026-09-24"), "custom"); // 10 days
  assert.equal(inferSprintDurationPreset(null, null), "custom");
});

test("4. Date Validation: accepts valid date range and rejects endDate < startDate", () => {
  // Valid normal
  assert.equal(validateSprintDates("2026-09-15", "2026-09-28").valid, true);

  // Same day sprint (allowed if backend allows)
  assert.equal(validateSprintDates("2026-09-15", "2026-09-15").valid, true);

  // Invalid: end date precedes start date
  const invalid = validateSprintDates("2026-09-20", "2026-09-15");
  assert.equal(invalid.valid, false);
  assert.match(invalid.error || "", /tidak boleh sebelum/i);

  // Empty values allowed (optional dates)
  assert.equal(validateSprintDates(null, null).valid, true);
  assert.equal(validateSprintDates("2026-09-15", null).valid, true);
});

test("5. Timing & Overdue: ACTIVE sprint past end date is marked OVERDUE without mutating status", () => {
  // ACTIVE sprint ending 2026-09-10 when today is 2026-09-15 (5 days overdue)
  const activeSprint = {
    startDate: "2026-08-28",
    endDate: "2026-09-10",
    status: "active"
  };

  const timingOverdue = getSprintTimingState(activeSprint, "2026-09-15");
  assert.equal(timingOverdue.isOverdue, true);
  assert.equal(timingOverdue.overdueDays, 5);
  assert.equal(activeSprint.status, "active"); // Status is NOT mutated!

  // ACTIVE sprint ending 2026-09-20 when today is 2026-09-15 (5 days remaining)
  const activeCurrent = {
    startDate: "2026-09-07",
    endDate: "2026-09-20",
    status: "active"
  };
  const timingCurrent = getSprintTimingState(activeCurrent, "2026-09-15");
  assert.equal(timingCurrent.isOverdue, false);
  assert.equal(timingCurrent.daysRemaining, 5);

  // REVIEW sprint past end date MUST NOT be marked active overdue
  const reviewSprint = {
    startDate: "2026-08-01",
    endDate: "2026-08-14",
    status: "review"
  };
  const timingReview = getSprintTimingState(reviewSprint, "2026-09-15");
  assert.equal(timingReview.isOverdue, false);

  // CLOSED sprint past end date MUST NOT be marked active overdue
  const closedSprint = {
    startDate: "2026-07-01",
    endDate: "2026-07-14",
    status: "closed"
  };
  const timingClosed = getSprintTimingState(closedSprint, "2026-09-15");
  assert.equal(timingClosed.isOverdue, false);
});

test("6. UI Architecture: ScrumPlanning.tsx contains duration presets, edit sprint, and role protections", () => {
  const fileContent = fs.readFileSync(
    path.resolve(process.cwd(), "src/app/components/pages/operator/ScrumPlanning.tsx"),
    "utf-8"
  );

  // Contains duration presets state & UI
  assert.match(fileContent, /sprintDurationPreset/);
  assert.match(fileContent, /1_week/);
  assert.match(fileContent, /2_weeks/);
  assert.match(fileContent, /4_weeks/);
  assert.match(fileContent, /custom/);

  // Contains edit sprint capability for planning
  assert.match(fileContent, /handleEditSprint|editingSprintId/);

  // Ensures closed sprint remains immutable / cannot be edited
  assert.match(fileContent, /isClosed/);
});
