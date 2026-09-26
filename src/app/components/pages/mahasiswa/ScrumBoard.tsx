import React, { useState, useEffect, useMemo } from "react";
import { useNavigate, useParams } from "react-router";
import { Layout } from "../../templates/Layout";
import {
  Kanban,
  CheckCircle2,
  Clock,
  Zap,
  AlertTriangle,
  FileText,
  Paperclip,
  CheckSquare,
  Square,
  ArrowRight,
  ExternalLink,
  ChevronRight,
  Calendar,
  Layers,
  Upload,
  MessageSquare,
  Sparkles,
  X,
  Plus,
  AlertCircle,
  Lock,
  Link as LinkIcon,
  GitBranch,
  Edit2,
  Trash2,
  Send,
  Copy,
  Check
} from "lucide-react";
import { apiDelete, apiGet, apiPatch, apiPost, getStoredUser, resolveApiAssetUrl } from "../../../lib/api";
import { formatDateReadable } from "../../../lib/date";
import {
  ProjectDivision,
  getDivisionTabs,
  normalizeDivisionItem,
  normalizeTaskDivisionFields
} from "../../../lib/scrum";
import { isMahasiswaKetuaRiset, MAHASISWA_LEADER_ROLE } from "../../../lib/researchRoles";
import { getSprintTimingState } from "../../../lib/sprintDuration";
import {
  GitHubRepository,
  normalizeGitHubRepository,
  isValidGitHubUrl,
  generateBranchTemplate
} from "../../../lib/githubIntegration";
import { getTaskDescriptionPreview } from "../../../lib/taskDescription";
import { RichTaskDescription } from "../../molecules/RichTaskDescription";
import { ProjectMembersView } from "../../organisms/ProjectMembersView";

interface ScrumTask {
  id: string;
  projectId: string;
  projectTitle: string;
  title: string;
  description: string;
  status: "TO DO" | "DOING" | "REVIEW" | "DONE";
  deadline?: string;
  priority?: string;
  tag?: string;
  progress: number;
  sprintId?: string | null;
  sprintName?: string;
  sprintStatus?: string;
  divisionId?: string | null;
  divisionName?: string | null;
  divisionIsActive?: boolean | null;
  storyPoints: number;
  assignees?: string[];
  assigneeUserIds?: string[];
  taskKey?: string;
  commentsCount?: number;
  subtasks: Array<{
    id: string;
    title: string;
    done: boolean;
  }>;
  attachments: Array<{
    id: string;
    file_url?: string;
    fileUrl?: string;
    file_name?: string;
    fileName?: string;
    file_size?: number;
    mime_type?: string;
  }>;
}

interface ResearchProjectInfo {
  id: string;
  title: string;
  short_title?: string;
  supervisor_id?: string;
  supervisor_name?: string;
  supervisor_initials?: string;
  period_text?: string;
  mitra?: string;
  status: string;
  progress?: number;
  category?: string;
  description?: string;
  research_type?: string;
  agreement_type?: string;
  agreement_start_date?: string;
  agreement_end_date?: string;
  agreement_file_url?: string;
  proposal_file_url?: string;
  rab_file_url?: string;
  attachment_link?: string;
  my_peran?: string;
}

interface TeamMember {
  id: string;
  name: string;
  initials: string;
  role: string;
  memberType: "Mahasiswa" | "Dosen" | string;
  color: string;
  status?: string;
  mahasiswaTipe?: string;
}

function formatBoardDateRange(start?: string | null, end?: string | null) {
  if (!start && !end) return "Periode belum ditentukan";
  if (start && end) return `${formatDateReadable(start)} – ${formatDateReadable(end)}`;
  if (start) return `Mulai ${formatDateReadable(start)}`;
  return `Sampai ${formatDateReadable(end)}`;
}

function BoardDocumentLink({ label, url }: { label: string; url?: string | null }) {
  const safeUrl = resolveApiAssetUrl(url);
  if (!safeUrl) {
    return (
      <div className="rounded-xl border border-[#D8F5D0] bg-white px-3 py-2 shadow-sm opacity-60">
        <span className="text-[10px] font-black uppercase tracking-wider text-slate-400">{label}</span>
        <p className="mt-1 text-xs font-semibold text-slate-400">Belum diunggah</p>
      </div>
    );
  }

  return (
    <a
      href={safeUrl}
      target="_blank"
      rel="noopener noreferrer"
      className="rounded-xl border border-[#D8F5D0] bg-white px-3 py-2 shadow-sm transition-all hover:border-[#0AB600] hover:bg-[#F0FFF0] block group"
    >
      <span className="text-[10px] font-black uppercase tracking-wider text-[#5CC444]">{label}</span>
      <p className="mt-1 text-xs font-bold text-[#0AB600] flex items-center gap-1">
        <span>Buka Dokumen</span>
        <ExternalLink size={12} />
      </p>
    </a>
  );
}

function MilestoneBanner({
  milestones,
  progressColor = "bg-[#0AB600]",
  editable = false,
  onToggle,
  onManage
}: {
  milestones: Array<{ id?: number; label: string; done: boolean }>;
  progressColor?: string;
  editable?: boolean;
  onToggle?: (i: number) => void;
  onManage?: () => void;
}) {
  if (milestones.length === 0) {
    return <p className="text-xs text-muted-foreground italic py-1">Belum ada milestone tercatat.</p>;
  }

  return (
    <div className="flex items-end gap-0 w-full overflow-x-auto py-2 group/banner">
      {milestones.map((m, i, arr) => (
        <div key={i} className="contents">
          <div className="flex flex-col items-center gap-1.5 shrink-0">
            <button
              type="button"
              disabled={!editable}
              onClick={() => onToggle && onToggle(i)}
              title={editable ? (m.done ? `Tandai "${m.label}" belum selesai` : `Tandai "${m.label}" selesai`) : undefined}
              className={`w-6 h-6 rounded-full flex items-center justify-center border-2 transition-all ${
                editable ? "hover:scale-110 cursor-pointer" : "cursor-default"
              } ${
                m.done
                  ? `${progressColor} border-transparent text-white`
                  : "bg-white border-[#A8E895] text-slate-400"
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
            <span className={`text-[9px] font-bold whitespace-nowrap ${m.done ? "text-[#0AB600]" : "text-[#5CC444]/70"}`}>
              {m.label}
            </span>
          </div>
          {i < arr.length - 1 && (
            <div
              className={`h-0.5 flex-1 min-w-[20px] mx-1 mb-4 ${
                m.done && arr[i + 1]?.done
                  ? progressColor
                  : m.done
                    ? `${progressColor} opacity-30`
                    : "bg-[#D8F5D0]"
              }`}
            />
          )}
        </div>
      ))}
      {editable && onManage && (
        <button
          type="button"
          onClick={onManage}
          className="ml-3 mb-4 shrink-0 flex items-center gap-1 px-2.5 py-1 bg-white border border-[#D8F5D0] hover:border-[#0AB600] hover:bg-[#F0FFF0] rounded-lg text-[10px] font-black text-[#4AB834] hover:text-[#0AB600] transition-all opacity-0 group-hover/banner:opacity-100 shadow-sm whitespace-nowrap"
        >
          <Edit2 size={10} strokeWidth={3} />
          <span>Kelola</span>
        </button>
      )}
    </div>
  );
}

function MilestoneBannerReadonly(props: {
  milestones: Array<{ id?: number; label: string; done: boolean }>;
  progressColor?: string;
}) {
  return <MilestoneBanner {...props} editable={false} />;
}

export default function ScrumBoard() {
  const navigate = useNavigate();
  const { researchId } = useParams();
  const currentUser = getStoredUser();

  const [projects, setProjects] = useState<ResearchProjectInfo[]>([]);
  const [selectedProjectFilter, setSelectedProjectFilter] = useState<string>(researchId || "all");
  const [tasks, setTasks] = useState<ScrumTask[]>([]);
  const [divisions, setDivisions] = useState<ProjectDivision[]>([]);
  const [teamMembers, setTeamMembers] = useState<TeamMember[]>([]);
  const [milestones, setMilestones] = useState<Array<{ id?: number; label: string; done: boolean }>>([]);
  const [repositories, setRepositories] = useState<GitHubRepository[]>([]);
  const [activeSprint, setActiveSprint] = useState<any>(null);
  const [reviewSprint, setReviewSprint] = useState<any>(null);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [selectedTask, setSelectedTask] = useState<ScrumTask | null>(null);
  const [selectedDivisionFilter, setSelectedDivisionFilter] = useState<string>("all");
  const [boardSprintScope, setBoardSprintScope] = useState<"active_sprint" | "all">("active_sprint");
  const [onlyMyTasks, setOnlyMyTasks] = useState(false);

  const [movingTaskId, setMovingTaskId] = useState<string | null>(null);
  const [uploadingAttachment, setUploadingAttachment] = useState(false);

  // Edit Board (Research Metadata) modal state
  const [isEditBoardOpen, setIsEditBoardOpen] = useState(false);
  const [boardForm, setBoardForm] = useState({
    title: "",
    mitra: "",
    period: "",
    description: ""
  });
  const [isSavingBoard, setIsSavingBoard] = useState(false);

  // Milestone management modal state
  const [isMilestoneOpen, setIsMilestoneOpen] = useState(false);
  const [newMilestoneLabel, setNewMilestoneLabel] = useState("");
  const [editingMsIndex, setEditingMsIndex] = useState<number | null>(null);
  const [editingMsLabel, setEditingMsLabel] = useState("");

  // External attachment link edit state
  const [isEditingAttachment, setIsEditingAttachment] = useState(false);
  const [attachmentLinkInput, setAttachmentLinkInput] = useState("");
  const [savingAttachment, setSavingAttachment] = useState(false);

  // Drag and drop state
  const [draggedTask, setDraggedTask] = useState<{ taskId: string; fromColumn: string } | null>(null);
  const [dragOverColumn, setDragOverColumn] = useState<string | null>(null);

  // Task detail modal tabs & comments state
  const [detailModalTab, setDetailModalTab] = useState<"detail" | "komentar" | "git">("detail");
  const [taskComments, setTaskComments] = useState<any[]>([]);
  const [taskCommentsLoading, setTaskCommentsLoading] = useState(false);
  const [newCommentText, setNewCommentText] = useState("");
  const [isSendingComment, setIsSendingComment] = useState(false);
  const [copiedBranchTemplate, setCopiedBranchTemplate] = useState(false);

  // Add task modal state (for Mahasiswa Ketua Riset)
  const [isAddTaskOpen, setIsAddTaskOpen] = useState(false);
  const [newTaskTitle, setNewTaskTitle] = useState("");
  const [newTaskDivisionId, setNewTaskDivisionId] = useState("");
  const [newTaskSprintId, setNewTaskSprintId] = useState("");
  const [newTaskStoryPoints, setNewTaskStoryPoints] = useState(3);
  const [newTaskAssignees, setNewTaskAssignees] = useState<string[]>([]);
  const [newTaskPriority, setNewTaskPriority] = useState("Sedang");
  const [newTaskDescription, setNewTaskDescription] = useState("");
  const [newTaskSubtasks, setNewTaskSubtasks] = useState<string[]>([]);
  const [newTaskSubtaskInput, setNewTaskSubtaskInput] = useState("");
  const [isCreatingTask, setIsCreatingTask] = useState(false);

  // Load student's assigned projects
  useEffect(() => {
    const loadProjects = async () => {
      try {
        const data = await apiGet<ResearchProjectInfo[]>(
          currentUser?.id
            ? `/research/assigned?userId=${encodeURIComponent(currentUser.id)}`
            : "/research"
        );
        const list = data || [];
        setProjects(list);

        if (researchId && list.some((p) => p.id === researchId)) {
          setSelectedProjectFilter(researchId);
        } else if (selectedProjectFilter === "all" && list.length === 1) {
          setSelectedProjectFilter(list[0].id);
        }
      } catch {
        // Fallback silently
      }
    };
    loadProjects();
  }, [currentUser?.id, researchId]);

  // Selected project object
  const currentProject = useMemo(() => {
    return projects.find((p) => p.id === selectedProjectFilter) || null;
  }, [projects, selectedProjectFilter]);

  // Determine if current user is Mahasiswa Ketua Riset
  const isLeader = useMemo(() => {
    if (!currentUser) return false;
    return isMahasiswaKetuaRiset(currentUser, teamMembers);
  }, [currentUser, teamMembers]);

  // Access rights for managing research metadata: Ketua Riset, Dosen, and Admin (Operator)
  const canManageMetadata = currentUser?.role === "operator" || currentUser?.role === "dosen" || isLeader;

  // Load project-specific details (sprints, members, milestones, repositories, divisions)
  useEffect(() => {
    if (!selectedProjectFilter || selectedProjectFilter === "all") {
      setDivisions([]);
      setTeamMembers([]);
      setMilestones([]);
      setRepositories([]);
      setActiveSprint(null);
      setReviewSprint(null);
      return;
    }

    const activeProjectId = selectedProjectFilter;

    // Load Sprints
    apiGet<any[]>(`/research/${activeProjectId}/sprints`)
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

    // Load Divisions
    apiGet<any[]>(`/research/${activeProjectId}/divisions`)
      .then((data) => setDivisions((data || []).map(normalizeDivisionItem)))
      .catch(() => setDivisions([]));

    // Load Members
    apiGet<any[]>(`/research/${activeProjectId}/members`)
      .then((data) => {
        const mapped: TeamMember[] = (data || []).map((m: any, idx: number) => ({
          id: String(m?.user_id || m?.userId || m?.id || ""),
          name: m?.name || "Anggota Tim",
          initials: m?.initials || m?.name?.slice(0, 2)?.toUpperCase() || "TM",
          role: m?.peran || m?.role || m?.member_type || "Anggota",
          memberType: m?.member_type || m?.memberType || "Mahasiswa",
          status: m?.student_status || m?.status || "Aktif",
          mahasiswaTipe: m?.mahasiswa_tipe || "Riset",
          color: m?.member_type === "Dosen" ? "bg-blue-500 text-white" : idx % 2 === 0 ? "bg-[#8B6FFF] text-white" : "bg-emerald-500 text-white"
        }));
        setTeamMembers(mapped);
      })
      .catch(() => setTeamMembers([]));

    // Load Milestones
    apiGet<any[]>(`/research/${activeProjectId}/milestones`)
      .then((data) => {
        setMilestones((data || []).map((m: any) => ({
          id: m.id,
          label: m.label,
          done: Boolean(m.done)
        })));
      })
      .catch(() => setMilestones([]));

    // Load Repositories
    apiGet<{ repositories?: any[] } | any[]>(`/research/${activeProjectId}/repositories`)
      .then((res) => {
        const raw = Array.isArray(res) ? res : Array.isArray((res as any)?.repositories) ? (res as any).repositories : [];
        setRepositories(raw.map(normalizeGitHubRepository));
      })
      .catch(() => setRepositories([]));

    setSelectedDivisionFilter("all");
  }, [selectedProjectFilter]);

  // Load tasks
  const loadTasks = async () => {
    setLoading(true);
    setError("");
    try {
      if (selectedProjectFilter && selectedProjectFilter !== "all") {
        try {
          const boardData = await apiGet<any>(`/research/${selectedProjectFilter}/board`);
          const columns = boardData?.columns || {};
          const rawTasks = [
            ...(columns.todo || []),
            ...(columns.doing || []),
            ...(columns.review || []),
            ...(columns.done || [])
          ];

          if (rawTasks.length > 0 || boardData?.permissions) {
            const mapped: ScrumTask[] = rawTasks.map((item) => {
              const norm = normalizeTaskDivisionFields(item);
              const assignees = Array.isArray(item?.assignees)
                ? item.assignees.map((a: any) => a?.name || a?.initials || String(a))
                : [];
              const assigneeUserIds = Array.isArray(item?.assignee_ids || item?.assigneeIds)
                ? (item.assignee_ids || item.assigneeIds).map((v: any) => String(v))
                : Array.isArray(item?.assignees)
                  ? item.assignees.map((a: any) => String(a?.user_id || a?.userId || "")).filter(Boolean)
                  : [];

              const taskKey = item.taskKey || item.task_key || (item.id ? `TASK-${item.id}` : undefined);
              const commentsCount = Number(item.commentsCount ?? item.comments_count ?? (Array.isArray(item.comments) ? item.comments.length : 0));

              return {
                id: String(item.id),
                projectId: selectedProjectFilter,
                projectTitle: currentProject?.title || "Riset",
                title: item.title || "Tugas",
                description: item.description || "",
                status: item.status || "TO DO",
                deadline: item.deadline,
                priority: item.priority || "Sedang",
                tag: item.tag,
                progress: Number(item.progress) || 0,
                sprintId: norm.sprintId,
                sprintName: item.sprintName || item.sprint_name,
                divisionId: norm.divisionId,
                divisionName: norm.divisionName,
                divisionIsActive: norm.divisionIsActive,
                storyPoints: norm.storyPoints ?? item.storyPoints ?? item.story_points ?? item.sp ?? 0,
                assignees,
                assigneeUserIds,
                taskKey,
                commentsCount,
                subtasks: item.subtasks || [],
                attachments: item.attachments || []
              };
            });

            setTasks(mapped);
            setLoading(false);
            return;
          }
        } catch {
          // Fallback to my-scrum-tasks if board endpoint fails
        }
      }

      // Default / fallback: load student's assigned scrum tasks
      const data = await apiGet<any[]>("/research/my-scrum-tasks");
      const mapped: ScrumTask[] = (data || []).map((item) => {
        const norm = normalizeTaskDivisionFields(item);
        const taskKey = item.taskKey || item.task_key || (item.id ? `TASK-${item.id}` : undefined);
        const commentsCount = Number(item.commentsCount ?? item.comments_count ?? (Array.isArray(item.comments) ? item.comments.length : 0));
        return {
          ...item,
          divisionId: norm.divisionId,
          divisionName: norm.divisionName,
          divisionIsActive: norm.divisionIsActive,
          sprintId: norm.sprintId,
          storyPoints: norm.storyPoints ?? item.storyPoints ?? item.story_points ?? item.sp ?? 0,
          taskKey,
          commentsCount,
          subtasks: item.subtasks || [],
          attachments: item.attachments || []
        };
      });
      setTasks(mapped);
    } catch (err: any) {
      setError(err?.message || "Gagal memuat tugas Scrum.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadTasks();
  }, [selectedProjectFilter, currentProject?.title]);

  // Filter tasks based on project, sprint scope, division, and "Tugas Saya Saja"
  const filteredTasks = useMemo(() => {
    let list = tasks;

    // Filter by project
    if (selectedProjectFilter !== "all") {
      list = list.filter((t) => t.projectId === selectedProjectFilter);
    }

    // Filter by sprint scope
    if (boardSprintScope === "active_sprint" && activeSprint) {
      list = list.filter((t) => t.sprintId === activeSprint.id);
    }

    // Filter by division
    if (selectedDivisionFilter !== "all") {
      if (selectedDivisionFilter === "unassigned") {
        list = list.filter((t) => !t.divisionId);
      } else {
        list = list.filter((t) => t.divisionId === selectedDivisionFilter);
      }
    }

    // Filter by "Tugas Saya Saja"
    if (onlyMyTasks && currentUser) {
      const myId = String(currentUser.id || currentUser.userId || "");
      const myName = String(currentUser.name || "").toLowerCase();
      list = list.filter((t) => {
        if (t.assigneeUserIds && t.assigneeUserIds.includes(myId)) return true;
        if (t.assignees && t.assignees.some((a) => a.toLowerCase().includes(myName))) return true;
        return false;
      });
    }

    return list;
  }, [tasks, selectedProjectFilter, boardSprintScope, activeSprint, selectedDivisionFilter, onlyMyTasks, currentUser]);

  // Project switcher options
  const projectOptions = useMemo(() => {
    if (projects.length > 0) {
      return projects.map((p) => ({ id: p.id, title: p.short_title || p.title }));
    }
    return Array.from(
      new Map(tasks.map((t) => [t.projectId, { id: t.projectId, title: t.projectTitle }])).values()
    );
  }, [projects, tasks]);

  // Dynamic division tabs
  const divisionTabs = useMemo(() => {
    if (selectedProjectFilter === "all") {
      return [{ id: "all", label: "Semua Divisi", count: tasks.length }];
    }
    const projectTasks = tasks.filter((t) => t.projectId === selectedProjectFilter);
    return getDivisionTabs(projectTasks, divisions);
  }, [selectedProjectFilter, tasks, divisions]);

  // Stats calculation
  const totalTasks = filteredTasks.length;
  const completedTasks = filteredTasks.filter((t) => t.status === "DONE").length;
  const inProgressTasks = filteredTasks.filter((t) => t.status === "DOING").length;
  const totalPoints = filteredTasks.reduce((acc, t) => acc + (t.storyPoints || 0), 0);
  const completedPoints = filteredTasks
    .filter((t) => t.status === "DONE")
    .reduce((acc, t) => acc + (t.storyPoints || 0), 0);
  const progressPercent = totalTasks > 0 ? Math.round((completedTasks / totalTasks) * 100) : 0;

  // Active tasks outside active sprint
  const unassignedActiveTasks = useMemo(() => {
    if (!activeSprint || selectedProjectFilter === "all") return [];
    return tasks.filter(
      (t) =>
        t.projectId === selectedProjectFilter &&
        (!t.sprintId || t.sprintId !== activeSprint.id) &&
        (t.status === "DOING" || t.status === "REVIEW")
    );
  }, [tasks, activeSprint, selectedProjectFilter]);

  // Columns
  const columns: Array<{
    id: ScrumTask["status"];
    title: string;
    bg: string;
    border: string;
    badge: string;
    iconColor: string;
  }> = [
    {
      id: "TO DO",
      title: "TO DO",
      bg: "bg-slate-50/80",
      border: "border-slate-200",
      badge: "bg-slate-200 text-slate-700",
      iconColor: "bg-slate-400"
    },
    {
      id: "DOING",
      title: "SEDANG DIKERJAKAN",
      bg: "bg-blue-50/50",
      border: "border-blue-200/80",
      badge: "bg-blue-100 text-blue-700",
      iconColor: "bg-blue-500"
    },
    {
      id: "REVIEW",
      title: "REVIEW / SIAP KONFIRMASI",
      bg: "bg-amber-50/50",
      border: "border-amber-200/80",
      badge: "bg-amber-100 text-amber-700",
      iconColor: "bg-amber-500"
    },
    {
      id: "DONE",
      title: "SELESAI",
      bg: "bg-emerald-50/50",
      border: "border-emerald-200/80",
      badge: "bg-emerald-100 text-emerald-700",
      iconColor: "bg-emerald-500"
    }
  ];

  // Move task status
  const handleUpdateStatus = async (task: ScrumTask, newStatus: ScrumTask["status"]) => {
    if (task.status === newStatus || movingTaskId === task.id) return;
    setMovingTaskId(task.id);

    try {
      await apiPatch(`/research/${task.projectId}/board/tasks/${task.id}/status`, {
        status: newStatus
      });

      setTasks((prev) =>
        prev.map((t) => (t.id === task.id ? { ...t, status: newStatus } : t))
      );

      if (selectedTask?.id === task.id) {
        setSelectedTask((prev) => (prev ? { ...prev, status: newStatus } : null));
      }
    } catch (err: any) {
      alert(err?.message || "Gagal mengubah status tugas.");
    } finally {
      setMovingTaskId(null);
    }
  };

  // Toggle subtask
  const handleToggleSubtask = async (task: ScrumTask, subtaskId: string, currentDone: boolean) => {
    try {
      await apiPatch(`/research/${task.projectId}/board/tasks/${task.id}/subtasks/${subtaskId}`, {
        done: !currentDone
      });

      const updatedSubtasks = task.subtasks.map((st) =>
        st.id === subtaskId ? { ...st, done: !currentDone } : st
      );

      const updatedTask = { ...task, subtasks: updatedSubtasks };
      setTasks((prev) => prev.map((t) => (t.id === task.id ? updatedTask : t)));

      if (selectedTask?.id === task.id) {
        setSelectedTask(updatedTask);
      }
    } catch (err: any) {
      alert(err?.message || "Gagal memperbarui sub-tugas.");
    }
  };

  // Upload attachment
  const handleUploadAttachment = async (e: React.ChangeEvent<HTMLInputElement>, task: ScrumTask) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setUploadingAttachment(true);
    try {
      const reader = new FileReader();
      reader.onload = async () => {
        try {
          const fileDataUrl = reader.result as string;
          await apiPost(`/research/${task.projectId}/board/tasks/${task.id}/attachments`, {
            fileDataUrl,
            fileName: file.name
          });
          await loadTasks();
        } catch (uploadErr: any) {
          alert(uploadErr?.message || "Gagal mengunggah lampiran.");
        } finally {
          setUploadingAttachment(false);
        }
      };
      reader.readAsDataURL(file);
    } catch (err: any) {
      alert("Gagal membaca file.");
      setUploadingAttachment(false);
    }
  };

  // Handle create task for Mahasiswa Ketua Riset
  const handleCreateTask = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTaskTitle.trim()) {
      alert("Judul tugas wajib diisi.");
      return;
    }
    if (!selectedProjectFilter || selectedProjectFilter === "all") {
      alert("Silakan pilih proyek riset terlebih dahulu.");
      return;
    }

    setIsCreatingTask(true);
    try {
      const payload: any = {
        title: newTaskTitle.trim(),
        description: newTaskDescription.trim(),
        divisionId: newTaskDivisionId || null,
        sprintId: newTaskSprintId || (activeSprint ? activeSprint.id : null),
        storyPoints: Number(newTaskStoryPoints) || 0,
        assignees: newTaskAssignees,
        priority: newTaskPriority || "Sedang",
        subtasks: newTaskSubtasks.filter(Boolean).map((t) => ({ title: t }))
      };

      await apiPost(`/research/${selectedProjectFilter}/board/tasks`, payload);
      alert("Tugas berhasil ditambahkan ke board.");

      // Reset form
      setNewTaskTitle("");
      setNewTaskDescription("");
      setNewTaskDivisionId("");
      setNewTaskSprintId("");
      setNewTaskStoryPoints(3);
      setNewTaskAssignees([]);
      setNewTaskPriority("Sedang");
      setNewTaskSubtasks([]);
      setNewTaskSubtaskInput("");
      setIsAddTaskOpen(false);

      // Reload tasks
      await loadTasks();
    } catch (err: any) {
      alert(err?.message || "Gagal menambahkan tugas.");
    } finally {
      setIsCreatingTask(false);
    }
  };

  // ─── Research Metadata Edit (Ketua Riset, Dosen, Admin) ─────────────
  const openEditBoardModal = () => {
    if (!canManageMetadata) {
      alert("Anda tidak memiliki izin mengubah detail riset ini.");
      return;
    }
    setBoardForm({
      title: currentProject?.short_title || currentProject?.title || "",
      mitra: currentProject?.mitra || "",
      period: currentProject?.period_text || "",
      description: currentProject?.description || ""
    });
    setIsEditBoardOpen(true);
  };

  const handleSaveBoardHeader = async () => {
    if (!canManageMetadata) return;
    if (!selectedProjectFilter || selectedProjectFilter === "all") return;
    setIsSavingBoard(true);
    try {
      await apiPatch(`/research/${selectedProjectFilter}/board/header`, {
        title: boardForm.title.trim() || currentProject?.title,
        shortTitle: boardForm.title.trim() || currentProject?.short_title,
        periodText: boardForm.period.trim() || currentProject?.period_text,
        mitra: boardForm.mitra.trim() || currentProject?.mitra,
        description: boardForm.description.trim() || currentProject?.description
      });

      setProjects((prev) =>
        prev.map((p) =>
          p.id === selectedProjectFilter
            ? {
                ...p,
                title: boardForm.title.trim() || p.title,
                short_title: boardForm.title.trim() || p.short_title,
                period_text: boardForm.period.trim() || p.period_text,
                mitra: boardForm.mitra.trim() || p.mitra,
                description: boardForm.description.trim() || p.description
              }
            : p
        )
      );
      setIsEditBoardOpen(false);
    } catch (err: any) {
      alert(err?.message || "Gagal menyimpan detail proyek.");
    } finally {
      setIsSavingBoard(false);
    }
  };

  // ─── Milestone Handlers (Ketua Riset, Dosen, Admin) ─────────────────
  const handleToggleMilestone = async (index: number) => {
    if (!canManageMetadata) return;
    const ms = milestones[index];
    if (!ms) return;
    try {
      if (ms.id) {
        await apiPatch(`/research/${selectedProjectFilter}/milestones/${ms.id}`, {
          done: !ms.done
        });
      }
      setMilestones((prev) =>
        prev.map((item, i) => (i === index ? { ...item, done: !item.done } : item))
      );
    } catch (err: any) {
      alert(err?.message || "Gagal memperbarui status milestone.");
    }
  };

  const handleAddMilestone = async () => {
    if (!canManageMetadata) return;
    if (!newMilestoneLabel.trim() || !selectedProjectFilter || selectedProjectFilter === "all") return;
    try {
      const res = await apiPost<{ id?: number }>(`/research/${selectedProjectFilter}/milestones`, {
        label: newMilestoneLabel.trim(),
        done: false,
        sortOrder: milestones.length
      });
      setMilestones((prev) => [
        ...prev,
        { id: res?.id, label: newMilestoneLabel.trim(), done: false }
      ]);
      setNewMilestoneLabel("");
    } catch (err: any) {
      alert(err?.message || "Gagal menambahkan milestone.");
    }
  };

  const handleRenameMilestone = async (index: number, label: string) => {
    if (!canManageMetadata) return;
    const ms = milestones[index];
    if (!ms || !label.trim()) return;
    try {
      if (ms.id) {
        await apiPatch(`/research/${selectedProjectFilter}/milestones/${ms.id}`, {
          label: label.trim()
        });
      }
      setMilestones((prev) =>
        prev.map((item, i) => (i === index ? { ...item, label: label.trim() } : item))
      );
    } catch (err: any) {
      alert(err?.message || "Gagal mengubah label milestone.");
    }
  };

  const handleRemoveMilestone = async (index: number) => {
    if (!canManageMetadata) return;
    const ms = milestones[index];
    if (!ms) return;
    try {
      if (ms.id) {
        await apiDelete(`/research/${selectedProjectFilter}/milestones/${ms.id}`);
      }
      setMilestones((prev) => prev.filter((_, i) => i !== index));
    } catch (err: any) {
      alert(err?.message || "Gagal menghapus milestone.");
    }
  };

  // ─── External Attachment Link Handler ──────────────────────────────
  const handleSaveAttachmentLink = async () => {
    if (!canManageMetadata) return;
    if (!selectedProjectFilter || selectedProjectFilter === "all") return;
    setSavingAttachment(true);
    try {
      await apiPatch(`/research/${selectedProjectFilter}/board/header`, {
        attachment_link: attachmentLinkInput.trim()
      });
      setProjects((prev) =>
        prev.map((p) =>
          p.id === selectedProjectFilter ? { ...p, attachment_link: attachmentLinkInput.trim() } : p
        )
      );
      setIsEditingAttachment(false);
    } catch (err: any) {
      alert(err?.message || "Gagal menyimpan link lampiran.");
    } finally {
      setSavingAttachment(false);
    }
  };

  // ─── Drag and Drop Handlers ────────────────────────────────────────
  const handleTaskDragStart = (e: React.DragEvent<HTMLDivElement>, task: ScrumTask, fromColumn: string) => {
    if (movingTaskId) {
      e.preventDefault();
      return;
    }
    e.dataTransfer.effectAllowed = "move";
    e.dataTransfer.setData("application/x-stas-task", JSON.stringify({ taskId: task.id, fromColumn }));
    e.dataTransfer.setData("text/plain", task.id);
    setDraggedTask({ taskId: task.id, fromColumn });
  };

  const handleTaskDragEnd = () => {
    setDraggedTask(null);
    setDragOverColumn(null);
  };

  const handleColumnDragOver = (e: React.DragEvent<HTMLDivElement>, columnId: string) => {
    if (!draggedTask || movingTaskId) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
    setDragOverColumn(columnId);
  };

  const handleColumnDrop = async (e: React.DragEvent<HTMLDivElement>, columnId: ScrumTask["status"]) => {
    if (movingTaskId) return;
    e.preventDefault();

    const rawPayload = e.dataTransfer.getData("application/x-stas-task");
    const fallbackTaskId = e.dataTransfer.getData("text/plain");
    let taskId = fallbackTaskId;
    try {
      const parsed = rawPayload ? JSON.parse(rawPayload) : null;
      taskId = parsed?.taskId || fallbackTaskId;
    } catch {
      taskId = fallbackTaskId;
    }

    setDraggedTask(null);
    setDragOverColumn(null);

    const task = tasks.find((t) => t.id === taskId);
    if (!task || task.status === columnId) return;

    await handleUpdateStatus(task, columnId);
  };

  // ─── Task Comments & Detail Actions ────────────────────────────────
  const loadComments = async (taskId: string, projectId?: string) => {
    const targetProjectId =
      projectId ||
      selectedTask?.projectId ||
      (selectedProjectFilter && selectedProjectFilter !== "all" ? selectedProjectFilter : null);

    if (!targetProjectId) return;
    setTaskCommentsLoading(true);
    try {
      let rawComments: any[] = [];
      try {
        const detail = await apiGet<any>(`/research/${targetProjectId}/board/tasks/${taskId}`);
        if (Array.isArray(detail?.comments)) {
          rawComments = detail.comments;
        }
      } catch {
        // Fallback if detail endpoint doesn't return comments
      }

      if (rawComments.length === 0) {
        const res = await apiGet<any[]>(`/research/${targetProjectId}/board/tasks/${taskId}/comments`);
        if (Array.isArray(res)) {
          rawComments = res;
        }
      }

      const normalized = rawComments.map((item, index) => ({
        id: String(item?.id || `comment-${index}`),
        authorId: item?.authorId || item?.userId || undefined,
        authorName: item?.authorName || item?.author || item?.userName || item?.user?.name || "Anggota Tim",
        text: item?.text || item?.comment || item?.body || "",
        createdAt: item?.createdAt || item?.created_at || item?.date || undefined,
        subtaskId: item?.subtaskId || item?.checklistId || undefined,
        subtaskTitle: item?.subtaskTitle || item?.checklistTitle || item?.subtask || undefined
      }));
      setTaskComments(normalized);
    } catch {
      setTaskComments([]);
    } finally {
      setTaskCommentsLoading(false);
    }
  };

  const handleSendComment = async () => {
    if (!newCommentText.trim() || !selectedTask) return;
    setIsSendingComment(true);
    try {
      const res = await apiPost<{ comment?: any }>(
        `/research/${selectedTask.projectId}/board/tasks/${selectedTask.id}/comments`,
        {
          authorId: currentUser?.id,
          authorName: currentUser?.name || "Mahasiswa",
          text: newCommentText.trim()
        }
      );
      if (res?.comment) {
        const normalized = {
          id: String(res.comment?.id || `comment-${Date.now()}`),
          authorId: res.comment?.authorId || currentUser?.id,
          authorName: res.comment?.authorName || currentUser?.name || "Mahasiswa",
          text: res.comment?.text || res.comment?.body || newCommentText.trim(),
          createdAt: res.comment?.createdAt || res.comment?.created_at || new Date().toISOString(),
          subtaskId: res.comment?.subtaskId,
          subtaskTitle: res.comment?.subtaskTitle
        };
        setTaskComments((prev) => [...prev, normalized]);
      } else {
        await loadComments(selectedTask.id, selectedTask.projectId);
      }
      setNewCommentText("");
      setTasks((prev) =>
        prev.map((t) =>
          t.id === selectedTask.id
            ? { ...t, commentsCount: (t.commentsCount || 0) + 1 }
            : t
        )
      );
      setSelectedTask((prev) =>
        prev ? { ...prev, commentsCount: (prev.commentsCount || 0) + 1 } : null
      );
    } catch (err: any) {
      alert(err?.message || "Gagal mengirim komentar.");
    } finally {
      setIsSendingComment(false);
    }
  };

  const handleDeleteTask = async (task: ScrumTask) => {
    if (!canManageMetadata) return;
    if (!confirm(`Apakah Anda yakin ingin menghapus tugas "${task.title}"?`)) return;
    try {
      await apiDelete(`/research/${task.projectId}/board/tasks/${task.id}`);
      setTasks((prev) => prev.filter((t) => t.id !== task.id));
      if (selectedTask?.id === task.id) {
        setSelectedTask(null);
      }
    } catch (err: any) {
      alert(err?.message || "Gagal menghapus tugas.");
    }
  };

  const openTaskDetail = (task: ScrumTask) => {
    setSelectedTask(task);
    setDetailModalTab("detail");
    void loadComments(task.id, task.projectId);
  };

  return (
    <Layout title="Scrum Board">
      <div className="flex flex-col gap-6 pb-12">
        {/* Top Header Card */}
        <div className="bg-white border border-border rounded-[24px] p-6 shadow-sm flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 mb-1.5">
              <span className="p-2 rounded-xl bg-purple-50 text-purple-600">
                <Kanban size={22} />
              </span>
              <h1 className="text-xl font-black text-foreground">Scrum Board</h1>
              <span className="px-2.5 py-0.5 rounded-full text-[11px] font-black bg-purple-100 text-purple-700">
                {isLeader ? "Mahasiswa Ketua Riset" : "Anggota Riset"}
              </span>
            </div>
            <p className="text-xs text-muted-foreground">
              Pantau sprint aktif, backlog, milestone, serta kerjakan tugas Scrum Anda dengan transparan.
            </p>
          </div>

          <div className="flex items-center gap-3 flex-wrap">
            {/* Project Filter Switcher */}
            {projectOptions.length > 0 && (
              <div className="flex items-center gap-2">
                <label className="text-xs font-bold text-muted-foreground">Proyek:</label>
                <select
                  value={selectedProjectFilter}
                  onChange={(e) => setSelectedProjectFilter(e.target.value)}
                  className="h-10 px-3 text-xs font-bold bg-slate-50 border border-border rounded-xl focus:outline-none cursor-pointer"
                >
                  <option value="all">Semua Proyek ({projectOptions.length})</option>
                  {projectOptions.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.title}
                    </option>
                  ))}
                </select>
              </div>
            )}

            {/* Edit Riset Button (Khusus Ketua Riset, Dosen, Admin) */}
            {canManageMetadata && selectedProjectFilter !== "all" && (
              <button
                onClick={openEditBoardModal}
                title="Edit Detail Riset"
                className="h-10 px-3.5 rounded-xl border border-border bg-white hover:bg-slate-50 text-slate-700 text-xs font-bold transition-all flex items-center gap-1.5 shadow-sm shrink-0"
              >
                <Edit2 size={15} />
                <span>Edit Riset</span>
              </button>
            )}

            {/* Mahasiswa Ketua Riset: Add Task Button */}
            {isLeader && selectedProjectFilter !== "all" && (
              <button
                onClick={() => setIsAddTaskOpen(true)}
                className="h-10 px-4 rounded-xl bg-[#6C47FF] hover:bg-[#5b3adb] text-white text-xs font-black transition-all flex items-center gap-2 shadow-sm shrink-0"
              >
                <Plus size={16} strokeWidth={3} />
                <span>Tambah Tugas</span>
              </button>
            )}
          </div>
        </div>

        {/* ── Metadata Riset Banner ── */}
        {currentProject && (
          <div className="bg-[#F0FFF0] border border-[#D8F5D0] rounded-[20px] overflow-hidden shadow-sm">
            {/* Top row */}
            <div className="p-5 flex flex-col md:flex-row md:items-start justify-between gap-4 border-b border-[#D8F5D0]">
              <div className="flex flex-col gap-1">
                <div className="flex items-center gap-2">
                  <span>📌</span>
                  <h2 className="text-lg font-black text-[#0AB600]">
                    {currentProject.short_title || currentProject.title}
                  </h2>
                  {canManageMetadata && (
                    <button
                      onClick={openEditBoardModal}
                      title="Edit Detail Riset"
                      className="p-1.5 bg-white/80 border border-[#D8F5D0] text-[#4AB834] hover:text-[#0AB600] hover:bg-white rounded-lg transition-all shadow-sm"
                    >
                      <Edit2 size={13} strokeWidth={2.5} />
                    </button>
                  )}
                  <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-100 text-emerald-800">
                    {currentProject.status || "Aktif"}
                  </span>
                </div>
                {currentProject.description && (
                  <p className="text-xs text-slate-600 mt-1 max-w-2xl leading-relaxed">
                    {currentProject.description}
                  </p>
                )}
                <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 mt-2">
                  <div className="flex items-center gap-1.5">
                    <span className="text-[10px] font-black text-[#5CC444] uppercase tracking-wider">Pembimbing:</span>
                    <span className="text-xs font-bold text-[#0AB600]">{currentProject.supervisor_name || "-"}</span>
                  </div>
                  <div className="w-px h-3 bg-[#A8E895]" />
                  <div className="flex items-center gap-1.5">
                    <span className="text-[10px] font-black text-[#5CC444] uppercase tracking-wider">Periode:</span>
                    <span className="text-xs font-bold text-[#0AB600]">{currentProject.period_text || "-"}</span>
                  </div>
                  <div className="w-px h-3 bg-[#A8E895]" />
                  <div className="flex items-center gap-1.5">
                    <span className="text-[10px] font-black text-[#5CC444] uppercase tracking-wider">Mitra:</span>
                    <span className="text-xs font-bold text-[#0AB600]">{currentProject.mitra || "-"}</span>
                  </div>
                </div>
              </div>

              {/* Progress summary */}
              <div className="flex flex-col gap-1.5 min-w-[180px] shrink-0">
                <div className="flex justify-between items-end">
                  <span className="text-xs font-bold text-[#4AB834]">Progress Riset</span>
                  <span className="text-sm font-black text-[#0AB600]">{currentProject.progress || 0}%</span>
                </div>
                <div className="w-full bg-[#D8F5D0] rounded-full h-2">
                  <div
                    className="bg-[#0AB600] h-2 rounded-full transition-all duration-500"
                    style={{ width: `${currentProject.progress || 0}%` }}
                  />
                </div>
                <span className="text-[10px] font-medium text-[#4AB834]">
                  {milestones.filter((m) => m.done).length} dari {milestones.length} milestone selesai
                </span>
              </div>
            </div>

            {/* Milestone bar */}
            <div className="px-5 pt-4 pb-2 border-b border-[#D8F5D0]">
              <div className="flex items-center justify-between mb-2">
                <span className="text-[10px] font-black text-[#5CC444] uppercase tracking-wider">
                  {canManageMetadata ? "Milestone Riset" : "Milestone Riset (Read-Only)"}
                </span>
                <div className="flex items-center gap-3">
                  <span className="text-[10px] text-slate-500 font-semibold">
                    {milestones.filter((m) => m.done).length}/{milestones.length} Selesai
                  </span>
                  {canManageMetadata && (
                    <button
                      onClick={() => setIsMilestoneOpen(true)}
                      className="flex items-center gap-1.5 px-2.5 py-1 bg-white border border-[#D8F5D0] hover:border-[#0AB600] hover:bg-[#F0FFF0] rounded-lg text-[10px] font-black text-[#4AB834] hover:text-[#0AB600] transition-all shadow-sm"
                    >
                      <Edit2 size={10} strokeWidth={3} />
                      <span>Kelola Milestone</span>
                    </button>
                  )}
                </div>
              </div>
              <MilestoneBanner
                milestones={milestones}
                progressColor="bg-[#0AB600]"
                editable={canManageMetadata}
                onToggle={handleToggleMilestone}
                onManage={() => setIsMilestoneOpen(true)}
              />
            </div>

            {/* Team members */}
            <div className="px-5 py-4 border-b border-[#D8F5D0]">
              <span className="text-[10px] font-black text-[#5CC444] uppercase tracking-wider block mb-3">
                Anggota Tim Riset
              </span>
              <ProjectMembersView members={teamMembers as any} />
            </div>

            {/* Research documents */}
            <div className="px-5 py-4 border-b border-[#D8F5D0]">
              <div className="mb-3 flex items-center justify-between gap-3">
                <span className="text-[10px] font-black text-[#5CC444] uppercase tracking-wider">Dokumen Riset</span>
                <span className="rounded-full border border-[#D8F5D0] bg-white px-2.5 py-1 text-[10px] font-black text-[#4AB834]">
                  {currentProject.research_type || "Jenis riset -"}
                </span>
              </div>
              <div className="grid grid-cols-1 gap-3 lg:grid-cols-5">
                <div className="rounded-xl border border-[#D8F5D0] bg-white px-3 py-2 shadow-sm lg:col-span-2">
                  <span className="text-[10px] font-black uppercase tracking-wider text-[#5CC444]">Dokumen Kerja Sama</span>
                  <div className="mt-1 flex flex-wrap items-center gap-2">
                    <span className={`rounded-md px-2 py-0.5 text-[10px] font-black ${currentProject.agreement_type ? "bg-green-50 text-[#0AB600]" : "bg-slate-100 text-slate-400"}`}>
                      {currentProject.agreement_type || "Belum diisi"}
                    </span>
                    <span className="text-xs font-bold text-slate-700">
                      {formatBoardDateRange(currentProject.agreement_start_date, currentProject.agreement_end_date)}
                    </span>
                  </div>
                </div>
                <BoardDocumentLink label="File PKS/MoU/MoA" url={currentProject.agreement_file_url} />
                <BoardDocumentLink label="Proposal" url={currentProject.proposal_file_url} />
                <BoardDocumentLink label="RAB" url={currentProject.rab_file_url} />
              </div>
            </div>

            {/* External Attachment Link */}
            <div className="px-5 py-4">
              <div className="flex items-center justify-between mb-2">
                <span className="text-[10px] font-black text-[#5CC444] uppercase tracking-wider">
                  Lampiran Eksternal (Drive / Repository Dokumen)
                </span>
                {canManageMetadata && (
                  <button
                    onClick={() => {
                      setAttachmentLinkInput(currentProject.attachment_link || "");
                      setIsEditingAttachment(!isEditingAttachment);
                    }}
                    className="flex items-center gap-1 px-2.5 py-1 bg-white border border-[#D8F5D0] hover:border-[#0AB600] hover:bg-[#F0FFF0] rounded-lg text-[10px] font-black text-[#4AB834] hover:text-[#0AB600] transition-all shadow-sm"
                  >
                    <LinkIcon size={10} strokeWidth={3} />
                    <span>{isEditingAttachment ? "Batal" : "Edit"}</span>
                  </button>
                )}
              </div>
              {isEditingAttachment ? (
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={attachmentLinkInput}
                    onChange={(e) => setAttachmentLinkInput(e.target.value)}
                    placeholder="https://drive.google.com/..."
                    className="flex-1 px-3 py-2 bg-white border border-[#D8F5D0] rounded-lg text-xs placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-[#0AB600]/20 focus:border-[#0AB600] font-semibold"
                  />
                  <button
                    onClick={handleSaveAttachmentLink}
                    disabled={savingAttachment}
                    className="px-3.5 py-2 bg-[#0AB600] hover:bg-[#099800] disabled:opacity-50 text-white rounded-lg text-xs font-black transition-colors"
                  >
                    {savingAttachment ? "Menyimpan..." : "Simpan"}
                  </button>
                </div>
              ) : currentProject.attachment_link ? (
                <a
                  href={resolveApiAssetUrl(currentProject.attachment_link) || currentProject.attachment_link}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-2 px-3 py-2 bg-white border border-[#D8F5D0] hover:border-[#0AB600] rounded-lg text-xs text-[#0AB600] hover:bg-[#F0FFF0] transition-all break-all shadow-sm font-semibold"
                >
                  <LinkIcon size={12} />
                  <span>{currentProject.attachment_link}</span>
                  <ExternalLink size={12} className="shrink-0" />
                </a>
              ) : (
                <p className="text-xs text-slate-400 italic">Belum ada link lampiran eksternal dari pembimbing.</p>
              )}
            </div>
          </div>
        )}

        {/* ── Repository GitHub Proyek (Read-Only) ── */}
        {selectedProjectFilter !== "all" && (
          <div className="bg-white rounded-[20px] border border-border p-5 shadow-sm">
            <div className="flex items-center justify-between gap-3 mb-3.5">
              <div className="flex items-center gap-2">
                <GitBranch size={18} className="text-slate-700" />
                <h3 className="text-sm font-black text-foreground">Repository GitHub Proyek</h3>
              </div>
              <span className="text-xs text-muted-foreground font-semibold">
                {repositories.length} repository terhubung
              </span>
            </div>

            {repositories.length === 0 ? (
              <div className="rounded-xl border border-dashed border-border/70 p-5 text-center text-xs text-muted-foreground">
                Belum ada repository GitHub yang terhubung ke project ini.
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {repositories.map((repo) => {
                  const div = divisions.find((d) => d.id === repo.divisionId);
                  const divisionLabel = div?.name || "Lintas Divisi";
                  const safeUrl = `https://github.com/${repo.owner}/${repo.repo}`;
                  const isUrlValid = isValidGitHubUrl(safeUrl);

                  return (
                    <div
                      key={repo.id}
                      className="p-3.5 bg-slate-50/70 border border-border rounded-xl flex flex-col justify-between gap-2.5 hover:border-slate-300 transition-colors"
                    >
                      <div className="space-y-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-bold text-xs text-foreground truncate">{repo.fullName}</span>
                          <span
                            className={`px-1.5 py-0.5 rounded text-[9px] font-bold ${
                              repo.isActive ? "bg-emerald-100 text-emerald-700" : "bg-slate-100 text-slate-500"
                            }`}
                          >
                            {repo.isActive ? "Aktif" : "Nonaktif"}
                          </span>
                          {repo.isPrivate && (
                            <span className="px-1.5 py-0.5 rounded text-[9px] font-bold bg-amber-100 text-amber-700 flex items-center gap-0.5">
                              <Lock size={9} /> Private
                            </span>
                          )}
                        </div>
                        <div className="flex items-center gap-2 text-[11px] text-muted-foreground flex-wrap">
                          <span>
                            Branch: <code className="font-mono text-[10px] bg-white px-1 py-0.5 rounded border border-slate-200">{repo.defaultBranch || "main"}</code>
                          </span>
                          <span>•</span>
                          <span>
                            Divisi: <strong className="text-foreground">{divisionLabel}</strong>
                          </span>
                        </div>
                      </div>
                      {isUrlValid && (
                        <div className="pt-1">
                          <a
                            href={safeUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-border bg-white hover:bg-slate-100 text-xs font-bold text-foreground transition-colors"
                          >
                            <ExternalLink size={12} />
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
        )}

        {/* ── Section Sesuai Gambar: Active Sprint Banner & Filters ── */}
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
                    <span className="text-xs font-black text-purple-700">⚡ {activeSprint.totalPoints ?? 0} SP</span>
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
                  Sprint {reviewSprint.name} sedang dalam tahap Review.
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2 shrink-0">
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

        {/* Warning if active tasks exist outside active sprint */}
        {activeSprint && unassignedActiveTasks.length > 0 && boardSprintScope === "active_sprint" && (
          <div className="bg-amber-50 border border-amber-300 rounded-[16px] p-4 shadow-sm flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-amber-950">
            <div className="flex items-start sm:items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-amber-100 text-amber-700 flex items-center justify-center shrink-0 mt-0.5 sm:mt-0">
                <AlertCircle size={20} />
              </div>
              <div>
                <p className="text-xs font-bold">
                  Terdapat {unassignedActiveTasks.length} tugas yang sedang dikerjakan mahasiswa (DOING/REVIEW), namun belum dimasukkan ke dalam <span className="font-semibold">{activeSprint.name}</span>.
                </p>
              </div>
            </div>
            <button
              onClick={() => setBoardSprintScope("all")}
              className="px-3.5 py-1.5 rounded-xl text-xs font-black bg-amber-600 hover:bg-amber-700 text-white shadow-sm transition-colors shrink-0"
            >
              Tampilkan Semua Tugas
            </button>
          </div>
        )}

        {/* Dynamic Division Sub-tabs */}
        <div className="flex items-center gap-2 overflow-x-auto pb-1">
          {divisionTabs.map((tab) => {
            const isSelected = selectedDivisionFilter === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => setSelectedDivisionFilter(tab.id)}
                className={`px-3.5 py-1.5 rounded-xl text-xs font-bold transition-all shrink-0 flex items-center gap-2 ${
                  isSelected
                    ? "bg-[#6C47FF] text-white shadow-sm"
                    : "bg-white text-muted-foreground border border-border hover:text-foreground hover:bg-slate-50"
                }`}
              >
                <span>{tab.label}</span>
                <span
                  className={`px-1.5 py-0.5 rounded-full text-[10px] font-black ${
                    isSelected ? "bg-white/20 text-white" : "bg-slate-100 text-slate-600"
                  }`}
                >
                  {tab.count}
                </span>
              </button>
            );
          })}
        </div>

        {/* Board Display */}
        {loading ? (
          <div className="p-12 text-center bg-white border border-border rounded-[24px]">
            <p className="text-xs font-bold text-muted-foreground">Memuat daftar tugas Scrum...</p>
          </div>
        ) : error ? (
          <div className="p-8 bg-red-50 text-red-700 border border-red-200 rounded-[20px] text-xs font-bold text-center">
            {error}
          </div>
        ) : filteredTasks.length === 0 ? (
          <div className="p-12 text-center bg-white border-2 border-dashed border-border rounded-[24px]">
            <div className="w-12 h-12 rounded-2xl bg-purple-50 text-purple-600 flex items-center justify-center mx-auto mb-3">
              <Kanban size={24} />
            </div>
            <h3 className="text-sm font-black text-foreground mb-1">Belum Ada Tugas Ditugaskan</h3>
            <p className="text-xs text-muted-foreground max-w-md mx-auto">
              Tidak ada tugas yang cocok dengan filter saat ini.
              {isLeader && " Klik tombol '+ Tambah Tugas' di atas untuk membuat tugas baru bagi tim Anda."}
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 flex-1">
            {columns.map((col) => {
              const colTasks = filteredTasks.filter((t) => t.status === col.id);

              return (
                <div
                  key={col.id}
                  onDragOver={(e) => handleColumnDragOver(e, col.id)}
                  onDragLeave={() => setDragOverColumn((cur) => (cur === col.id ? null : cur))}
                  onDrop={(e) => void handleColumnDrop(e, col.id)}
                  className={`flex flex-col rounded-[20px] ${col.bg} border ${col.border} p-4 transition-all min-h-[450px] shadow-sm ${
                    dragOverColumn === col.id ? "ring-2 ring-purple-400 ring-offset-2 bg-white/90" : ""
                  }`}
                >
                  {/* Column Header */}
                  <div className="flex items-center justify-between gap-2 mb-3.5 px-1">
                    <div className="flex items-center gap-2">
                      <span className={`w-2.5 h-2.5 rounded-full ${col.iconColor}`} />
                      <h3 className="text-xs font-black text-foreground uppercase tracking-wider">{col.title}</h3>
                    </div>
                    <span className={`px-2 py-0.5 rounded-full text-[10px] font-black ${col.badge}`}>
                      {colTasks.length}
                    </span>
                  </div>

                  {/* Tasks List */}
                  <div className="flex flex-col gap-3 flex-1 overflow-y-auto">
                    {colTasks.length === 0 ? (
                      <div className="flex-1 flex items-center justify-center p-4 border border-dashed border-border/60 rounded-xl">
                        <p className="text-[11px] text-muted-foreground/70 italic">Kosong</p>
                      </div>
                    ) : (
                      colTasks.map((task) => {
                        const isDone = task.status === "DONE";
                        const subtasksCount = task.subtasks.length;
                        const completedSubtasks = task.subtasks.filter((st) => st.done).length;

                        return (
                          <div
                            key={task.id}
                            draggable={movingTaskId !== task.id}
                            onDragStart={(e) => handleTaskDragStart(e, task, col.id)}
                            onDragEnd={handleTaskDragEnd}
                            onClick={() => openTaskDetail(task)}
                            title="Seret kartu untuk memindahkan status, atau klik untuk melihat detail."
                            className={`bg-white rounded-[16px] p-4 shadow-sm border border-slate-200/90 hover:shadow-md hover:border-purple-300 transition-all cursor-grab active:cursor-grabbing flex flex-col gap-2.5 group relative ${
                              isDone ? "opacity-80" : ""
                            } ${draggedTask?.taskId === task.id ? "opacity-50 scale-[0.98]" : ""}`}
                          >
                            {/* Project & Sprint Tag */}
                            <div className="flex items-center justify-between gap-2">
                              <div className="flex items-center gap-1.5 min-w-0">
                                {task.taskKey && (
                                  <span className="text-[9px] font-mono font-bold px-1.5 py-0.5 rounded bg-slate-100 text-slate-700 border border-slate-200 shrink-0">
                                    {task.taskKey}
                                  </span>
                                )}
                                <span className="text-[10px] font-bold text-muted-foreground truncate max-w-[130px]">
                                  {task.projectTitle}
                                </span>
                              </div>
                              {task.sprintName && (
                                <span className="text-[9px] font-black px-1.5 py-0.5 rounded bg-purple-50 text-purple-700 shrink-0">
                                  {task.sprintName}
                                </span>
                              )}
                            </div>

                            {/* Division Badge */}
                            <div className="flex items-center gap-1.5">
                              {task.divisionName ? (
                                <span className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-indigo-50 text-indigo-700 border border-indigo-200 truncate max-w-[200px]">
                                  {task.divisionName}
                                </span>
                              ) : (
                                <span className="text-[9px] font-medium px-1.5 py-0.5 rounded bg-slate-100 text-slate-500 border border-slate-200">
                                  Belum Ada Divisi
                                </span>
                              )}
                            </div>

                            {/* Task Title */}
                            <p
                              className={`text-xs font-black text-foreground leading-snug ${
                                isDone ? "line-through text-muted-foreground" : ""
                              }`}
                            >
                              {task.title}
                            </p>

                            {/* Task Description Preview */}
                            {task.description && (
                              <p className="text-[11px] text-muted-foreground line-clamp-2 leading-relaxed">
                                {getTaskDescriptionPreview(task.description, 2)}
                              </p>
                            )}

                            {/* Subtask Check Progress (if any) */}
                            {subtasksCount > 0 && (
                              <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground bg-slate-50 px-2 py-1 rounded-lg">
                                <CheckSquare size={12} className="text-[#6C47FF]" />
                                <span>
                                  {completedSubtasks} dari {subtasksCount} sub-tugas selesai
                                </span>
                              </div>
                            )}

                            {/* Footer (SP & Attachments & Quick Status) */}
                            <div className="flex items-center justify-between pt-1 border-t border-slate-100 text-[10px]">
                              <span className="px-2 py-0.5 rounded-md font-black bg-purple-50 text-purple-700 border border-purple-200">
                                ⚡ {task.storyPoints} SP
                              </span>

                              <div className="flex items-center gap-2 text-muted-foreground">
                                {task.commentsCount !== undefined && task.commentsCount > 0 && (
                                  <span className="flex items-center gap-0.5" title="Komentar">
                                    <MessageSquare size={12} />
                                    <span>{task.commentsCount}</span>
                                  </span>
                                )}
                                {task.attachments.length > 0 && (
                                  <span className="flex items-center gap-0.5" title="Lampiran bukti kerja">
                                    <Paperclip size={12} />
                                    <span>{task.attachments.length}</span>
                                  </span>
                                )}

                                {/* Quick Move Action */}
                                <select
                                  value={task.status}
                                  onClick={(e) => e.stopPropagation()}
                                  onChange={(e) =>
                                    handleUpdateStatus(task, e.target.value as ScrumTask["status"])
                                  }
                                  className="text-[10px] font-bold bg-slate-50 border border-border px-1.5 py-0.5 rounded focus:outline-none cursor-pointer"
                                >
                                  <option value="TO DO">TO DO</option>
                                  <option value="DOING">DOING</option>
                                  <option value="REVIEW">REVIEW</option>
                                  <option value="DONE">DONE</option>
                                </select>
                              </div>
                            </div>
                          </div>
                        );
                      })
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* ── MODAL: Tambah Tugas Baru (Mahasiswa Ketua Riset) ── */}
        {isAddTaskOpen && (
          <div
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4"
            onClick={() => setIsAddTaskOpen(false)}
          >
            <div
              className="bg-white rounded-[24px] shadow-2xl w-full max-w-lg p-6 flex flex-col gap-4 border border-border max-h-[90vh] overflow-y-auto"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-center justify-between pb-3 border-b border-border">
                <div className="flex items-center gap-2">
                  <div className="w-8 h-8 rounded-xl bg-purple-100 text-purple-700 flex items-center justify-center">
                    <Plus size={18} strokeWidth={3} />
                  </div>
                  <div>
                    <h3 className="text-base font-black text-foreground">Tambah Tugas Baru</h3>
                    <p className="text-[11px] text-muted-foreground">Sebagai Mahasiswa Ketua Riset, Anda berhak menambahkan tugas tim.</p>
                  </div>
                </div>
                <button
                  onClick={() => setIsAddTaskOpen(false)}
                  className="p-1 rounded-full hover:bg-slate-100 text-muted-foreground hover:text-foreground"
                >
                  <X size={18} />
                </button>
              </div>

              <form onSubmit={handleCreateTask} className="flex flex-col gap-3.5">
                {/* Judul Tugas */}
                <div>
                  <label className="text-xs font-bold text-foreground block mb-1">
                    Judul Tugas <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    required
                    value={newTaskTitle}
                    onChange={(e) => setNewTaskTitle(e.target.value)}
                    placeholder="Contoh: Selesaikan antarmuka wireframe Dashboard"
                    className="w-full h-10 px-3 text-xs bg-slate-50 border border-border rounded-xl focus:outline-none focus:border-purple-500 focus:bg-white transition-all font-semibold"
                  />
                </div>

                {/* Divisi & Sprint Target */}
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-xs font-bold text-foreground block mb-1">Divisi Proyek</label>
                    <select
                      value={newTaskDivisionId}
                      onChange={(e) => setNewTaskDivisionId(e.target.value)}
                      className="w-full h-10 px-3 text-xs bg-slate-50 border border-border rounded-xl focus:outline-none font-semibold cursor-pointer"
                    >
                      <option value="">Lintas / Tanpa Divisi</option>
                      {divisions.map((d) => (
                        <option key={d.id} value={d.id}>
                          {d.name}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="text-xs font-bold text-foreground block mb-1">Sprint Target</label>
                    <select
                      value={newTaskSprintId}
                      onChange={(e) => setNewTaskSprintId(e.target.value)}
                      className="w-full h-10 px-3 text-xs bg-slate-50 border border-border rounded-xl focus:outline-none font-semibold cursor-pointer"
                    >
                      {activeSprint && (
                        <option value={activeSprint.id}>
                          {activeSprint.name} (Sprint Aktif)
                        </option>
                      )}
                      <option value="">Product Backlog (Tanpa Sprint)</option>
                    </select>
                  </div>
                </div>

                {/* Story Points & Prioritas */}
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-xs font-bold text-foreground block mb-1">Story Points (SP)</label>
                    <input
                      type="number"
                      min={0}
                      max={100}
                      value={newTaskStoryPoints}
                      onChange={(e) => setNewTaskStoryPoints(Number(e.target.value))}
                      className="w-full h-10 px-3 text-xs bg-slate-50 border border-border rounded-xl focus:outline-none font-semibold"
                    />
                  </div>

                  <div>
                    <label className="text-xs font-bold text-foreground block mb-1">Prioritas</label>
                    <select
                      value={newTaskPriority}
                      onChange={(e) => setNewTaskPriority(e.target.value)}
                      className="w-full h-10 px-3 text-xs bg-slate-50 border border-border rounded-xl focus:outline-none font-semibold cursor-pointer"
                    >
                      <option value="Rendah">Rendah</option>
                      <option value="Sedang">Sedang</option>
                      <option value="Tinggi">Tinggi</option>
                      <option value="Mendesak">Mendesak</option>
                    </select>
                  </div>
                </div>

                {/* Penerima Tugas / Assignee */}
                {teamMembers.length > 0 && (
                  <div>
                    <label className="text-xs font-bold text-foreground block mb-1">Penerima Tugas (Assignees)</label>
                    <div className="max-h-28 overflow-y-auto border border-border rounded-xl p-2 bg-slate-50 flex flex-col gap-1.5">
                      {teamMembers.map((member) => {
                        const isChecked = newTaskAssignees.includes(member.id);
                        return (
                          <label
                            key={member.id}
                            className="flex items-center gap-2 text-xs font-semibold text-slate-700 cursor-pointer hover:bg-white p-1 rounded-lg transition-colors"
                          >
                            <input
                              type="checkbox"
                              checked={isChecked}
                              onChange={(e) => {
                                if (e.target.checked) {
                                  setNewTaskAssignees([...newTaskAssignees, member.id]);
                                } else {
                                  setNewTaskAssignees(newTaskAssignees.filter((id) => id !== member.id));
                                }
                              }}
                              className="rounded text-purple-600 focus:ring-purple-500"
                            />
                            <span>{member.name}</span>
                            <span className="text-[10px] text-muted-foreground font-normal">({member.role})</span>
                          </label>
                        );
                      })}
                    </div>
                  </div>
                )}

                {/* Deskripsi */}
                <div>
                  <label className="text-xs font-bold text-foreground block mb-1">Deskripsi / Instruksi Tugas</label>
                  <textarea
                    rows={3}
                    value={newTaskDescription}
                    onChange={(e) => setNewTaskDescription(e.target.value)}
                    placeholder="Jelaskan kebutuhan tugas, kriteria pengerjaan, dan output yang diharapkan..."
                    className="w-full p-3 text-xs bg-slate-50 border border-border rounded-xl focus:outline-none focus:border-purple-500 focus:bg-white transition-all font-semibold"
                  />
                </div>

                {/* Checklist Sub-tugas */}
                <div>
                  <label className="text-xs font-bold text-foreground block mb-1">Checklist Sub-tugas</label>
                  <div className="flex gap-2 mb-2">
                    <input
                      type="text"
                      value={newTaskSubtaskInput}
                      onChange={(e) => setNewTaskSubtaskInput(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") {
                          e.preventDefault();
                          if (newTaskSubtaskInput.trim()) {
                            setNewTaskSubtasks([...newTaskSubtasks, newTaskSubtaskInput.trim()]);
                            setNewTaskSubtaskInput("");
                          }
                        }
                      }}
                      placeholder="Ketik sub-tugas dan tekan Tambah..."
                      className="flex-1 h-9 px-3 text-xs bg-slate-50 border border-border rounded-xl focus:outline-none font-semibold"
                    />
                    <button
                      type="button"
                      onClick={() => {
                        if (newTaskSubtaskInput.trim()) {
                          setNewTaskSubtasks([...newTaskSubtasks, newTaskSubtaskInput.trim()]);
                          setNewTaskSubtaskInput("");
                        }
                      }}
                      className="px-3 h-9 bg-slate-100 hover:bg-slate-200 text-foreground text-xs font-bold rounded-xl transition-colors"
                    >
                      Tambah
                    </button>
                  </div>
                  {newTaskSubtasks.length > 0 && (
                    <div className="flex flex-col gap-1 max-h-24 overflow-y-auto">
                      {newTaskSubtasks.map((st, i) => (
                        <div key={i} className="flex items-center justify-between p-2 bg-slate-50 rounded-lg text-xs font-semibold">
                          <span>{st}</span>
                          <button
                            type="button"
                            onClick={() => setNewTaskSubtasks(newTaskSubtasks.filter((_, idx) => idx !== i))}
                            className="text-red-500 hover:text-red-700"
                          >
                            <X size={14} />
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {/* Buttons */}
                <div className="flex items-center justify-end gap-2 pt-3 border-t border-border">
                  <button
                    type="button"
                    onClick={() => setIsAddTaskOpen(false)}
                    className="px-4 py-2 rounded-xl text-xs font-bold text-muted-foreground hover:bg-slate-100 transition-colors"
                  >
                    Batal
                  </button>
                  <button
                    type="submit"
                    disabled={isCreatingTask}
                    className="px-5 py-2.5 rounded-xl text-xs font-black bg-[#6C47FF] hover:bg-[#5b3adb] text-white shadow-sm transition-all disabled:opacity-50"
                  >
                    {isCreatingTask ? "Menyimpan..." : "Simpan Tugas"}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* ── MODAL: Task Detail & Work Execution ── */}
        {selectedTask && (
          <div
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4"
            onClick={() => setSelectedTask(null)}
          >
            <div
              className="bg-white rounded-[24px] shadow-2xl w-full max-w-xl p-6 flex flex-col gap-4 border border-border max-h-[90vh] overflow-y-auto"
              onClick={(e) => e.stopPropagation()}
            >
              {/* Header */}
              <div className="flex items-start justify-between gap-3 pb-3 border-b border-border">
                <div>
                  <div className="flex items-center gap-2 mb-1 flex-wrap">
                    {selectedTask.taskKey && (
                      <span className="text-[10px] font-mono font-bold px-1.5 py-0.5 rounded bg-slate-100 text-slate-700 border border-slate-200">
                        {selectedTask.taskKey}
                      </span>
                    )}
                    <span className="text-[10px] font-black px-2 py-0.5 rounded bg-purple-50 text-purple-700">
                      {selectedTask.projectTitle}
                    </span>
                    {selectedTask.divisionName ? (
                      <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-indigo-50 text-indigo-700 border border-indigo-200">
                        {selectedTask.divisionName}
                      </span>
                    ) : (
                      <span className="text-[10px] font-medium px-2 py-0.5 rounded bg-slate-100 text-slate-500 border border-slate-200">
                        Belum Ada Divisi
                      </span>
                    )}
                    <span className="text-[10px] font-bold text-muted-foreground">
                      {selectedTask.sprintName || "Product Backlog"}
                    </span>
                    <span className="text-xs font-black text-purple-700">
                      ⚡ {selectedTask.storyPoints} Story Points
                    </span>
                  </div>
                  <h3 className="text-base font-black text-foreground">{selectedTask.title}</h3>
                </div>

                <button
                  onClick={() => setSelectedTask(null)}
                  className="p-1 rounded-full hover:bg-slate-100 text-muted-foreground hover:text-foreground"
                >
                  <X size={18} />
                </button>
              </div>

              {/* Modal Tabs Header */}
              <div className="flex items-center gap-2 border-b border-border pb-2">
                <button
                  type="button"
                  onClick={() => setDetailModalTab("detail")}
                  className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all ${
                    detailModalTab === "detail"
                      ? "bg-[#6C47FF] text-white shadow-sm"
                      : "text-muted-foreground hover:bg-slate-100 hover:text-foreground"
                  }`}
                >
                  Detail Tugas
                </button>
                <button
                  type="button"
                  onClick={() => setDetailModalTab("komentar")}
                  className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 ${
                    detailModalTab === "komentar"
                      ? "bg-[#6C47FF] text-white shadow-sm"
                      : "text-muted-foreground hover:bg-slate-100 hover:text-foreground"
                  }`}
                >
                  <MessageSquare size={13} />
                  <span>Komentar ({taskComments.length || selectedTask.commentsCount || 0})</span>
                </button>
                <button
                  type="button"
                  onClick={() => setDetailModalTab("git")}
                  className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 ${
                    detailModalTab === "git"
                      ? "bg-[#6C47FF] text-white shadow-sm"
                      : "text-muted-foreground hover:bg-slate-100 hover:text-foreground"
                  }`}
                >
                  <GitBranch size={13} />
                  <span>Git Branch</span>
                </button>
              </div>

              {/* Tab 1: Detail */}
              {detailModalTab === "detail" && (
                <div className="flex flex-col gap-4">
                  {/* Status Selector Bar */}
                  <div className="flex items-center justify-between p-3 bg-slate-50 rounded-xl border border-border">
                    <span className="text-xs font-black text-foreground">Status Pengerjaan Saat Ini:</span>
                    <div className="flex items-center gap-1.5">
                      {(["TO DO", "DOING", "REVIEW", "DONE"] as const).map((st) => (
                        <button
                          key={st}
                          onClick={() => handleUpdateStatus(selectedTask, st)}
                          className={`px-3 py-1 text-xs font-black rounded-lg transition-all ${
                            selectedTask.status === st
                              ? st === "DONE"
                                ? "bg-emerald-600 text-white shadow-sm"
                                : "bg-purple-600 text-white shadow-sm"
                              : "bg-white text-muted-foreground border border-border hover:text-foreground"
                          }`}
                        >
                          {st}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Description */}
                  {selectedTask.description ? (
                    <div>
                      <label className="text-xs font-black text-muted-foreground block mb-1">
                        Instruksi Tugas dari Admin/Ketua
                      </label>
                      <div className="p-4 bg-slate-50 border border-border rounded-xl">
                        <RichTaskDescription content={selectedTask.description} />
                      </div>
                    </div>
                  ) : null}

                  {/* Subtasks / Checklist */}
                  {selectedTask.subtasks.length > 0 && (
                    <div>
                      <label className="text-xs font-black text-foreground block mb-2 flex items-center justify-between">
                        <span>Checklist Sub-tugas</span>
                        <span className="text-muted-foreground font-normal text-[11px]">
                          {selectedTask.subtasks.filter((st) => st.done).length} / {selectedTask.subtasks.length} Selesai
                        </span>
                      </label>
                      <div className="flex flex-col gap-2">
                        {selectedTask.subtasks.map((st) => (
                          <div
                            key={st.id}
                            onClick={() => handleToggleSubtask(selectedTask, st.id, st.done)}
                            className={`p-3 rounded-xl border transition-all flex items-center gap-3 cursor-pointer ${
                              st.done
                                ? "bg-emerald-50/40 border-emerald-200 text-emerald-900"
                                : "bg-white border-border hover:bg-slate-50"
                            }`}
                          >
                            {st.done ? (
                              <CheckSquare size={16} className="text-emerald-600 shrink-0" />
                            ) : (
                              <Square size={16} className="text-slate-400 shrink-0" />
                            )}
                            <span
                              className={`text-xs font-bold ${
                                st.done ? "line-through text-muted-foreground" : "text-foreground"
                              }`}
                            >
                              {st.title}
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Attachments / Bukti Pengerjaan */}
                  <div>
                    <div className="flex items-center justify-between mb-2">
                      <label className="text-xs font-black text-foreground">
                        Lampiran Bukti Pengerjaan (Screenshots / Dokumen)
                      </label>
                      <label className="cursor-pointer px-2.5 py-1 bg-slate-100 hover:bg-slate-200 text-foreground text-xs font-bold rounded-lg transition-colors flex items-center gap-1.5">
                        <Upload size={12} />
                        <span>{uploadingAttachment ? "Mengunggah..." : "Unggah Bukti"}</span>
                        <input
                          type="file"
                          disabled={uploadingAttachment}
                          onChange={(e) => handleUploadAttachment(e, selectedTask)}
                          className="hidden"
                        />
                      </label>
                    </div>

                    <div className="flex flex-col gap-2">
                      {selectedTask.attachments.length === 0 ? (
                        <div className="p-4 text-center border border-dashed border-border rounded-xl text-xs text-muted-foreground">
                          Belum ada lampiran bukti. Klik tombol "Unggah Bukti" untuk menambahkan laporan atau screenshot.
                        </div>
                      ) : (
                        selectedTask.attachments.map((at) => {
                          const fileUrl = resolveApiAssetUrl(at.file_url || at.fileUrl) || at.file_url || at.fileUrl || "";
                          return (
                            <a
                              key={at.id}
                              href={fileUrl}
                              target="_blank"
                              rel="noopener noreferrer"
                              download={at.file_name || at.fileName || undefined}
                              className="p-2.5 bg-slate-50 border border-border rounded-xl flex items-center justify-between hover:bg-slate-100 transition-colors group"
                            >
                              <div className="flex items-center gap-2 min-w-0">
                                <Paperclip size={14} className="text-primary shrink-0" />
                                <span className="text-xs font-bold text-foreground truncate">{at.file_name || at.fileName}</span>
                              </div>
                              <ExternalLink size={14} className="text-muted-foreground group-hover:text-foreground shrink-0" />
                            </a>
                          );
                        })
                      )}
                    </div>
                  </div>

                  {/* Bottom Actions */}
                  <div className="flex items-center justify-between gap-3 pt-2">
                    {canManageMetadata && (
                      <button
                        type="button"
                        onClick={() => handleDeleteTask(selectedTask)}
                        className="px-3 py-2 rounded-xl text-xs font-bold text-red-600 hover:bg-red-50 border border-red-200 transition-colors flex items-center gap-1.5"
                      >
                        <Trash2 size={14} />
                        <span>Hapus Tugas</span>
                      </button>
                    )}

                    <div className="flex-1 flex justify-end">
                      {selectedTask.status !== "DONE" ? (
                        <button
                          onClick={() => handleUpdateStatus(selectedTask, "DONE")}
                          className="w-full sm:w-auto px-5 h-10 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-black rounded-xl transition-colors flex items-center justify-center gap-2 shadow-sm shadow-emerald-200"
                        >
                          <CheckCircle2 size={16} />
                          <span>Konfirmasi Tugas Selesai (DONE)</span>
                        </button>
                      ) : (
                        <div className="p-2.5 rounded-xl bg-emerald-50 border border-emerald-200 flex items-center gap-2 text-emerald-800 text-xs font-bold">
                          <CheckCircle2 size={16} className="text-emerald-600" />
                          <span>Tugas telah diselesaikan</span>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              )}

              {/* Tab 2: Komentar */}
              {detailModalTab === "komentar" && (
                <div className="flex flex-col gap-3 min-h-[300px]">
                  <div className="flex-1 overflow-y-auto max-h-[360px] flex flex-col gap-3 pr-1">
                    {taskCommentsLoading ? (
                      <p className="text-xs text-muted-foreground py-6 text-center">Memuat percakapan komentar...</p>
                    ) : taskComments.length === 0 ? (
                      <div className="p-8 text-center text-xs text-muted-foreground border border-dashed border-border rounded-xl">
                        Belum ada komentar pada tugas ini. Tulis komentar pertama Anda di bawah.
                      </div>
                    ) : (
                      taskComments.map((c, i) => {
                        const authorName = c.authorName || c.author_name || "Anggota Tim";
                        const initials = authorName.slice(0, 2).toUpperCase();
                        const isMe = Boolean(c.authorId && currentUser?.id && c.authorId === currentUser?.id);
                        return (
                          <div key={c.id || i} className={`flex gap-2.5 ${isMe ? "flex-row-reverse" : ""}`}>
                            <div
                              className={`w-7 h-7 rounded-full flex items-center justify-center text-[10px] font-black text-white shrink-0 ${
                                isMe ? "bg-purple-600" : "bg-emerald-600"
                              }`}
                            >
                              {initials}
                            </div>
                            <div className={`flex flex-col max-w-[80%] ${isMe ? "items-end" : "items-start"}`}>
                              <div className={`flex items-center gap-1.5 text-[10px] text-muted-foreground mb-0.5 ${isMe ? "flex-row-reverse" : ""}`}>
                                <span className="font-bold text-foreground">{authorName}</span>
                                {c.subtaskTitle && (
                                  <span className="rounded-full bg-amber-50 px-2 py-0.5 text-[9px] font-black text-amber-700">
                                    {c.subtaskTitle}
                                  </span>
                                )}
                                {c.createdAt && (
                                  <span>
                                    • {new Date(c.createdAt).toLocaleDateString("id-ID", { day: "numeric", month: "short" })}{" "}
                                    {new Date(c.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                                  </span>
                                )}
                              </div>
                              <div
                                className={`p-3 rounded-2xl text-xs leading-relaxed ${
                                  isMe
                                    ? "bg-purple-50 border border-purple-200 text-purple-950 rounded-tr-none"
                                    : "bg-slate-50 border border-border text-foreground rounded-tl-none"
                                }`}
                              >
                                {c.text}
                              </div>
                            </div>
                          </div>
                        );
                      })
                    )}
                  </div>

                  {/* Comment Input */}
                  <div className="pt-2 border-t border-border">
                    <div className="flex gap-2">
                      <textarea
                        rows={2}
                        value={newCommentText}
                        onChange={(e) => setNewCommentText(e.target.value)}
                        onKeyDown={(e) => {
                          if ((e.ctrlKey || e.metaKey) && e.key === "Enter") {
                            e.preventDefault();
                            void handleSendComment();
                          }
                        }}
                        placeholder="Tulis komentar... (Tekan Ctrl+Enter untuk kirim)"
                        className="flex-1 p-2.5 text-xs bg-slate-50 border border-border rounded-xl focus:outline-none focus:border-purple-500 font-semibold resize-none"
                      />
                      <button
                        type="button"
                        disabled={!newCommentText.trim() || isSendingComment}
                        onClick={handleSendComment}
                        className="px-3.5 bg-[#6C47FF] hover:bg-[#5b3adb] disabled:opacity-40 text-white rounded-xl text-xs font-bold transition-all flex items-center justify-center shrink-0"
                      >
                        <Send size={15} />
                      </button>
                    </div>
                  </div>
                </div>
              )}

              {/* Tab 3: Git Branch */}
              {detailModalTab === "git" && (
                <div className="flex flex-col gap-4">
                  <div className="p-4 bg-slate-50 border border-border rounded-xl space-y-3">
                    <div className="flex items-center justify-between">
                      <span className="text-[11px] font-bold text-muted-foreground uppercase tracking-wider">
                        Task Key
                      </span>
                      <span className="px-2.5 py-0.5 rounded text-xs font-mono font-black bg-white text-slate-800 border border-slate-200">
                        {selectedTask.taskKey || `TASK-${selectedTask.id}`}
                      </span>
                    </div>

                    <div>
                      <div className="flex items-center justify-between mb-1.5">
                        <span className="text-[11px] font-bold text-muted-foreground uppercase tracking-wider">
                          Rekomendasi Branch Git
                        </span>
                        <button
                          type="button"
                          onClick={() => {
                            const template = generateBranchTemplate(
                              selectedTask.taskKey || `TASK-${selectedTask.id}`,
                              selectedTask.title
                            );
                            navigator.clipboard.writeText(template);
                            setCopiedBranchTemplate(true);
                            setTimeout(() => setCopiedBranchTemplate(false), 2000);
                          }}
                          className="text-xs text-[#6C47FF] hover:underline font-bold flex items-center gap-1"
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
                      </div>
                      <div className="p-2.5 rounded-xl bg-white border border-slate-200 text-xs font-mono text-slate-800 break-all select-all font-semibold">
                        {generateBranchTemplate(
                          selectedTask.taskKey || `TASK-${selectedTask.id}`,
                          selectedTask.title
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Connected Repositories */}
                  <div>
                    <h4 className="text-xs font-black text-foreground mb-2 flex items-center gap-1.5">
                      <GitBranch size={14} className="text-slate-600" />
                      <span>Repository Proyek Terhubung ({repositories.length})</span>
                    </h4>
                    {repositories.length === 0 ? (
                      <p className="text-xs text-muted-foreground italic">Belum ada repository terhubung ke proyek ini.</p>
                    ) : (
                      <div className="flex flex-col gap-2">
                        {repositories.map((repo) => (
                          <div
                            key={repo.id}
                            className="p-3 bg-slate-50 border border-border rounded-xl flex items-center justify-between gap-3 text-xs"
                          >
                            <div className="min-w-0">
                              <p className="font-bold text-foreground truncate">{repo.fullName}</p>
                              <p className="text-[11px] text-muted-foreground">
                                Default branch: <code className="font-mono bg-white px-1 py-0.5 rounded border border-slate-200">{repo.defaultBranch || "main"}</code>
                              </p>
                            </div>
                            <a
                              href={`https://github.com/${repo.owner}/${repo.repo}`}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="px-2.5 py-1 bg-white border border-border hover:bg-slate-100 text-foreground font-bold rounded-lg text-xs flex items-center gap-1 shrink-0"
                            >
                              <ExternalLink size={12} />
                              <span>Buka GitHub</span>
                            </a>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

        {/* ── MODAL: Edit Detail Proyek (Ketua Riset, Dosen, Admin) ── */}
        {isEditBoardOpen && canManageMetadata && (
          <div
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4"
            onClick={() => setIsEditBoardOpen(false)}
          >
            <div
              className="bg-white rounded-[24px] shadow-2xl w-full max-w-lg p-6 flex flex-col gap-4 border border-border max-h-[90vh] overflow-y-auto"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-center justify-between pb-3 border-b border-border">
                <div className="flex items-center gap-2">
                  <div className="w-8 h-8 rounded-xl bg-purple-100 text-purple-700 flex items-center justify-center">
                    <Edit2 size={16} strokeWidth={2.5} />
                  </div>
                  <div>
                    <h3 className="text-base font-black text-foreground">Edit Detail Proyek</h3>
                    <p className="text-[11px] text-muted-foreground">Pengaturan metadata dan informasi proyek riset</p>
                  </div>
                </div>
                <button
                  onClick={() => setIsEditBoardOpen(false)}
                  className="p-1 rounded-full hover:bg-slate-100 text-muted-foreground hover:text-foreground"
                >
                  <X size={18} />
                </button>
              </div>

              <div className="flex flex-col gap-3.5">
                <div>
                  <label className="text-xs font-bold text-foreground block mb-1">Nama / Judul Proyek</label>
                  <input
                    type="text"
                    value={boardForm.title}
                    onChange={(e) => setBoardForm((prev) => ({ ...prev, title: e.target.value }))}
                    className="w-full h-10 px-3 text-xs bg-slate-50 border border-border rounded-xl focus:outline-none focus:border-purple-500 font-semibold"
                  />
                </div>

                <div>
                  <label className="text-xs font-bold text-foreground block mb-1">Mitra / Organisasi Kerja Sama</label>
                  <input
                    type="text"
                    value={boardForm.mitra}
                    onChange={(e) => setBoardForm((prev) => ({ ...prev, mitra: e.target.value }))}
                    className="w-full h-10 px-3 text-xs bg-slate-50 border border-border rounded-xl focus:outline-none focus:border-purple-500 font-semibold"
                  />
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-xs font-bold text-foreground block mb-1">Dosen Pembimbing</label>
                    <div className="w-full h-10 px-3 flex items-center text-xs bg-slate-100 border border-border rounded-xl text-slate-600 font-semibold truncate">
                      {currentProject?.supervisor_name || "Belum ditentukan"}
                    </div>
                  </div>
                  <div>
                    <label className="text-xs font-bold text-foreground block mb-1">Periode Riset</label>
                    <input
                      type="text"
                      value={boardForm.period}
                      onChange={(e) => setBoardForm((prev) => ({ ...prev, period: e.target.value }))}
                      placeholder="Contoh: Jan 2026 – Des 2026"
                      className="w-full h-10 px-3 text-xs bg-slate-50 border border-border rounded-xl focus:outline-none focus:border-purple-500 font-semibold"
                    />
                  </div>
                </div>

                <div>
                  <label className="text-xs font-bold text-foreground block mb-1">Deskripsi Proyek</label>
                  <textarea
                    rows={3}
                    value={boardForm.description}
                    onChange={(e) => setBoardForm((prev) => ({ ...prev, description: e.target.value }))}
                    placeholder="Tuliskan gambaran umum riset..."
                    className="w-full p-3 text-xs bg-slate-50 border border-border rounded-xl focus:outline-none focus:border-purple-500 font-semibold"
                  />
                </div>

                <div className="flex items-center justify-end gap-2 pt-3 border-t border-border">
                  <button
                    type="button"
                    onClick={() => setIsEditBoardOpen(false)}
                    className="px-4 py-2 rounded-xl text-xs font-bold text-muted-foreground hover:bg-slate-100 transition-colors"
                  >
                    Batal
                  </button>
                  <button
                    type="button"
                    disabled={isSavingBoard}
                    onClick={handleSaveBoardHeader}
                    className="px-5 py-2.5 rounded-xl text-xs font-black bg-[#6C47FF] hover:bg-[#5b3adb] text-white shadow-sm transition-all disabled:opacity-50"
                  >
                    {isSavingBoard ? "Menyimpan..." : "Simpan Perubahan"}
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* ── MODAL: Kelola Milestone (Ketua Riset, Dosen, Admin) ── */}
        {isMilestoneOpen && canManageMetadata && (
          <div
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4"
            onClick={() => {
              setIsMilestoneOpen(false);
              setEditingMsIndex(null);
            }}
          >
            <div
              className="bg-white rounded-[24px] shadow-2xl w-full max-w-lg p-6 flex flex-col gap-4 border border-border max-h-[90vh] overflow-hidden"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-center justify-between pb-3 border-b border-border shrink-0">
                <div>
                  <h3 className="text-base font-black text-foreground">Kelola Milestone Proyek</h3>
                  <p className="text-[11px] text-muted-foreground font-medium">
                    {currentProject?.short_title || currentProject?.title}
                  </p>
                </div>
                <button
                  onClick={() => {
                    setIsMilestoneOpen(false);
                    setEditingMsIndex(null);
                  }}
                  className="p-1 rounded-full hover:bg-slate-100 text-muted-foreground hover:text-foreground"
                >
                  <X size={18} />
                </button>
              </div>

              {/* Progress banner */}
              <div className="p-3 bg-emerald-50/70 border border-[#D8F5D0] rounded-xl shrink-0">
                <div className="flex items-center justify-between mb-1.5 text-xs font-bold">
                  <span className="text-[#4AB834]">
                    {milestones.filter((m) => m.done).length} dari {milestones.length} milestone selesai
                  </span>
                  <span className="font-black text-[#0AB600]">
                    {milestones.length > 0
                      ? Math.round((milestones.filter((m) => m.done).length / milestones.length) * 100)
                      : 0}
                    %
                  </span>
                </div>
                <div className="w-full bg-[#D8F5D0] rounded-full h-2">
                  <div
                    className="bg-[#0AB600] h-2 rounded-full transition-all duration-300"
                    style={{
                      width: `${
                        milestones.length > 0
                          ? (milestones.filter((m) => m.done).length / milestones.length) * 100
                          : 0
                      }%`
                    }}
                  />
                </div>
              </div>

              {/* Milestones list */}
              <div className="flex-1 overflow-y-auto flex flex-col gap-2 min-h-[150px] max-h-[300px]">
                {milestones.length === 0 ? (
                  <div className="text-center py-8 text-xs text-muted-foreground">Belum ada milestone. Tambahkan di bawah.</div>
                ) : (
                  milestones.map((m, i) => (
                    <div
                      key={i}
                      className={`flex items-center gap-2.5 p-2.5 rounded-xl border transition-all ${
                        m.done ? "bg-[#F0FFF0] border-[#D8F5D0]" : "bg-white border-border"
                      }`}
                    >
                      <button
                        type="button"
                        onClick={() => handleToggleMilestone(i)}
                        className={`w-6 h-6 rounded-full border-2 flex items-center justify-center shrink-0 transition-transform hover:scale-110 ${
                          m.done ? "bg-[#0AB600] border-transparent text-white" : "bg-white border-slate-300"
                        }`}
                      >
                        {m.done && (
                          <svg viewBox="0 0 12 12" className="w-2.5 h-2.5">
                            <path
                              d="M1 6l3.5 3.5L11 2"
                              stroke="white"
                              strokeWidth="2.5"
                              fill="none"
                              strokeLinecap="round"
                              strokeLinejoin="round"
                            />
                          </svg>
                        )}
                      </button>

                      {editingMsIndex === i ? (
                        <input
                          autoFocus
                          value={editingMsLabel}
                          onChange={(e) => setEditingMsLabel(e.target.value)}
                          onBlur={async () => {
                            if (editingMsLabel.trim()) {
                              await handleRenameMilestone(i, editingMsLabel);
                            }
                            setEditingMsIndex(null);
                          }}
                          onKeyDown={async (e) => {
                            if (e.key === "Enter") {
                              if (editingMsLabel.trim()) {
                                await handleRenameMilestone(i, editingMsLabel);
                              }
                              setEditingMsIndex(null);
                            }
                            if (e.key === "Escape") setEditingMsIndex(null);
                          }}
                          className="flex-1 text-xs font-bold bg-white border border-[#0AB600] rounded-lg px-2.5 py-1 focus:outline-none"
                        />
                      ) : (
                        <span
                          onDoubleClick={() => {
                            setEditingMsIndex(i);
                            setEditingMsLabel(m.label);
                          }}
                          title="Double-click untuk ubah label"
                          className={`flex-1 text-xs font-bold cursor-pointer ${
                            m.done ? "text-[#0AB600] line-through" : "text-foreground"
                          }`}
                        >
                          {m.label}
                        </span>
                      )}

                      <div className="flex items-center gap-1 shrink-0">
                        <button
                          type="button"
                          onClick={() => {
                            setEditingMsIndex(i);
                            setEditingMsLabel(m.label);
                          }}
                          className="p-1 rounded-lg text-slate-400 hover:text-[#0AB600] hover:bg-slate-100"
                        >
                          <Edit2 size={13} />
                        </button>
                        <button
                          type="button"
                          onClick={() => handleRemoveMilestone(i)}
                          className="p-1 rounded-lg text-slate-400 hover:text-red-500 hover:bg-red-50"
                        >
                          <Trash2 size={13} />
                        </button>
                      </div>
                    </div>
                  ))
                )}
              </div>

              {/* Add milestone section */}
              <div className="pt-3 border-t border-border shrink-0">
                <label className="text-[10px] font-black text-muted-foreground uppercase tracking-wider block mb-1.5">
                  Tambah Milestone Baru
                </label>
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={newMilestoneLabel}
                    onChange={(e) => setNewMilestoneLabel(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && newMilestoneLabel.trim()) {
                        e.preventDefault();
                        void handleAddMilestone();
                      }
                    }}
                    placeholder="Contoh: Desain Sistem, Uji Lapangan..."
                    className="flex-1 h-9 px-3 text-xs bg-slate-50 border border-border rounded-xl focus:outline-none font-semibold"
                  />
                  <button
                    type="button"
                    disabled={!newMilestoneLabel.trim()}
                    onClick={handleAddMilestone}
                    className="px-3.5 h-9 bg-[#0AB600] hover:bg-[#099800] disabled:opacity-40 text-white text-xs font-bold rounded-xl transition-all flex items-center gap-1 shrink-0"
                  >
                    <Plus size={14} strokeWidth={3} />
                    <span>Tambah</span>
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </Layout>
  );
}