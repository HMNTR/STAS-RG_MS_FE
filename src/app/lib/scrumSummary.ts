// Sprint Summary Normalization & Helpers for Scrum V2 Phase 2B

export interface SprintSummaryOverview {
  totalTasks: number;
  completedTasks: number;
  unfinishedTasks: number;
  plannedStoryPoints: number;
  completedStoryPoints: number;
  achievementPercent: number;
}

export interface SprintDivisionResult {
  divisionId: string | null;
  divisionName: string;
  totalTasks: number;
  completedTasks: number;
  unfinishedTasks: number;
  plannedStoryPoints: number;
  completedStoryPoints: number;
  achievementPercent: number;
}

export interface SummaryTaskItem {
  taskId: string;
  title: string;
  status: string;
  progress: number;
  divisionId: string | null;
  divisionName: string;
  storyPoints: number;
  outcome?: "carry_over" | "backlog" | "cancelled" | "done" | null;
  targetSprintId?: string | null;
}

export interface SprintNarrative {
  id?: string;
  summary: string;
  achievements: string;
  challenges: string;
  lessonsLearned: string;
  nextSprintPlan: string;
  isFinalized?: boolean;
  finalizedBy?: string | null;
  finalizedAt?: string | null;
}

export interface ReviewMeetingAttendee {
  userId: string;
  name: string;
  role?: string;
}

export interface ReviewMeeting {
  id?: string;
  meetingDate: string;
  startTime: string;
  location: string;
  meetingLink: string;
  chairUserId: string;
  agenda: string;
  notes: string;
  decisions: string;
  attendees: ReviewMeetingAttendee[];
}

export interface MemberContributionMetrics {
  id: string;
  name: string;
  role?: string;
  initials?: string;
  assignedTasks: number;
  completedTasks: number;
  carryOverCount: number;
  plannedStoryPoints: number;
  completedStoryPoints: number;
}

export interface MemberEvaluation {
  id?: string;
  userId: string;
  taskCompletion: number;
  quality: number;
  timeliness: number;
  collaboration: number;
  initiative: number;
  overallScore: number | null;
  notes: string;
}

export interface PlanningTargetSprint {
  id: string;
  projectId?: string;
  name: string;
  goal?: string;
  startDate?: string | null;
  endDate?: string | null;
  status: string;
}

export interface FinalizationError {
  code: string;
  message: string;
}

export interface NormalizedSprintSummary {
  sprint: {
    id: string;
    projectId?: string;
    name: string;
    goal?: string;
    startDate?: string | null;
    endDate?: string | null;
    status: string;
    closedAt?: string | null;
  };
  overview: SprintSummaryOverview;
  divisionResults: SprintDivisionResult[];
  completedWork: SummaryTaskItem[];
  unfinishedWork: SummaryTaskItem[];
  meeting: ReviewMeeting;
  summary: SprintNarrative;
  requiredEvaluations: Array<{ id: string; name: string; role?: string; initials?: string }>;
  evaluations: MemberEvaluation[];
  memberMetrics: MemberContributionMetrics[];
  planningTargetSprints: PlanningTargetSprint[];
  canFinalize: boolean;
  finalizationErrors: FinalizationError[];
}

export function normalizeSprintSummary(data: any): NormalizedSprintSummary {
  const sprintData = data?.sprint || {};
  const sprint = {
    id: String(sprintData.id || ""),
    projectId: sprintData.projectId ?? sprintData.project_id,
    name: String(sprintData.name || "Sprint"),
    goal: sprintData.goal || "",
    startDate: sprintData.startDate ?? sprintData.start_date ?? null,
    endDate: sprintData.endDate ?? sprintData.end_date ?? null,
    status: String(sprintData.status || "review").toLowerCase(),
    closedAt: sprintData.closedAt ?? sprintData.closed_at ?? null,
  };

  const overviewData = data?.overview || {};
  const plannedStoryPoints = Number(overviewData.plannedStoryPoints ?? overviewData.planned_story_points ?? 0);
  const completedStoryPoints = Number(overviewData.completedStoryPoints ?? overviewData.completed_story_points ?? 0);
  const totalTasks = Number(overviewData.totalTasks ?? overviewData.total_tasks ?? 0);
  const completedTasks = Number(overviewData.completedTasks ?? overviewData.completed_tasks ?? 0);
  const unfinishedTasks = Number(overviewData.unfinishedTasks ?? overviewData.unfinished_tasks ?? 0);
  const rawAchievement = overviewData.achievementPercent ?? overviewData.achievement_percent;
  const achievementPercent = rawAchievement !== undefined && rawAchievement !== null
    ? Number(rawAchievement)
    : (plannedStoryPoints > 0 ? Math.round((completedStoryPoints / plannedStoryPoints) * 1000) / 10 : 0);

  const overview: SprintSummaryOverview = {
    totalTasks,
    completedTasks,
    unfinishedTasks,
    plannedStoryPoints,
    completedStoryPoints,
    achievementPercent,
  };

  const rawDivisionResults = Array.isArray(data?.divisionResults) ? data.divisionResults : [];
  const divisionResults: SprintDivisionResult[] = rawDivisionResults.map((div: any) => ({
    divisionId: div.divisionId ?? div.division_id ?? null,
    divisionName: String(div.divisionName ?? div.division_name ?? "Belum Ada Divisi"),
    totalTasks: Number(div.totalTasks ?? div.total_tasks ?? 0),
    completedTasks: Number(div.completedTasks ?? div.completed_tasks ?? 0),
    unfinishedTasks: Number(div.unfinishedTasks ?? div.unfinished_tasks ?? 0),
    plannedStoryPoints: Number(div.plannedStoryPoints ?? div.planned_story_points ?? 0),
    completedStoryPoints: Number(div.completedStoryPoints ?? div.completed_story_points ?? 0),
    achievementPercent: Number(div.achievementPercent ?? div.achievement_percent ?? 0),
  }));

  const rawCompleted = Array.isArray(data?.completedWork) ? data.completedWork : [];
  const completedWork: SummaryTaskItem[] = rawCompleted.map((task: any) => ({
    taskId: String(task.taskId ?? task.task_id ?? ""),
    title: String(task.title || ""),
    status: String(task.status || "DONE"),
    progress: Number(task.progress ?? 100),
    divisionId: task.divisionId ?? task.division_id ?? null,
    divisionName: String(task.divisionName ?? task.division_name ?? "Belum Ada Divisi"),
    storyPoints: Number(task.storyPoints ?? task.story_points ?? 0),
    outcome: task.outcome || "done",
    targetSprintId: null,
  }));

  const rawUnfinished = Array.isArray(data?.unfinishedWork) ? data.unfinishedWork : [];
  const unfinishedWork: SummaryTaskItem[] = rawUnfinished.map((task: any) => ({
    taskId: String(task.taskId ?? task.task_id ?? ""),
    title: String(task.title || ""),
    status: String(task.status || "TODO"),
    progress: Number(task.progress || 0),
    divisionId: task.divisionId ?? task.division_id ?? null,
    divisionName: String(task.divisionName ?? task.division_name ?? "Belum Ada Divisi"),
    storyPoints: Number(task.storyPoints ?? task.story_points ?? 0),
    outcome: task.outcome || null,
    targetSprintId: task.targetSprintId ?? task.target_sprint_id ?? null,
  }));

  const rawNarrative = data?.summary || {};
  const summary: SprintNarrative = {
    id: rawNarrative.id ? String(rawNarrative.id) : undefined,
    summary: String(rawNarrative.summary || ""),
    achievements: String(rawNarrative.achievements || ""),
    challenges: String(rawNarrative.challenges || ""),
    lessonsLearned: String(rawNarrative.lessonsLearned ?? rawNarrative.lessons_learned ?? ""),
    nextSprintPlan: String(rawNarrative.nextSprintPlan ?? rawNarrative.next_sprint_plan ?? ""),
    isFinalized: Boolean(rawNarrative.isFinalized ?? rawNarrative.is_finalized ?? false),
    finalizedBy: rawNarrative.finalizedBy ?? rawNarrative.finalized_by ?? null,
    finalizedAt: rawNarrative.finalizedAt ?? rawNarrative.finalized_at ?? null,
  };

  const rawMeeting = data?.meeting || {};
  const rawAttendees = Array.isArray(rawMeeting.attendees) ? rawMeeting.attendees : [];
  const attendees: ReviewMeetingAttendee[] = rawAttendees.map((att: any) => ({
    userId: String(att.userId ?? att.user_id ?? ""),
    name: String(att.name ?? att.nameSnapshot ?? att.name_snapshot ?? "Anggota"),
    role: att.role ?? att.roleSnapshot ?? att.role_snapshot ?? undefined,
  }));

  const meeting: ReviewMeeting = {
    id: rawMeeting.id ? String(rawMeeting.id) : undefined,
    meetingDate: rawMeeting.meetingDate ? String(rawMeeting.meetingDate).slice(0, 10) : (rawMeeting.meeting_date ? String(rawMeeting.meeting_date).slice(0, 10) : ""),
    startTime: String(rawMeeting.startTime ?? rawMeeting.start_time ?? ""),
    location: String(rawMeeting.location || ""),
    meetingLink: String(rawMeeting.meetingLink ?? rawMeeting.meeting_link ?? ""),
    chairUserId: String(rawMeeting.chairUserId ?? rawMeeting.chair_user_id ?? ""),
    agenda: String(rawMeeting.agenda || ""),
    notes: String(rawMeeting.notes || ""),
    decisions: String(rawMeeting.decisions || ""),
    attendees,
  };

  const rawReqEvals = Array.isArray(data?.requiredEvaluations) ? data.requiredEvaluations : [];
  const requiredEvaluations = rawReqEvals.map((req: any) => ({
    id: String(req.id || ""),
    name: String(req.name || ""),
    role: req.role,
    initials: req.initials,
  }));

  const rawEvals = Array.isArray(data?.evaluations) ? data.evaluations : [];
  const evaluations: MemberEvaluation[] = rawEvals.map((ev: any) => ({
    id: ev.id ? String(ev.id) : undefined,
    userId: String(ev.userId ?? ev.user_id ?? ev.evaluatedUserId ?? ev.evaluated_user_id ?? ""),
    taskCompletion: Number(ev.taskCompletion ?? ev.task_completion ?? 0),
    quality: Number(ev.quality ?? 0),
    timeliness: Number(ev.timeliness ?? 0),
    collaboration: Number(ev.collaboration ?? 0),
    initiative: Number(ev.initiative ?? 0),
    overallScore: ev.overallScore !== undefined && ev.overallScore !== null ? Number(ev.overallScore) : (ev.overall_score !== undefined && ev.overall_score !== null ? Number(ev.overall_score) : null),
    notes: String(ev.notes || ""),
  }));

  const rawMetrics = Array.isArray(data?.memberMetrics) ? data.memberMetrics : [];
  const memberMetrics: MemberContributionMetrics[] = rawMetrics.map((m: any) => ({
    id: String(m.id || ""),
    name: String(m.name || ""),
    role: m.role,
    initials: m.initials,
    assignedTasks: Number(m.assignedTasks ?? m.assigned_tasks ?? 0),
    completedTasks: Number(m.completedTasks ?? m.completed_tasks ?? 0),
    carryOverCount: Number(m.carryOverCount ?? m.carry_over_count ?? 0),
    plannedStoryPoints: Number(m.plannedStoryPoints ?? m.planned_story_points ?? 0),
    completedStoryPoints: Number(m.completedStoryPoints ?? m.completed_story_points ?? 0),
  }));

  const rawPlanningTargets = Array.isArray(data?.planningTargetSprints) ? data.planningTargetSprints : [];
  const planningTargetSprints: PlanningTargetSprint[] = rawPlanningTargets.map((s: any) => ({
    id: String(s.id || ""),
    projectId: s.projectId ?? s.project_id,
    name: String(s.name || "Sprint"),
    goal: s.goal || "",
    startDate: s.startDate ?? s.start_date ?? null,
    endDate: s.endDate ?? s.end_date ?? null,
    status: String(s.status || "planning"),
  }));

  const rawErrors = Array.isArray(data?.finalizationErrors) ? data.finalizationErrors : [];
  const finalizationErrors: FinalizationError[] = rawErrors.map((err: any) => ({
    code: String(err.code || "UNKNOWN"),
    message: String(err.message || (typeof err === "string" ? err : "Validasi finalisasi belum terpenuhi")),
  }));

  return {
    sprint,
    overview,
    divisionResults,
    completedWork,
    unfinishedWork,
    meeting,
    summary,
    requiredEvaluations,
    evaluations,
    memberMetrics,
    planningTargetSprints,
    canFinalize: Boolean(data?.canFinalize),
    finalizationErrors,
  };
}

/**
 * Default sprint selector order according to spec:
 * 1. review Sprint if one exists
 * 2. latest closed Sprint (first by closedAt desc or list order)
 * 3. active Sprint
 * 4. latest planning Sprint
 */
export function selectDefaultSprint<T extends { id: string; status: string; closedAt?: string | null; closed_at?: string | null }>(
  sprints: T[]
): T | null {
  if (!sprints || sprints.length === 0) return null;

  // 1. review Sprint
  const reviewSprint = sprints.find((s) => s.status === "review");
  if (reviewSprint) return reviewSprint;

  // 2. latest closed Sprint
  const closedSprints = sprints.filter((s) => s.status === "closed" || s.status === "completed");
  if (closedSprints.length > 0) {
    // If closedAt available, sort descending
    return [...closedSprints].sort((a, b) => {
      const timeA = new Date(a.closedAt || a.closed_at || 0).getTime();
      const timeB = new Date(b.closedAt || b.closed_at || 0).getTime();
      return timeB - timeA;
    })[0];
  }

  // 3. active Sprint
  const activeSprint = sprints.find((s) => s.status === "active");
  if (activeSprint) return activeSprint;

  // 4. latest planning Sprint
  const planningSprints = sprints.filter((s) => s.status === "planning");
  if (planningSprints.length > 0) {
    return planningSprints[planningSprints.length - 1];
  }

  return sprints[0];
}

export function getSprintStatusBadge(status: string): { label: string; className: string } {
  switch (status?.toLowerCase()) {
    case "active":
      return { label: "ACTIVE", className: "bg-purple-100 text-purple-700 border border-purple-300 font-black" };
    case "review":
      return { label: "MENUNGGU REVIEW", className: "bg-amber-100 text-amber-800 border border-amber-300 font-black" };
    case "closed":
    case "completed":
      return { label: "CLOSED", className: "bg-slate-100 text-slate-700 border border-slate-300 font-black" };
    case "planning":
    default:
      return { label: "PLANNING", className: "bg-blue-50 text-blue-700 border border-blue-200 font-black" };
  }
}

export function validateEvaluationForm(scores: {
  taskCompletion: number | null | undefined;
  quality: number | null | undefined;
  timeliness: number | null | undefined;
  collaboration: number | null | undefined;
  initiative: number | null | undefined;
  notes: string;
}): { valid: boolean; error?: string } {
  const fields = ["taskCompletion", "quality", "timeliness", "collaboration", "initiative"] as const;
  for (const field of fields) {
    const val = scores[field];
    if (val === null || val === undefined || !Number.isInteger(val) || val < 1 || val > 10) {
      return { valid: false, error: "Semua skor evaluasi harus dipilih dengan nilai bulat antara 1 sampai 10." };
    }
  }
  if (!String(scores.notes || "").trim()) {
    return { valid: false, error: "Catatan evaluasi wajib diisi." };
  }
  return { valid: true };
}

export function formatScrumError(error: any): string {
  const code = error?.code || error?.body?.code || error?.response?.data?.code;
  const message = error?.body?.message || error?.response?.data?.message || error?.message || "Terjadi kesalahan pada sistem Scrum.";

  switch (code) {
    case "SCRUM_SELF_EVALUATION_FORBIDDEN":
      return "Anda tidak dapat mengevaluasi diri sendiri.";
    case "SCRUM_EVALUATION_SCORE_INVALID":
      return "Skor evaluasi tidak valid. Masukkan angka bulat antara 1 sampai 10.";
    case "SCRUM_EVALUATION_NOTES_REQUIRED":
      return "Catatan evaluasi wajib diisi untuk setiap anggota.";
    case "SCRUM_OUTCOME_INVALID":
      return "Keputusan task tidak valid.";
    case "SCRUM_CARRY_OVER_TARGET_REQUIRED":
      return "Sprint target planning wajib dipilih untuk carry-over.";
    case "SCRUM_INVALID_CARRY_OVER_TARGET":
      return "Target carry-over harus berupa Sprint planning pada project ini.";
    case "SCRUM_SPRINT_ALREADY_FINALIZED":
    case "SCRUM_SUMMARY_FINALIZED":
      return "Sprint ini sudah difinalisasi sebelumnya.";
    case "SCRUM_SPRINT_NOT_REVIEW":
      return "Sprint harus berstatus review untuk dapat difinalisasi.";
    case "SCRUM_SPRINT_FINALIZATION_BLOCKED":
      return "Sprint belum dapat difinalisasi. Harap lengkapi semua syarat di checklist kesiapan.";
    case "SCRUM_ACTIVE_SPRINT_EXISTS":
      return "Project ini masih memiliki Sprint lain yang sedang aktif.";
    default:
      return message;
  }
}

export const FINALIZE_CONFIRMATION_MESSAGE =
  "Finalisasi akan menutup Sprint ini dan menerapkan keputusan task yang belum selesai. Task carry-over akan dipindahkan ke Sprint target, task backlog akan dikembalikan ke Product Backlog, dan task yang dibatalkan tetap tersimpan di histori. Tindakan ini tidak dapat dibuka kembali pada versi saat ini.";
