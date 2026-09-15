export type SprintDurationPreset = "1_week" | "2_weeks" | "4_weeks" | "custom";

export interface SprintTimingState {
  isOverdue: boolean;
  overdueDays: number;
  daysRemaining: number | null;
  totalDays: number | null;
  durationPreset: SprintDurationPreset;
  durationLabel: string;
  periodLabel: string;
}

/**
 * Parses YYYY-MM-DD string into [year, monthIndex (0-11), day]
 */
export function parseDateParts(dateStr: string): [number, number, number] | null {
  if (!dateStr || typeof dateStr !== "string") return null;
  const match = dateStr.trim().slice(0, 10).match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return null;
  const year = parseInt(match[1], 10);
  const monthIndex = parseInt(match[2], 10) - 1;
  const day = parseInt(match[3], 10);
  return [year, monthIndex, day];
}

/**
 * Formats a local date or (year, monthIndex, day) into YYYY-MM-DD
 */
export function formatDateParts(year: number, monthIndex: number, day: number): string {
  const d = new Date(year, monthIndex, day);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const dt = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${dt}`;
}

/**
 * Adds calendar days to a YYYY-MM-DD string cleanly without timezone arithmetic.
 */
export function addCalendarDays(startDateStr: string, daysToAdd: number): string {
  const parts = parseDateParts(startDateStr);
  if (!parts) return startDateStr;
  const [year, monthIndex, day] = parts;
  return formatDateParts(year, monthIndex, day + daysToAdd);
}

/**
 * Calculates inclusive end date for Sprint duration presets:
 * 1 Week: 7 calendar days total (end = start + 6 days)
 * 2 Weeks: 14 calendar days total (end = start + 13 days)
 * 4 Weeks: 28 calendar days total (end = start + 27 days)
 * Custom: returns existing or empty
 */
export function calculateSprintEndDate(
  startDateStr?: string | null,
  preset: SprintDurationPreset = "2_weeks"
): string {
  if (!startDateStr || !parseDateParts(startDateStr)) return "";

  switch (preset) {
    case "1_week":
      return addCalendarDays(startDateStr, 6);
    case "2_weeks":
      return addCalendarDays(startDateStr, 13);
    case "4_weeks":
      return addCalendarDays(startDateStr, 27);
    case "custom":
    default:
      return "";
  }
}

/**
 * Calculates inclusive calendar days between startDate and endDate.
 * (end_date - start_date) + 1
 */
export function getSprintInclusiveDays(
  startDateStr?: string | null,
  endDateStr?: string | null
): number | null {
  if (!startDateStr || !endDateStr) return null;
  const startParts = parseDateParts(startDateStr);
  const endParts = parseDateParts(endDateStr);
  if (!startParts || !endParts) return null;

  const startUtc = Date.UTC(startParts[0], startParts[1], startParts[2]);
  const endUtc = Date.UTC(endParts[0], endParts[1], endParts[2]);
  const diffDays = Math.round((endUtc - startUtc) / 86400000);
  return diffDays >= 0 ? diffDays + 1 : null;
}

/**
 * Infers duration preset from inclusive calendar days:
 * 7 days -> 1_week
 * 14 days -> 2_weeks
 * 28 days -> 4_weeks
 * other -> custom
 */
export function inferSprintDurationPreset(
  startDateStr?: string | null,
  endDateStr?: string | null
): SprintDurationPreset {
  const days = getSprintInclusiveDays(startDateStr, endDateStr);
  if (days === 7) return "1_week";
  if (days === 14) return "2_weeks";
  if (days === 28) return "4_weeks";
  return "custom";
}

/**
 * Returns human readable duration label
 */
export function formatSprintDurationLabel(
  preset: SprintDurationPreset,
  inclusiveDays?: number | null
): string {
  switch (preset) {
    case "1_week":
      return "1 Minggu (7 Hari)";
    case "2_weeks":
      return "2 Minggu (14 Hari)";
    case "4_weeks":
      return "4 Minggu (28 Hari)";
    case "custom":
      return inclusiveDays ? `Kustom (${inclusiveDays} Hari)` : "Kustom";
  }
}

const MONTH_NAMES_SHORT = [
  "Jan", "Feb", "Mar", "Apr", "Mei", "Jun",
  "Jul", "Agu", "Sep", "Okt", "Nov", "Des"
];

/**
 * Formats YYYY-MM-DD into readable date (e.g., "15 Sep 2026")
 */
export function formatDateReadable(dateStr?: string | null): string {
  const parts = parseDateParts(dateStr || "");
  if (!parts) return dateStr || "-";
  const [year, monthIndex, day] = parts;
  return `${day} ${MONTH_NAMES_SHORT[monthIndex]} ${year}`;
}

/**
 * Formats period label (e.g., "15 Sep – 28 Sep 2026")
 */
export function formatPeriodLabel(startDateStr?: string | null, endDateStr?: string | null): string {
  if (!startDateStr && !endDateStr) return "-";
  if (startDateStr && !endDateStr) return `${formatDateReadable(startDateStr)} s/d -`;
  if (!startDateStr && endDateStr) return `- s/d ${formatDateReadable(endDateStr)}`;

  const startParts = parseDateParts(startDateStr!);
  const endParts = parseDateParts(endDateStr!);
  if (!startParts || !endParts) return `${startDateStr} s/d ${endDateStr}`;

  if (startParts[0] === endParts[0]) {
    // Same year
    if (startParts[1] === endParts[1]) {
      // Same month
      return `${startParts[2]} – ${endParts[2]} ${MONTH_NAMES_SHORT[startParts[1]]} ${startParts[0]}`;
    }
    return `${startParts[2]} ${MONTH_NAMES_SHORT[startParts[1]]} – ${endParts[2]} ${MONTH_NAMES_SHORT[endParts[1]]} ${startParts[0]}`;
  }

  return `${formatDateReadable(startDateStr)} – ${formatDateReadable(endDateStr)}`;
}

/**
 * Validates start and end date logic:
 * - End date must not precede start date
 */
export function validateSprintDates(
  startDateStr?: string | null,
  endDateStr?: string | null
): { valid: boolean; error?: string } {
  if (!startDateStr && !endDateStr) {
    return { valid: true };
  }

  if (startDateStr && !parseDateParts(startDateStr)) {
    return { valid: false, error: "Format tanggal mulai tidak valid." };
  }

  if (endDateStr && !parseDateParts(endDateStr)) {
    return { valid: false, error: "Format tanggal selesai tidak valid." };
  }

  if (startDateStr && endDateStr) {
    const startParts = parseDateParts(startDateStr)!;
    const endParts = parseDateParts(endDateStr)!;
    const startUtc = Date.UTC(startParts[0], startParts[1], startParts[2]);
    const endUtc = Date.UTC(endParts[0], endParts[1], endParts[2]);

    if (endUtc < startUtc) {
      return { valid: false, error: "Tanggal selesai tidak boleh sebelum tanggal mulai." };
    }
  }

  return { valid: true };
}

/**
 * Calculates non-destructive timing state:
 * - isOverdue: today > end_date AND sprint status == ACTIVE
 * - daysRemaining: days left until end date
 * NOTE: Does NOT mutate sprint status!
 */
export function getSprintTimingState(
  sprint: {
    startDate?: string | null;
    endDate?: string | null;
    status?: string | null;
  },
  referenceDateInput?: string | Date
): SprintTimingState {
  const startDateStr = sprint.startDate ? String(sprint.startDate).slice(0, 10) : null;
  const endDateStr = sprint.endDate ? String(sprint.endDate).slice(0, 10) : null;
  const status = String(sprint.status || "planning").toLowerCase();

  const totalDays = getSprintInclusiveDays(startDateStr, endDateStr);
  const durationPreset = inferSprintDurationPreset(startDateStr, endDateStr);
  const durationLabel = formatSprintDurationLabel(durationPreset, totalDays);
  const periodLabel = formatPeriodLabel(startDateStr, endDateStr);

  let refDateParts: [number, number, number];
  if (typeof referenceDateInput === "string" && parseDateParts(referenceDateInput)) {
    refDateParts = parseDateParts(referenceDateInput)!;
  } else if (referenceDateInput instanceof Date) {
    refDateParts = [referenceDateInput.getFullYear(), referenceDateInput.getMonth(), referenceDateInput.getDate()];
  } else {
    const now = new Date();
    refDateParts = [now.getFullYear(), now.getMonth(), now.getDate()];
  }

  const todayUtc = Date.UTC(refDateParts[0], refDateParts[1], refDateParts[2]);

  let isOverdue = false;
  let overdueDays = 0;
  let daysRemaining: number | null = null;

  if (endDateStr) {
    const endParts = parseDateParts(endDateStr);
    if (endParts) {
      const endUtc = Date.UTC(endParts[0], endParts[1], endParts[2]);
      const diffFromEnd = Math.round((todayUtc - endUtc) / 86400000);

      // Overdue is ONLY valid for active sprints
      if (status === "active" && diffFromEnd > 0) {
        isOverdue = true;
        overdueDays = diffFromEnd;
      } else if (diffFromEnd <= 0) {
        daysRemaining = Math.abs(diffFromEnd);
      }
    }
  }

  return {
    isOverdue,
    overdueDays,
    daysRemaining,
    totalDays,
    durationPreset,
    durationLabel,
    periodLabel
  };
}
