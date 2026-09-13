/**
 * Helper module for Scrum V2 Phase 3B: GitHub Integration Frontend.
 * Provides safe DTO normalizers, validation, and presentation helpers.
 * GitHub activity is development evidence only; STAS-RG/MS remains the source of truth.
 */

export interface GitHubRepository {
  id: string;
  projectId: string;
  divisionId: string | null;
  owner: string;
  repo: string;
  fullName: string;
  githubRepositoryId: string | null;
  githubInstallationId: string | null;
  defaultBranch: string;
  isPrivate: boolean;
  isActive: boolean;
  createdAt: string | null;
  createdBy: string | null;
}

export interface TaskRepositoryLink {
  id: string;
  taskId: string;
  repositoryId: string;
  branchName: string | null;
  linkSource: string;
  owner: string;
  repo: string;
  fullName: string;
  githubOwner?: string;
  githubRepo?: string;
  createdAt: string | null;
}

export type GitHubActivityType =
  | "push"
  | "pull_request_opened"
  | "pull_request_reopened"
  | "pull_request_synchronize"
  | "pull_request_closed"
  | "pull_request_merged"
  | string;

export interface GitHubActivity {
  id: string;
  repositoryId: string;
  taskId: string | null;
  deliveryId: string | null;
  activityType: GitHubActivityType;
  actorLogin: string | null;
  branchName: string | null;
  commitSha: string | null;
  commitMessage: string | null;
  prNumber: number | null;
  prTitle: string | null;
  prState: string | null;
  prMerged: boolean | null;
  htmlUrl: string | null;
  occurredAt: string | null;
  suggestedTaskStatus: "DOING" | "REVIEW" | "DONE" | null;
  createdAt: string | null;
}

export interface GitHubIntegrationStatus {
  configured: boolean;
  message?: string;
}

export interface GitHubActivitySummary {
  totalActivities: number;
  commitsCount: number;
  prCount: number;
  mergedPrCount: number;
  uniqueRepositoriesCount: number;
}

/**
 * Normalizes backend repository object (handles camelCase and snake_case).
 */
export function normalizeGitHubRepository(item: any): GitHubRepository {
  const owner = String(item?.githubOwner ?? item?.github_owner ?? item?.owner ?? "").trim();
  const repo = String(item?.githubRepo ?? item?.github_repo ?? item?.repo ?? "").trim();
  const fullName = owner && repo ? `${owner}/${repo}` : owner || repo;

  return {
    id: String(item?.id ?? ""),
    projectId: String(item?.projectId ?? item?.project_id ?? ""),
    divisionId: item?.divisionId ?? item?.division_id ?? null,
    owner,
    repo,
    fullName,
    githubRepositoryId: item?.githubRepositoryId ?? item?.github_repository_id ? String(item.githubRepositoryId ?? item.github_repository_id) : null,
    githubInstallationId: item?.githubInstallationId ?? item?.github_installation_id ? String(item.githubInstallationId ?? item.github_installation_id) : null,
    defaultBranch: String(item?.defaultBranch ?? item?.default_branch ?? "main").trim() || "main",
    isPrivate: Boolean(item?.isPrivate ?? item?.is_private ?? false),
    isActive: item?.isActive !== undefined ? Boolean(item.isActive) : item?.is_active !== undefined ? Boolean(item.is_active) : true,
    createdAt: item?.createdAt ?? item?.created_at ?? null,
    createdBy: item?.createdBy ?? item?.created_by ?? null,
  };
}

/**
 * Normalizes backend task repository link object.
 */
export function normalizeTaskRepositoryLink(item: any): TaskRepositoryLink {
  const owner = String(item?.github_owner ?? item?.githubOwner ?? item?.owner ?? "").trim();
  const repo = String(item?.github_repo ?? item?.githubRepo ?? item?.repo ?? "").trim();
  const fullName = owner && repo ? `${owner}/${repo}` : owner || repo;

  return {
    id: String(item?.id ?? ""),
    taskId: String(item?.task_id ?? item?.taskId ?? ""),
    repositoryId: String(item?.repository_id ?? item?.repositoryId ?? ""),
    branchName: item?.branch_name ?? item?.branchName ?? null,
    linkSource: String(item?.link_source ?? item?.linkSource ?? "manual"),
    owner,
    repo,
    fullName,
    githubOwner: owner,
    githubRepo: repo,
    createdAt: item?.created_at ?? item?.createdAt ?? null,
  };
}

/**
 * Normalizes backend GitHub activity object.
 * Enforces rule: closed unmerged PR must never have a suggestedTaskStatus of DONE.
 */
export function normalizeGitHubActivity(item: any): GitHubActivity {
  const activityType = String(item?.activity_type ?? item?.activityType ?? "").trim();
  const prMerged = item?.pull_request_merged !== undefined ? Boolean(item.pull_request_merged) : item?.prMerged !== undefined ? Boolean(item.prMerged) : null;
  const rawSuggestion = item?.suggested_task_status ?? item?.suggestedTaskStatus ?? null;

  // Safety safeguard: closed unmerged PR must NOT suggest DONE
  let suggestedTaskStatus: "DOING" | "REVIEW" | "DONE" | null = null;
  if (rawSuggestion === "DOING" || rawSuggestion === "REVIEW" || rawSuggestion === "DONE") {
    if (activityType === "pull_request_closed" && prMerged === false && rawSuggestion === "DONE") {
      suggestedTaskStatus = null;
    } else {
      suggestedTaskStatus = rawSuggestion;
    }
  }

  return {
    id: String(item?.id ?? ""),
    repositoryId: String(item?.repository_id ?? item?.repositoryId ?? ""),
    taskId: item?.task_id ?? item?.taskId ?? null,
    deliveryId: item?.delivery_id ?? item?.deliveryId ?? null,
    activityType,
    actorLogin: item?.github_actor_login ?? item?.actorLogin ?? item?.actor ?? null,
    branchName: item?.branch_name ?? item?.branchName ?? null,
    commitSha: item?.commit_sha ?? item?.commitSha ?? item?.sha ?? null,
    commitMessage: item?.commit_message ?? item?.commitMessage ?? item?.message ?? null,
    prNumber: item?.pull_request_number !== undefined && item?.pull_request_number !== null ? Number(item.pull_request_number) : item?.prNumber !== undefined && item?.prNumber !== null ? Number(item.prNumber) : null,
    prTitle: item?.pull_request_title ?? item?.prTitle ?? item?.title ?? null,
    prState: item?.pull_request_state ?? item?.prState ?? item?.state ?? null,
    prMerged,
    htmlUrl: item?.html_url ?? item?.htmlUrl ?? item?.url ?? null,
    occurredAt: item?.occurred_at ?? item?.occurredAt ?? null,
    suggestedTaskStatus,
    createdAt: item?.created_at ?? item?.createdAt ?? null,
  };
}

/**
 * Normalizes GitHub configuration status from backend.
 */
export function normalizeGitHubConfigStatus(res: any): GitHubIntegrationStatus {
  const configured = Boolean(res?.configured);
  const message = configured
    ? "GitHub App terhubung dan aktif."
    : "GitHub App belum dikonfigurasi pada server. Repository dapat dilihat/dikelola sesuai kemampuan backend, tetapi sinkronisasi GitHub live belum tersedia.";
  return { configured, message };
}

/**
 * Formats task key for display, ensuring valid TASK-<number> formatting.
 */
export function formatTaskKey(taskKey?: string | null): string {
  if (!taskKey) return "";
  const trimmed = String(taskKey).trim().toUpperCase();
  if (/^TASK-[0-9]+$/.test(trimmed)) {
    return trimmed;
  }
  return trimmed;
}

/**
 * Generates recommended branch template from Task Key and title.
 * Example: feature/TASK-184-authentication
 */
export function generateBranchTemplate(taskKey?: string | null, taskTitle?: string | null): string {
  const key = formatTaskKey(taskKey);
  if (!key) return "";

  const cleanTitle = String(taskTitle || "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 30);

  return cleanTitle ? `feature/${key}-${cleanTitle}` : `feature/${key}`;
}

/**
 * Formats commit SHA into short 7-character form.
 */
export function formatShortSha(sha?: string | null): string {
  if (!sha) return "";
  return String(sha).trim().slice(0, 7);
}

/**
 * Maps GitHub activity type to human-readable Indonesian label and color badge class.
 */
export function getActivityTypeMeta(type: string, prMerged?: boolean | null): {
  label: string;
  badgeClass: string;
} {
  const normalized = String(type || "").trim().toLowerCase();

  switch (normalized) {
    case "push":
      return {
        label: "Push / Commit",
        badgeClass: "bg-blue-100 text-blue-700 border-blue-200",
      };
    case "pull_request_opened":
      return {
        label: "PR Dibuka",
        badgeClass: "bg-emerald-100 text-emerald-700 border-emerald-200",
      };
    case "pull_request_reopened":
      return {
        label: "PR Dibuka Kembali",
        badgeClass: "bg-amber-100 text-amber-700 border-amber-200",
      };
    case "pull_request_synchronize":
      return {
        label: "PR Diperbarui",
        badgeClass: "bg-sky-100 text-sky-700 border-sky-200",
      };
    case "pull_request_merged":
      return {
        label: "PR Di-merge",
        badgeClass: "bg-purple-100 text-purple-700 border-purple-200",
      };
    case "pull_request_closed":
      if (prMerged) {
        return {
          label: "PR Di-merge",
          badgeClass: "bg-purple-100 text-purple-700 border-purple-200",
        };
      }
      return {
        label: "PR Ditutup",
        badgeClass: "bg-slate-100 text-slate-700 border-slate-200",
      };
    default:
      return {
        label: normalized || "Aktivitas GitHub",
        badgeClass: "bg-slate-100 text-slate-700 border-slate-200",
      };
  }
}

/**
 * Maps suggested task status to Indonesian label and badge style.
 */
export function getSuggestedStatusMeta(status?: string | null): {
  label: string;
  badgeClass: string;
} | null {
  if (!status) return null;
  const upper = String(status).trim().toUpperCase();

  switch (upper) {
    case "DOING":
      return {
        label: "Disarankan: DOING",
        badgeClass: "bg-blue-100 text-blue-700 border-blue-200",
      };
    case "REVIEW":
      return {
        label: "Disarankan: REVIEW",
        badgeClass: "bg-amber-100 text-amber-700 border-amber-200",
      };
    case "DONE":
      return {
        label: "Disarankan: DONE",
        badgeClass: "bg-emerald-100 text-emerald-700 border-emerald-200",
      };
    default:
      return null;
  }
}

/**
 * Validates external GitHub URLs safely to prevent XSS or non-github redirects.
 */
export function isValidGitHubUrl(url?: string | null): boolean {
  if (!url || typeof url !== "string") return false;
  try {
    const parsed = new URL(url.trim());
    return (
      (parsed.protocol === "https:" || parsed.protocol === "http:") &&
      (parsed.hostname === "github.com" || parsed.hostname === "www.github.com")
    );
  } catch {
    return false;
  }
}

/**
 * Formats GitHub actor login without linking or hallucinating STAS-RG identity.
 * Displays strictly as '@login'.
 */
export function formatGitHubActor(actorLogin?: string | null): string {
  const trimmed = String(actorLogin || "").trim();
  if (!trimmed) return "Tidak diketahui";
  return trimmed.startsWith("@") ? trimmed : `@${trimmed}`;
}

/**
 * Calculates summary metrics across a list of normalized GitHub activities.
 */
export function calculateGitHubActivitySummary(activities: GitHubActivity[]): GitHubActivitySummary {
  if (!Array.isArray(activities)) {
    return {
      totalActivities: 0,
      commitsCount: 0,
      prCount: 0,
      mergedPrCount: 0,
      uniqueRepositoriesCount: 0,
    };
  }

  let commitsCount = 0;
  let prCount = 0;
  let mergedPrCount = 0;
  const repoSet = new Set<string>();

  for (const act of activities) {
    if (act.repositoryId) repoSet.add(act.repositoryId);

    if (act.activityType === "push") {
      commitsCount += 1;
    } else if (act.activityType.startsWith("pull_request_")) {
      prCount += 1;
      if (act.activityType === "pull_request_merged" || act.prMerged === true) {
        mergedPrCount += 1;
      }
    }
  }

  return {
    totalActivities: activities.length,
    commitsCount,
    prCount,
    mergedPrCount,
    uniqueRepositoriesCount: repoSet.size,
  };
}

/**
 * Evaluates whether a status suggestion can be applied to a task.
 * Enforces:
 * - Closed sprint tasks cannot be mutated.
 * - Same status needs no mutation.
 * - Only authorized managers/editors may apply.
 */
export function canApplySuggestedStatus(params: {
  suggestedStatus?: string | null;
  currentTaskStatus?: string | null;
  isSprintClosed?: boolean;
  canManageTask?: boolean;
}): { eligible: boolean; reason?: string } {
  const { suggestedStatus, currentTaskStatus, isSprintClosed, canManageTask } = params;

  if (!suggestedStatus) {
    return { eligible: false, reason: "Tidak ada saran status" };
  }

  if (isSprintClosed) {
    return { eligible: false, reason: "Sprint sudah ditutup (read-only)" };
  }

  if (canManageTask === false) {
    return { eligible: false, reason: "Tidak memiliki izin mengubah status task" };
  }

  const normSuggested = String(suggestedStatus).trim().toUpperCase();
  const normCurrent = String(currentTaskStatus || "").trim().toUpperCase();

  if (normSuggested === normCurrent) {
    return { eligible: false, reason: "Status task sudah sesuai" };
  }

  return { eligible: true };
}

/**
 * Translates backend error codes and messages into clear Indonesian user feedback.
 */
export function formatGitHubError(error: any): string {
  const code = error?.code || error?.response?.data?.code;
  const message = error?.message || error?.response?.data?.message;

  switch (code) {
    case "SCRUM_REPOSITORY_EXISTS":
      return "Repository sudah terdaftar pada project ini.";
    case "SCRUM_TASK_REPOSITORY_EXISTS":
      return "Task sudah terhubung ke repository tersebut.";
    case "SCRUM_REPOSITORY_NOT_FOUND":
      return "Repository tidak ditemukan.";
    case "SCRUM_TASK_NOT_FOUND":
      return "Task tidak ditemukan.";
    default:
      if (message) return String(message);
      return "Terjadi kesalahan saat memproses data GitHub.";
  }
}

export interface ResearchProjectItem {
  id: string;
  title: string;
  short_title?: string;
  status: string;
}

/**
 * Resolves the correct API endpoint for research project listing.
 * Operator uses GET /research (NOT /research/projects).
 * Dosen uses GET /research/assigned (optionally with userId).
 */
export function getResearchProjectsEndpoint(isDosen: boolean, userId?: string | null): string {
  if (isDosen) {
    return userId ? `/research/assigned?userId=${encodeURIComponent(userId)}` : "/research/assigned";
  }
  return "/research";
}

/**
 * Normalizes research project list response from GET /research or GET /research/assigned.
 * Safely handles plain array, wrapped { data: [...] }, or wrapped { projects: [...] }.
 */
export function normalizeResearchProjectList(data: any): ResearchProjectItem[] {
  const rawList = Array.isArray(data)
    ? data
    : Array.isArray(data?.data)
      ? data.data
      : Array.isArray(data?.projects)
        ? data.projects
        : [];

  return rawList
    .map((item: any) => ({
      id: String(item?.id ?? ""),
      title: String(item?.title ?? item?.name ?? ""),
      short_title: item?.short_title ?? item?.shortTitle ?? undefined,
      status: String(item?.status ?? "Aktif"),
    }))
    .filter((p: ResearchProjectItem) => Boolean(p.id));
}
