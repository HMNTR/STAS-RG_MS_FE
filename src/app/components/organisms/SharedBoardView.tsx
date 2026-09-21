/**
 * SharedBoardView — identik dengan BoardView di MyResearch.tsx
 * Digunakan oleh ProgressTim (Dosen) dan ProgressBoard (Operator)
 * Full access: add task, edit, delete, move, edit board, manage milestone
 */
import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router";
import {
  ChevronLeft, Edit2, AlertTriangle, Check, X,
  UploadCloud, Download, Send, FileText,
  Image as ImageIcon, Folder, Plus, Trash2, MessageSquare,
  Paperclip, GitBranch, ExternalLink, Link as LinkIcon, Search,
  Kanban, Users as UsersIcon, GitCommit, GitPullRequest, Copy, CheckCircle2, RefreshCw,
  AlertCircle, Lock
} from "lucide-react";
import { useConfirmDialog } from "../molecules/ConfirmDialog";
import { apiDelete, apiGet, apiPatch, apiPost, apiPut, getStoredUser, resolveApiAssetUrl } from "../../lib/api";
import { formatDateReadable } from "../../lib/date";
import { ProjectMembersView } from "./ProjectMembersView";
import {
  DOSEN_RESEARCH_ROLES,
  getResearchRoleOptions,
  MAHASISWA_RESEARCH_ROLES,
  normalizeResearchRoleForMemberType,
  getCombinedMemberRoles,
  loadStoredDivisionRoles
} from "../../lib/researchRoles";
import {
  ProjectDivision,
  normalizeTaskDivisionFields,
  filterTasksForBoard,
  getDivisionTabs,
  normalizeDivisionItem
} from "../../lib/scrum";
import { getSprintTimingState } from "../../lib/sprintDuration";
import { RichTaskDescription } from "../molecules/RichTaskDescription";
import { getTaskDescriptionPreview } from "../../lib/taskDescription";
import {
  GitHubRepository,
  TaskRepositoryLink,
  GitHubActivity,
  normalizeGitHubRepository,
  normalizeTaskRepositoryLink,
  normalizeGitHubActivity,
  formatTaskKey,
  generateBranchTemplate,
  formatShortSha,
  getActivityTypeMeta,
  getSuggestedStatusMeta,
  isValidGitHubUrl,
  formatGitHubActor,
  canApplySuggestedStatus,
  formatGitHubError,
} from "../../lib/githubIntegration";

type Milestone = {
  id?: number;
  label: string;
  done: boolean;
  sortOrder?: number;
};

type TeamMember = {
  id: string;
  name: string;
  initials: string;
  role: string;
  memberType: "Mahasiswa" | "Dosen" | string;
  color: string;
  status?: string;
  mahasiswaTipe?: string;
  bergabung?: string;
  selesai?: string;
};

type BoardTask = {
  id: string;
  taskKey?: string;
  title: string;
  status: "TO DO" | "DOING" | "REVIEW" | "DONE";
  deadline?: string;
  statusText?: string;
  description?: string;
  tag: string;
  sp: number;
  assignees: string[];
  assigneeUserIds?: string[];
  comments: number;
  isOverdue: boolean;
  progress?: number;
  priority?: string;
  sortOrder?: number;
  storyPoints?: number | null;
  sprintId?: string | null;
  divisionId?: string | null;
  divisionName?: string | null;
  divisionIsActive?: boolean | null;
  createdByName?: string;
  createdByInitials?: string;
  createdByRole?: string;
};

type TaskAttachment = {
  id: string;
  name: string;
  sizeLabel: string;
  uploadedAt: string;
  url?: string;
  type: "file" | "link";
  local?: boolean;
};

type TaskSubtask = {
  id: string;
  title: string;
  done: boolean;
  attachmentRequired: boolean;
  completedAt?: string;
};

type TaskComment = {
  id: string;
  authorId?: string;
  authorName?: string;
  text: string;
  createdAt?: string;
  subtaskId?: string;
  subtaskTitle?: string;
};

type BoardColumns = {
  todo: BoardTask[];
  doing: BoardTask[];
  review: BoardTask[];
  done: BoardTask[];
};

type BoardColumnId = keyof BoardColumns;

type ProjectView = {
  id: string;
  shortTitle: string;
  period: string;
  mitra: string;
  progress: number;
  progressColor: string;
  status: string;
  ketuaInitials: string;
  researchType?: string;
  agreementType?: string;
  agreementStartDate?: string;
  agreementEndDate?: string;
  agreementFileUrl?: string;
  proposalFileUrl?: string;
  rabFileUrl?: string;
  attachment_link?: string;
};

type BoardPermissions = {
  role: "mahasiswa" | "dosen" | "operator";
  isLeaderMember: boolean;
  canManageCards: boolean;
  canFillExistingCards: boolean;
};

const EMPTY_BOARD_COLUMNS: BoardColumns = { todo: [], doing: [], review: [], done: [] };

function getDefaultBoardPermissions(role?: string | null): BoardPermissions {
  const normalizedRole = String(role || "mahasiswa").toLowerCase() as BoardPermissions["role"];
  const isPrivileged = normalizedRole === "operator" || normalizedRole === "dosen";

  return {
    role: ["operator", "dosen", "mahasiswa"].includes(normalizedRole) ? normalizedRole : "mahasiswa",
    isLeaderMember: false,
    canManageCards: isPrivileged,
    canFillExistingCards: true,
  };
}

function normalizeBoardPermissions(value: any, fallbackRole?: string | null): BoardPermissions {
  const fallback = getDefaultBoardPermissions(fallbackRole);
  if (!value || typeof value !== "object") return fallback;
  const role = String(value.role || fallback.role).toLowerCase();

  return {
    role: ["operator", "dosen", "mahasiswa"].includes(role) ? role as BoardPermissions["role"] : fallback.role,
    isLeaderMember: Boolean(value.isLeaderMember ?? fallback.isLeaderMember),
    canManageCards: Boolean(value.canManageCards ?? fallback.canManageCards),
    canFillExistingCards: Boolean(value.canFillExistingCards ?? fallback.canFillExistingCards),
  };
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function getActiveMilestoneLabel(milestones: Milestone[]) {
  return milestones.find((m) => !m.done)?.label ?? "Semua Selesai ✓";
}

function getMilestoneProgress(milestones: Milestone[]) {
  return milestones.length
    ? Math.round((milestones.filter((m) => m.done).length / milestones.length) * 100)
    : 0;
}

function formatFileSize(bytes: number) {
  if (!Number.isFinite(bytes) || bytes <= 0) return "0 B";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function toDateInputValue(value?: string) {
  if (!value) return "";
  const normalized = String(value).trim();
  if (!normalized) return "";

  if (/^\d{4}-\d{2}-\d{2}$/.test(normalized)) {
    return normalized;
  }

  if (/^\d{2}\/\d{2}\/\d{4}$/.test(normalized)) {
    const [day, month, year] = normalized.split("/");
    return `${year}-${month}-${day}`;
  }

  const parsed = new Date(normalized);
  if (Number.isNaN(parsed.getTime())) return "";
  return parsed.toISOString().slice(0, 10);
}

function getResearchField(row: any, camelKey: string, snakeKey: string) {
  return String(row?.[camelKey] || row?.[snakeKey] || "");
}

function formatBoardDate(value?: string) {
  if (!value) return "-";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value;
  return parsed.toLocaleDateString("id-ID", { day: "2-digit", month: "short", year: "numeric" });
}

function formatBoardDateRange(start?: string, end?: string) {
  if (!start && !end) return "-";
  return `${formatBoardDate(start)} - ${formatBoardDate(end)}`;
}

function normalizeTaskAttachment(item: any, index: number): TaskAttachment {
  if (typeof item === "string") {
    const rawUrl = item.trim();
    const resolvedUrl = resolveApiAssetUrl(rawUrl) || rawUrl;
    const name = rawUrl.split("/").pop() || `Lampiran ${index + 1}`;
    return {
      id: `attachment-${index}`,
      name,
      sizeLabel: "-",
      uploadedAt: new Date().toISOString(),
      url: resolvedUrl,
      type: rawUrl.startsWith("http") && !rawUrl.includes("/uploads/") ? "link" : "file",
      local: false
    };
  }

  const name = item?.name || item?.filename || item?.file_name || item?.fileName || item?.title || item?.url || `Lampiran ${index + 1}`;
  const sizeValue = Number(item?.size || item?.bytes || item?.file_size || item?.fileSize || 0);
  const uploadedAt = item?.uploadedAt || item?.createdAt || item?.created_at || new Date().toISOString();
  const rawUrl = item?.url || item?.href || item?.file_url || item?.fileUrl || item?.fileDataUrl || "";
  const resolvedUrl = resolveApiAssetUrl(rawUrl) || rawUrl;
  return {
    id: String(item?.id || `attachment-${index}`),
    name,
    sizeLabel: item?.sizeLabel || formatFileSize(sizeValue),
    uploadedAt,
    url: resolvedUrl,
    type: item?.type === "link" ? "link" : "file",
    local: Boolean(item?.local)
  };
}

function normalizeTaskSubtask(item: any, index: number): TaskSubtask {
  return {
    id: String(item?.id || `subtask-${index}`),
    title: item?.title || item?.label || item?.text || `Sub-tugas ${index + 1}`,
    done: Boolean(item?.done || item?.checked),
    attachmentRequired: item?.attachmentRequired !== false,
    completedAt: item?.completedAt || item?.checkedAt || undefined
  };
}

function normalizeTaskComment(item: any, index: number): TaskComment {
  return {
    id: String(item?.id || `comment-${index}`),
    authorId: item?.authorId || item?.userId || undefined,
    authorName: item?.authorName || item?.author || item?.userName || "Pengguna",
    text: item?.text || item?.comment || item?.body || "",
    createdAt: item?.createdAt || item?.created_at || item?.date || undefined,
    subtaskId: item?.subtaskId || item?.checklistId || undefined,
    subtaskTitle: item?.subtaskTitle || item?.checklistTitle || item?.subtask || undefined
  };
}

function getInitialsFromName(value?: string) {
  return String(value || "U")
    .split(" ")
    .map((chunk) => chunk[0] || "")
    .join("")
    .slice(0, 2)
    .toUpperCase() || "U";
}

function mapTeamMember(member: any, index: number): TeamMember {
  const fallbackInitials = getInitialsFromName(member?.name || "TM");
  const memberType = member?.member_type || member?.memberType || "Mahasiswa";

  return {
    id: String(member?.user_id || member?.userId || ""),
    name: member?.name || "Anggota Tim",
    initials: member?.initials || fallbackInitials,
    role: member?.peran || memberType || "Anggota",
    memberType,
    status: member?.student_status || member?.status || "Aktif",
    mahasiswaTipe: member?.mahasiswa_tipe || "Riset",
    bergabung: member?.bergabung,
    selesai: member?.selesai,
    color: memberType === "Dosen"
      ? "bg-blue-500 text-white"
      : index % 2 === 0
        ? "bg-[#8B6FFF] text-white"
        : "bg-emerald-500 text-white"
  };
}

function normalizeBoardStatus(value?: string): BoardTask["status"] {
  const normalized = String(value || "")
    .trim()
    .toUpperCase()
    .replace(/\s+/g, " ");

  if (normalized === "TODO") return "TO DO";
  if (normalized === "TO DO" || normalized === "DOING" || normalized === "REVIEW" || normalized === "DONE") {
    return normalized;
  }

  return "TO DO";
}

function getBoardColumnKey(status: BoardTask["status"]): BoardColumnId {
  if (status === "TO DO") return "todo";
  if (status === "DOING") return "doing";
  if (status === "REVIEW") return "review";
  return "done";
}

function getBoardStatusFromColumnKey(columnId: BoardColumnId): BoardTask["status"] {
  if (columnId === "todo") return "TO DO";
  if (columnId === "doing") return "DOING";
  if (columnId === "review") return "REVIEW";
  return "DONE";
}

function mapBoardTask(item: any): BoardTask {
  const normDivision = normalizeTaskDivisionFields(item);
  const status = normalizeBoardStatus(item?.status);
  const deadline = item?.deadline || undefined;
  const isOverdue = Boolean(
    deadline &&
    status !== "DONE" &&
    !Number.isNaN(new Date(deadline).getTime()) &&
    new Date(deadline).getTime() < new Date(new Date().toDateString()).getTime()
  );
  const assignees = Array.isArray(item?.assignees)
    ? item.assignees.map((assignee: any) => assignee?.initials || getInitialsFromName(assignee?.name))
    : [];
  const assigneeUserIds = Array.isArray(item?.assignee_ids || item?.assigneeIds)
    ? (item.assignee_ids || item.assigneeIds).map((value: any) => String(value))
    : Array.isArray(item?.assignees)
      ? item.assignees.map((assignee: any) => String(assignee?.user_id || assignee?.userId || "")).filter(Boolean)
      : [];

  return {
    id: String(item?.id || ""),
    taskKey: formatTaskKey(item?.taskKey || item?.task_key) || undefined,
    title: item?.title || "Task",
    status,
    deadline,
    statusText: item?.description || item?.statusText || undefined,
    description: item?.description || "",
    tag: item?.tag || (status === "DONE" ? "Done" : "Riset"),
    sp: Number(item?.sp) || 3,
    assignees,
    assigneeUserIds,
    comments: Number(item?.commentsCount ?? item?.comments_count ?? item?.comments?.length ?? 0),
    isOverdue,
    progress: item?.progress !== undefined && item?.progress !== null ? Number(item.progress) : undefined,
    priority: item?.priority || undefined,
    sortOrder: Number(item?.sortOrder ?? item?.sort_order ?? 0),
    storyPoints: normDivision.storyPoints ?? (item?.sp !== undefined ? Number(item.sp) : 3),
    sprintId: normDivision.sprintId,
    divisionId: normDivision.divisionId,
    divisionName: normDivision.divisionName,
    divisionIsActive: normDivision.divisionIsActive,
    createdByName: item?.createdByName || item?.created_by_name || undefined,
    createdByInitials: item?.createdByName ? getInitialsFromName(item.createdByName) : undefined,
    createdByRole: item?.createdByRole || undefined
  };
}

function getTaskAttachmentsFromDetail(task: any) {
  if (!Array.isArray(task?.attachments)) return [];
  return task.attachments.map(normalizeTaskAttachment);
}

function fileToDataUrl(file: File) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ""));
    reader.onerror = () => reject(new Error(`Gagal membaca file ${file.name}.`));
    reader.readAsDataURL(file);
  });
}

// ─── MilestoneBanner ─────────────────────────────────────────────────────────

function MilestoneBanner({
  milestones, progressColor, onToggle, onManage, editable = true,
}: {
  milestones: Milestone[];
  progressColor: string;
  onToggle: (i: number) => void;
  onManage: () => void;
  editable?: boolean;
}) {
  return (
    <div className="flex items-end gap-0 w-full group/banner">
      {milestones.map((m, i, arr) => (
        <div key={i} className="contents">
          <div className="flex flex-col items-center gap-1.5">
            <button
              onClick={() => onToggle(i)}
              disabled={!editable}
              title={m.done ? `Tandai "${m.label}" belum selesai` : `Tandai "${m.label}" selesai`}
              className={`w-6 h-6 rounded-full flex items-center justify-center border-2 transition-all hover:scale-110 hover:shadow-md focus:outline-none disabled:hover:scale-100 disabled:hover:shadow-none disabled:cursor-default ${m.done ? `${progressColor} border-transparent text-white` : "bg-white border-[#A8E895] hover:border-[#0AB600]"
                }`}
            >
              {m.done ? (
                <svg viewBox="0 0 12 12" className="w-2.5 h-2.5">
                  <path d="M1 6l3.5 3.5L11 2" stroke="white" strokeWidth="2.5" fill="none" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              ) : (
                <div className="w-1.5 h-1.5 rounded-full bg-[#A8E895]" />
              )}
            </button>
            <span className={`text-[9px] font-bold whitespace-nowrap transition-colors ${m.done ? "text-[#0AB600]" : "text-[#5CC444]/70"}`}>
              {m.label}
            </span>
          </div>
          {i < arr.length - 1 && (
            <div className={`h-0.5 flex-1 mx-1 mb-4 transition-all ${m.done && arr[i + 1].done ? progressColor
              : m.done ? `${progressColor} opacity-30`
                : "bg-[#D8F5D0]"
              }`} />
          )}
        </div>
      ))}
      {editable && (
        <button
          onClick={onManage}
          className="ml-4 mb-4 shrink-0 flex items-center gap-1.5 px-3 py-1 bg-white border border-[#D8F5D0] hover:border-[#0AB600] hover:bg-[#F0FFF0] rounded-lg text-[10px] font-black text-[#4AB834] hover:text-[#0AB600] transition-all opacity-0 group-hover/banner:opacity-100 shadow-sm whitespace-nowrap"
        >
          <Edit2 size={10} strokeWidth={3} /> Kelola
        </button>
      )}
    </div>
  );
}

function BoardDocumentLink({ label, url }: { label: string; url?: string }) {
  const resolvedUrl = resolveApiAssetUrl(url) || url;
  return (
    <div className="flex min-w-0 flex-col gap-1 rounded-xl border border-[#D8F5D0] bg-white px-3 py-2 shadow-sm">
      <span className="text-[10px] font-black uppercase tracking-wider text-[#5CC444]">{label}</span>
      {resolvedUrl ? (
        <a
          href={resolvedUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex min-w-0 items-center gap-1.5 text-xs font-bold text-[#0AB600] hover:underline"
        >
          <span className="truncate">Buka file</span>
          <ExternalLink size={12} className="shrink-0" />
        </a>
      ) : (
        <span className="text-xs font-semibold italic text-slate-400">Belum tersedia</span>
      )}
    </div>
  );
}

// ─── Tag color ────────────────────────────────────────────────────────────────

function getTagColor(tag: string) {
  switch (tag) {
    case "Backend": return "bg-teal-100 text-teal-700";
    case "Penulis TA": return "bg-cyan-100 text-cyan-700";
    case "Hardware": return "bg-slate-200 text-slate-700";
    case "Dokumentasi": return "bg-amber-100 text-amber-700";
    case "Jurnal": return "bg-blue-100 text-blue-700";
    case "Done": return "bg-emerald-100 text-emerald-700";
    default: return "bg-muted text-muted-foreground";
  }
}

// ─── Board tasks (same as mahasiswa) ──────────────────────────────────────────

interface SharedBoardViewProps {
  /** Which projects to show in the switcher */
  projectIds?: string[];
  strictProjectFilter?: boolean;
  /** Label for the "back" button — if provided, show back button instead of switcher */
  backLabel?: string;
  onBack?: () => void;
  /** Accent color class for active tab/button (default: bg-[#6C47FF]) */
  accentBg?: string;
  accentText?: string;
  accentHover?: string;
}

// ─── Main Component ───────────────────────────────────────────────────────────

export function SharedBoardView({
  projectIds = [],
  strictProjectFilter = false,
  backLabel,
  onBack,
  accentBg = "bg-[#0AB600]",
  accentText = "text-[#0AB600]",
  accentHover = "hover:text-[#0AB600]",
}: SharedBoardViewProps) {
  const { confirm, confirmDialog } = useConfirmDialog();
  const currentUser = getStoredUser();
  const navigate = useNavigate();

  const [availableProjects, setAvailableProjects] = useState<ProjectView[]>([]);
  const [activeId, setActiveId] = useState("");
  const [milestonesMap, setMilestonesMap] = useState<Record<string, Milestone[]>>({});
  const [teamMembersMap, setTeamMembersMap] = useState<Record<string, TeamMember[]>>({});
  const [tasksMap, setTasksMap] = useState<Record<string, BoardColumns>>({});
  const [permissionsMap, setPermissionsMap] = useState<Record<string, BoardPermissions>>({});
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [activeSprint, setActiveSprint] = useState<any>(null);
  const [reviewSprint, setReviewSprint] = useState<any>(null);
  const [divisions, setDivisions] = useState<ProjectDivision[]>([]);
  const [selectedDivisionId, setSelectedDivisionId] = useState<string>("all");
  const [boardSprintScope, setBoardSprintScope] = useState<"active_sprint" | "all">("active_sprint");
  const [onlyMyTasks, setOnlyMyTasks] = useState(false);
  const [boardRepos, setBoardRepos] = useState<GitHubRepository[]>([]);
  const [boardReposLoading, setBoardReposLoading] = useState<boolean>(false);
  const [boardReposError, setBoardReposError] = useState<string>("");
  const projectIdsKey = projectIds.join("|");

  useEffect(() => {
    if (!activeId) {
      setActiveSprint(null);
      setReviewSprint(null);
      return;
    }
    apiGet<any[]>(`/research/${activeId}/sprints`)
      .then((list) => {
        const active = (list || []).find((s) => s.status === "active");
        const review = (list || []).find((s) => s.status === "review");
        setActiveSprint(active || null);
        setReviewSprint(review || null);
      })
      .catch(() => {
        setActiveSprint(null);
        setReviewSprint(null);
      });
  }, [activeId]);

  useEffect(() => {
    if (!activeId) {
      setDivisions([]);
      return;
    }
    setSelectedDivisionId("all");
    apiGet<any[]>(`/research/${activeId}/divisions`)
      .then((list) => {
        setDivisions((list || []).map(normalizeDivisionItem));
      })
      .catch(() => setDivisions([]));
  }, [activeId]);

  useEffect(() => {
    if (!activeId) {
      setBoardRepos([]);
      setBoardReposError("");
      setBoardReposLoading(false);
      return;
    }
    let mounted = true;
    setBoardReposLoading(true);
    setBoardReposError("");

    apiGet<{ configured?: boolean; repositories?: any[] }>(`/research/${activeId}/repositories`)
      .then((res) => {
        if (!mounted) return;
        const raw = Array.isArray(res?.repositories)
          ? res.repositories
          : Array.isArray(res)
            ? res
            : [];
        setBoardRepos(raw.map(normalizeGitHubRepository));
      })
      .catch(() => {
        if (!mounted) return;
        setBoardReposError("Gagal memuat repository project.");
      })
      .finally(() => {
        if (mounted) {
          setBoardReposLoading(false);
        }
      });

    return () => {
      mounted = false;
    };
  }, [activeId]);

  useEffect(() => {
    const loadProjects = async () => {
      setLoading(true);
      setLoadError("");
      try {
        const projectRows = await apiGet<Array<any>>(
          currentUser?.id && currentUser?.role !== "operator"
            ? `/research/assigned?userId=${encodeURIComponent(currentUser.id)}`
            : "/research"
        );
        const filteredRows = strictProjectFilter
          ? (projectRows || []).filter((row) => projectIds.includes(row.id))
          : projectIds.length
            ? (projectRows || []).filter((row) => projectIds.includes(row.id))
            : (projectRows || []);

        const detailRows = await Promise.all(
          filteredRows.map(async (row) => {
            const [members, milestones] = await Promise.all([
              apiGet<Array<any>>(`/research/${row.id}/members`).catch(() => []),
              apiGet<Array<any>>(`/research/${row.id}/milestones`).catch(() => [])
            ]);
            return { row, members, milestones };
          })
        );

        const nextTeamMembersMap: Record<string, TeamMember[]> = {};
        const nextMilestonesMap: Record<string, Milestone[]> = {};

        const mappedProjects: ProjectView[] = detailRows.map(({ row, members, milestones }) => {
          const teamMembers: TeamMember[] = (members || []).map(mapTeamMember);

          nextTeamMembersMap[row.id] = teamMembers;
          nextMilestonesMap[row.id] = (milestones || []).map((item: any) => ({
            id: item.id,
            label: item.label,
            done: Boolean(item.done),
            sortOrder: item.sort_order
          }));

          const ketuaByPeran = teamMembers.find((member) => /ketua/i.test(member.role || ""));
          const ketuaByInitial = teamMembers.find((member) => member.initials === row.supervisor_initials);

          return {
            id: row.id,
            shortTitle: row.short_title || row.title || "Riset",
            period: row.period_text || "-",
            mitra: row.mitra || "-",
            progress: Number(row.progress) || 0,
            progressColor: "bg-[#6C47FF]",
            status: row.status || "Aktif",
            ketuaInitials: ketuaByInitial?.initials || ketuaByPeran?.initials || teamMembers[0]?.initials || "TM",
            researchType: getResearchField(row, "researchType", "research_type"),
            agreementType: getResearchField(row, "agreementType", "agreement_type"),
            agreementStartDate: getResearchField(row, "agreementStartDate", "agreement_start_date"),
            agreementEndDate: getResearchField(row, "agreementEndDate", "agreement_end_date"),
            agreementFileUrl: getResearchField(row, "agreementFileUrl", "agreement_file_url"),
            proposalFileUrl: getResearchField(row, "proposalFileUrl", "proposal_file_url"),
            rabFileUrl: getResearchField(row, "rabFileUrl", "rab_file_url"),
            attachment_link: row.attachment_link || row.attachmentLink || undefined
          };
        });

        setAvailableProjects(mappedProjects);
        setTeamMembersMap(nextTeamMembersMap);
        setMilestonesMap(nextMilestonesMap);
        setActiveId((prev) => {
          if (mappedProjects.some((project) => project.id === prev)) return prev;
          return mappedProjects[0]?.id || "";
        });
      } catch (error: any) {
        setLoadError(error?.message || "Gagal memuat data board.");
      } finally {
        setLoading(false);
      }
    };

    loadProjects();
  }, [currentUser?.id, currentUser?.role, projectIdsKey, strictProjectFilter]);

  useEffect(() => {
    const loadBoard = async () => {
      if (!activeId) return;
      try {
        const data = await apiGet<any>(`/research/${activeId}/board`);
        const allTasks = Array.isArray(data?.tasks)
          ? data.tasks
          : [
              ...(data?.columns?.todo || []),
              ...(data?.columns?.doing || []),
              ...(data?.columns?.review || []),
              ...(data?.columns?.done || [])
            ];

        const nextAttachmentMap: Record<string, TaskAttachment[]> = {};
        allTasks.forEach((task: any) => {
          const attachments = getTaskAttachmentsFromDetail(task);
          if (attachments.length > 0) {
            nextAttachmentMap[String(task.id)] = attachments;
          }
        });

        setTaskAttachmentsMap((prev) => ({ ...prev, ...nextAttachmentMap }));
        setPermissionsMap((prev) => ({
          ...prev,
          [activeId]: normalizeBoardPermissions(data?.permissions, currentUser?.role)
        }));

        setTasksMap((prev) => ({
          ...prev,
          [activeId]: {
            todo: (data?.columns?.todo || []).map(mapBoardTask),
            doing: (data?.columns?.doing || []).map(mapBoardTask),
            review: (data?.columns?.review || []).map(mapBoardTask),
            done: (data?.columns?.done || []).map(mapBoardTask)
          }
        }));
      } catch {
        setTasksMap((prev) => ({ ...prev, [activeId]: EMPTY_BOARD_COLUMNS }));
      }
    };

    loadBoard();
  }, [activeId, currentUser?.role, teamMembersMap]);

  // Modal state
  const [selectedTask, setSelectedTask] = useState<any | null>(null);
  const [activeTab, setActiveTab] = useState<"detail" | "komentar" | "development">("detail");
  const [taskRepoLinks, setTaskRepoLinks] = useState<TaskRepositoryLink[]>([]);
  const [taskActivities, setTaskActivities] = useState<GitHubActivity[]>([]);
  const [projectRepos, setProjectRepos] = useState<GitHubRepository[]>([]);
  const [taskDevLoading, setTaskDevLoading] = useState<boolean>(false);
  const [taskDevError, setTaskDevError] = useState<string>("");
  const [showLinkRepoModal, setShowLinkRepoModal] = useState<boolean>(false);
  const [linkingRepoId, setLinkingRepoId] = useState<string>("");
  const [linkingBranchName, setLinkingBranchName] = useState<string>("");
  const [savingTaskLink, setSavingTaskLink] = useState<boolean>(false);
  const [unlinkingRepoConfirm, setUnlinkingRepoConfirm] = useState<TaskRepositoryLink | null>(null);
  const [confirmTaskSuggestion, setConfirmTaskSuggestion] = useState<{ activity: GitHubActivity; targetStatus: string } | null>(null);
  const [applyingTaskStatus, setApplyingTaskStatus] = useState<boolean>(false);
  const [copiedTaskKey, setCopiedTaskKey] = useState<boolean>(false);
  const [copiedBranchTemplate, setCopiedBranchTemplate] = useState<boolean>(false);
  const [isAddTaskOpen, setIsAddTaskOpen] = useState(false);
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [isEditBoardOpen, setIsEditBoardOpen] = useState(false);
  const [showDeleteWarning, setShowDeleteWarning] = useState(false);
  const [isMilestoneOpen, setIsMilestoneOpen] = useState(false);
  const [subtasks, setSubtasks] = useState([""]);
  const [taskForm, setTaskForm] = useState({
    title: "",
    status: "TO DO" as BoardTask["status"],
    priority: "Tinggi",
    deadline: "",
    assigneeId: "",
    description: "",
    divisionId: "" as string | null
  });
  const [boardForm, setBoardForm] = useState({
    title: "",
    mitra: "",
    period: ""
  });
  const [newMilestoneLabel, setNewMilestoneLabel] = useState("");
  const [editingMsIndex, setEditingMsIndex] = useState<number | null>(null);
  const [editingMsLabel, setEditingMsLabel] = useState("");
  const [taskComments, setTaskComments] = useState<TaskComment[]>([]);
  const [taskCommentsLoading, setTaskCommentsLoading] = useState(false);
  const [newCommentText, setNewCommentText] = useState("");
  const [taskSubtasks, setTaskSubtasks] = useState<TaskSubtask[]>([]);
  const [newTaskSubtask, setNewTaskSubtask] = useState("");
  const [taskAttachmentsMap, setTaskAttachmentsMap] = useState<Record<string, TaskAttachment[]>>({});
  const [taskAttachments, setTaskAttachments] = useState<TaskAttachment[]>([]);
  const [taskFetchMessage, setTaskFetchMessage] = useState("");
  const [taskCommentMessage, setTaskCommentMessage] = useState("");
  const [taskAttachmentMessage, setTaskAttachmentMessage] = useState("");
  const [taskChecklistMessage, setTaskChecklistMessage] = useState("");
  const [pendingChecklistSubtaskId, setPendingChecklistSubtaskId] = useState<string | null>(null);
  const [selectedCommentSubtaskId, setSelectedCommentSubtaskId] = useState<string>("__task__");
  const [draggedTask, setDraggedTask] = useState<{ taskId: string; fromColumn: BoardColumnId } | null>(null);
  const [dragOverColumn, setDragOverColumn] = useState<BoardColumnId | null>(null);
  const [movingTaskId, setMovingTaskId] = useState<string | null>(null);
  const checklistAttachmentInputRef = React.useRef<HTMLInputElement | null>(null);

  // Attachment link state
  const [attachmentLink, setAttachmentLink] = useState("");
  const [isEditingAttachment, setIsEditingAttachment] = useState(false);
  const [savingAttachment, setSavingAttachment] = useState(false);

  // Add member modal state
  const [isAddMemberOpen, setIsAddMemberOpen] = useState(false);
  const [availableCandidates, setAvailableCandidates] = useState<Array<{ user_id: string; name: string; initials: string; member_type: string }>>([]);
  const [selectedCandidateId, setSelectedCandidateId] = useState<string | null>(null);
  const [newMemberPeran, setNewMemberPeran] = useState("Anggota");
  const [loadingCandidates, setLoadingCandidates] = useState(false);
  const [memberSearch, setMemberSearch] = useState("");

  // Computed values (AFTER all hooks)
  const project = availableProjects.find((row) => row.id === activeId) ?? availableProjects[0];
  const milestones = milestonesMap[activeId] ?? [];
  const tasks = tasksMap[activeId] ?? EMPTY_BOARD_COLUMNS;
  const allCurrentTasks = [
    ...(tasks.todo || []),
    ...(tasks.doing || []),
    ...(tasks.review || []),
    ...(tasks.done || [])
  ];
  const effectiveActiveSprintId = boardSprintScope === "all" ? null : (activeSprint?.id || null);
  const scopedTasks = effectiveActiveSprintId
    ? allCurrentTasks.filter((t) => t.sprintId === effectiveActiveSprintId)
    : allCurrentTasks;
  const unassignedActiveTasks = allCurrentTasks.filter(
    (t) => (!t.sprintId || (activeSprint?.id && t.sprintId !== activeSprint.id)) && (t.status === "DOING" || t.status === "REVIEW")
  );
  const divisionTabs = getDivisionTabs(scopedTasks, divisions);
  const boardPermissions = permissionsMap[activeId] || getDefaultBoardPermissions(currentUser?.role);
  const canManageCards = boardPermissions.canManageCards;
  const canFillExistingCards = canManageCards || boardPermissions.canFillExistingCards;

  // Initialize attachment link when project changes
  React.useEffect(() => {
    if (project?.attachment_link) {
      setAttachmentLink(project.attachment_link);
    }
  }, [project?.id]);

  const loadTaskDevelopmentData = React.useCallback(async (taskId: string) => {
    if (!activeId || !taskId) return;
    try {
      setTaskDevLoading(true);
      setTaskDevError("");
      const [linksRes, actsRes, reposRes] = await Promise.all([
        apiGet<any[]>(`/research/${activeId}/board/tasks/${taskId}/repositories`).catch(() => []),
        apiGet<any[]>(`/research/${activeId}/board/tasks/${taskId}/github-activity`).catch(() => []),
        projectRepos.length === 0
          ? apiGet<{ repositories?: any[] }>(`/research/${activeId}/repositories`).catch(() => ({ repositories: [] }))
          : Promise.resolve({ repositories: projectRepos })
      ]);

      setTaskRepoLinks((linksRes || []).map(normalizeTaskRepositoryLink));
      setTaskActivities((actsRes || []).map(normalizeGitHubActivity));
      if (reposRes?.repositories) {
        setProjectRepos((reposRes.repositories || []).map(normalizeGitHubRepository));
      }
    } catch {
      setTaskDevError("Aktivitas GitHub tidak dapat dimuat saat ini.");
    } finally {
      setTaskDevLoading(false);
    }
  }, [activeId, projectRepos]);

  useEffect(() => {
    if (selectedTask?.id && activeTab === "development") {
      void loadTaskDevelopmentData(selectedTask.id);
    }
  }, [selectedTask?.id, activeTab, loadTaskDevelopmentData]);

  const toggleMilestone = async (i: number) => {
    if (!canManageCards) {
      setLoadError("Anda tidak memiliki izin mengubah milestone board ini.");
      return;
    }
    const current = milestones[i];
    if (!current) return;
    if (current.id) {
      await apiPatch(`/research/${activeId}/milestones/${current.id}`, { done: !current.done });
    }
    setMilestonesMap((prev) => ({
      ...prev,
      [activeId]: (prev[activeId] || []).map((item, index) =>
        index === i ? { ...item, done: !item.done } : item
      )
    }));
  };

  if (loading) {
    return (
      <div className="-m-8 flex min-h-[calc(100vh-60px)] items-center justify-center bg-slate-50/30 p-8">
        <div className="w-full max-w-xl rounded-2xl border border-border bg-white p-8 text-center shadow-sm text-sm text-muted-foreground">
          Memuat progress board...
        </div>
      </div>
    );
  }

  if (!project) {
    return (
      <div className="-m-8 flex min-h-[calc(100vh-60px)] items-center justify-center bg-slate-50/30 p-8">
        <div className="w-full max-w-xl rounded-2xl border border-border bg-white p-8 text-center shadow-sm">
          <p className="text-[11px] font-black uppercase tracking-wider text-muted-foreground">Progress Board</p>
          <h2 className="mt-2 text-xl font-black text-foreground">Belum ada proyek riset</h2>
          <p className="mt-2 text-sm font-medium text-muted-foreground">
            {loadError || "Data board akan muncul setelah admin menambahkan data riset di menu database riset."}
          </p>
        </div>
      </div>
    );
  }

  const teamMembers = teamMembersMap[activeId] || [];
  const ketuaMember = teamMembers.find((m) => m.role.toLowerCase().includes("ketua"));
  const activeMsLabel = getActiveMilestoneLabel(milestones);
  const milestoneProgress = getMilestoneProgress(milestones);
  const normalizedMemberSearch = memberSearch.trim().toLowerCase();
  const filteredAvailableCandidates = availableCandidates.filter((candidate) =>
    !normalizedMemberSearch ||
    candidate.name.toLowerCase().includes(normalizedMemberSearch) ||
    candidate.initials.toLowerCase().includes(normalizedMemberSearch) ||
    candidate.member_type.toLowerCase().includes(normalizedMemberSearch)
  );

  const getAssigneeColor = (initials: string) =>
    teamMembers.find((m) => m.initials === initials)?.color ?? "bg-slate-300 text-white";
  const getMemberName = (initials: string) =>
    teamMembers.find((m) => m.initials === initials)?.name ?? initials;

  const patchTaskIntoColumns = (task: any) => {
    const mappedTask = mapBoardTask(task);
    setTasksMap((prev) => {
      const columnsState = prev[activeId] || EMPTY_BOARD_COLUMNS;
      const sanitized = {
        todo: (columnsState.todo || []).filter((item) => item.id !== mappedTask.id),
        doing: (columnsState.doing || []).filter((item) => item.id !== mappedTask.id),
        review: (columnsState.review || []).filter((item) => item.id !== mappedTask.id),
        done: (columnsState.done || []).filter((item) => item.id !== mappedTask.id)
      };
      const columnKey = getBoardColumnKey(mappedTask.status);
      sanitized[columnKey] = [...sanitized[columnKey], mappedTask].sort((left, right) => {
        const leftOrder = Number(left.sortOrder ?? 0);
        const rightOrder = Number(right.sortOrder ?? 0);
        if (leftOrder !== rightOrder) return leftOrder - rightOrder;
        return left.title.localeCompare(right.title);
      });
      return { ...prev, [activeId]: sanitized };
    });

    const attachments = getTaskAttachmentsFromDetail(task);
    setTaskAttachmentsMap((prev) => ({ ...prev, [String(task.id)]: attachments }));

    return mappedTask;
  };

  const hydrateTaskDetailState = (task: any) => {
    const mappedTask = patchTaskIntoColumns(task);
    const comments = Array.isArray(task?.comments)
      ? task.comments.map(normalizeTaskComment)
      : [];
    const subtasks = Array.isArray(task?.subtasks)
      ? task.subtasks.map(normalizeTaskSubtask)
      : [];
    const attachments = getTaskAttachmentsFromDetail(task);

    setSelectedTask({
      ...mappedTask,
      createdByName: task?.createdByName || task?.created_by_name || mappedTask.createdByName,
      createdByInitials: getInitialsFromName(task?.createdByName || task?.created_by_name || mappedTask.createdByName),
      createdByRole: task?.createdByRole || mappedTask.createdByRole
    });
    setTaskComments(comments);
    setTaskSubtasks(subtasks);
    setTaskAttachments(attachments);
    setSelectedCommentSubtaskId(subtasks[0]?.id || "__task__");
  };

  const handleLinkRepository = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedTask?.id || !linkingRepoId) return;
    try {
      setSavingTaskLink(true);
      setTaskDevError("");
      await apiPost(`/research/${activeId}/board/tasks/${selectedTask.id}/repositories`, {
        repositoryId: linkingRepoId,
        branchName: linkingBranchName.trim() || null
      });
      setShowLinkRepoModal(false);
      setLinkingRepoId("");
      setLinkingBranchName("");
      await loadTaskDevelopmentData(selectedTask.id);
    } catch (err: any) {
      setTaskDevError(formatGitHubError(err));
    } finally {
      setSavingTaskLink(false);
    }
  };

  const handleUnlinkRepository = async () => {
    if (!selectedTask?.id || !unlinkingRepoConfirm) return;
    try {
      setTaskDevLoading(true);
      setTaskDevError("");
      await apiDelete(`/research/${activeId}/board/tasks/${selectedTask.id}/repositories/${unlinkingRepoConfirm.repositoryId}`);
      setUnlinkingRepoConfirm(null);
      await loadTaskDevelopmentData(selectedTask.id);
    } catch (err: any) {
      setTaskDevError(formatGitHubError(err));
    } finally {
      setTaskDevLoading(false);
    }
  };

  const handleApplyTaskSuggestion = async () => {
    if (!selectedTask?.id || !confirmTaskSuggestion) return;
    try {
      setApplyingTaskStatus(true);
      setTaskDevError("");
      const targetStatus = confirmTaskSuggestion.targetStatus;
      const targetColumn = (targetStatus === "TO DO" ? "todo" : targetStatus.toLowerCase()) as BoardColumnId;
      await moveTaskToColumn(selectedTask as BoardTask, targetColumn, { refreshSelected: true });
      setConfirmTaskSuggestion(null);
      await loadTaskDevelopmentData(selectedTask.id);
    } catch (err: any) {
      setTaskDevError(err?.message || "Gagal menerapkan status task.");
    } finally {
      setApplyingTaskStatus(false);
    }
  };

  const openAddTaskModal = () => {
    if (!canManageCards) {
      setTaskFetchMessage("Anda tidak memiliki izin menambah kartu pada board ini.");
      return;
    }
    const defaultDivision =
      selectedDivisionId && selectedDivisionId !== "all" && selectedDivisionId !== "unassigned"
        ? selectedDivisionId
        : "";
    setTaskForm({
      title: "",
      status: "TO DO",
      priority: "Tinggi",
      deadline: "",
      assigneeId: teamMembers[0]?.id || "",
      description: "",
      divisionId: defaultDivision
    });
    setSubtasks([""]);
    setIsAddTaskOpen(true);
  };

  const openEditTaskModal = () => {
    if (!selectedTask) return;
    if (!canManageCards) {
      setTaskFetchMessage("Anda tidak memiliki izin mengedit kartu pada board ini.");
      return;
    }
    setTaskForm({
      title: selectedTask.title || "",
      status: selectedTask.status || "TO DO",
      priority: selectedTask.priority || "Tinggi",
      deadline: toDateInputValue(selectedTask.deadline),
      assigneeId: selectedTask.assigneeUserIds?.[0] || "",
      description: selectedTask.description || selectedTask.statusText || "",
      divisionId: selectedTask.divisionId ?? ""
    });
    setSubtasks(taskSubtasks.length > 0 ? taskSubtasks.map((item) => item.title) : [""]);
    setIsEditModalOpen(true);
  };

  const openEditBoardModal = () => {
    if (!canManageCards) {
      setLoadError("Anda tidak memiliki izin mengubah detail board ini.");
      return;
    }
    setBoardForm({
      title: project.shortTitle || "",
      mitra: project.mitra || "",
      period: project.period || ""
    });
    setIsEditBoardOpen(true);
  };

  const closeTaskEditor = () => {
    setIsAddTaskOpen(false);
    setIsEditModalOpen(false);
  };

  const syncModalSubtasks = async (taskId: string) => {
    const cleaned = subtasks.map((item) => item.trim()).filter(Boolean);

    if (!isEditModalOpen) {
      for (const title of cleaned) {
        await apiPost(`/research/${activeId}/board/tasks/${taskId}/subtasks`, { title });
      }
      return;
    }

    const existing = taskSubtasks;
    const maxLength = Math.max(existing.length, cleaned.length);
    for (let index = 0; index < maxLength; index += 1) {
      const existingSubtask = existing[index];
      const nextTitle = cleaned[index];

      if (existingSubtask && nextTitle) {
        if (existingSubtask.title !== nextTitle) {
          await apiPatch(`/research/${activeId}/board/tasks/${taskId}/subtasks/${existingSubtask.id}`, {
            title: nextTitle
          });
        }
        continue;
      }

      if (!existingSubtask && nextTitle) {
        await apiPost(`/research/${activeId}/board/tasks/${taskId}/subtasks`, { title: nextTitle });
        continue;
      }

      if (existingSubtask && !nextTitle) {
        await apiDelete(`/research/${activeId}/board/tasks/${taskId}/subtasks/${existingSubtask.id}`);
      }
    }
  };

  const handleSaveTask = async () => {
    if (!canManageCards) {
      setTaskFetchMessage("Anda tidak memiliki izin menyimpan perubahan kartu pada board ini.");
      return;
    }
    const title = taskForm.title.trim();
    if (!title) {
      setTaskFetchMessage("Judul tugas wajib diisi.");
      return;
    }

    const activeDivisions = divisions.filter((d) => d.isActive !== false);
    if (!isEditModalOpen && activeDivisions.length > 0 && !taskForm.divisionId) {
      setTaskFetchMessage("Divisi wajib dipilih untuk proyek ini.");
      return;
    }

    const payload: any = {
      title,
      description: taskForm.description.trim() || null,
      status: taskForm.status,
      deadline: taskForm.deadline || null,
      priority: taskForm.priority,
      tag: selectedTask?.tag || "Riset",
      assignee_ids: taskForm.assigneeId ? [taskForm.assigneeId] : [],
      divisionId: taskForm.divisionId || null,
      division_id: taskForm.divisionId || null
    };

    if (!isEditModalOpen && activeSprint?.id) {
      payload.sprintId = activeSprint.id;
      payload.sprint_id = activeSprint.id;
    } else if (isEditModalOpen && selectedTask?.sprintId !== undefined) {
      payload.sprintId = selectedTask.sprintId;
      payload.sprint_id = selectedTask.sprintId;
    }

    try {
      setTaskFetchMessage("");
      const response = isEditModalOpen && selectedTask?.id
        ? await apiPatch<{ task?: any }>(`/research/${activeId}/board/tasks/${selectedTask.id}`, payload)
        : await apiPost<{ task?: any }>(`/research/${activeId}/board/tasks`, payload);

      const savedTask = response?.task || response;
      const savedTaskId = String(savedTask?.id || selectedTask?.id || "");
      if (!savedTaskId) {
        closeTaskEditor();
        return;
      }

      await syncModalSubtasks(savedTaskId);
      await refreshBoardData(selectedTask?.id === savedTaskId ? savedTaskId : null);

      closeTaskEditor();
    } catch (error: any) {
      setTaskFetchMessage(error?.message || "Gagal menyimpan task.");
    }
  };

  const findTaskById = (columnsState: BoardColumns, taskId: string) => {
    const allTasks = [
      ...(columnsState.todo || []),
      ...(columnsState.doing || []),
      ...(columnsState.review || []),
      ...(columnsState.done || [])
    ];
    return allTasks.find((item) => item.id === taskId) || null;
  };

  const moveTaskLocally = (task: BoardTask, nextColumn: BoardColumnId) => {
    const nextStatus = getBoardStatusFromColumnKey(nextColumn);
    const movedTask = { ...task, status: nextStatus };

    setTasksMap((prev) => {
      const columnsState = prev[activeId] || EMPTY_BOARD_COLUMNS;
      const sanitized: BoardColumns = {
        todo: (columnsState.todo || []).filter((item) => item.id !== movedTask.id),
        doing: (columnsState.doing || []).filter((item) => item.id !== movedTask.id),
        review: (columnsState.review || []).filter((item) => item.id !== movedTask.id),
        done: (columnsState.done || []).filter((item) => item.id !== movedTask.id)
      };
      sanitized[nextColumn] = [...sanitized[nextColumn], movedTask];
      return { ...prev, [activeId]: sanitized };
    });

    setSelectedTask((prev: any) => prev?.id === movedTask.id ? { ...prev, status: nextStatus } : prev);
  };

  const moveTaskToColumn = async (task: BoardTask, nextColumn: BoardColumnId, options?: { refreshSelected?: boolean }) => {
    if (!task?.id) return;
    if (!canFillExistingCards) {
      setTaskFetchMessage("Anda tidak memiliki izin memindahkan status kartu pada board ini.");
      return;
    }

    const currentColumn = getBoardColumnKey(task.status);
    if (currentColumn === nextColumn) return;

    const nextStatus = getBoardStatusFromColumnKey(nextColumn);

    try {
      setTaskFetchMessage("");
      setMovingTaskId(task.id);
      moveTaskLocally(task, nextColumn);
      await apiPatch<{ task?: any }>(
        `/research/${activeId}/board/tasks/${task.id}/status`,
        { status: nextStatus }
      );
      await refreshBoardData(options?.refreshSelected ? task.id : null);
    } catch (error: any) {
      setTaskFetchMessage(error?.message || "Gagal memindahkan status task.");
      await refreshBoardData(options?.refreshSelected ? task.id : null).catch(() => null);
    } finally {
      setMovingTaskId(null);
      setDraggedTask(null);
      setDragOverColumn(null);
    }
  };

  const handleMoveTaskStatus = async (value: string) => {
    if (!selectedTask?.id || !value) return;
    await moveTaskToColumn(selectedTask as BoardTask, value as BoardColumnId, { refreshSelected: true });
  };

  const handleTaskDragStart = (event: React.DragEvent<HTMLDivElement>, task: BoardTask, fromColumn: BoardColumnId) => {
    if (!canFillExistingCards || movingTaskId) {
      event.preventDefault();
      return;
    }

    event.dataTransfer.effectAllowed = "move";
    event.dataTransfer.setData("application/x-stas-task", JSON.stringify({ taskId: task.id, fromColumn }));
    event.dataTransfer.setData("text/plain", task.id);
    setDraggedTask({ taskId: task.id, fromColumn });
  };

  const handleTaskDragEnd = () => {
    setDraggedTask(null);
    setDragOverColumn(null);
  };

  const handleColumnDragOver = (event: React.DragEvent<HTMLDivElement>, columnId: BoardColumnId) => {
    if (!canFillExistingCards || !draggedTask || movingTaskId) return;
    event.preventDefault();
    event.dataTransfer.dropEffect = "move";
    setDragOverColumn(columnId);
  };

  const handleColumnDrop = async (event: React.DragEvent<HTMLDivElement>, columnId: BoardColumnId) => {
    if (!canFillExistingCards || movingTaskId) return;
    event.preventDefault();

    const rawPayload = event.dataTransfer.getData("application/x-stas-task");
    const fallbackTaskId = event.dataTransfer.getData("text/plain");
    let taskId = fallbackTaskId;

    try {
      const parsed = rawPayload ? JSON.parse(rawPayload) : null;
      taskId = parsed?.taskId || fallbackTaskId;
    } catch {
      taskId = fallbackTaskId;
    }

    const columnsState = tasksMap[activeId] || EMPTY_BOARD_COLUMNS;
    const task = findTaskById(columnsState, String(taskId || ""));

    if (!task) {
      setDraggedTask(null);
      setDragOverColumn(null);
      return;
    }

    await moveTaskToColumn(task, columnId);
  };

  const handleSaveBoardHeader = async () => {
    if (!canManageCards) {
      setLoadError("Anda tidak memiliki izin menyimpan detail board ini.");
      return;
    }
    try {
      const response = await apiPatch<{ project?: any }>(`/research/${activeId}/board/header`, {
        title: boardForm.title.trim() || project.shortTitle,
        shortTitle: boardForm.title.trim() || project.shortTitle,
        periodText: boardForm.period.trim() || project.period,
        mitra: boardForm.mitra.trim() || project.mitra
      });

      const updatedProject = response?.project;
      if (updatedProject) {
        setAvailableProjects((prev) => prev.map((item) =>
          item.id === activeId
            ? {
                ...item,
                shortTitle: updatedProject.short_title || updatedProject.shortTitle || updatedProject.title || item.shortTitle,
                period: updatedProject.period_text || updatedProject.periodText || item.period,
                mitra: updatedProject.mitra || item.mitra,
                status: updatedProject.status || item.status,
                progress: Number(updatedProject.progress ?? item.progress) || 0
              }
            : item
        ));
      }

      await refreshBoardData(selectedTask?.id || null);
      setIsEditBoardOpen(false);
    } catch (error: any) {
      setLoadError(error?.message || "Gagal menyimpan detail proyek.");
    }
  };

  // ─── Add Member Functions ───────────────────────────────────────────────────

  const loadCandidates = async () => {
    setLoadingCandidates(true);
    try {
      const [studentsData, lecturersData] = await Promise.all([
        apiGet<Array<any>>("/students").catch(() => []),
        apiGet<Array<any>>("/lecturers").catch(() => [])
      ]);

      const currentMemberIds = new Set(teamMembers.map(m => m.id));

      const candidates = [
        ...(studentsData || []).map((s: any) => ({
          user_id: String(s.user_id || s.userId || s.id || ""),
          name: s.name,
          initials: s.initials,
          member_type: "Mahasiswa"
        })),
        ...(lecturersData || []).map((l: any) => ({
          user_id: String(l.user_id || l.userId || l.id || ""),
          name: l.name,
          initials: l.initials,
          member_type: "Dosen"
        }))
      ].filter((c: any) => c.user_id && !currentMemberIds.has(c.user_id));

      setAvailableCandidates(candidates);
      setSelectedCandidateId(null);
      setMemberSearch("");
      setNewMemberPeran("Anggota");
    } catch (err) {
      console.error("Failed to load candidates:", err);
    } finally {
      setLoadingCandidates(false);
    }
  };

  const openAddMemberModal = async () => {
    if (!canManageCards) {
      setLoadError("Anda tidak memiliki izin menambah anggota board ini.");
      return;
    }
    await loadCandidates();
    setIsAddMemberOpen(true);
  };

  const toggleCandidate = (userId: string) => {
    setSelectedCandidateId(prev => prev === userId ? null : userId);
  };

  const handleAddMembers = async () => {
    if (!selectedCandidateId) return;
    if (!canManageCards) {
      setLoadError("Anda tidak memiliki izin menambah anggota board ini.");
      return;
    }
    
    const candidate = availableCandidates.find(c => c.user_id === selectedCandidateId);
    const hasKetua = teamMembers.some(m => m.role.toLowerCase().includes("ketua"));
    const memberType = candidate?.member_type || "Mahasiswa";
    const peran = normalizeResearchRoleForMemberType(newMemberPeran, memberType);
    
    // Validate Ketua role
    if (peran === "Ketua") {
      if (hasKetua) {
        await confirm({
          title: "Ketua sudah ada",
          description: "Sudah ada Ketua di riset ini. Hanya boleh ada 1 Ketua.",
          confirmLabel: "Mengerti",
          variant: "warning",
          hideCancel: true
        });
        return;
      }
      if (candidate?.member_type !== "Dosen") {
        await confirm({
          title: "Ketua harus dosen",
          description: "Ketua tim wajib Dosen. Mahasiswa tidak bisa menjadi Ketua.",
          confirmLabel: "Mengerti",
          variant: "warning",
          hideCancel: true
        });
        return;
      }
    }
    
    try {
      await apiPost(`/research/${activeId}/members`, {
        userId: selectedCandidateId,
        memberType,
        peran,
        status: "Aktif"
      });

      // Reload members dari API
      const members = await apiGet<Array<any>>(`/research/${activeId}/members`);
      
      const updatedTeamMembers: TeamMember[] = (members || []).map(mapTeamMember);
      
      // Update map dan trigger re-render
      setTeamMembersMap(prev => {
        return { ...prev, [activeId]: updatedTeamMembers };
      });
      
      setIsAddMemberOpen(false);
      setSelectedCandidateId(null);
      setMemberSearch("");
      setNewMemberPeran("Anggota");
    } catch (err: any) {
      console.error("[Add Member] Error:", err);
      await confirm({
        title: "Gagal menambah anggota",
        description: err?.message || "Gagal menambah anggota.",
        confirmLabel: "Mengerti",
        variant: "danger",
        hideCancel: true
      });
    }
  };

  const handleUpdateMemberRole = async (member: TeamMember, peran: string) => {
    if (!canManageCards) {
      setLoadError("Anda tidak memiliki izin mengubah peran anggota board ini.");
      return;
    }

    const normalizedPeran = normalizeResearchRoleForMemberType(peran, member.memberType);
    try {
      await apiPatch(`/research/${activeId}/members/${member.id}`, {
        memberType: member.memberType,
        peran: normalizedPeran
      });

      const members = await apiGet<Array<any>>(`/research/${activeId}/members`);
      setTeamMembersMap(prev => ({ ...prev, [activeId]: (members || []).map(mapTeamMember) }));
      await refreshBoardData(selectedTask?.id || null);
    } catch (err: any) {
      await confirm({
        title: "Gagal mengubah peran",
        description: err?.message || "Gagal mengubah peran anggota.",
        confirmLabel: "Mengerti",
        variant: "danger",
        hideCancel: true
      });
    }
  };

  const handleRemoveMember = async (userId: string) => {
    if (!canManageCards) {
      setLoadError("Anda tidak memiliki izin menghapus anggota board ini.");
      return;
    }
    const member = teamMembers.find(m => m.id === userId);
    if (!member) return;

    const confirmed = await confirm({
      title: "Hapus anggota tim?",
      description: `${member.name} akan dihapus dari tim riset ini.`,
      confirmLabel: "Hapus",
      cancelLabel: "Batal",
      variant: "danger"
    });
    if (!confirmed) return;

    try {
      await apiDelete(`/research/${activeId}/members/${userId}`);

      // Reload members
      const members = await apiGet<Array<any>>(`/research/${activeId}/members`);
      const updatedTeamMembers: TeamMember[] = (members || []).map(mapTeamMember);
      setTeamMembersMap(prev => ({ ...prev, [activeId]: updatedTeamMembers }));
    } catch (err: any) {
      console.error("Failed to remove member:", err);
      await confirm({
        title: "Gagal menghapus anggota",
        description: err?.message || "Gagal menghapus anggota.",
        confirmLabel: "Mengerti",
        variant: "danger",
        hideCancel: true
      });
    }
  };

  const columns: Array<{ id: BoardColumnId; title: string; bg: string; iconColor: string; textColor: string; pillBg: string }> = [
    { id: "todo", title: "TO DO", bg: "bg-slate-50", iconColor: "bg-slate-300", textColor: "text-slate-600", pillBg: "bg-slate-200 text-slate-700" },
    { id: "doing", title: "DOING", bg: "bg-blue-50/50", iconColor: "bg-blue-400", textColor: "text-blue-600", pillBg: "bg-blue-100 text-blue-700" },
    { id: "review", title: "REVIEW", bg: "bg-amber-50/50", iconColor: "bg-amber-400", textColor: "text-amber-600", pillBg: "bg-amber-100 text-amber-700" },
    { id: "done", title: "DONE", bg: "bg-emerald-50/50", iconColor: "bg-emerald-400", textColor: "text-emerald-600", pillBg: "bg-emerald-100 text-emerald-700" },
  ];

  const syncSelectedTaskProgress = (subtasks: TaskSubtask[], taskIdOverride?: string) => {
    const taskId = taskIdOverride || selectedTask?.id;
    if (!taskId) return;
    const progress = subtasks.length
      ? Math.round((subtasks.filter((item) => item.done).length / subtasks.length) * 100)
      : 0;

    setSelectedTask((prev: any) => prev ? { ...prev, progress } : prev);
    setTasksMap((prev) => {
      const columnsState = prev[activeId] || EMPTY_BOARD_COLUMNS;
      const patch = (rows: BoardTask[]) => rows.map((row) => row.id === taskId ? { ...row, progress } : row);
      return {
        ...prev,
        [activeId]: {
          todo: patch(columnsState.todo || []),
          doing: patch(columnsState.doing || []),
          review: patch(columnsState.review || []),
          done: patch(columnsState.done || [])
        }
      };
    });
  };

  const refreshBoardData = async (taskIdToRefresh?: string | null) => {
    if (!activeId) return null;

    const data = await apiGet<any>(`/research/${activeId}/board`);
    setPermissionsMap((prev) => ({
      ...prev,
      [activeId]: normalizeBoardPermissions(data?.permissions, currentUser?.role)
    }));
    const allTasks = Array.isArray(data?.tasks)
      ? data.tasks
      : [
          ...(data?.columns?.todo || []),
          ...(data?.columns?.doing || []),
          ...(data?.columns?.review || []),
          ...(data?.columns?.done || [])
        ];

    const nextAttachmentMap: Record<string, TaskAttachment[]> = {};
    allTasks.forEach((task: any) => {
      const attachments = getTaskAttachmentsFromDetail(task);
      if (attachments.length > 0) {
        nextAttachmentMap[String(task.id)] = attachments;
      }
    });

    setTaskAttachmentsMap((prev) => ({ ...prev, ...nextAttachmentMap }));
    setTasksMap((prev) => ({
      ...prev,
      [activeId]: {
        todo: (data?.columns?.todo || []).map(mapBoardTask),
        doing: (data?.columns?.doing || []).map(mapBoardTask),
        review: (data?.columns?.review || []).map(mapBoardTask),
        done: (data?.columns?.done || []).map(mapBoardTask)
      }
    }));

    if (taskIdToRefresh) {
      const refreshedTask = await apiGet<any>(`/research/${activeId}/board/tasks/${taskIdToRefresh}`);
      hydrateTaskDetailState(refreshedTask);
      return refreshedTask;
    }

    return data;
  };

  const openTask = async (task: any) => {
    setSelectedTask(task);
    setActiveTab("detail");
    setShowDeleteWarning(false);
    setNewCommentText("");
    setTaskComments([]);
    setTaskSubtasks([]);
    setTaskAttachments(taskAttachmentsMap[String(task.id)] || []);
    setNewTaskSubtask("");
    setTaskFetchMessage("");
    setTaskCommentMessage("");
    setTaskAttachmentMessage("");
    setTaskChecklistMessage("");
    setPendingChecklistSubtaskId(null);
    setSelectedCommentSubtaskId("__task__");
    setTaskCommentsLoading(true);
    try {
      const detail = await apiGet<any>(`/research/${activeId}/board/tasks/${task.id}`);
      hydrateTaskDetailState(detail);
      if (!detail?.comments?.length && !detail?.subtasks?.length && !detail?.attachments?.length) {
        setTaskFetchMessage("Detail task berhasil dimuat, tetapi komentar, sub-tugas, dan lampiran masih kosong.");
      }
    } catch (error: any) {
      setTaskComments([]);
      setTaskSubtasks([]);
      setTaskAttachments([]);
      setTaskFetchMessage(error?.message || "Fetching data detail tugas gagal.");
    } finally {
      setTaskCommentsLoading(false);
    }
  };
  const closeTask = () => {
    setTaskAttachments([]);
    setSelectedTask(null);
    setShowDeleteWarning(false);
    setTaskFetchMessage("");
    setTaskCommentMessage("");
    setTaskAttachmentMessage("");
    setTaskChecklistMessage("");
    setPendingChecklistSubtaskId(null);
    setSelectedCommentSubtaskId("__task__");
  };
  const addSubtaskRow = () => setSubtasks([...subtasks, ""]);
  const removeSubtaskRow = (i: number) => setSubtasks(subtasks.filter((_, idx) => idx !== i));

  const deleteTask = () => {
    if (!selectedTask) return;
    if (!canManageCards) {
      setTaskFetchMessage("Anda tidak memiliki izin menghapus kartu pada board ini.");
      return;
    }
    void (async () => {
      try {
        await apiDelete(`/research/${activeId}/board/tasks/${selectedTask.id}`);
        await refreshBoardData();
        closeTask();
      } catch (error: any) {
        setTaskFetchMessage(error?.message || "Gagal menghapus task.");
      }
    })();
  };

  const addMilestone = async () => {
    if (!canManageCards) {
      setLoadError("Anda tidak memiliki izin menambah milestone board ini.");
      return;
    }
    if (!newMilestoneLabel.trim()) return;
    const response = await apiPost<{ id?: number }>(`/research/${activeId}/milestones`, {
      label: newMilestoneLabel.trim(),
      done: false,
      sortOrder: milestones.length
    });
    setMilestonesMap(prev => ({
      ...prev,
      [activeId]: [...(prev[activeId] || []), { id: response?.id, label: newMilestoneLabel.trim(), done: false }]
    }));
    setNewMilestoneLabel("");
  };

  const renameMilestone = async (index: number, label: string) => {
    if (!canManageCards) {
      setLoadError("Anda tidak memiliki izin mengubah milestone board ini.");
      return;
    }
    const current = milestones[index];
    if (!current || !label.trim()) return;
    if (current.id) {
      await apiPatch(`/research/${activeId}/milestones/${current.id}`, { label: label.trim() });
    }
    setMilestonesMap((prev) => ({
      ...prev,
      [activeId]: (prev[activeId] || []).map((item, idx) =>
        idx === index ? { ...item, label: label.trim() } : item
      )
    }));
  };

  const removeMilestone = async (index: number) => {
    if (!canManageCards) {
      setLoadError("Anda tidak memiliki izin menghapus milestone board ini.");
      return;
    }
    const current = milestones[index];
    if (!current) return;
    if (current.id) {
      await apiDelete(`/research/${activeId}/milestones/${current.id}`);
    }
    setMilestonesMap((prev) => ({
      ...prev,
      [activeId]: (prev[activeId] || []).filter((_, idx) => idx !== index)
    }));
  };

  // ─── Attachment Link Functions ──────────────────────────────────────────────

  const saveAttachmentLink = async () => {
    if (!canManageCards) {
      setLoadError("Anda tidak memiliki izin mengubah link lampiran board ini.");
      return;
    }
    setSavingAttachment(true);
    try {
      await apiPut(`/research/${activeId}`, { attachmentLink: attachmentLink.trim() || null });
      setIsEditingAttachment(false);
      // Update availableProjects state agar UI langsung ter-update
      setAvailableProjects(prev =>
        prev.map(p =>
          p.id === activeId
            ? { ...p, attachment_link: attachmentLink.trim() || undefined }
            : p
        )
      );
    } catch (err: any) {
      console.error("Failed to save attachment link:", err);
      await confirm({
        title: "Gagal menyimpan link",
        description: err?.message || "Gagal menyimpan link lampiran.",
        confirmLabel: "Mengerti",
        variant: "danger",
        hideCancel: true
      });
    } finally {
      setSavingAttachment(false);
    }
  };

  const sendTaskComment = async () => {
    if (!canFillExistingCards) {
      setTaskCommentMessage("Anda tidak memiliki izin mengisi kartu pada board ini.");
      return;
    }
    if (!selectedTask?.id || !currentUser?.id) {
      setTaskCommentMessage("Komentar tidak bisa dikirim karena data user atau tugas tidak tersedia.");
      return;
    }
    const text = newCommentText.trim();
    if (!text) {
      setTaskCommentMessage("Komentar kosong tidak bisa dikirim.");
      return;
    }

    const payload = {
      id: `LCM-${Date.now()}`,
      logbookId: selectedTask.id,
      authorId: currentUser.id,
      authorName: currentUser.name || null,
      text
    };

    try {
      const response = await apiPost<{ task?: any; comment?: any }>(
        `/research/${activeId}/board/tasks/${selectedTask.id}/comments`,
        {
          id: payload.id,
          authorId: payload.authorId,
          authorName: payload.authorName || undefined,
          text: payload.text
        }
      );

      await refreshBoardData(selectedTask.id);
      setNewCommentText("");
      setTaskCommentMessage("");
    } catch (error: any) {
      setTaskCommentMessage(error?.message || "Fetching komentar atau mengirim komentar gagal.");
    }
  };

  const addTaskSubtask = () => {
    if (!canManageCards) {
      setTaskChecklistMessage("Anda tidak memiliki izin menambah sub-tugas pada kartu ini.");
      return;
    }
    const title = newTaskSubtask.trim();
    if (!title) {
      setTaskChecklistMessage("Sub-tugas kosong tidak bisa ditambahkan.");
      return;
    }

    if (!selectedTask?.id) return;
    void (async () => {
      try {
        await apiPost<{ task?: any }>(
          `/research/${activeId}/board/tasks/${selectedTask.id}/subtasks`,
          { title }
        );
        await refreshBoardData(selectedTask.id);
        setNewTaskSubtask("");
        setTaskChecklistMessage("");
      } catch (error: any) {
        setTaskChecklistMessage(error?.message || "Gagal menambahkan sub-tugas.");
      }
    })();
  };

  const removeTaskSubtask = (subtaskId: string) => {
    if (!selectedTask?.id) return;
    if (!canManageCards) {
      setTaskChecklistMessage("Anda tidak memiliki izin menghapus sub-tugas pada kartu ini.");
      return;
    }
    void (async () => {
      try {
        await apiDelete<{ task?: any }>(
          `/research/${activeId}/board/tasks/${selectedTask.id}/subtasks/${subtaskId}`
        );
        await refreshBoardData(selectedTask.id);
        setTaskChecklistMessage("");
      } catch (error: any) {
        setTaskChecklistMessage(error?.message || "Gagal menghapus sub-tugas.");
      }
    })();
  };

  const toggleTaskSubtask = (subtaskId: string) => {
    if (!canFillExistingCards) {
      setTaskChecklistMessage("Anda tidak memiliki izin mengisi checklist pada kartu ini.");
      return;
    }
    const current = taskSubtasks.find((item) => item.id === subtaskId);
    if (!current) return;

    if (!current.done && currentUser?.role === "mahasiswa" && current.attachmentRequired && taskAttachments.length === 0) {
      setTaskChecklistMessage("Mahasiswa wajib menambahkan minimal 1 lampiran sebelum mencentang sub-tugas.");
      setTaskAttachmentMessage("Silakan pilih lampiran pendukung untuk sub-tugas ini.");
      setPendingChecklistSubtaskId(subtaskId);
      checklistAttachmentInputRef.current?.click();
      return;
    }

    void (async () => {
      try {
        await apiPatch<{ task?: any }>(
          `/research/${activeId}/board/tasks/${selectedTask.id}/subtasks/${subtaskId}`,
          { done: !current.done }
        );
        await refreshBoardData(selectedTask.id);
        setTaskChecklistMessage("");
        setPendingChecklistSubtaskId(null);
      } catch (error: any) {
        setTaskChecklistMessage(error?.message || "Gagal memperbarui sub-tugas.");
      }
    })();
  };

  const handleTaskAttachmentUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    if (!canFillExistingCards) {
      setTaskAttachmentMessage("Anda tidak memiliki izin menambahkan lampiran pada kartu ini.");
      event.target.value = "";
      return;
    }
    const files = Array.from(event.target.files || []);
    if (!files.length) {
      setTaskAttachmentMessage("Tidak ada file yang dipilih.");
      return;
    }

    const taskId = String(selectedTask?.id || "");
    if (!taskId) {
      setTaskAttachmentMessage("Lampiran tidak bisa ditambahkan karena tugas belum dipilih.");
      event.target.value = "";
      return;
    }

    void (async () => {
      try {
        for (const file of files) {
          const fileDataUrl = await fileToDataUrl(file);
          await apiPost<{ task?: any }>(
            `/research/${activeId}/board/tasks/${taskId}/attachments`,
            { fileName: file.name, fileDataUrl }
          );
        }

        await refreshBoardData(taskId);

        setTaskAttachmentMessage("Lampiran berhasil ditambahkan untuk tugas ini.");
        setTaskChecklistMessage("");
        if (pendingChecklistSubtaskId) {
          const subtaskId = pendingChecklistSubtaskId;
          setPendingChecklistSubtaskId(null);
          window.setTimeout(() => {
            toggleTaskSubtask(subtaskId);
          }, 0);
        }
      } catch (error: any) {
        setTaskAttachmentMessage(error?.message || "Gagal mengunggah lampiran tugas.");
      } finally {
        event.target.value = "";
      }
    })();
  };

  return (
    <>
      <div className="-m-8 flex flex-col min-w-0 min-h-[calc(100vh-60px)] bg-slate-50/30">
        <div className="p-8 flex flex-col min-w-0 gap-6 flex-1">

          {/* ── Topbar row ── */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              {backLabel && onBack ? (
                <button
                  onClick={onBack}
                  className={`flex items-center gap-2 px-3 py-2 bg-white border border-border rounded-xl text-sm font-bold text-slate-600 ${accentHover} hover:border-[#0AB600]/30 hover:bg-[#F0FFF0] transition-all shadow-sm`}
                >
                  <ChevronLeft size={16} strokeWidth={3} /> {backLabel}
                </button>
              ) : (
                /* Project tabs switcher */
                <div className="flex items-center gap-1 bg-white border border-border rounded-xl p-1 shadow-sm">
                  {availableProjects.map(r => (
                    <button key={r.id} onClick={() => setActiveId(r.id)}
                      className={`px-4 py-1.5 rounded-lg text-sm font-bold transition-all ${activeId === r.id ? `${accentBg} text-white shadow-sm` : "text-muted-foreground hover:text-foreground"}`}>
                      {r.shortTitle.split("–")[0].trim()}
                    </button>
                  ))}
                </div>
              )}
              <div className="w-px h-6 bg-border" />
              <div>
                <p className="text-[10px] font-black text-muted-foreground uppercase tracking-widest mb-0.5">Progress Board</p>
                <h1 className="text-xl font-black text-foreground">{project.shortTitle}</h1>
              </div>
            </div>
            <div className="flex items-center gap-3">
              {canManageCards ? (
                <>
                  <button
                    title="Edit Board Settings"
                    onClick={openEditBoardModal}
                    className={`flex items-center justify-center bg-white border border-border rounded-xl w-10 h-10 text-slate-500 ${accentHover} hover:bg-slate-50 hover:border-[#0AB600]/30 transition-all shadow-sm`}
                  >
                    <Edit2 size={16} strokeWidth={2.5} />
                  </button>
                  <div className="w-px h-6 bg-border mx-1" />
                  <button
                    onClick={openAddTaskModal}
                    className={`${accentBg} hover:opacity-90 text-white px-5 py-2.5 rounded-xl text-sm font-bold shadow-sm transition-all flex items-center gap-2`}
                  >
                    <Plus size={16} strokeWidth={3} /> Tambah Tugas
                  </button>
                </>
              ) : (
                <span className="rounded-full border border-slate-200 bg-white px-3 py-1.5 text-[11px] font-black text-slate-500 shadow-sm">
                  {canFillExistingCards ? "Akses isi kartu" : "Akses lihat"}
                </span>
              )}
            </div>
          </div>

          {/* 🚀🚀 Metadata Banner 🚀🚀 */}
          <div className="bg-[#F0FFF0] border border-[#D8F5D0] rounded-[16px] overflow-hidden">
            {/* Top row */}
            <div className="p-5 flex flex-col md:flex-row md:items-start justify-between gap-4 border-b border-[#D8F5D0]">
              <div className="flex flex-col gap-1 group">
                <div className="flex items-center gap-2">
                  <span>📌</span>
                  <h2 className={`text-lg font-bold ${accentText}`}>{project.shortTitle}</h2>
                  {canManageCards && (
                    <button
                      onClick={openEditBoardModal}
                      className="opacity-0 group-hover:opacity-100 p-1.5 bg-white/60 border border-[#D8F5D0] text-[#4AB834] hover:text-[#0AB600] hover:bg-white rounded-lg transition-all shadow-sm"
                    >
                      <Edit2 size={14} strokeWidth={2.5} />
                    </button>
                  )}
                </div>
                <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 mt-1.5">
                  {[
                    { label: "Ketua", value: ketuaMember?.name },
                    { label: "Periode", value: project.period },
                    { label: "Mitra", value: project.mitra.split(" Hibah")[0] },
                    { label: "Milestone", value: activeMsLabel },
                  ].map((item, i, arr) => (
                    <React.Fragment key={item.label}>
                      <div className="flex items-center gap-1.5">
                        <span className="text-[10px] font-black text-[#5CC444] uppercase tracking-wider">{item.label}</span>
                        <span className={`text-xs font-bold ${accentText}`}>{item.value}</span>
                      </div>
                      {i < arr.length - 1 && <div className="w-px h-3 bg-[#A8E895]" />}
                    </React.Fragment>
                  ))}
                </div>
              </div>
              <div className="flex flex-col gap-1.5 min-w-[180px] shrink-0">
                <div className="flex justify-between items-end">
                  <span className="text-xs font-bold text-[#4AB834]">Progress</span>
                  <span className={`text-sm font-black ${accentText}`}>{milestoneProgress}%</span>
                </div>
                <div className="w-full bg-[#D8F5D0] rounded-full h-2">
                  <div className={`${accentBg} h-2 rounded-full transition-all duration-500`} style={{ width: `${milestoneProgress}%` }} />
                </div>
                <span className="text-[10px] font-medium text-[#4AB834]">
                  {milestones.filter(m => m.done).length} dari {milestones.length} milestone selesai
                </span>
              </div>
            </div>

            {/* Milestone bar */}
            <div className="px-5 pt-4 pb-2 border-b border-[#D8F5D0]">
              <div className="flex items-center justify-between mb-3">
                <span className="text-[10px] font-black text-[#5CC444] uppercase tracking-wider">
                  Milestone Progress — {milestones.filter(m => m.done).length}/{milestones.length} Selesai
                </span>
                <button
                  onClick={() => setIsMilestoneOpen(true)}
                  className="flex items-center gap-1.5 px-2.5 py-1 bg-white border border-[#D8F5D0] hover:border-[#0AB600] hover:bg-[#F0FFF0] rounded-lg text-[10px] font-black text-[#4AB834] hover:text-[#0AB600] transition-all shadow-sm"
                >
                  <Edit2 size={10} strokeWidth={3} /> Kelola Milestone
                </button>
              </div>
              <MilestoneBanner
                milestones={milestones}
                progressColor={project.progressColor}
                onToggle={toggleMilestone}
                onManage={() => setIsMilestoneOpen(true)}
                editable={canManageCards}
              />
            </div>

            {/* Team members */}
            <div className="px-5 py-4">
              <span className="text-[10px] font-black text-[#5CC444] uppercase tracking-wider block mb-3">Anggota Tim</span>
              <ProjectMembersView members={teamMembers as any} />
            </div>

            {/* Research documents */}
            <div className="px-5 py-4 border-t border-[#D8F5D0]">
              <div className="mb-3 flex items-center justify-between gap-3">
                <span className="text-[10px] font-black text-[#5CC444] uppercase tracking-wider">Dokumen Riset</span>
                <span className="rounded-full border border-[#D8F5D0] bg-white px-2.5 py-1 text-[10px] font-black text-[#4AB834]">
                  {project.researchType || "Jenis riset -"}
                </span>
              </div>
              <div className="grid grid-cols-1 gap-3 lg:grid-cols-5">
                <div className="rounded-xl border border-[#D8F5D0] bg-white px-3 py-2 shadow-sm lg:col-span-2">
                  <span className="text-[10px] font-black uppercase tracking-wider text-[#5CC444]">Dokumen Kerja Sama</span>
                  <div className="mt-1 flex flex-wrap items-center gap-2">
                    <span className={`rounded-md px-2 py-0.5 text-[10px] font-black ${project.agreementType ? "bg-green-50 text-[#0AB600]" : "bg-slate-100 text-slate-400"}`}>
                      {project.agreementType || "Belum diisi"}
                    </span>
                    <span className="text-xs font-bold text-slate-700">
                      {formatBoardDateRange(project.agreementStartDate, project.agreementEndDate)}
                    </span>
                  </div>
                </div>
                <BoardDocumentLink label="File PKS/MoU/MoA" url={project.agreementFileUrl} />
                <BoardDocumentLink label="Proposal" url={project.proposalFileUrl} />
                <BoardDocumentLink label="RAB" url={project.rabFileUrl} />
              </div>
            </div>

            {/* Attachment Link */}
            <div className="px-5 py-4 border-t border-[#D8F5D0]">
              <div className="flex items-center justify-between mb-2">
                <span className="text-[10px] font-black text-[#5CC444] uppercase tracking-wider">Lampiran</span>
                <button
                  onClick={() => { setAttachmentLink(project.attachment_link || ""); setIsEditingAttachment(!isEditingAttachment); }}
                  className="flex items-center gap-1.5 px-2.5 py-1 bg-white border border-[#D8F5D0] hover:border-[#0AB600] hover:bg-[#F0FFF0] rounded-lg text-[10px] font-black text-[#4AB834] hover:text-[#0AB600] transition-all shadow-sm"
                >
                  <LinkIcon size={10} strokeWidth={3} /> {isEditingAttachment ? "Batal" : "Edit"}
                </button>
              </div>
              {isEditingAttachment ? (
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={attachmentLink}
                    onChange={e => setAttachmentLink(e.target.value)}
                    placeholder="https://drive.google.com/..."
                    className="flex-1 px-3 py-2 bg-white border border-[#D8F5D0] rounded-lg text-xs placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-[#0AB600]/20 focus:border-[#0AB600]"
                  />
                  <button
                    onClick={saveAttachmentLink}
                    disabled={savingAttachment}
                    className="px-3 py-2 bg-[#0AB600] hover:bg-[#099800] disabled:opacity-50 text-white rounded-lg text-xs font-black transition-colors"
                  >
                    {savingAttachment ? "..." : "Simpan"}
                  </button>
                </div>
              ) : project.attachment_link ? (
                <a
                  href={resolveApiAssetUrl(project.attachment_link) || project.attachment_link}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-2 px-3 py-2 bg-white border border-[#D8F5D0] rounded-lg text-xs text-[#0AB600] hover:bg-[#F0FFF0] transition-all break-all"
                >
                  <LinkIcon size={12} /> {project.attachment_link}
                </a>
              ) : (
                <p className="text-xs text-slate-400 italic">Belum ada lampiran</p>
              )}
            </div>
          </div>

          {/* ── Sprint Status Banner & My Tasks Filter ── */}
          {activeSprint ? (() => {
            const timing = getSprintTimingState(activeSprint);
            return (
            <div className="bg-white border border-purple-200 rounded-[16px] p-4 shadow-sm flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-purple-100 text-purple-700 flex items-center justify-center shrink-0">
                  <Kanban size={20} />
                </div>
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <h3 className="text-sm font-black text-foreground">{activeSprint.name}</h3>
                    <span className="px-2 py-0.5 rounded-full text-[10px] font-black bg-purple-100 text-purple-700 uppercase tracking-wider">
                      Sprint Aktif
                    </span>
                    <span className="text-xs font-black text-purple-700">⚡ {activeSprint.totalPoints} SP</span>
                    {timing.isOverdue && (
                      <span className="px-2.5 py-0.5 rounded-full text-[10px] font-black bg-rose-100 text-rose-700 border border-rose-200 animate-pulse">
                        Melewati Jadwal ({timing.overdueDays} Hari)
                      </span>
                    )}
                  </div>
                  {activeSprint.goal && <p className="text-xs text-muted-foreground mt-0.5">{activeSprint.goal}</p>}
                  {(activeSprint.startDate || activeSprint.endDate) && (
                    <div className="flex flex-wrap items-center gap-2 text-[11px] text-muted-foreground mt-1">
                      <span>Periode: {timing.periodLabel}</span>
                      <span className="text-slate-300">•</span>
                      <span className="font-semibold text-slate-700">Durasi: {timing.durationLabel}</span>
                    </div>
                  )}
                </div>
              </div>

              <div className="flex items-center gap-2 shrink-0">
                <button
                  onClick={() => setOnlyMyTasks(!onlyMyTasks)}
                  className={`px-3.5 py-1.5 rounded-xl text-xs font-bold transition-all border ${
                    onlyMyTasks
                      ? "bg-purple-600 text-white border-purple-600 shadow-sm"
                      : "bg-slate-50 hover:bg-slate-100 text-muted-foreground border-border"
                  }`}
                >
                  {onlyMyTasks ? "✓ Menampilkan Tugas Saya" : "Filter: Tugas Saya Saja"}
                </button>
                <button
                  onClick={() => setBoardSprintScope(boardSprintScope === "active_sprint" ? "all" : "active_sprint")}
                  className={`px-3.5 py-1.5 rounded-xl text-xs font-bold transition-all border flex items-center gap-1.5 ${
                    boardSprintScope === "all"
                      ? "bg-[#6C47FF] text-white border-[#6C47FF] shadow-sm"
                      : "bg-slate-50 hover:bg-slate-100 text-muted-foreground border-border"
                  }`}
                  title={
                    boardSprintScope === "all"
                      ? "Sedang menampilkan seluruh tugas proyek (termasuk backlog). Klik untuk batasi ke Sprint Aktif saja."
                      : "Klik untuk menampilkan semua tugas proyek termasuk backlog."
                  }
                >
                  {boardSprintScope === "all" ? "✓ Menampilkan Semua Tugas" : "Tampilkan: Semua Tugas (Termasuk Backlog)"}
                </button>
              </div>
            </div>
            );
          })() : reviewSprint ? (
            <div className="bg-amber-50 border border-amber-200 rounded-[16px] p-4 shadow-sm flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-amber-100 text-amber-700 flex items-center justify-center shrink-0">
                  <Kanban size={20} />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <h3 className="text-sm font-black text-foreground">Sprint {reviewSprint.name}</h3>
                    <span className="px-2 py-0.5 rounded-full text-[10px] font-black bg-amber-100 text-amber-800 uppercase tracking-wider">
                      Tahap Review
                    </span>
                  </div>
                  <p className="text-xs text-amber-900/80 mt-1">
                    Sprint {reviewSprint.name} sedang dalam tahap Review. Summary dan evaluasi Sprint perlu diselesaikan sebelum Sprint berikutnya dapat dimulai.
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-2 shrink-0">
                {(currentUser?.role === "operator" || currentUser?.role === "dosen") && (
                  <button
                    onClick={() => {
                      const path = currentUser?.role === "dosen"
                        ? `/dosen/scrum?projectId=${activeId}&sprintId=${reviewSprint.id}`
                        : `/operator/scrum?projectId=${activeId}&sprintId=${reviewSprint.id}`;
                      navigate(path);
                    }}
                    className="px-3.5 py-1.5 rounded-xl text-xs font-black bg-amber-600 hover:bg-amber-700 text-white shadow-sm flex items-center gap-1.5 transition-colors"
                    title="Buka Sprint Summary & Review"
                  >
                    <FileText size={13} />
                    <span>Buka Sprint Summary</span>
                  </button>
                )}
                <button
                  onClick={() => setOnlyMyTasks(!onlyMyTasks)}
                  className={`px-3.5 py-1.5 rounded-xl text-xs font-bold transition-all border ${
                    onlyMyTasks
                      ? "bg-purple-600 text-white border-purple-600 shadow-sm"
                      : "bg-white hover:bg-slate-50 text-muted-foreground border-border"
                  }`}
                >
                  {onlyMyTasks ? "✓ Menampilkan Tugas Saya" : "Filter: Tugas Saya Saja"}
                </button>
              </div>
            </div>
          ) : (
            <div className="bg-white border border-border rounded-[16px] p-3.5 shadow-sm flex items-center justify-between">
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <Kanban size={16} />
                <span>Belum ada Sprint aktif untuk proyek ini. Menampilkan semua tugas.</span>
              </div>
              <button
                onClick={() => setOnlyMyTasks(!onlyMyTasks)}
                className={`px-3.5 py-1.5 rounded-xl text-xs font-bold transition-all border ${
                  onlyMyTasks
                    ? "bg-purple-600 text-white border-purple-600 shadow-sm"
                    : "bg-slate-50 hover:bg-slate-100 text-muted-foreground border-border"
                }`}
              >
                {onlyMyTasks ? "✓ Menampilkan Tugas Saya" : "Filter: Tugas Saya Saja"}
              </button>
            </div>
          )}

          {/* ── Warning Banner for Active Tasks Outside Active Sprint ── */}
          {activeSprint && unassignedActiveTasks.length > 0 && boardSprintScope === "active_sprint" && (
            <div className="bg-amber-50/90 border border-amber-300 rounded-[16px] p-4 shadow-sm flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-amber-950">
              <div className="flex items-start sm:items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-amber-100 text-amber-700 flex items-center justify-center shrink-0 mt-0.5 sm:mt-0">
                  <AlertCircle size={20} />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <h4 className="text-xs font-black text-amber-900 uppercase tracking-wide">
                      Tugas Sedang Berjalan di Luar Sprint Aktif ({unassignedActiveTasks.length})
                    </h4>
                    <span className="px-2 py-0.5 rounded-full text-[10px] font-black bg-amber-200 text-amber-800">
                      Product Backlog
                    </span>
                  </div>
                  <p className="text-xs text-amber-800/90 mt-0.5">
                    Terdapat {unassignedActiveTasks.length} tugas yang sedang dikerjakan mahasiswa (status DOING/REVIEW), namun belum dimasukkan ke dalam <span className="font-semibold">{activeSprint.name}</span>.
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2 shrink-0 self-end sm:self-center">
                <button
                  type="button"
                  onClick={() => setBoardSprintScope("all")}
                  className="px-3.5 py-1.5 rounded-xl text-xs font-black bg-amber-600 hover:bg-amber-700 text-white transition-all shadow-sm"
                >
                  Tampilkan Semua Tugas di Board
                </button>
              </div>
            </div>
          )}

          {activeSprint && boardSprintScope === "all" && (
            <div className="bg-purple-50/80 border border-purple-200 rounded-[16px] px-4 py-2.5 shadow-sm flex items-center justify-between gap-3 text-purple-900">
              <div className="flex items-center gap-2 text-xs">
                <span className="font-bold">Mode Tampilan:</span>
                <span>Menampilkan seluruh tugas proyek (termasuk tugas Product Backlog).</span>
              </div>
              <button
                type="button"
                onClick={() => setBoardSprintScope("active_sprint")}
                className="px-3 py-1 rounded-lg text-xs font-black bg-white hover:bg-purple-100 text-purple-700 border border-purple-200 transition-all shrink-0"
              >
                Kembali ke Hanya Sprint Aktif
              </button>
            </div>
          )}

          {/* ── Division Sub-tabs ── */}
          <div className="flex items-center gap-2 overflow-x-auto pb-1 -mt-1 scrollbar-thin">
            {divisionTabs.map((tab) => {
              const isSelected = selectedDivisionId === tab.id;
              return (
                <button
                  key={tab.id}
                  onClick={() => setSelectedDivisionId(tab.id)}
                  className={`px-3.5 py-1.5 rounded-xl text-xs font-bold transition-all whitespace-nowrap flex items-center gap-1.5 shrink-0 border ${
                    isSelected
                      ? "bg-[#6C47FF] text-white border-[#6C47FF] shadow-sm"
                      : "bg-white hover:bg-slate-50 text-slate-600 border-border"
                  }`}
                >
                  <span>{tab.label}</span>
                  <span
                    className={`px-1.5 py-0.2 rounded-full text-[10px] font-black ${
                      isSelected ? "bg-white/25 text-white" : "bg-slate-100 text-slate-600"
                    }`}
                  >
                    {tab.count}
                  </span>
                </button>
              );
            })}
          </div>

          {/* 🚀🚀 Kanban Board 🚀🚀 */}
          <div className="grid grid-cols-1 lg:grid-cols-4 gap-4 xl:gap-6 flex-1 min-h-[400px]">
            {columns.map((col) => {
              const colTasks = filterTasksForBoard(tasks[col.id] || [], {
                activeSprintId: effectiveActiveSprintId,
                selectedDivisionId,
                onlyMyTasks,
                currentUserId: currentUser?.id,
              });

                  return (
                  <div
                    key={col.id}
                    onDragOver={(event) => handleColumnDragOver(event, col.id)}
                    onDragLeave={() => setDragOverColumn((current) => current === col.id ? null : current)}
                    onDrop={(event) => void handleColumnDrop(event, col.id)}
                    className={`flex flex-col min-w-0 rounded-[20px] ${col.bg} p-4 transition-all ${dragOverColumn === col.id ? "ring-2 ring-[#6C47FF]/40 ring-offset-2 bg-white/80" : ""}`}
                  >
                    <div className="flex items-center gap-2 mb-4 px-2">
                      <div className={`w-3 h-3 rounded-sm ${col.iconColor}`} />
                      <h3 className={`text-sm font-bold ${col.textColor} uppercase tracking-wider`}>{col.title}</h3>
                      <span className={`px-2 py-0.5 rounded-full text-[11px] font-bold ${col.pillBg} ml-1`}>{colTasks.length}</span>
                    </div>
                    <div className="flex flex-col gap-4 flex-1 overflow-y-auto">
                      {colTasks.map((task: any) => (
                        <div
                          key={task.id}
                          draggable={canFillExistingCards && movingTaskId !== task.id}
                          onDragStart={(event) => handleTaskDragStart(event, task, col.id)}
                          onDragEnd={handleTaskDragEnd}
                          onClick={() => {
                            if (movingTaskId === task.id || draggedTask?.taskId === task.id) return;
                            openTask(task);
                          }}
                          title={canFillExistingCards ? "Seret kartu ini ke kolom lain untuk mengubah status." : undefined}
                          className={`bg-white rounded-[16px] p-5 shadow-sm border ${task.isOverdue && col.id !== "done" ? "border-red-400" : "border-border/60"} hover:shadow-md transition-all ${canFillExistingCards ? "cursor-grab active:cursor-grabbing" : "cursor-pointer"} ${movingTaskId === task.id ? "opacity-60" : ""} ${draggedTask?.taskId === task.id ? "scale-[0.98] opacity-70" : ""}`}
                        >
                          {task.taskKey && (
                            <div className="mb-1.5">
                              <span className="px-1.5 py-0.5 rounded text-[10px] font-mono font-bold bg-slate-100 text-slate-700 border border-slate-200 inline-block">
                                {task.taskKey}
                              </span>
                            </div>
                          )}
                          <p className="font-bold text-sm text-foreground mb-2.5 leading-snug">{task.title}</p>
                          {task.deadline && (
                            <div className="flex items-center gap-1.5 mb-3">
                              {task.isOverdue && <AlertTriangle size={12} className="text-red-500" strokeWidth={3} />}
                              <span className={`text-[11px] font-bold ${task.isOverdue ? "text-red-500" : "text-muted-foreground"}`}>
                                Deadline: {formatDateReadable(task.deadline)}
                              </span>
                            </div>
                          )}
                          {task.statusText && (
                            <div className="mb-3">
                              <p
                                className={`text-[11px] text-muted-foreground line-clamp-3 leading-relaxed whitespace-pre-line ${
                                  col.id === "done" ? "line-through text-slate-400" : ""
                                }`}
                              >
                                {getTaskDescriptionPreview(task.statusText)}
                              </p>
                            </div>
                          )}
                          {task.progress !== undefined && (
                            <div className="mb-4">
                              <span className="text-[10px] font-bold text-muted-foreground block mb-1.5">{task.progress}% selesai</span>
                              <div className="w-full bg-slate-100 rounded-full h-1.5">
                                <div className={`${accentBg} h-1.5 rounded-full`} style={{ width: `${task.progress}%` }} />
                              </div>
                            </div>
                          )}
                          <div className="flex items-center justify-between mt-4">
                            <div className="flex items-center gap-1.5 flex-wrap">
                              <span className={`px-2.5 py-1 rounded-md text-[10px] font-bold ${getTagColor(task.tag)}`}>{task.tag}</span>
                              {selectedDivisionId === "all" && (
                                task.divisionName ? (
                                  <span className="px-2 py-0.5 rounded-md text-[10px] font-bold bg-slate-100 text-slate-700 border border-slate-200">
                                    {task.divisionName}
                                  </span>
                                ) : (
                                  <span className="px-2 py-0.5 rounded-md text-[10px] font-bold bg-slate-50 text-slate-500 border border-dashed border-slate-300">
                                    Belum Ada Divisi
                                  </span>
                                )
                              )}
                              {task.storyPoints !== null && task.storyPoints !== undefined && (
                                <span className="px-2 py-0.5 rounded-md text-[10px] font-black bg-purple-50 text-purple-700 border border-purple-200 flex items-center gap-0.5" title="Tingkat Kesulitan (Fibonacci Story Points)">
                                  <span>⚡</span>
                                  <span>{task.storyPoints} SP</span>
                                </span>
                              )}
                              {activeSprint && (!task.sprintId || task.sprintId !== activeSprint.id) && (
                                <span className="px-2 py-0.5 rounded-md text-[10px] font-bold bg-amber-100 text-amber-800 border border-amber-200" title="Tugas ini berada di Product Backlog (belum dimasukkan ke sprint aktif)">
                                  Backlog
                                </span>
                              )}
                            </div>
                            <div className="flex items-center gap-3">
                              <div className="flex items-center -space-x-1.5">
                                {task.assignees.map((a: string, i: number) => (
                                  <div
                                    key={i}
                                    className={`group/avatar relative w-6 h-6 rounded-full flex items-center justify-center text-[8px] font-bold border-[1.5px] border-white shadow-sm cursor-pointer ${getAssigneeColor(a)}`}
                                    style={{ zIndex: 5 - i }}
                                  >
                                    {a}
                                    <div className="absolute bottom-7 left-1/2 -translate-x-1/2 bg-slate-800 text-white text-[10px] font-medium px-2 py-1 rounded opacity-0 invisible group-hover/avatar:opacity-100 group-hover/avatar:visible whitespace-nowrap z-50 transition-all shadow-lg pointer-events-none">
                                      {getMemberName(a)}
                                      <div className="absolute -bottom-1 left-1/2 -translate-x-1/2 w-2 h-2 bg-slate-800 rotate-45" />
                                    </div>
                                  </div>
                                ))}
                              </div>
                              <div className="flex items-center gap-1 text-slate-300">
                                <MessageSquare size={12} fill="currentColor" />
                                <span className="text-[11px] font-bold">{task.comments}</span>
                              </div>
                            </div>
                          </div>
                        </div>
                      ))}
                  {col.id === "done" && (tasks[col.id] || []).length > 0 && (
                    <div className="text-center py-2">
                      <span className="text-xs font-bold text-emerald-400/80 cursor-pointer hover:text-emerald-500 transition-colors">+ tugas lainnya</span>
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>

          {/* 🚀🚀 Project Attachments 🚀🚀 */}
          <div className="mt-2 flex flex-col gap-5">
            <div className="flex items-center gap-2">
              <Paperclip className="text-primary" size={20} />
              <h2 className="text-lg font-bold text-foreground">Lampiran Tugas</h2>
            </div>
            {Object.entries(taskAttachmentsMap).filter(([, items]) => items.length > 0).length === 0 ? (
              <div className="rounded-[16px] border border-dashed border-border bg-white p-6 text-sm text-muted-foreground">
                Belum ada lampiran tugas. Lampiran akan muncul di sini setelah mahasiswa menambahkan lampiran saat menyelesaikan sub-tugas.
              </div>
            ) : (
              <div className="flex flex-col gap-3">
                {Object.entries(taskAttachmentsMap)
                  .filter(([, items]) => items.length > 0)
                  .map(([taskId, items]) => {
                    const boardTask = [
                      ...(tasks.todo || []),
                      ...(tasks.doing || []),
                      ...(tasks.review || []),
                      ...(tasks.done || [])
                    ].find((task) => String(task.id) === taskId);

                    return (
                      <div key={taskId} className="rounded-[16px] border border-border bg-white p-4 shadow-sm">
                        <div className="flex items-center justify-between gap-3 mb-3">
                          <div>
                            <p className="text-sm font-black text-foreground">{boardTask?.title || `Tugas ${taskId}`}</p>
                            <p className="text-[11px] font-medium text-muted-foreground">{items.length} lampiran</p>
                          </div>
                          {boardTask && (
                            <button
                              onClick={() => openTask(boardTask)}
                              className="text-xs font-bold text-[#0AB600] hover:underline"
                            >
                              Buka Tugas
                            </button>
                          )}
                        </div>
                        <div className="flex flex-col gap-2">
                          {items.map((attachment) => (
                            <div key={attachment.id} className="flex items-center gap-3 rounded-xl border border-border/70 bg-slate-50 px-3 py-2.5">
                              <div className={`w-9 h-9 rounded-lg flex items-center justify-center shrink-0 ${attachment.type === "link" ? "bg-blue-100 text-blue-600" : "bg-emerald-100 text-emerald-600"}`}>
                                {attachment.type === "link" ? <ExternalLink size={16} /> : <FileText size={16} />}
                              </div>
                              <div className="min-w-0 flex-1">
                                <p className="truncate text-sm font-bold text-foreground">{attachment.name}</p>
                                <p className="text-[10px] text-muted-foreground">
                                  {attachment.sizeLabel} • {new Date(attachment.uploadedAt).toLocaleString("id-ID")}
                                </p>
                              </div>
                              {attachment.url && (
                                <a
                                  href={attachment.url}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  download={attachment.name || undefined}
                                  className="inline-flex items-center gap-1 rounded-lg bg-white border border-border px-3 py-2 text-xs font-bold text-slate-600 hover:bg-slate-100 transition-colors shadow-sm"
                                >
                                  <Download size={12} /> Buka
                                </a>
                              )}
                            </div>
                          ))}
                        </div>
                      </div>
                    );
                  })}
              </div>
            )}
          </div>

          {/* ── Repository Section ── */}
          <div className="mt-2 flex flex-col gap-4">
            <div className="flex items-center gap-2">
              <GitBranch className="text-primary" size={20} />
              <h2 className="text-lg font-bold text-foreground">Repository</h2>
              {boardRepos.length > 0 && (
                <span className="text-xs font-bold text-muted-foreground bg-slate-100 px-2 py-0.5 rounded-full">
                  {boardRepos.length}
                </span>
              )}
            </div>

            {boardReposLoading ? (
              <div className="bg-white rounded-[16px] border border-border/60 p-5 shadow-sm flex items-center gap-2 text-muted-foreground text-sm">
                <RefreshCw size={16} className="animate-spin text-primary" />
                <span>Memuat repository project...</span>
              </div>
            ) : boardReposError ? (
              <div className="bg-white rounded-[16px] border border-rose-200 bg-rose-50/40 p-4 shadow-sm text-sm text-rose-600 flex items-center gap-2">
                <AlertCircle size={16} className="shrink-0" />
                <span>{boardReposError}</span>
              </div>
            ) : boardRepos.length === 0 ? (
              <div className="bg-white rounded-[16px] border border-border/60 p-5 shadow-sm text-center">
                <p className="text-sm text-muted-foreground">Belum ada repository GitHub yang terhubung ke project ini.</p>
              </div>
            ) : (
              <div className="flex flex-col gap-3">
                {boardRepos.map((repo) => {
                  const div = divisions.find((d) => d.id === repo.divisionId);
                  const divisionLabel = div?.name || "Lintas Divisi";
                  const safeUrl = `https://github.com/${repo.owner}/${repo.repo}`;
                  const isUrlValid = isValidGitHubUrl(safeUrl);

                  return (
                    <div
                      key={repo.id}
                      className="bg-white rounded-[16px] border border-border/60 p-4 shadow-sm hover:border-slate-300 transition-colors flex flex-col sm:flex-row sm:items-center justify-between gap-3"
                    >
                      <div className="space-y-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-bold text-sm text-foreground truncate">
                            {repo.fullName}
                          </span>
                          <span
                            className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                              repo.isActive
                                ? "bg-emerald-100 text-emerald-700"
                                : "bg-slate-100 text-slate-500"
                            }`}
                          >
                            {repo.isActive ? "Aktif" : "Nonaktif"}
                          </span>
                          {repo.isPrivate && (
                            <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-amber-100 text-amber-700 flex items-center gap-1">
                              <Lock size={10} /> Private
                            </span>
                          )}
                        </div>

                        <div className="flex items-center gap-3 text-xs text-muted-foreground flex-wrap">
                          <span>
                            Default branch:{" "}
                            <code className="px-1.5 py-0.5 rounded bg-slate-100 text-slate-700 text-[11px] font-mono">
                              {repo.defaultBranch || "main"}
                            </code>
                          </span>
                          <span>•</span>
                          <span>
                            Divisi: <strong className="text-foreground">{divisionLabel}</strong>
                          </span>
                        </div>
                      </div>

                      {isUrlValid && (
                        <div className="shrink-0 flex items-center">
                          <a
                            href={safeUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-border bg-slate-50 hover:bg-slate-100 text-xs font-bold text-foreground transition-colors"
                          >
                            <ExternalLink size={13} />
                            <span>Buka GitHub</span>
                          </a>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>


        </div>
      </div>

      {/* ══ Task Detail Modal ══ */}
      {selectedTask && !isEditModalOpen && (
        <div className="fixed inset-0 z-[100] bg-slate-900/40 backdrop-blur-sm flex items-start justify-center pt-[6vh] p-4 sm:p-6">
          <div className="bg-white w-full max-w-[600px] max-h-[88vh] rounded-[20px] shadow-2xl flex flex-col overflow-hidden animate-in fade-in zoom-in-95 duration-300 relative">
            {showDeleteWarning && (
              <div className="absolute inset-0 z-50 bg-white/95 backdrop-blur-sm flex items-center justify-center p-8 text-center">
                <div className="max-w-xs w-full bg-white p-6 rounded-2xl shadow-xl border border-border">
                  <div className="w-16 h-16 bg-red-100 text-red-500 rounded-full flex items-center justify-center mx-auto mb-4"><AlertTriangle size={32} /></div>
                  <h3 className="text-lg font-black text-foreground mb-2">Hapus Tugas?</h3>
                  <p className="text-sm text-slate-500 mb-6">Tugas ini akan dihapus permanen dan tidak dapat dikembalikan.</p>
                  <div className="flex gap-3">
                    <button onClick={() => setShowDeleteWarning(false)} className="flex-1 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold rounded-xl transition-colors text-sm">Batal</button>
                    <button onClick={deleteTask} className="flex-1 py-2.5 bg-red-500 hover:bg-red-600 text-white font-bold rounded-xl transition-colors text-sm">Ya, Hapus</button>
                  </div>
                </div>
              </div>
            )}
            <div className="p-6 border-b border-border bg-white shrink-0">
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-2">
                  {selectedTask.taskKey && (
                    <div className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded bg-slate-100 border border-slate-200 text-slate-800 font-mono font-bold text-xs">
                      <span>{selectedTask.taskKey}</span>
                      <button
                        type="button"
                        onClick={() => {
                          navigator.clipboard.writeText(selectedTask.taskKey);
                          setCopiedTaskKey(true);
                          setTimeout(() => setCopiedTaskKey(false), 2000);
                        }}
                        title="Copy Task Key"
                        className="text-slate-400 hover:text-slate-700 transition-colors p-0.5"
                      >
                        {copiedTaskKey ? <Check size={12} className="text-emerald-600" /> : <Copy size={12} />}
                      </button>
                    </div>
                  )}
                  <span className={`px-2.5 py-1 rounded text-[10px] font-bold uppercase tracking-wide ${selectedTask.status === "DONE" ? "bg-emerald-100 text-emerald-700" :
                    selectedTask.status === "DOING" ? "bg-blue-100 text-blue-700" :
                      selectedTask.status === "REVIEW" ? "bg-amber-100 text-amber-700" : "bg-slate-100 text-slate-700"
                    }`}>{selectedTask.status}</span>
                  <span className={`px-2.5 py-1 rounded text-[10px] font-bold ${getTagColor(selectedTask.tag)}`}>{selectedTask.tag}</span>
                  <span className="px-2.5 py-1 rounded bg-slate-100 text-slate-600 text-[10px] font-bold border border-slate-200">{selectedTask.sp} SP</span>
                </div>
                <div className="flex items-center gap-2">
                  {canFillExistingCards && (
                    <select
                      defaultValue=""
                      onChange={(e) => {
                        if (!e.target.value) return;
                        void handleMoveTaskStatus(e.target.value);
                        e.currentTarget.value = "";
                      }}
                      className="text-xs font-bold border border-slate-200 rounded-lg px-2.5 py-1.5 bg-slate-50 text-slate-600 focus:outline-none hover:bg-slate-100 cursor-pointer transition-colors"
                    >
                      <option value="" disabled>Pindah ke...</option>
                      <option value="todo">TO DO</option>
                      <option value="doing">DOING</option>
                      <option value="review">REVIEW</option>
                      <option value="done">DONE</option>
                    </select>
                  )}
                  {canManageCards && (
                    <>
                      <button onClick={openEditTaskModal} className="w-8 h-8 rounded-lg bg-slate-50 hover:bg-slate-100 text-slate-500 flex items-center justify-center transition-colors border border-transparent hover:border-slate-200"><Edit2 size={14} /></button>
                      <button onClick={() => setShowDeleteWarning(true)} className="w-8 h-8 rounded-lg bg-red-50 hover:bg-red-100 text-red-500 flex items-center justify-center transition-colors border border-transparent hover:border-red-200"><Trash2 size={14} /></button>
                    </>
                  )}
                  {(canFillExistingCards || canManageCards) && <div className="w-px h-5 bg-border mx-1" />}
                  <button onClick={closeTask} className="w-8 h-8 rounded-full bg-slate-50 hover:bg-slate-100 text-slate-500 flex items-center justify-center transition-colors ml-1"><X size={18} /></button>
                </div>
              </div>
              <h2 className="text-xl font-black text-foreground mb-4 leading-tight pr-4">{selectedTask.title}</h2>
              {selectedTask.progress !== undefined && (
                <div>
                  <div className="flex items-center justify-between mb-1.5">
                    <span className="text-xs font-bold text-muted-foreground">Progress</span>
                    <span className={`text-xs font-black ${accentText}`}>{selectedTask.progress}%</span>
                  </div>
                  <div className="w-full bg-slate-100 rounded-full h-2">
                    <div className={`${accentBg} h-2 rounded-full`} style={{ width: `${selectedTask.progress}%` }} />
                  </div>
                </div>
              )}
            </div>
            <div className="flex px-6 border-b border-border bg-white shrink-0">
              {(["detail", "komentar", "development"] as const).map((tab) => (
                <button
                  key={tab}
                  onClick={() => setActiveTab(tab)}
                  className={`py-3 px-2 mr-6 text-sm font-bold border-b-2 transition-colors capitalize ${activeTab === tab ? `border-[#0AB600] ${accentText}` : "border-transparent text-muted-foreground hover:text-foreground"}`}
                >
                  {tab === "detail" ? "Detail" : tab === "komentar" ? `Komentar (${selectedTask.comments || 0})` : "Development"}
                </button>
              ))}
            </div>
            <div className="flex-1 flex flex-col min-h-0 bg-slate-50/50 relative">
              {activeTab === "detail" && (
                <div className="flex-1 overflow-y-auto p-6 flex flex-col">
                  {taskFetchMessage && (
                    <div className="bg-amber-50 border border-amber-200 text-amber-700 rounded-xl p-3.5 mb-4 text-sm font-medium">
                      {taskFetchMessage}
                    </div>
                  )}
                  {selectedTask.isOverdue ? (
                    <div className="bg-red-50 border border-red-100 text-red-600 rounded-xl p-3.5 mb-6 flex items-start gap-3">
                      <AlertTriangle size={18} className="mt-0.5 shrink-0" />
                      <div>
                        <p className="text-sm font-bold">Tugas ini telah melewati tenggat waktu!</p>
                        <p className="text-xs text-red-500/80 mt-1">Harap segera selesaikan atau diskusikan dengan pembimbing.</p>
                      </div>
                    </div>
                  ) : (
                    <div className="bg-emerald-50 border border-emerald-100 text-emerald-700 rounded-xl p-3.5 mb-6 flex items-start gap-3">
                      <Check size={18} className="mt-0.5 shrink-0" />
                      <div>
                        <p className="text-sm font-bold">On Track</p>
                        <p className="text-xs text-emerald-600/80 mt-1">Tugas ini berjalan sesuai jadwal sprint saat ini.</p>
                      </div>
                    </div>
                  )}
                  <div className="grid grid-cols-2 gap-y-5 gap-x-6 mb-8">
                    <div>
                      <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest block mb-1">Prioritas</span>
                      <span className="inline-flex items-center px-2 py-0.5 rounded bg-red-100 text-red-700 text-xs font-bold">
                        <span className="w-2 h-2 rounded-full bg-red-500 mr-1.5" /> Tinggi
                      </span>
                    </div>
                    <div>
                      <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest block mb-1">Deadline</span>
                      <span className={`text-sm font-bold ${selectedTask.isOverdue ? "text-red-500" : "text-foreground"}`}>{formatDateReadable(selectedTask.deadline) || "Belum diatur"}</span>
                    </div>
                    <div>
                      <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest block mb-1">Divisi</span>
                      <span className="inline-flex items-center px-2 py-0.5 rounded bg-slate-100 text-slate-700 text-xs font-bold border border-slate-200">
                        {selectedTask.divisionName || "Belum Ada Divisi"}
                      </span>
                    </div>
                    <div>
                      <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest block mb-2">Ditugaskan Ke</span>
                      <div className="flex flex-col gap-2">
                        {selectedTask.assignees.map((a: string, i: number) => {
                          const member = teamMembers.find(m => m.initials === a);
                          return (
                            <div key={i} className="flex items-center gap-2">
                              <div className={`w-7 h-7 rounded-full flex items-center justify-center text-[9px] font-bold shrink-0 ${getAssigneeColor(a)}`}>{a}</div>
                              <div className="flex flex-col">
                                <span className="text-sm font-bold text-foreground">{getMemberName(a)}</span>
                                {member && <span className="text-[10px] font-medium text-muted-foreground">{member.role}</span>}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                    <div>
                      <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest block mb-2">Dibuat Oleh</span>
                      <div className="flex items-center gap-2">
                        <div className="w-6 h-6 rounded-full bg-slate-400 text-white flex items-center justify-center text-[9px] font-bold">
                          {selectedTask.createdByInitials || "SYS"}
                        </div>
                        <div className="flex flex-col">
                          <span className="text-sm font-bold text-foreground">{selectedTask.createdByName || "Sistem"}</span>
                          {selectedTask.createdByRole && (
                            <span className="text-[10px] font-medium text-muted-foreground">{selectedTask.createdByRole}</span>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                  <div className="mb-8">
                    <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest block mb-3">Deskripsi Tugas</span>
                    <div className="bg-white p-5 rounded-xl border border-border shadow-sm">
                      <RichTaskDescription content={selectedTask.description || selectedTask.statusText || ""} />
                    </div>
                  </div>
                  <div>
                    <div className="flex items-center justify-between gap-3 mb-3">
                      <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest">
                        Sub-tugas ({taskSubtasks.filter((item) => item.done).length}/{taskSubtasks.length})
                      </span>
                      {taskSubtasks.length > 0 && (
                        <span className={`text-xs font-black ${accentText}`}>
                          {Math.round((taskSubtasks.filter((item) => item.done).length / taskSubtasks.length) * 100)}%
                        </span>
                      )}
                    </div>
                    {taskChecklistMessage && (
                      <div className="mb-3 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-medium text-red-600">
                        {taskChecklistMessage}
                      </div>
                    )}
                    {taskAttachmentMessage && (
                      <div className="mb-3 rounded-xl border border-blue-200 bg-blue-50 px-4 py-3 text-sm font-medium text-blue-700">
                        {taskAttachmentMessage}
                      </div>
                    )}
                    <input
                      ref={checklistAttachmentInputRef}
                      type="file"
                      multiple
                      className="hidden"
                      onChange={handleTaskAttachmentUpload}
                    />
                    <div className="mb-3 flex items-center justify-between gap-3 rounded-xl border border-dashed border-border bg-white px-4 py-3">
                      <div>
                        <p className="text-sm font-bold text-foreground">Lampiran checklist</p>
                        <p className="text-[11px] text-muted-foreground">
                          {taskAttachments.length > 0
                            ? `${taskAttachments.length} lampiran sudah ditambahkan untuk tugas ini.`
                            : "Belum ada lampiran. Mahasiswa wajib menambahkan lampiran sebelum mencentang sub-tugas."}
                        </p>
                      </div>
                      {canFillExistingCards && (
                        <button
                          onClick={() => checklistAttachmentInputRef.current?.click()}
                          className="inline-flex items-center gap-2 rounded-xl border border-border bg-slate-50 px-4 py-2.5 text-xs font-bold text-slate-700 hover:bg-slate-100 transition-colors shrink-0"
                        >
                          <UploadCloud size={14} /> Tambah Lampiran
                        </button>
                      )}
                    </div>
                    {taskAttachments.length > 0 && (
                      <div className="mb-3 flex flex-col gap-2">
                        {taskAttachments.map((att) => (
                          <div key={att.id} className="flex items-center justify-between gap-3 rounded-xl border border-border/70 bg-slate-50 px-3 py-2">
                            <div className="flex items-center gap-2.5 min-w-0">
                              <FileText size={15} className="text-emerald-600 shrink-0" />
                              <div className="min-w-0">
                                <p className="text-xs font-bold text-foreground truncate">{att.name}</p>
                                <p className="text-[10px] text-muted-foreground">{att.sizeLabel}</p>
                              </div>
                            </div>
                            {att.url && (
                              <a
                                href={att.url}
                                target="_blank"
                                rel="noopener noreferrer"
                                download={att.name || undefined}
                                className="inline-flex items-center gap-1 rounded-lg bg-white border border-border px-2.5 py-1 text-[11px] font-bold text-slate-600 hover:bg-slate-100 transition-colors shadow-sm shrink-0"
                              >
                                <Download size={11} /> Buka
                              </a>
                            )}
                          </div>
                        ))}
                      </div>
                    )}
                    <div className="space-y-2">
                      {taskSubtasks.length === 0 && (
                        <div className="rounded-xl border border-dashed border-border bg-white px-4 py-3 text-sm text-muted-foreground">
                          {canManageCards ? "Sub-tugas belum ada. Tambahkan item checklist baru di bawah." : "Sub-tugas belum ada."}
                        </div>
                      )}
                      {taskSubtasks.map((item) => (
                        <div key={item.id} className="flex items-center gap-3 bg-white p-3 rounded-xl border border-border shadow-sm">
                          <button
                            onClick={() => toggleTaskSubtask(item.id)}
                            disabled={!canFillExistingCards}
                            className={`w-5 h-5 rounded flex items-center justify-center shrink-0 transition-colors ${
                              item.done ? "bg-emerald-500 text-white border-emerald-500" : "bg-slate-50 border-2 border-slate-300 hover:border-[#0AB600] disabled:hover:border-slate-300 disabled:cursor-not-allowed"
                            }`}
                            title={item.attachmentRequired ? "Checklist ini membutuhkan lampiran untuk mahasiswa." : "Toggle sub-tugas"}
                          >
                            {item.done && <Check size={12} strokeWidth={3} />}
                          </button>
                          <div className="flex-1 min-w-0">
                            <p className={`text-sm font-medium ${item.done ? "text-muted-foreground line-through decoration-slate-300" : "text-foreground"}`}>
                              {item.title}
                            </p>
                            <div className="flex items-center gap-2 mt-1">
                              {item.attachmentRequired && (
                                <span className="inline-flex items-center gap-1 rounded-full bg-amber-50 px-2 py-0.5 text-[10px] font-black text-amber-700">
                                  <Paperclip size={10} /> Butuh lampiran
                                </span>
                              )}
                              {item.completedAt && (
                                <span className="text-[10px] font-medium text-muted-foreground">
                                  Dicentang {new Date(item.completedAt).toLocaleString("id-ID")}
                                </span>
                              )}
                            </div>
                          </div>
                          {canManageCards && (
                            <button
                              onClick={() => removeTaskSubtask(item.id)}
                              className="w-8 h-8 rounded-lg bg-red-50 hover:bg-red-100 text-red-500 flex items-center justify-center transition-colors shrink-0"
                              title="Hapus sub-tugas"
                            >
                              <X size={14} />
                            </button>
                          )}
                        </div>
                      ))}
                    </div>
                    {canManageCards && (
                      <div className="mt-3 flex gap-2">
                        <input
                          value={newTaskSubtask}
                          onChange={(e) => setNewTaskSubtask(e.target.value)}
                          onKeyDown={(e) => { if (e.key === "Enter") addTaskSubtask(); }}
                          placeholder="Tambah sub-tugas baru..."
                          className="flex-1 rounded-xl border border-border bg-white px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#0AB600]/20 focus:border-[#0AB600]"
                        />
                        <button
                          onClick={addTaskSubtask}
                          className={`px-4 py-2.5 rounded-xl text-sm font-bold text-white ${accentBg} hover:opacity-90 transition-colors`}
                        >
                          Tambah
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              )}
              {activeTab === "komentar" && (
                <div className="flex-1 min-h-0 flex flex-col">
                  <div className="flex-1 overflow-y-auto p-6 flex flex-col gap-6">
                    {taskFetchMessage && (
                      <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm font-medium text-amber-700">
                        {taskFetchMessage}
                      </div>
                    )}
                    {taskCommentMessage && (
                      <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-medium text-red-600">
                        {taskCommentMessage}
                      </div>
                    )}
                    {taskCommentsLoading && <p className="text-sm text-muted-foreground">Memuat komentar...</p>}
                    {!taskCommentsLoading && taskComments.length === 0 && (
                      <p className="text-sm text-muted-foreground">Belum ada komentar. Kamu bisa menulis komentar pertama di bawah.</p>
                    )}
                    {!taskCommentsLoading && taskComments.map((comment) => {
                      const initials = String(comment.authorName || "U")
                        .split(" ")
                        .map((chunk: string) => chunk[0] || "")
                        .join("")
                        .slice(0, 2)
                        .toUpperCase() || "U";
                      const isOwn = comment.authorId && currentUser?.id && comment.authorId === currentUser.id;
                      return (
                        <div key={comment.id} className={`flex gap-3 ${isOwn ? "flex-row-reverse" : ""}`}>
                          <div className={`w-8 h-8 rounded-full ${isOwn ? "bg-emerald-500" : "bg-blue-500"} text-white flex items-center justify-center text-xs font-bold shrink-0`}>
                            {initials}
                          </div>
                          <div className={`flex flex-col gap-1.5 max-w-[85%] ${isOwn ? "items-end" : "items-start"}`}>
                            <div className={`flex items-center gap-2 ${isOwn ? "flex-row-reverse" : ""}`}>
                              <span className="text-xs font-bold text-foreground">{comment.authorName || "Pengguna"}</span>
                              {comment.subtaskTitle && (
                                <span className="rounded-full bg-amber-50 px-2 py-0.5 text-[9px] font-black text-amber-700">
                                  {comment.subtaskTitle}
                                </span>
                              )}
                              <span className="text-[10px] font-medium text-muted-foreground">
                                {comment.createdAt ? new Date(comment.createdAt).toLocaleString("id-ID") : "-"}
                              </span>
                            </div>
                            <div className={`p-3.5 rounded-2xl text-sm text-foreground shadow-sm leading-relaxed ${isOwn ? "bg-[#F8F5FF] border border-[#E9E0FF] rounded-tr-none" : "bg-white border border-border rounded-tl-none"
                              }`}>
                              {comment.text}
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                  {canFillExistingCards ? (
                  <div className="p-4 bg-white border-t border-border shrink-0">
                    <div className="rounded-2xl border border-border bg-slate-50 p-4 shadow-sm">
                      <div className="flex items-center gap-3 mb-3">
                        <div className="w-8 h-8 rounded-full bg-slate-400 flex items-center justify-center text-xs font-bold text-white shrink-0">
                          {String(currentUser?.initials || "U")}
                        </div>
                        <div className="min-w-0">
                          <p className="text-sm font-black text-foreground">Tulis Komentar</p>
                          <p className="text-[11px] font-medium text-muted-foreground">Pilih sub-tugas tujuan komentar sebelum mengirim.</p>
                        </div>
                      </div>
                      <div className="mb-3">
                        <label className="mb-1.5 block text-[11px] font-black uppercase tracking-wide text-muted-foreground">
                          Komentar untuk
                        </label>
                        <select
                          value={selectedCommentSubtaskId}
                          onChange={(e) => setSelectedCommentSubtaskId(e.target.value)}
                          className="w-full rounded-xl border border-border bg-white px-3 py-2.5 text-sm font-medium text-foreground focus:outline-none focus:ring-2 focus:ring-[#6C47FF]/20 focus:border-[#6C47FF]"
                        >
                          <option value="__task__">Tugas utama</option>
                          {taskSubtasks.map((subtask) => (
                            <option key={subtask.id} value={subtask.id}>
                              {subtask.title}
                            </option>
                          ))}
                        </select>
                      </div>
                      <div className="bg-white border border-border rounded-xl focus-within:ring-2 focus-within:ring-[#6C47FF]/20 focus-within:border-[#6C47FF] transition-all p-1 flex">
                        <textarea
                          placeholder={
                            selectedCommentSubtaskId !== "__task__"
                              ? `Tulis komentar untuk ${taskSubtasks.find((item) => item.id === selectedCommentSubtaskId)?.title || "sub-tugas ini"}...`
                              : "Tulis komentar untuk tugas ini..."
                          }
                          value={newCommentText}
                          onChange={(e) => setNewCommentText(e.target.value)}
                          onKeyDown={(e) => {
                            if ((e.ctrlKey || e.metaKey) && e.key === "Enter") {
                              e.preventDefault();
                              void sendTaskComment();
                            }
                          }}
                          className="w-full bg-transparent border-none focus:ring-0 resize-none text-sm p-2.5 min-h-[72px] max-h-[160px]"
                          rows={3}
                        />
                        <button
                          onClick={sendTaskComment}
                          disabled={!newCommentText.trim() || !currentUser?.id}
                          className={`w-11 h-11 ${accentBg} hover:opacity-90 text-white rounded-xl flex items-center justify-center shrink-0 transition-colors self-end m-0.5 disabled:opacity-40 disabled:cursor-not-allowed`}
                          title="Kirim komentar"
                        >
                          <Send size={16} className="ml-0.5" />
                        </button>
                      </div>
                      <div className="mt-2 flex justify-between gap-3">
                        <p className="text-[11px] text-muted-foreground">Gunakan `Ctrl+Enter` untuk kirim lebih cepat.</p>
                        <span className="text-[11px] font-medium text-muted-foreground">{newCommentText.trim().length} karakter</span>
                      </div>
                    </div>
                  </div>
                  ) : (
                    <div className="p-4 bg-white border-t border-border text-sm font-medium text-muted-foreground shrink-0">
                      Anda hanya memiliki akses lihat untuk komentar kartu ini.
                    </div>
                  )}
                </div>
              )}

              {/* ══ Development Tab ══ */}
              {activeTab === "development" && (
                <div className="flex-1 overflow-y-auto p-6 flex flex-col gap-6">
                  {/* Scoped error banner */}
                  {taskDevError && (
                    <div className="rounded-xl border border-red-200 bg-red-50 p-3.5 text-xs text-red-700 flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <AlertCircle size={15} className="shrink-0 text-red-600" />
                        <span>{taskDevError}</span>
                      </div>
                      <button onClick={() => setTaskDevError("")} className="text-red-500 hover:text-red-700">
                        <X size={14} />
                      </button>
                    </div>
                  )}

                  {/* Section 1: Task Key & Recommended Branch Convention */}
                  <div className="bg-white rounded-2xl p-4 border border-border shadow-sm space-y-3">
                    <div className="flex items-center justify-between">
                      <span className="text-[11px] font-bold text-muted-foreground uppercase tracking-wider">
                        Task Key
                      </span>
                      <span className="px-2.5 py-0.5 rounded text-xs font-mono font-black bg-slate-100 text-slate-800 border border-slate-200">
                        {selectedTask.taskKey || "(Belum ada task key)"}
                      </span>
                    </div>

                    <div>
                      <div className="flex items-center justify-between mb-1.5">
                        <span className="text-[11px] font-bold text-muted-foreground uppercase tracking-wider">
                          Rekomendasi Branch Convention
                        </span>
                        {selectedTask.taskKey && (
                          <button
                            type="button"
                            onClick={() => {
                              const template = generateBranchTemplate(selectedTask.taskKey, selectedTask.title);
                              navigator.clipboard.writeText(template);
                              setCopiedBranchTemplate(true);
                              setTimeout(() => setCopiedBranchTemplate(false), 2000);
                            }}
                            className="text-xs text-primary hover:underline font-bold flex items-center gap-1"
                          >
                            {copiedBranchTemplate ? (
                              <>
                                <Check size={12} className="text-emerald-600" />
                                <span className="text-emerald-600">Tersalin</span>
                              </>
                            ) : (
                              <>
                                <Copy size={12} />
                                <span>Copy Branch Template</span>
                              </>
                            )}
                          </button>
                        )}
                      </div>
                      <div className="p-2.5 rounded-xl bg-slate-50 border border-slate-200 text-xs font-mono text-slate-800 break-all select-all">
                        {selectedTask.taskKey
                          ? generateBranchTemplate(selectedTask.taskKey, selectedTask.title)
                          : "(Task key diperlukan untuk template branch)"}
                      </div>
                    </div>
                  </div>

                  {/* Section 2: Linked Repositories */}
                  <div className="bg-white rounded-2xl p-4 border border-border shadow-sm space-y-3">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <GitBranch size={16} className="text-slate-700" />
                        <h4 className="text-xs font-black text-foreground uppercase tracking-wider">
                          Repository Terhubung ({taskRepoLinks.length})
                        </h4>
                      </div>
                      {canManageCards && (
                        <button
                          type="button"
                          onClick={() => {
                            setLinkingRepoId(projectRepos[0]?.id || "");
                            setLinkingBranchName("");
                            setShowLinkRepoModal(true);
                          }}
                          className="px-2.5 py-1 rounded-lg bg-slate-900 text-white text-xs font-bold hover:bg-slate-800 transition-colors flex items-center gap-1"
                        >
                          <Plus size={12} />
                          <span>Hubungkan</span>
                        </button>
                      )}
                    </div>

                    {taskRepoLinks.length === 0 ? (
                      <p className="text-xs text-muted-foreground py-2">
                        Belum ada repository yang terhubung ke task ini.
                      </p>
                    ) : (
                      <div className="divide-y divide-border/60">
                        {taskRepoLinks.map((link) => {
                          const safeUrl = `https://github.com/${link.owner}/${link.repo}`;
                          return (
                            <div key={link.id} className="py-2.5 flex items-center justify-between gap-3 text-xs">
                              <div className="min-w-0">
                                <div className="flex items-center gap-1.5 font-bold text-foreground">
                                  <span>{link.fullName}</span>
                                  {isValidGitHubUrl(safeUrl) && (
                                    <a
                                      href={safeUrl}
                                      target="_blank"
                                      rel="noopener noreferrer"
                                      className="text-slate-400 hover:text-slate-700"
                                      title="Buka repository"
                                    >
                                      <ExternalLink size={12} />
                                    </a>
                                  )}
                                </div>
                                <div className="flex items-center gap-2 text-muted-foreground text-[11px] mt-0.5">
                                  {link.branchName && (
                                    <span className="font-mono bg-slate-100 px-1.5 py-0.5 rounded text-slate-700">
                                      {link.branchName}
                                    </span>
                                  )}
                                  <span>•</span>
                                  <span>Sumber: {link.linkSource}</span>
                                </div>
                              </div>
                              {canManageCards && (
                                <button
                                  type="button"
                                  onClick={() => setUnlinkingRepoConfirm(link)}
                                  className="text-red-500 hover:text-red-700 text-xs font-bold px-2 py-1 rounded hover:bg-red-50 transition-colors"
                                >
                                  Lepas Link
                                </button>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>

                  {/* Section 3: Development Activity Timeline */}
                  <div className="bg-white rounded-2xl p-4 border border-border shadow-sm space-y-3">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <GitCommit size={16} className="text-slate-700" />
                        <h4 className="text-xs font-black text-foreground uppercase tracking-wider">
                          Riwayat Aktivitas GitHub ({taskActivities.length})
                        </h4>
                      </div>
                      <button
                        type="button"
                        onClick={() => loadTaskDevelopmentData(selectedTask.id)}
                        disabled={taskDevLoading}
                        className="p-1 rounded-lg hover:bg-slate-100 text-slate-600 transition-colors"
                        title="Refresh Aktivitas"
                      >
                        <RefreshCw size={13} className={taskDevLoading ? "animate-spin" : ""} />
                      </button>
                    </div>

                    {taskDevLoading ? (
                      <p className="text-xs text-muted-foreground py-4 text-center">
                        Memuat aktivitas GitHub...
                      </p>
                    ) : taskActivities.length === 0 ? (
                      <div className="py-6 text-center text-xs text-muted-foreground space-y-1">
                        <p className="font-bold text-slate-700">Belum ada aktivitas GitHub untuk task ini</p>
                        <p className="text-[11px] max-w-sm mx-auto">
                          Aktivitas commit atau pull request yang menyebutkan{" "}
                          <strong className="text-foreground">{selectedTask.taskKey || "TASK-KEY"}</strong>{" "}
                          akan otomatis tercatat di sini.
                        </p>
                      </div>
                    ) : (
                      <div className="space-y-3">
                        {taskActivities.map((act) => {
                          const typeMeta = getActivityTypeMeta(act.activityType, act.prMerged);
                          const statusMeta = getSuggestedStatusMeta(act.suggestedTaskStatus);
                          const isPush = act.activityType === "push";
                          const hasValidUrl = isValidGitHubUrl(act.htmlUrl);

                          const applyEligible = canApplySuggestedStatus({
                            suggestedStatus: act.suggestedTaskStatus,
                            currentTaskStatus: selectedTask.status,
                            isSprintClosed: activeSprint?.id === selectedTask?.sprintId && activeSprint?.status === "closed",
                            canManageTask: canFillExistingCards,
                          });

                          return (
                            <div
                              key={act.id}
                              className="p-3 rounded-xl bg-slate-50/70 border border-slate-200/80 space-y-2 text-xs"
                            >
                              <div className="flex items-center justify-between gap-2 flex-wrap">
                                <div className="flex items-center gap-1.5">
                                  <span className={`px-2 py-0.5 rounded text-[10px] font-bold border ${typeMeta.badgeClass}`}>
                                    {typeMeta.label}
                                  </span>
                                  {act.branchName && (
                                    <span className="font-mono text-[11px] text-slate-600 bg-white px-1.5 py-0.5 rounded border border-slate-200">
                                      {act.branchName}
                                    </span>
                                  )}
                                </div>
                                <span className="text-[10px] text-muted-foreground">
                                  {act.occurredAt ? new Date(act.occurredAt).toLocaleString("id-ID") : "-"}
                                </span>
                              </div>

                              {isPush ? (
                                <div className="space-y-1">
                                  <div className="flex items-center gap-2 flex-wrap">
                                    {act.commitSha && (
                                      <code className="px-1 py-0.5 rounded bg-white text-slate-800 font-mono font-bold text-[11px] border border-slate-200">
                                        {formatShortSha(act.commitSha)}
                                      </code>
                                    )}
                                    <span className="font-semibold text-foreground">
                                      {act.commitMessage || "(Tanpa pesan commit)"}
                                    </span>
                                  </div>
                                </div>
                              ) : (
                                <div className="space-y-1">
                                  <div className="flex items-center gap-2 flex-wrap">
                                    {act.prNumber && (
                                      <span className="font-black text-purple-700">
                                        PR #{act.prNumber}
                                      </span>
                                    )}
                                    <span className="font-semibold text-foreground">
                                      {act.prTitle || "(Tanpa judul PR)"}
                                    </span>
                                  </div>
                                </div>
                              )}

                              <div className="flex items-center justify-between gap-2 pt-1 border-t border-slate-200/60 text-[11px] text-muted-foreground">
                                <div>
                                  Oleh: <strong className="text-foreground">{formatGitHubActor(act.actorLogin)}</strong>
                                </div>
                                {hasValidUrl && (
                                  <a
                                    href={act.htmlUrl!}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="inline-flex items-center gap-1 text-primary hover:underline font-semibold"
                                  >
                                    <span>GitHub</span>
                                    <ExternalLink size={10} />
                                  </a>
                                )}
                              </div>

                              {/* Status Suggestion Presentation */}
                              {statusMeta && (
                                <div className="mt-2 pt-2 border-t border-slate-200/80 flex items-center justify-between gap-2 flex-wrap bg-white p-2.5 rounded-lg border">
                                  <div className="flex items-center gap-1.5">
                                    <span className={`px-2 py-0.5 rounded text-[10px] font-bold border ${statusMeta.badgeClass}`}>
                                      {statusMeta.label}
                                    </span>
                                    {!applyEligible.eligible && applyEligible.reason && (
                                      <span className="text-[11px] text-muted-foreground font-medium">
                                        • {applyEligible.reason}
                                      </span>
                                    )}
                                  </div>

                                  {applyEligible.eligible && (
                                    <button
                                      type="button"
                                      onClick={() =>
                                        setConfirmTaskSuggestion({
                                          activity: act,
                                          targetStatus: act.suggestedTaskStatus!,
                                        })
                                      }
                                      className="px-2.5 py-1 rounded-lg bg-slate-900 text-white text-[11px] font-bold hover:bg-slate-800 transition-colors shadow-sm"
                                    >
                                      Terapkan Status {act.suggestedTaskStatus}
                                    </button>
                                  )}
                                </div>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* Link Repository Modal */}
              {showLinkRepoModal && (
                <div className="fixed inset-0 z-[120] bg-slate-900/40 backdrop-blur-sm flex items-center justify-center p-4">
                  <div className="bg-white rounded-2xl max-w-sm w-full p-5 shadow-2xl space-y-4 animate-in fade-in">
                    <div className="flex items-center justify-between border-b border-border pb-3">
                      <h4 className="text-sm font-black text-foreground flex items-center gap-2">
                        <GitBranch size={16} />
                        <span>Hubungkan Repository</span>
                      </h4>
                      <button onClick={() => setShowLinkRepoModal(false)} className="text-slate-400 hover:text-slate-600">
                        <X size={16} />
                      </button>
                    </div>

                    <form onSubmit={handleLinkRepository} className="space-y-3">
                      <div>
                        <label className="text-xs font-bold text-slate-700 block mb-1">
                          Pilih Repository <span className="text-red-500">*</span>
                        </label>
                        <select
                          required
                          value={linkingRepoId}
                          onChange={(e) => setLinkingRepoId(e.target.value)}
                          className="w-full text-xs font-bold border border-slate-200 rounded-xl px-3 py-2 bg-slate-50 text-slate-800 focus:outline-none"
                        >
                          {projectRepos.length === 0 ? (
                            <option value="">Tidak ada repository pada project ini</option>
                          ) : (
                            projectRepos
                              .sort((a, b) => {
                                const aMatches = a.divisionId === selectedTask.divisionId;
                                const bMatches = b.divisionId === selectedTask.divisionId;
                                if (aMatches && !bMatches) return -1;
                                if (!aMatches && bMatches) return 1;
                                return a.fullName.localeCompare(b.fullName);
                              })
                              .map((r) => (
                                <option key={r.id} value={r.id}>
                                  {r.fullName} {r.divisionId === selectedTask.divisionId ? "(Divisi Sesuai)" : ""}
                                </option>
                              ))
                          )}
                        </select>
                      </div>

                      <div>
                        <label className="text-xs font-bold text-slate-700 block mb-1">
                          Nama Branch (Opsional)
                        </label>
                        <input
                          type="text"
                          placeholder="Contoh: feature/TASK-184-auth"
                          value={linkingBranchName}
                          onChange={(e) => setLinkingBranchName(e.target.value)}
                          className="w-full text-xs border border-slate-200 rounded-xl px-3 py-2 bg-slate-50 focus:outline-none"
                        />
                      </div>

                      <div className="flex items-center justify-end gap-2 pt-2 border-t border-border">
                        <button
                          type="button"
                          onClick={() => setShowLinkRepoModal(false)}
                          className="px-3 py-1.5 rounded-lg text-xs font-bold text-slate-600 hover:bg-slate-100"
                        >
                          Batal
                        </button>
                        <button
                          type="submit"
                          disabled={savingTaskLink || !linkingRepoId}
                          className="px-3.5 py-1.5 rounded-lg bg-primary text-white text-xs font-bold hover:bg-primary/90 transition-colors shadow-sm disabled:opacity-50"
                        >
                          {savingTaskLink ? "Menghubungkan..." : "Hubungkan"}
                        </button>
                      </div>
                    </form>
                  </div>
                </div>
              )}

              {/* Unlink Repository Confirmation Modal */}
              {unlinkingRepoConfirm && (
                <div className="fixed inset-0 z-[120] bg-slate-900/40 backdrop-blur-sm flex items-center justify-center p-4">
                  <div className="bg-white rounded-2xl max-w-xs w-full p-5 shadow-2xl text-center space-y-3 animate-in fade-in">
                    <div className="w-12 h-12 rounded-full bg-red-100 text-red-600 flex items-center justify-center mx-auto">
                      <AlertTriangle size={24} />
                    </div>
                    <h4 className="text-sm font-black text-foreground">Lepaskan Link Repository?</h4>
                    <p className="text-xs text-slate-600 leading-relaxed">
                      Link repository akan dilepas dari task. Riwayat aktivitas GitHub yang sudah tersimpan tidak akan dihapus.
                    </p>
                    <div className="flex items-center gap-2 pt-2">
                      <button
                        type="button"
                        onClick={() => setUnlinkingRepoConfirm(null)}
                        className="flex-1 py-2 rounded-xl text-xs font-bold text-slate-600 bg-slate-100 hover:bg-slate-200 transition-colors"
                      >
                        Batal
                      </button>
                      <button
                        type="button"
                        onClick={handleUnlinkRepository}
                        className="flex-1 py-2 rounded-xl text-xs font-bold text-white bg-red-600 hover:bg-red-700 transition-colors shadow-sm"
                      >
                        Lepas Link
                      </button>
                    </div>
                  </div>
                </div>
              )}

              {/* Human Confirmation Modal for Task Status Suggestion */}
              {confirmTaskSuggestion && (
                <div className="fixed inset-0 z-[120] bg-slate-900/40 backdrop-blur-sm flex items-center justify-center p-4">
                  <div className="bg-white rounded-2xl max-w-sm w-full p-5 shadow-2xl text-center space-y-3 animate-in fade-in">
                    <div className="w-12 h-12 rounded-full bg-blue-100 text-blue-600 flex items-center justify-center mx-auto">
                      <CheckCircle2 size={24} />
                    </div>
                    <h4 className="text-sm font-black text-foreground">
                      Terapkan Status {confirmTaskSuggestion.targetStatus}?
                    </h4>
                    <p className="text-xs text-muted-foreground leading-relaxed">
                      GitHub menyarankan status{" "}
                      <strong className="text-foreground">{confirmTaskSuggestion.targetStatus}</strong>{" "}
                      berdasarkan aktivitas pengembangan. Status task akan diperbarui menggunakan alur Task normal.
                    </p>
                    <div className="flex items-center gap-2 pt-2">
                      <button
                        type="button"
                        onClick={() => setConfirmTaskSuggestion(null)}
                        disabled={applyingTaskStatus}
                        className="flex-1 py-2 rounded-xl text-xs font-bold text-slate-600 bg-slate-100 hover:bg-slate-200 transition-colors"
                      >
                        Batal
                      </button>
                      <button
                        type="button"
                        onClick={handleApplyTaskSuggestion}
                        disabled={applyingTaskStatus}
                        className="flex-1 py-2 rounded-xl text-xs font-bold text-white bg-primary hover:bg-primary/90 transition-colors shadow-sm"
                      >
                        {applyingTaskStatus ? "Menerapkan..." : `Terapkan ${confirmTaskSuggestion.targetStatus}`}
                      </button>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ══ Add / Edit Task Modal ══ */}
      {(isAddTaskOpen || isEditModalOpen) && (
        <div className="fixed inset-0 z-[110] bg-slate-900/40 backdrop-blur-sm flex items-start justify-center pt-[6vh] p-4 sm:p-6">
          <div className="bg-white w-full max-w-[600px] max-h-[88vh] rounded-[20px] shadow-2xl flex flex-col overflow-hidden">
            <div className="p-5 border-b border-border bg-white flex items-center justify-between shrink-0">
              <div className="flex items-center gap-3">
                {isEditModalOpen ? <Edit2 className={accentText} size={24} /> : <Folder className="text-amber-400" size={24} fill="#FCD34D" />}
                <h2 className="text-lg font-black text-foreground">{isEditModalOpen ? "Edit Tugas" : "Tambah Tugas Baru"}</h2>
              </div>
              <button onClick={closeTaskEditor} className="w-8 h-8 rounded-full bg-slate-50 hover:bg-slate-100 text-slate-500 flex items-center justify-center transition-colors"><X size={18} /></button>
            </div>
            <div className="flex-1 overflow-y-auto p-6 flex flex-col gap-5">
              <div>
                <label className="text-sm font-bold text-slate-700 block mb-1.5">Judul Tugas <span className="text-red-500">*</span></label>
                <input
                  type="text"
                  value={taskForm.title}
                  onChange={(e) => setTaskForm((prev) => ({ ...prev, title: e.target.value }))}
                  placeholder="Contoh: Implementasi model training pipeline..."
                  className="w-full p-3 bg-white border border-slate-300 rounded-xl text-sm placeholder:text-slate-400 focus:ring-2 focus:ring-[#6C47FF]/20 focus:border-[#6C47FF] outline-none transition-all"
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-sm font-bold text-slate-700 block mb-1.5">Status</label>
                  <select
                    value={taskForm.status}
                    onChange={(e) => setTaskForm((prev) => ({ ...prev, status: e.target.value as BoardTask["status"] }))}
                    className="w-full p-3 bg-white border border-slate-300 rounded-xl text-sm font-medium focus:ring-2 focus:ring-[#6C47FF]/20 focus:border-[#6C47FF] outline-none transition-all"
                  >
                    <option value="TO DO">To Do</option>
                    <option value="DOING">Doing</option>
                    <option value="REVIEW">Review</option>
                    <option value="DONE">Done</option>
                  </select>
                </div>
                <div>
                  <label className="text-sm font-bold text-slate-700 block mb-1.5">Prioritas</label>
                  <select
                    value={taskForm.priority}
                    onChange={(e) => setTaskForm((prev) => ({ ...prev, priority: e.target.value }))}
                    className="w-full p-3 bg-white border border-slate-300 rounded-xl text-sm font-medium focus:ring-2 focus:ring-[#6C47FF]/20 focus:border-[#6C47FF] outline-none transition-all"
                  >
                    <option value="Tinggi">Tinggi</option>
                    <option value="Menengah">Menengah</option>
                    <option value="Rendah">Rendah</option>
                  </select>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-sm font-bold text-slate-700 block mb-1.5">
                    Divisi {divisions.filter((d) => d.isActive !== false).length > 0 && <span className="text-red-500">*</span>}
                  </label>
                  <select
                    value={taskForm.divisionId || ""}
                    onChange={(e) => setTaskForm((prev) => ({ ...prev, divisionId: e.target.value || null }))}
                    className="w-full p-3 bg-white border border-slate-300 rounded-xl text-sm font-medium focus:ring-2 focus:ring-[#6C47FF]/20 focus:border-[#6C47FF] outline-none transition-all"
                  >
                    {divisions.filter((d) => d.isActive !== false).length > 0 ? (
                      <option value="">-- Pilih Divisi --</option>
                    ) : (
                      <option value="">Tanpa Divisi</option>
                    )}
                    {divisions.map((d) => (
                      <option key={d.id} value={d.id}>
                        {d.name} {d.isActive === false ? "(Nonaktif)" : ""}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="text-sm font-bold text-slate-700 block mb-1.5">Ditugaskan ke</label>
                  <select
                    value={taskForm.assigneeId}
                    onChange={(e) => setTaskForm((prev) => ({ ...prev, assigneeId: e.target.value }))}
                    className="w-full p-3 bg-white border border-slate-300 rounded-xl text-sm font-medium focus:ring-2 focus:ring-[#6C47FF]/20 focus:border-[#6C47FF] outline-none transition-all"
                  >
                    <option value="">Belum ditentukan</option>
                    {teamMembers.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
                  </select>
                </div>
              </div>
              <div>
                <label className="text-sm font-bold text-slate-700 block mb-1.5">Deadline</label>
                <input
                  type="date"
                  value={taskForm.deadline}
                  onChange={(e) => setTaskForm((prev) => ({ ...prev, deadline: e.target.value }))}
                  className="w-full p-3 bg-white border border-slate-300 rounded-xl text-sm text-slate-700 focus:ring-2 focus:ring-[#6C47FF]/20 focus:border-[#6C47FF] outline-none transition-all cursor-pointer"
                />
              </div>
              <div>
                <label className="text-sm font-bold text-slate-700 block mb-1.5">Deskripsi Tugas</label>
                <textarea
                  value={taskForm.description}
                  onChange={(e) => setTaskForm((prev) => ({ ...prev, description: e.target.value }))}
                  placeholder="Jelaskan detail tugas yang harus dikerjakan..."
                  className="w-full p-3 bg-white border border-slate-300 rounded-xl text-sm placeholder:text-slate-400 focus:ring-2 focus:ring-[#6C47FF]/20 focus:border-[#6C47FF] outline-none min-h-[100px] resize-y transition-all"
                />
              </div>
              <div>
                <label className="text-sm font-bold text-slate-700 block mb-1.5">Sub-tugas / Checklist</label>
                <div className="flex flex-col gap-2">
                  {subtasks.map((value, idx) => (
                    <div key={idx} className="flex items-center gap-2">
                      <input
                        type="text"
                        value={value}
                        onChange={(e) => setSubtasks((prev) => prev.map((item, itemIndex) => itemIndex === idx ? e.target.value : item))}
                        placeholder={`Sub-tugas ${idx + 1}...`}
                        className="flex-1 p-3 bg-white border border-slate-300 rounded-xl text-sm placeholder:text-slate-400 focus:ring-2 focus:ring-[#6C47FF]/20 focus:border-[#6C47FF] outline-none transition-all"
                      />
                      <button onClick={() => removeSubtaskRow(idx)} className="w-11 h-11 shrink-0 rounded-xl bg-red-50 hover:bg-red-100 border border-red-100 text-red-500 flex items-center justify-center transition-colors"><X size={16} /></button>
                    </div>
                  ))}
                  <button onClick={addSubtaskRow} className="self-start mt-1 flex items-center gap-2 px-4 py-2 rounded-xl border-2 border-dashed border-slate-300 text-slate-500 text-sm font-bold hover:bg-slate-50 hover:border-[#6C47FF]/50 hover:text-[#6C47FF] transition-all">
                    <Plus size={14} strokeWidth={3} /> Tambah item checklist
                  </button>
                </div>
              </div>
            </div>
            <div className="p-5 border-t border-border bg-white flex items-center justify-end gap-3 shrink-0">
              <button onClick={closeTaskEditor} className="px-6 py-2.5 rounded-xl text-sm font-bold text-slate-600 bg-slate-100 hover:bg-slate-200 transition-colors">Batal</button>
              <button onClick={() => { void handleSaveTask(); }} className={`px-6 py-2.5 rounded-xl text-sm font-bold text-white ${accentBg} hover:opacity-90 shadow-sm transition-colors flex items-center gap-2`}>
                <Check size={16} strokeWidth={3} /> {isEditModalOpen ? "Simpan Perubahan" : "Buat Tugas"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ══ Edit Board Modal ══ */}
      {isEditBoardOpen && (
        <div className="fixed inset-0 z-[110] bg-slate-900/40 backdrop-blur-sm flex items-start justify-center pt-[6vh] p-4 sm:p-6">
          <div className="bg-white w-full max-w-[500px] max-h-[78vh] rounded-[20px] shadow-2xl flex flex-col overflow-hidden">
            <div className="flex items-center justify-between p-5 md:px-6 border-b border-border/50 bg-slate-50/50 shrink-0">
              <div className="flex items-center gap-3">
                <div className={`w-10 h-10 rounded-xl bg-[#F8F5FF] ${accentText} flex items-center justify-center shadow-sm`}><Edit2 size={20} strokeWidth={2.5} /></div>
                <div>
                  <h2 className="text-lg font-black text-foreground">Edit Detail Proyek</h2>
                  <p className="text-[11px] font-bold text-muted-foreground">Pengaturan informasi board</p>
                </div>
              </div>
              <button onClick={() => setIsEditBoardOpen(false)} className="w-8 h-8 rounded-full bg-slate-100 hover:bg-slate-200 flex items-center justify-center text-slate-500 transition-colors"><X size={16} strokeWidth={2.5} /></button>
            </div>
            <div className="flex-1 min-h-0 overflow-y-auto p-5 md:p-6 flex flex-col gap-5">
              <div className="flex flex-col gap-2">
                <label className="text-xs font-bold text-slate-700">Nama Proyek</label>
                <input
                  type="text"
                  value={boardForm.title}
                  onChange={(e) => setBoardForm((prev) => ({ ...prev, title: e.target.value }))}
                  className="w-full px-4 py-2.5 rounded-xl border border-border bg-white text-sm font-semibold focus:outline-none focus:ring-2 focus:ring-[#6C47FF]/20 focus:border-[#6C47FF] transition-all"
                />
              </div>
              <div className="flex flex-col gap-2">
                <label className="text-xs font-bold text-slate-700">Mitra / Organisasi</label>
                <input
                  type="text"
                  value={boardForm.mitra}
                  onChange={(e) => setBoardForm((prev) => ({ ...prev, mitra: e.target.value }))}
                  className="w-full px-4 py-2.5 rounded-xl border border-border bg-white text-sm font-semibold focus:outline-none focus:ring-2 focus:ring-[#6C47FF]/20 focus:border-[#6C47FF] transition-all"
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="flex flex-col gap-2">
                  <label className="text-xs font-bold text-slate-700">Ketua Tim</label>
                  <div className="w-full px-4 py-2.5 rounded-xl border border-border bg-slate-50 text-sm font-semibold text-slate-600">
                    {ketuaMember?.name || "Belum ditentukan"}
                  </div>
                </div>
                <div className="flex flex-col gap-2">
                  <label className="text-xs font-bold text-slate-700">Periode</label>
                  <input
                    type="text"
                    value={boardForm.period}
                    onChange={(e) => setBoardForm((prev) => ({ ...prev, period: e.target.value }))}
                    className="w-full px-4 py-2.5 rounded-xl border border-border bg-white text-sm font-semibold focus:outline-none focus:ring-2 focus:ring-[#6C47FF]/20 focus:border-[#6C47FF] transition-all"
                  />
                </div>
              </div>
              <div className="flex flex-col gap-2">
                <label className="text-xs font-bold text-slate-700">Anggota Tim</label>
                <div className="flex flex-col gap-2 rounded-xl border border-slate-200 bg-slate-50/60 p-2">
                  <div className="max-h-[210px] overflow-y-auto pr-1 flex flex-col gap-2">
                    {teamMembers.map((member, i) => (
                      <div key={member.id || i} className="flex items-center gap-2.5 px-3 py-2 rounded-xl bg-white border border-slate-200 group hover:border-[#6C47FF]/30 hover:bg-[#F8F5FF] transition-all">
                        <div className={`w-7 h-7 rounded-full flex items-center justify-center text-[10px] font-bold shrink-0 ${getAssigneeColor(member.initials)}`}>{member.initials}</div>
                        <div className="flex flex-col flex-1 min-w-0">
                          <span className="text-xs font-bold text-slate-800 truncate">{member.name}</span>
                          <select
                            value={member.role}
                            onChange={(e) => { void handleUpdateMemberRole(member, e.target.value); }}
                            className="mt-0.5 w-full max-w-[180px] bg-transparent text-[10px] font-bold text-slate-500 outline-none cursor-pointer"
                            title="Ubah peran anggota"
                          >
                            {(() => {
                              const activeDiv = divisions.find((d) => d.id === selectedDivisionId);
                              const divisionRoles = loadStoredDivisionRoles(
                                activeId,
                                selectedDivisionId !== "all" && selectedDivisionId !== "unassigned" ? selectedDivisionId : undefined
                              );
                              const combined = getCombinedMemberRoles(
                                member.memberType,
                                selectedDivisionId !== "all" && selectedDivisionId !== "unassigned" ? selectedDivisionId : null,
                                activeDiv?.name,
                                divisionRoles
                              );
                              const allOpts = Array.from(new Set([member.role, ...combined].filter(Boolean)));
                              return allOpts.map((role) => (
                                <option key={role} value={role}>{role}</option>
                              ));
                            })()}
                          </select>
                        </div>
                        <button
                          onClick={() => handleRemoveMember(member.id)}
                          className="text-slate-300 hover:text-red-500 opacity-0 group-hover:opacity-100 transition-all ml-1"
                        >
                          <X size={13} strokeWidth={3} />
                        </button>
                      </div>
                    ))}
                  </div>
                  <button
                    onClick={openAddMemberModal}
                    className="flex items-center gap-1.5 px-3 py-2 rounded-xl border border-dashed border-slate-300 bg-white text-xs font-bold text-slate-500 hover:text-[#6C47FF] hover:border-[#6C47FF] hover:bg-[#6C47FF]/5 transition-all"
                  >
                    <Plus size={12} strokeWidth={3} /> Tambah Anggota
                  </button>
                </div>
              </div>
            </div>
            <div className="p-5 md:px-6 border-t border-border/50 bg-slate-50/50 flex justify-end gap-3 shrink-0">
              <button onClick={() => setIsEditBoardOpen(false)} className="px-5 py-2.5 rounded-xl text-sm font-bold text-slate-600 bg-white border border-slate-200 hover:bg-slate-50 transition-colors">Batal</button>
              <button onClick={() => { void handleSaveBoardHeader(); }} className={`${accentBg} hover:opacity-90 text-white px-5 py-2.5 rounded-xl text-sm font-bold shadow-sm transition-all`}>Simpan Perubahan</button>
            </div>
          </div>
        </div>
      )}

      {/* ══ Milestone Modal ══ */}
      {isMilestoneOpen && (
        <div className="fixed inset-0 z-[120] bg-slate-900/40 backdrop-blur-sm flex items-start justify-center pt-[6vh] p-4 sm:p-6">
          <div className="bg-white w-full max-w-[520px] max-h-[88vh] rounded-[20px] shadow-2xl flex flex-col overflow-hidden">
            <div className="px-6 py-5 border-b border-border flex items-center justify-between shrink-0">
              <div>
                <h2 className="text-lg font-black text-foreground">Kelola Milestone</h2>
                <p className="text-xs text-muted-foreground font-medium mt-0.5">{project.shortTitle}</p>
              </div>
              <button onClick={() => { setIsMilestoneOpen(false); setEditingMsIndex(null); }} className="w-8 h-8 rounded-full bg-slate-50 hover:bg-slate-100 text-slate-500 flex items-center justify-center transition-colors"><X size={18} /></button>
            </div>
            <div className="px-6 py-4 bg-[#F8F5FF] border-b border-[#E9E0FF] shrink-0">
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-bold text-[#9E8BFF]">{milestones.filter(m => m.done).length} dari {milestones.length} milestone selesai</span>
                <span className={`text-sm font-black ${accentText}`}>{milestoneProgress}%</span>
              </div>
              <div className="w-full bg-[#E9E0FF] rounded-full h-2">
                <div className={`${accentBg} h-2 rounded-full transition-all duration-500`} style={{ width: `${milestoneProgress}%` }} />
              </div>
              {activeMsLabel !== "Semua Selesai ✓" && (
                <p className="text-[11px] font-medium text-[#9E8BFF] mt-1.5">Aktif: <span className={`font-black ${accentText}`}>{activeMsLabel}</span></p>
              )}
            </div>
            <div className="flex-1 overflow-y-auto p-6 flex flex-col gap-2">
              {milestones.length === 0 && <div className="text-center py-10 text-muted-foreground text-sm font-medium">Belum ada milestone. Tambahkan di bawah.</div>}
              {milestones.map((m, i) => (
                <div key={i} className={`flex items-center gap-3 p-3 rounded-xl border transition-all ${m.done ? "bg-[#F8F5FF] border-[#E9E0FF]" : "bg-white border-border hover:border-slate-200"}`}>
                  <span className="text-[10px] font-black text-muted-foreground w-4 text-center shrink-0">{i + 1}</span>
                  <button
                    onClick={() => toggleMilestone(i)}
                    className={`w-6 h-6 rounded-full border-2 flex items-center justify-center shrink-0 transition-all hover:scale-110 ${m.done ? `${project.progressColor} border-transparent text-white` : "bg-white border-slate-300 hover:border-[#6C47FF]"}`}
                  >
                    {m.done && <svg viewBox="0 0 12 12" className="w-2.5 h-2.5"><path d="M1 6l3.5 3.5L11 2" stroke="white" strokeWidth="2.5" fill="none" strokeLinecap="round" strokeLinejoin="round" /></svg>}
                  </button>
                  {editingMsIndex === i ? (
                    <input
                      autoFocus
                      value={editingMsLabel}
                      onChange={(e) => setEditingMsLabel(e.target.value)}
                      onBlur={async () => {
                        if (editingMsLabel.trim()) {
                          await renameMilestone(i, editingMsLabel);
                        }
                        setEditingMsIndex(null);
                      }}
                      onKeyDown={async (e) => {
                        if (e.key === "Enter") {
                          if (editingMsLabel.trim()) {
                            await renameMilestone(i, editingMsLabel);
                          }
                          setEditingMsIndex(null);
                        }
                        if (e.key === "Escape") setEditingMsIndex(null);
                      }}
                      className="flex-1 text-sm font-bold bg-white border border-[#6C47FF] rounded-lg px-2.5 py-1 focus:outline-none focus:ring-2 focus:ring-[#6C47FF]/20"
                    />
                  ) : (
                    <span
                      className={`flex-1 text-sm font-bold cursor-pointer hover:text-[#6C47FF] transition-colors ${m.done ? "text-[#9E8BFF] line-through decoration-[#C5AEFF]" : "text-foreground"}`}
                      onDoubleClick={() => { setEditingMsIndex(i); setEditingMsLabel(m.label); }}
                      title="Double-click untuk ubah nama"
                    >{m.label}</span>
                  )}
                  <div className="flex items-center gap-0.5 shrink-0">
                    <button onClick={() => { setEditingMsIndex(i); setEditingMsLabel(m.label); }} className="w-7 h-7 rounded-lg flex items-center justify-center text-slate-400 hover:text-[#6C47FF] hover:bg-[#F8F5FF] transition-all"><Edit2 size={12} /></button>
                    <button onClick={() => removeMilestone(i)} className="w-7 h-7 rounded-lg flex items-center justify-center text-slate-400 hover:text-red-500 hover:bg-red-50 transition-all"><Trash2 size={12} /></button>
                  </div>
                </div>
              ))}
            </div>
            <div className="px-6 py-4 border-t border-border shrink-0 bg-slate-50/50">
              <p className="text-[10px] font-black text-muted-foreground uppercase tracking-widest mb-2">Tambah Milestone Baru</p>
              <div className="flex gap-2">
                <input
                  type="text"
                  value={newMilestoneLabel}
                  onChange={(e) => setNewMilestoneLabel(e.target.value)}
                  onKeyDown={(e) => { if (e.key === "Enter" && newMilestoneLabel.trim()) addMilestone(); }}
                  placeholder="Contoh: Uji Lapangan, Revisi Jurnal..."
                  className="flex-1 px-3 py-2.5 border border-border rounded-xl text-sm placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-[#6C47FF]/20 focus:border-[#6C47FF] transition-all bg-white"
                />
                <button onClick={addMilestone} disabled={!newMilestoneLabel.trim()} className={`flex items-center gap-1.5 px-4 py-2.5 ${accentBg} hover:opacity-90 disabled:opacity-40 disabled:cursor-not-allowed text-white rounded-xl text-sm font-bold transition-all shrink-0`}>
                  <Plus size={16} strokeWidth={3} /> Tambah
                </button>
              </div>
              <p className="text-[10px] text-muted-foreground mt-2">💡 Klik lingkaran untuk toggle · Double-click nama untuk ubah</p>
            </div>
          </div>
        </div>
      )}

      {/* ══ Add Member Modal ══ */}
      {isAddMemberOpen && (
        <div className="fixed inset-0 z-[130] bg-slate-900/40 backdrop-blur-sm flex items-start justify-center pt-[10vh] p-4 sm:p-6" onClick={() => setIsAddMemberOpen(false)}>
          <div className="bg-white w-full max-w-[480px] max-h-[80vh] rounded-[20px] shadow-2xl flex flex-col overflow-hidden" onClick={e => e.stopPropagation()}>
            <div className="px-6 py-5 border-b border-border flex items-center justify-between shrink-0">
              <div>
                <h2 className="text-lg font-black text-foreground">Tambah Anggota Tim</h2>
                <p className="text-[11px] font-bold text-muted-foreground">{project.shortTitle}</p>
              </div>
              <button onClick={() => setIsAddMemberOpen(false)} className="w-8 h-8 rounded-full bg-slate-100 hover:bg-slate-200 flex items-center justify-center text-slate-500 transition-colors"><X size={16} strokeWidth={2.5} /></button>
            </div>
            <div className="p-5 md:p-6 flex flex-col gap-4 overflow-y-auto">
              {/* Role Selection */}
              <div className="flex flex-col gap-2">
                <label className="text-xs font-bold text-slate-700">Peran</label>
                <select
                  value={newMemberPeran}
                  onChange={e => setNewMemberPeran(e.target.value)}
                  className="w-full px-4 py-2.5 rounded-xl border border-border bg-white text-sm font-semibold focus:outline-none focus:ring-2 focus:ring-[#6C47FF]/20 focus:border-[#6C47FF] transition-all"
                >
                  {(() => {
                    const hasKetua = teamMembers.some(m => m.role.toLowerCase().includes("ketua"));
                    const selectedCandidate = availableCandidates.find(c => c.user_id === selectedCandidateId);
                    const activeDiv = divisions.find((d) => d.id === selectedDivisionId);
                    const divisionRoles = loadStoredDivisionRoles(
                      activeId,
                      selectedDivisionId !== "all" && selectedDivisionId !== "unassigned" ? selectedDivisionId : undefined
                    );
                    const roleOptions = selectedCandidate
                      ? getCombinedMemberRoles(
                          selectedCandidate.member_type,
                          selectedDivisionId !== "all" && selectedDivisionId !== "unassigned" ? selectedDivisionId : null,
                          activeDiv?.name,
                          divisionRoles
                        )
                      : Array.from(new Set([...MAHASISWA_RESEARCH_ROLES, ...DOSEN_RESEARCH_ROLES]));
                    
                    const filteredRoles = roleOptions.filter(role => {
                      if (role === "Ketua") {
                        return !hasKetua && selectedCandidate?.member_type === "Dosen";
                      }
                      return true;
                    });

                    return filteredRoles.map(p => <option key={p}>{p}</option>);
                  })()}
                </select>
                {teamMembers.some(m => m.role.toLowerCase().includes("ketua")) && (
                  <p className="text-[10px] text-amber-600 font-medium">⚠️ Ketua sudah ditentukan. Hanya bisa diubah, tidak bisa menambah Ketua baru.</p>
                )}
                {selectedCandidateId && availableCandidates.find(c => c.user_id === selectedCandidateId)?.member_type === "Mahasiswa" && (
                  <p className="text-[10px] text-emerald-600 font-medium">Mahasiswa bisa memakai peran Mahasiswa Ketua Riset untuk akses kelola board dari backend.</p>
                )}
              </div>

              {/* Candidate List */}
              <div className="flex flex-col gap-2">
                <label className="text-xs font-bold text-slate-700">Pilih Anggota</label>
                <div className="flex items-center gap-2 rounded-xl border border-border bg-white px-3 py-2.5 focus-within:border-[#6C47FF] focus-within:ring-2 focus-within:ring-[#6C47FF]/20">
                  <Search size={15} className="shrink-0 text-slate-400" />
                  <input
                    value={memberSearch}
                    onChange={(e) => setMemberSearch(e.target.value)}
                    placeholder="Cari nama, inisial, atau tipe anggota..."
                    className="w-full bg-transparent text-sm font-semibold text-slate-800 outline-none placeholder:text-slate-400"
                  />
                  {memberSearch && (
                    <button
                      type="button"
                      onClick={() => setMemberSearch("")}
                      className="shrink-0 text-slate-400 hover:text-slate-600"
                      title="Bersihkan pencarian"
                    >
                      <X size={14} strokeWidth={2.5} />
                    </button>
                  )}
                </div>
                {loadingCandidates ? (
                  <div className="text-center py-6 text-sm text-muted-foreground">Memuat kandidat...</div>
                ) : availableCandidates.length === 0 ? (
                  <div className="text-center py-6 text-sm text-muted-foreground">Semua user sudah menjadi anggota</div>
                ) : filteredAvailableCandidates.length === 0 ? (
                  <div className="text-center py-6 text-sm text-muted-foreground">Tidak ada kandidat yang cocok dengan pencarian.</div>
                ) : (
                  <div className="flex flex-col gap-2 max-h-[300px] overflow-y-auto">
                    {filteredAvailableCandidates.map((candidate) => {
                      const isSelected = selectedCandidateId === candidate.user_id;
                      return (
                        <label
                          key={candidate.user_id}
                          onClick={() => {
                            setSelectedCandidateId(candidate.user_id);
                            setNewMemberPeran(getResearchRoleOptions(candidate.member_type)[0] || "Anggota");
                          }}
                          className={`flex items-center gap-3 p-3 rounded-xl border cursor-pointer transition-all ${
                            isSelected
                              ? "border-[#6C47FF] bg-[#F8F5FF]"
                              : "border-slate-200 bg-white hover:border-slate-300 hover:bg-slate-50"
                          }`}
                        >
                          <input
                            type="radio"
                            name="candidate-selection"
                            checked={isSelected}
                            onChange={() => {
                              setSelectedCandidateId(candidate.user_id);
                              setNewMemberPeran(getResearchRoleOptions(candidate.member_type)[0] || "Anggota");
                            }}
                            className="accent-[#6C47FF] shrink-0"
                          />
                          <div className={`w-8 h-8 rounded-full flex items-center justify-center text-[10px] font-bold shrink-0 ${
                            candidate.member_type === "Dosen" ? "bg-blue-500 text-white" : "bg-emerald-500 text-white"
                          }`}>
                            {candidate.initials}
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-bold text-slate-800 truncate">{candidate.name}</p>
                            <span className={`text-[10px] font-black px-2 py-0.5 rounded-full ${
                              candidate.member_type === "Dosen" ? "bg-blue-100 text-blue-700" : "bg-emerald-100 text-emerald-700"
                            }`}>
                              {candidate.member_type}
                            </span>
                          </div>
                        </label>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>
            <div className="p-5 md:px-6 border-t border-border/50 bg-slate-50/50 flex justify-end gap-3">
              <button
                onClick={() => setIsAddMemberOpen(false)}
                className="px-5 py-2.5 rounded-xl text-sm font-bold text-slate-600 bg-white border border-slate-200 hover:bg-slate-50 transition-colors"
              >
                Batal
              </button>
              <button
                onClick={handleAddMembers}
                disabled={!selectedCandidateId}
                className={`${accentBg} hover:opacity-90 disabled:opacity-40 disabled:cursor-not-allowed text-white px-5 py-2.5 rounded-xl text-sm font-bold shadow-sm transition-all`}
              >
                Tambahkan
              </button>
            </div>
          </div>
        </div>
      )}
      {confirmDialog}
    </>
  );
}
