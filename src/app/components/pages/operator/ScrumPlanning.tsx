import React, { useState, useEffect } from "react";
import { useNavigate, useSearchParams } from "react-router";
import { OperatorLayout } from "../../templates/OperatorLayout";
import { DosenLayout } from "../../templates/DosenLayout";
import {
  Kanban,
  Plus,
  Play,
  CheckCircle2,
  Calendar,
  Layers,
  Users,
  Zap,
  ArrowRight,
  Trash2,
  Pencil,
  Search,
  ExternalLink,
  ChevronDown,
  ChevronUp,
  Clock,
  Sparkles,
  AlertCircle,
  FileText,
  X
} from "lucide-react";
import { apiGet, apiPost, apiPatch, apiDelete, getStoredUser } from "../../../lib/api";
import {
  ProjectDivision,
  normalizeDivisionItem,
  END_SPRINT_CONFIRMATION_MESSAGE
} from "../../../lib/scrum";
import {
  DivisionRole,
  normalizeDivisionRole,
  validateDivisionRoleName,
  loadStoredDivisionRoles,
  saveStoredDivisionRoles,
  DEFAULT_DIVISION_ROLES
} from "../../../lib/researchRoles";


const FIBONACCI_POINTS = [1, 2, 3, 5, 8, 13, 21];

interface Sprint {
  id: string;
  projectId: string;
  name: string;
  goal: string;
  startDate: string | null;
  endDate: string | null;
  status: "planning" | "active" | "review" | "closed" | "completed";
  totalTasks: number;
  completedTasks: number;
  totalPoints: number;
  completedPoints: number;
}

interface Project {
  id: string;
  title: string;
  short_title?: string;
}

interface Member {
  userId: string;
  name: string;
  initials?: string;
  role?: string;
  memberType?: string;
}

export default function ScrumPlanning() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const selectedProjectId = searchParams.get("projectId") || "";

  const currentUser = getStoredUser();
  const isDosen = currentUser?.role === "dosen";
  const LayoutComponent = isDosen ? DosenLayout : OperatorLayout;

  const [projects, setProjects] = useState<Project[]>([]);
  const [activeProject, setActiveProject] = useState<Project | null>(null);
  const [sprints, setSprints] = useState<Sprint[]>([]);
  const [tasks, setTasks] = useState<any[]>([]);
  const [members, setMembers] = useState<Member[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [searchBacklog, setSearchBacklog] = useState("");

  // Modal states
  const [isSprintModalOpen, setIsSprintModalOpen] = useState(false);
  const [sprintForm, setSprintForm] = useState({
    name: "",
    goal: "",
    startDate: "",
    endDate: ""
  });

  const [isTaskModalOpen, setIsTaskModalOpen] = useState(false);
  const [taskForm, setTaskForm] = useState({
    id: "",
    title: "",
    description: "",
    storyPoints: 3,
    assigneeIds: [] as string[],
    sprintId: "" as string | null,
    divisionId: "" as string | null
  });
  const [isEditingTask, setIsEditingTask] = useState(false);

  // Division states
  const [divisions, setDivisions] = useState<ProjectDivision[]>([]);
  const [isDivisionModalOpen, setIsDivisionModalOpen] = useState(false);
  const [newDivisionName, setNewDivisionName] = useState("");
  const [editingDivisionId, setEditingDivisionId] = useState<string | null>(null);
  const [editingDivisionName, setEditingDivisionName] = useState("");
  const [divisionActionLoading, setDivisionActionLoading] = useState(false);

  // Division Roles states
  const [divisionRolesMap, setDivisionRolesMap] = useState<Record<string, DivisionRole[]>>({});
  const [expandedDivisionRoles, setExpandedDivisionRoles] = useState<Record<string, boolean>>({});
  const [newRoleInputs, setNewRoleInputs] = useState<Record<string, string>>({});
  const [roleError, setRoleError] = useState<Record<string, string>>({});
  const [roleActionLoading, setRoleActionLoading] = useState(false);


  // Load Projects
  useEffect(() => {
    const loadProjects = async () => {
      try {
        const endpoint = isDosen && currentUser?.id
          ? `/research/assigned?userId=${encodeURIComponent(currentUser.id)}`
          : "/research";
        const data = await apiGet<Project[]>(endpoint);
        const list = data || [];
        setProjects(list);
        if (list.length > 0) {
          const current = list.find((p) => p.id === selectedProjectId) || list[0];
          setActiveProject(current);
          if (current.id !== selectedProjectId) {
            setSearchParams({ projectId: current.id });
          }
        }
      } catch (err: any) {
        setError(err?.message || "Gagal memuat data penelitian");
      }
    };
    loadProjects();
  }, [isDosen, currentUser?.id]);

  // Load Sprints, Tasks, Members, and Divisions when activeProject changes
  const loadProjectData = async (projectId: string) => {
    if (!projectId) return;
    setLoading(true);
    try {
      const [sprintsData, boardData, membersData, divisionsData] = await Promise.all([
        apiGet<Sprint[]>(`/research/${projectId}/sprints`).catch(() => []),
        apiGet<any>(`/research/${projectId}/board`).catch(() => ({ tasks: [] })),
        apiGet<any[]>(`/research/${projectId}/members`).catch(() => []),
        apiGet<any[]>(`/research/${projectId}/divisions`).catch(() => [])
      ]);

      setSprints(sprintsData || []);
      setTasks(boardData?.tasks || []);
      const normalizedDivs = (divisionsData || []).map(normalizeDivisionItem);
      setDivisions(normalizedDivs);
      loadRolesForDivisions(projectId, normalizedDivs);
      setMembers(
        (membersData || []).map((m: any) => ({
          userId: m.user_id || m.userId,
          name: m.name,
          initials: m.initials,
          role: m.peran || m.role || "Anggota",
          memberType: m.member_type || m.memberType || (m.role === "dosen" ? "Dosen" : "Mahasiswa")
        }))
      );
    } catch (err: any) {
      setError(err?.message || "Gagal memuat detail Scrum");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (activeProject?.id) {
      loadProjectData(activeProject.id);
    }
  }, [activeProject?.id]);

  const handleSelectProject = (projectId: string) => {
    const p = projects.find((item) => item.id === projectId) || null;
    setActiveProject(p);
    setSearchParams({ projectId });
  };

  // Division Actions (Kelola Divisi)
  const handleCreateDivision = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeProject?.id || !newDivisionName.trim()) return;
    setDivisionActionLoading(true);
    try {
      await apiPost(`/research/${activeProject.id}/divisions`, { name: newDivisionName.trim() });
      setNewDivisionName("");
      const divs = await apiGet<any[]>(`/research/${activeProject.id}/divisions`).catch(() => []);
      setDivisions((divs || []).map(normalizeDivisionItem));
    } catch (err: any) {
      alert(err?.message || "Gagal menambahkan divisi.");
    } finally {
      setDivisionActionLoading(false);
    }
  };

  const handleRenameDivision = async (divisionId: string) => {
    if (!activeProject?.id || !editingDivisionName.trim()) return;
    setDivisionActionLoading(true);
    try {
      await apiPatch(`/research/${activeProject.id}/divisions/${divisionId}`, { name: editingDivisionName.trim() });
      setEditingDivisionId(null);
      setEditingDivisionName("");
      const divs = await apiGet<any[]>(`/research/${activeProject.id}/divisions`).catch(() => []);
      setDivisions((divs || []).map(normalizeDivisionItem));
    } catch (err: any) {
      alert(err?.message || "Gagal mengubah nama divisi.");
    } finally {
      setDivisionActionLoading(false);
    }
  };

  const handleToggleDivisionStatus = async (divisionId: string, currentActive: boolean) => {
    if (!activeProject?.id) return;
    setDivisionActionLoading(true);
    try {
      await apiPatch(`/research/${activeProject.id}/divisions/${divisionId}`, { isActive: !currentActive });
      const divs = await apiGet<any[]>(`/research/${activeProject.id}/divisions`).catch(() => []);
      setDivisions((divs || []).map(normalizeDivisionItem));
    } catch (err: any) {
      alert(err?.message || "Gagal mengubah status divisi.");
    } finally {
      setDivisionActionLoading(false);
    }
  };

  const handleReorderDivision = async (divisionId: string, direction: "up" | "down") => {
    if (!activeProject?.id) return;
    const index = divisions.findIndex((d) => d.id === divisionId);
    if (index < 0) return;
    const targetIndex = direction === "up" ? index - 1 : index + 1;
    if (targetIndex < 0 || targetIndex >= divisions.length) return;

    const currentDiv = divisions[index];
    const targetDiv = divisions[targetIndex];
    setDivisionActionLoading(true);
    try {
      await Promise.all([
        apiPatch(`/research/${activeProject.id}/divisions/${currentDiv.id}`, { sortOrder: targetDiv.sortOrder ?? targetIndex }),
        apiPatch(`/research/${activeProject.id}/divisions/${targetDiv.id}`, { sortOrder: currentDiv.sortOrder ?? index })
      ]);
      const divs = await apiGet<any[]>(`/research/${activeProject.id}/divisions`).catch(() => []);
      setDivisions((divs || []).map(normalizeDivisionItem));
    } catch (err: any) {
      alert(err?.message || "Gagal mengubah urutan divisi.");
    } finally {
      setDivisionActionLoading(false);
    }
  };

  const loadRolesForDivisions = async (projectId: string, divList: ProjectDivision[]) => {
    const rolesMap: Record<string, DivisionRole[]> = {};
    for (const div of divList) {
      try {
        const remote = await apiGet<any[]>(`/research/${projectId}/divisions/${div.id}/roles`).catch(() => null);
        if (Array.isArray(remote) && remote.length > 0) {
          rolesMap[div.id] = remote.map(normalizeDivisionRole);
        } else {
          rolesMap[div.id] = loadStoredDivisionRoles(projectId, div.id);
        }
      } catch {
        rolesMap[div.id] = loadStoredDivisionRoles(projectId, div.id);
      }
    }
    setDivisionRolesMap(rolesMap);
  };

  const handleAddDivisionRole = async (divisionId: string, divisionName: string) => {
    if (!activeProject?.id) return;
    const inputVal = (newRoleInputs[divisionId] || "").trim();
    const existing = divisionRolesMap[divisionId] || [];

    const validation = validateDivisionRoleName(inputVal, existing);
    if (!validation.valid) {
      setRoleError((prev) => ({ ...prev, [divisionId]: validation.error || "Nama role tidak valid." }));
      return;
    }

    setRoleActionLoading(true);
    setRoleError((prev) => ({ ...prev, [divisionId]: "" }));
    try {
      let createdRole: DivisionRole | null = null;
      try {
        const res = await apiPost<any>(`/research/${activeProject.id}/divisions/${divisionId}/roles`, {
          name: inputVal
        });
        if (res) {
          createdRole = normalizeDivisionRole(res);
        }
      } catch {
        // Fallback to local storage
      }

      if (!createdRole) {
        createdRole = {
          id: `drole-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
          divisionId,
          projectId: activeProject.id,
          name: inputVal,
          isActive: true,
          sortOrder: existing.length + 1
        };
      }

      const updated = [...existing, createdRole];
      saveStoredDivisionRoles(activeProject.id, divisionId, updated);
      setDivisionRolesMap((prev) => ({ ...prev, [divisionId]: updated }));
      setNewRoleInputs((prev) => ({ ...prev, [divisionId]: "" }));
    } catch (err: any) {
      setRoleError((prev) => ({ ...prev, [divisionId]: err?.message || "Gagal menambah role." }));
    } finally {
      setRoleActionLoading(false);
    }
  };

  const handleDeleteDivisionRole = async (divisionId: string, roleId: string, roleName: string) => {
    if (!activeProject?.id) return;
    if (!confirm(`Hapus role "${roleName}" dari divisi ini?`)) return;

    setRoleActionLoading(true);
    try {
      try {
        await apiDelete(`/research/${activeProject.id}/divisions/${divisionId}/roles/${roleId}`);
      } catch {
        // Fallback to local storage update
      }

      const existing = divisionRolesMap[divisionId] || [];
      const updated = existing.filter((r) => r.id !== roleId);
      saveStoredDivisionRoles(activeProject.id, divisionId, updated);
      setDivisionRolesMap((prev) => ({ ...prev, [divisionId]: updated }));
    } catch (err: any) {
      alert(err?.message || "Gagal menghapus role.");
    } finally {
      setRoleActionLoading(false);
    }
  };

  const handleApplyRecommendedRoles = (divisionId: string, divisionName: string) => {
    if (!activeProject?.id) return;
    const key = divisionName.trim().toLowerCase();
    let presets: string[] = [];
    for (const [prefix, roles] of Object.entries(DEFAULT_DIVISION_ROLES)) {
      if (key.includes(prefix)) {
        presets = roles;
        break;
      }
    }

    if (presets.length === 0) {
      alert("Tidak ditemukan preset rekomendasi untuk divisi ini.");
      return;
    }

    const existing = divisionRolesMap[divisionId] || [];
    const newItems: DivisionRole[] = [];
    presets.forEach((roleName) => {
      const exists = existing.some((r) => r.name.toLowerCase() === roleName.toLowerCase());
      if (!exists) {
        newItems.push({
          id: `drole-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
          divisionId,
          projectId: activeProject.id,
          name: roleName,
          isActive: true,
          sortOrder: existing.length + newItems.length + 1
        });
      }
    });

    if (newItems.length === 0) {
      alert("Semua role rekomendasi sudah ada di divisi ini.");
      return;
    }

    const updated = [...existing, ...newItems];
    saveStoredDivisionRoles(activeProject.id, divisionId, updated);
    setDivisionRolesMap((prev) => ({ ...prev, [divisionId]: updated }));
  };


  // Sprint Actions
  const handleCreateSprint = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeProject?.id || !sprintForm.name.trim()) return;

    try {
      await apiPost(`/research/${activeProject.id}/sprints`, {
        name: sprintForm.name.trim(),
        goal: sprintForm.goal.trim() || null,
        startDate: sprintForm.startDate || null,
        endDate: sprintForm.endDate || null,
        status: "planning"
      });

      setIsSprintModalOpen(false);
      setSprintForm({ name: "", goal: "", startDate: "", endDate: "" });
      await loadProjectData(activeProject.id);
    } catch (err: any) {
      alert(err?.message || "Gagal membuat sprint.");
    }
  };

  const handleStartSprint = async (sprintId: string) => {
    if (!activeProject?.id) return;
    if (!confirm("Mulai Sprint ini sekarang?")) return;

    try {
      await apiPatch(`/research/${activeProject.id}/sprints/${sprintId}`, { status: "active" });
      await loadProjectData(activeProject.id);
    } catch (err: any) {
      alert(err?.message || "Gagal memulai sprint.");
    }
  };

  const handleEndSprint = async (sprintId: string) => {
    if (!activeProject?.id) return;
    if (!confirm(END_SPRINT_CONFIRMATION_MESSAGE)) return;

    try {
      await apiPatch(`/research/${activeProject.id}/sprints/${sprintId}`, { status: "review" });
      await loadProjectData(activeProject.id);
    } catch (err: any) {
      alert(err?.message || "Gagal mengakhiri sprint.");
    }
  };

  const handleDeleteSprint = async (sprintId: string) => {
    if (!activeProject?.id) return;
    if (!confirm("Hapus Sprint ini? Semua tugas di dalamnya akan dikembalikan ke Product Backlog.")) return;

    try {
      await apiDelete(`/research/${activeProject.id}/sprints/${sprintId}`);
      await loadProjectData(activeProject.id);
    } catch (err: any) {
      alert(err?.message || "Gagal menghapus sprint.");
    }
  };

  // Task Actions
  const handleSaveTask = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeProject?.id || !taskForm.title.trim()) return;

    const activeDivisions = divisions.filter((d) => d.isActive !== false);
    if (!isEditingTask && activeDivisions.length > 0 && !taskForm.divisionId) {
      alert("Divisi wajib dipilih untuk proyek ini.");
      return;
    }

    try {
      if (isEditingTask && taskForm.id) {
        await apiPatch(`/research/${activeProject.id}/board/tasks/${taskForm.id}`, {
          title: taskForm.title.trim(),
          description: taskForm.description.trim() || null,
          storyPoints: taskForm.storyPoints,
          assigneeIds: taskForm.assigneeIds,
          sprintId: taskForm.sprintId,
          divisionId: taskForm.divisionId || null
        });
      } else {
        await apiPost(`/research/${activeProject.id}/board/tasks`, {
          title: taskForm.title.trim(),
          description: taskForm.description.trim() || null,
          storyPoints: taskForm.storyPoints,
          assigneeIds: taskForm.assigneeIds,
          sprintId: taskForm.sprintId,
          divisionId: taskForm.divisionId || null,
          status: "TO DO"
        });
      }

      setIsTaskModalOpen(false);
      setTaskForm({ id: "", title: "", description: "", storyPoints: 3, assigneeIds: [], sprintId: null, divisionId: "" });
      await loadProjectData(activeProject.id);
    } catch (err: any) {
      alert(err?.message || "Gagal menyimpan task.");
    }
  };

  const handleMoveTaskToSprint = async (taskId: string, sprintId: string | null) => {
    if (!activeProject?.id) return;
    try {
      await apiPatch(`/research/${activeProject.id}/board/tasks/${taskId}`, {
        sprintId: sprintId
      });
      await loadProjectData(activeProject.id);
    } catch (err: any) {
      alert(err?.message || "Gagal memindahkan task.");
    }
  };

  const handleDeleteTask = async (taskId: string) => {
    if (!activeProject?.id) return;
    if (!confirm("Hapus tugas ini?")) return;
    try {
      await apiDelete(`/research/${activeProject.id}/board/tasks/${taskId}`);
      await loadProjectData(activeProject.id);
    } catch (err: any) {
      alert(err?.message || "Gagal menghapus tugas.");
    }
  };

  const openEditTaskModal = (task: any) => {
    setIsEditingTask(true);
    setTaskForm({
      id: task.id,
      title: task.title,
      description: task.description || "",
      storyPoints: task.storyPoints ?? task.story_points ?? 3,
      assigneeIds: task.assigneeIds || task.assignee_ids || [],
      sprintId: task.sprintId ?? task.sprint_id ?? null,
      divisionId: task.divisionId ?? task.division_id ?? ""
    });
    setIsTaskModalOpen(true);
  };

  const openCreateTaskModal = (defaultSprintId: string | null = null) => {
    setIsEditingTask(false);
    setTaskForm({
      id: "",
      title: "",
      description: "",
      storyPoints: 3,
      assigneeIds: [],
      sprintId: defaultSprintId,
      divisionId: ""
    });
    setIsTaskModalOpen(true);
  };

  // Group tasks
  const backlogTasks = tasks.filter((t) => !t.sprintId && !t.sprint_id).filter((t) => {
    if (!searchBacklog.trim()) return true;
    return t.title.toLowerCase().includes(searchBacklog.toLowerCase());
  });

  const activeSprint = sprints.find((s) => s.status === "active");

  // Hanya mahasiswa yang dapat ditugaskan (Dosen bertindak sebagai pemberi tugas)
  const assignableStudents = members.filter((m) => {
    const isDosenMember =
      String(m.memberType || "").toLowerCase() === "dosen" ||
      String(m.role || "").toLowerCase() === "dosen" ||
      String(m.role || "").toLowerCase().includes("pembimbing");
    return !isDosenMember;
  });

  return (
    <LayoutComponent title="Manajemen Scrum & Sprint">
      <div className="flex flex-col gap-6 pb-12">
        {/* Top Header & Project Selector */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-white p-5 rounded-[20px] border border-border shadow-sm">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <span className="p-2 bg-purple-50 text-purple-600 rounded-xl">
                <Kanban size={20} />
              </span>
              <h2 className="text-xl font-black text-foreground">Scrum & Sprint Planning</h2>
            </div>
            <p className="text-xs text-muted-foreground">
              Rencanakan siklus kerja (Sprint), tentukan bobot kesulitan (Fibonacci), dan tugaskan mahasiswa.
            </p>
          </div>

          <div className="flex items-center gap-3">
            <select
              value={activeProject?.id || ""}
              onChange={(e) => handleSelectProject(e.target.value)}
              className="h-11 px-4 text-xs font-black bg-slate-50 border border-border rounded-xl focus:outline-none focus:ring-2 focus:ring-primary/20 cursor-pointer min-w-[220px]"
            >
              {projects.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.short_title || p.title}
                </option>
              ))}
            </select>

            {activeProject && (
              <>
                <button
                  onClick={() => setIsDivisionModalOpen(true)}
                  className="h-11 px-4 bg-purple-50 hover:bg-purple-100 text-purple-700 text-xs font-black rounded-xl transition-colors flex items-center gap-2 border border-purple-200"
                  title="Kelola Divisi Riset"
                >
                  <Layers size={14} />
                  <span>Kelola Divisi</span>
                </button>
                <button
                  onClick={() => navigate(isDosen ? `/dosen/scrum?projectId=${activeProject.id}` : `/operator/scrum?projectId=${activeProject.id}`)}
                  className="h-11 px-4 bg-slate-900 hover:bg-slate-800 text-white text-xs font-black rounded-xl transition-colors flex items-center gap-2 shadow-sm"
                  title="Buka Sprint Summary & Review"
                >
                  <span>Buka Sprint Summary</span>
                  <ExternalLink size={14} />
                </button>
                <button
                  onClick={() => navigate(isDosen ? `/dosen/riset?projectId=${activeProject.id}` : `/operator/riset?projectId=${activeProject.id}`)}
                  className="h-11 px-4 bg-slate-100 hover:bg-slate-200 text-foreground text-xs font-black rounded-xl transition-colors flex items-center gap-2"
                  title="Buka Papan Kanban Utama"
                >
                  <span>Live Kanban</span>
                  <ExternalLink size={14} />
                </button>
              </>
            )}
          </div>
        </div>

        {/* Stats Highlight Bar */}
        {activeProject && (
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <div className="bg-white p-4 rounded-2xl border border-border shadow-sm flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-purple-50 text-purple-600 flex items-center justify-center shrink-0">
                <Layers size={18} />
              </div>
              <div className="min-w-0">
                <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider block">
                  Sprint Aktif
                </span>
                <p className="text-sm font-black text-foreground truncate">
                  {activeSprint ? activeSprint.name : "Belum ada sprint aktif"}
                </p>
              </div>
            </div>

            <div className="bg-white p-4 rounded-2xl border border-border shadow-sm flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-amber-50 text-amber-600 flex items-center justify-center shrink-0">
                <Zap size={18} />
              </div>
              <div>
                <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider block">
                  Beban Sprint Aktif
                </span>
                <p className="text-sm font-black text-foreground">
                  {activeSprint ? `${activeSprint.totalPoints} Story Points` : "0 SP"}
                </p>
              </div>
            </div>

            <div className="bg-white p-4 rounded-2xl border border-border shadow-sm flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center shrink-0">
                <CheckCircle2 size={18} />
              </div>
              <div>
                <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider block">
                  Progres Pengerjaan
                </span>
                <p className="text-sm font-black text-foreground">
                  {activeSprint
                    ? `${activeSprint.completedTasks} / ${activeSprint.totalTasks} Selesai`
                    : "0 Selesai"}
                </p>
              </div>
            </div>

            <div className="bg-white p-4 rounded-2xl border border-border shadow-sm flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center shrink-0">
                <Clock size={18} />
              </div>
              <div>
                <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider block">
                  Antrean Backlog
                </span>
                <p className="text-sm font-black text-foreground">{backlogTasks.length} Tugas Menunggu</p>
              </div>
            </div>
          </div>
        )}

        {/* Two-Column Scrum Board (Product Backlog & Sprints) */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
          {/* LEFT: Product Backlog (5 Cols) */}
          <div className="lg:col-span-5 bg-white border border-border rounded-[20px] shadow-sm p-5 flex flex-col gap-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <h3 className="text-sm font-black text-foreground">Product Backlog</h3>
                <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-slate-100 text-slate-700">
                  {backlogTasks.length}
                </span>
              </div>

              <button
                onClick={() => openCreateTaskModal(null)}
                className="px-3 py-1.5 bg-primary hover:bg-primary/90 text-white text-xs font-black rounded-xl transition-colors flex items-center gap-1.5 shadow-sm shadow-primary/20"
              >
                <Plus size={14} strokeWidth={3} />
                <span>Tambah Task</span>
              </button>
            </div>

            {/* Backlog Search */}
            <div className="relative">
              <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
              <input
                type="text"
                placeholder="Cari task di backlog..."
                value={searchBacklog}
                onChange={(e) => setSearchBacklog(e.target.value)}
                className="w-full h-9 pl-9 pr-3 text-xs bg-slate-50 border border-border rounded-xl focus:outline-none focus:ring-1 focus:ring-primary"
              />
            </div>

            {/* Backlog List */}
            <div className="flex flex-col gap-2.5 max-h-[600px] overflow-y-auto pr-1">
              {backlogTasks.length === 0 ? (
                <div className="p-8 text-center border-2 border-dashed border-border rounded-2xl">
                  <p className="text-xs font-bold text-muted-foreground mb-2">Backlog kosong</p>
                  <p className="text-[11px] text-muted-foreground">
                    Semua tugas sudah masuk ke dalam Sprint atau belum ada tugas yang ditambahkan.
                  </p>
                </div>
              ) : (
                backlogTasks.map((task) => {
                  const sp = task.storyPoints ?? task.story_points ?? 3;
                  const taskAssignees = task.assignees || [];
                  const taskDivisionName =
                    task.divisionName ||
                    task.division_name ||
                    divisions.find((d) => d.id === (task.divisionId ?? task.division_id))?.name;

                  return (
                    <div
                      key={task.id}
                      className="p-3.5 bg-slate-50 hover:bg-slate-100/80 border border-slate-200/80 rounded-xl transition-all flex flex-col gap-2 group"
                    >
                      <div className="flex items-start justify-between gap-2">
                        <p className="text-xs font-bold text-foreground leading-snug">{task.title}</p>
                        <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                          <button
                            onClick={() => openEditTaskModal(task)}
                            className="p-1 hover:bg-white text-muted-foreground hover:text-foreground rounded-md"
                            title="Edit"
                          >
                            <Pencil size={12} />
                          </button>
                          <button
                            onClick={() => handleDeleteTask(task.id)}
                            className="p-1 hover:bg-red-50 text-muted-foreground hover:text-red-500 rounded-md"
                            title="Hapus"
                          >
                            <Trash2 size={12} />
                          </button>
                        </div>
                      </div>

                      {task.description && (
                        <p className="text-[11px] text-muted-foreground line-clamp-1">{task.description}</p>
                      )}

                      <div className="flex items-center justify-between pt-1 border-t border-slate-200/50">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="px-2 py-0.5 rounded-md text-[10px] font-black bg-purple-50 text-purple-700 border border-purple-200">
                            ⚡ {sp} SP
                          </span>

                          {taskDivisionName ? (
                            <span className="px-2 py-0.5 rounded-md text-[10px] font-bold bg-slate-100 text-slate-700 border border-slate-200">
                              {taskDivisionName}
                            </span>
                          ) : (
                            <span className="px-2 py-0.5 rounded-md text-[10px] font-bold bg-slate-50 text-slate-500 border border-dashed border-slate-300">
                              Belum Ada Divisi
                            </span>
                          )}

                          <div className="flex items-center -space-x-1">
                            {taskAssignees.map((a: any, i: number) => (
                              <div
                                key={i}
                                className="w-5 h-5 rounded-full bg-primary/20 text-primary border border-white flex items-center justify-center text-[8px] font-black"
                                title={a.name}
                              >
                                {a.initials || a.name?.slice(0, 2)?.toUpperCase()}
                              </div>
                            ))}
                            {taskAssignees.length === 0 && (
                              <span className="text-[10px] text-muted-foreground italic">Belum di-assign</span>
                            )}
                          </div>
                        </div>

                        {/* Move to Sprint action */}
                        {sprints.length > 0 && (
                          <div className="flex items-center gap-1">
                            <select
                              onChange={(e) => {
                                if (e.target.value) handleMoveTaskToSprint(task.id, e.target.value);
                              }}
                              defaultValue=""
                              className="text-[10px] font-bold bg-white border border-border px-2 py-1 rounded-lg text-muted-foreground hover:text-foreground cursor-pointer focus:outline-none"
                            >
                              <option value="" disabled>
                                + Masukkan ke Sprint...
                              </option>
                              {sprints
                                .filter((s) => s.status !== "completed" && s.status !== "closed")
                                .map((s) => (
                                  <option key={s.id} value={s.id}>
                                    {s.name} {s.status === "active" ? "(Aktif)" : s.status === "review" ? "(Review)" : ""}
                                  </option>
                                ))}
                            </select>
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>

          {/* RIGHT: Sprints Area (7 Cols) */}
          <div className="lg:col-span-7 flex flex-col gap-4">
            <div className="flex items-center justify-between bg-white p-4 rounded-[20px] border border-border shadow-sm">
              <div className="flex items-center gap-2">
                <h3 className="text-sm font-black text-foreground">Daftar Sprint</h3>
                <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-slate-100 text-slate-700">
                  {sprints.length} Sprint
                </span>
              </div>

              <button
                onClick={() => setIsSprintModalOpen(true)}
                className="px-3.5 py-1.5 bg-slate-900 hover:bg-slate-800 text-white text-xs font-black rounded-xl transition-colors flex items-center gap-1.5 shadow-sm"
              >
                <Plus size={14} strokeWidth={3} />
                <span>Buat Sprint Baru</span>
              </button>
            </div>

            {/* Sprints List */}
            <div className="flex flex-col gap-4">
              {sprints.length === 0 ? (
                <div className="p-10 text-center bg-white border-2 border-dashed border-border rounded-[20px]">
                  <p className="text-sm font-black text-foreground mb-1">Belum ada Sprint</p>
                  <p className="text-xs text-muted-foreground max-w-md mx-auto mb-4">
                    Buat Sprint pertama untuk proyek riset ini, lalu masukkan tugas dari Product Backlog.
                  </p>
                  <button
                    onClick={() => setIsSprintModalOpen(true)}
                    className="px-4 py-2 bg-primary text-white text-xs font-black rounded-xl"
                  >
                    + Buat Sprint Pertama
                  </button>
                </div>
              ) : (
                sprints.map((sprint) => {
                  const sprintTasks = tasks.filter(
                    (t) => (t.sprintId ?? t.sprint_id) === sprint.id
                  );
                  const isPlanning = sprint.status === "planning";
                  const isActive = sprint.status === "active";
                  const isReview = sprint.status === "review";
                  const isClosed = sprint.status === "closed" || sprint.status === "completed";

                  return (
                    <div
                      key={sprint.id}
                      className={`bg-white rounded-[20px] border transition-all p-5 flex flex-col gap-4 shadow-sm ${
                        isActive
                          ? "border-purple-300 ring-2 ring-purple-100 bg-purple-50/10"
                          : isReview
                          ? "border-amber-300 ring-2 ring-amber-100 bg-amber-50/10"
                          : isClosed
                          ? "border-slate-200 opacity-80"
                          : "border-border"
                      }`}
                    >
                      {/* Sprint Header */}
                      <div className="flex flex-col md:flex-row md:items-center justify-between gap-2 pb-3 border-b border-border/60">
                        <div>
                          <div className="flex items-center gap-2.5">
                            <h4 className="text-base font-black text-foreground">{sprint.name}</h4>
                            <span
                              className={`px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider ${
                                isActive
                                  ? "bg-purple-100 text-purple-700 animate-pulse"
                                  : isReview
                                  ? "bg-amber-100 text-amber-800"
                                  : isClosed
                                  ? "bg-slate-100 text-slate-600"
                                  : "bg-blue-50 text-blue-700"
                              }`}
                            >
                              {isActive
                                ? "Sedang Aktif"
                                : isReview
                                ? "MENUNGGU REVIEW"
                                : isClosed
                                ? "Selesai"
                                : "Planning"}
                            </span>
                            <span className="text-xs font-black text-purple-700">
                              ⚡ {sprint.totalPoints} SP
                            </span>
                          </div>
                          {sprint.goal && (
                            <p className="text-xs text-muted-foreground mt-0.5">{sprint.goal}</p>
                          )}
                          {isReview && (
                            <p className="text-xs text-amber-700 mt-1 font-medium">
                              Sprint sedang dalam tahap Review. Summary dan evaluasi Sprint perlu diselesaikan sebelum Sprint berikutnya dapat dimulai.
                            </p>
                          )}
                          {(sprint.startDate || sprint.endDate) && (
                            <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground mt-1">
                              <Calendar size={12} />
                              <span>
                                {sprint.startDate || "?"} s/d {sprint.endDate || "?"}
                              </span>
                            </div>
                          )}
                        </div>

                        {/* Sprint Controls */}
                        <div className="flex items-center gap-2">
                          {isPlanning && (
                            <button
                              onClick={() => handleStartSprint(sprint.id)}
                              className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-black rounded-xl transition-colors flex items-center gap-1 shadow-sm"
                            >
                              <Play size={12} fill="currentColor" />
                              <span>Mulai Sprint</span>
                            </button>
                          )}

                          {isActive && (
                            <button
                              onClick={() => handleEndSprint(sprint.id)}
                              className="px-3 py-1.5 bg-purple-600 hover:bg-purple-700 text-white text-xs font-black rounded-xl transition-colors flex items-center gap-1 shadow-sm"
                            >
                              <CheckCircle2 size={14} />
                              <span>Akhiri Sprint</span>
                            </button>
                          )}

                          {isReview && (
                            <button
                              onClick={() => navigate(isDosen ? `/dosen/scrum?projectId=${activeProject?.id}&sprintId=${sprint.id}` : `/operator/scrum?projectId=${activeProject?.id}&sprintId=${sprint.id}`)}
                              className="px-3 py-1.5 bg-amber-600 hover:bg-amber-700 text-white text-xs font-black rounded-xl transition-colors flex items-center gap-1 shadow-sm"
                            >
                              <FileText size={14} />
                              <span>Buka Summary</span>
                            </button>
                          )}

                          {isClosed && (
                            <button
                              onClick={() => navigate(isDosen ? `/dosen/scrum?projectId=${activeProject?.id}&sprintId=${sprint.id}` : `/operator/scrum?projectId=${activeProject?.id}&sprintId=${sprint.id}`)}
                              className="px-3 py-1.5 bg-slate-700 hover:bg-slate-800 text-white text-xs font-black rounded-xl transition-colors flex items-center gap-1 shadow-sm"
                            >
                              <FileText size={14} />
                              <span>Lihat Summary</span>
                            </button>
                          )}

                          {!isClosed && (
                            <button
                              onClick={() => openCreateTaskModal(sprint.id)}
                              className="p-1.5 hover:bg-slate-100 text-muted-foreground hover:text-foreground rounded-lg transition-colors"
                              title="Tambah task ke sprint ini"
                            >
                              <Plus size={16} />
                            </button>
                          )}

                          {isPlanning && (
                            <button
                              onClick={() => handleDeleteSprint(sprint.id)}
                              className="p-1.5 hover:bg-red-50 text-muted-foreground hover:text-red-500 rounded-lg transition-colors"
                              title="Hapus sprint"
                            >
                              <Trash2 size={16} />
                            </button>
                          )}
                        </div>
                      </div>

                      {/* Tasks in Sprint */}
                      <div className="flex flex-col gap-2">
                        {sprintTasks.length === 0 ? (
                          <div className="p-4 text-center border border-dashed border-border rounded-xl text-xs text-muted-foreground">
                            Belum ada task di dalam Sprint ini. Pindahkan dari Product Backlog di sebelah kiri.
                          </div>
                        ) : (
                          sprintTasks.map((task) => {
                            const sp = task.storyPoints ?? task.story_points ?? 3;
                            const taskAssignees = task.assignees || [];
                            const isTaskDone = task.status === "DONE";
                            const taskDivisionName =
                              task.divisionName ||
                              task.division_name ||
                              divisions.find((d) => d.id === (task.divisionId ?? task.division_id))?.name;

                            return (
                              <div
                                key={task.id}
                                className={`p-3 rounded-xl border transition-all flex items-center justify-between gap-3 ${
                                  isTaskDone
                                    ? "bg-emerald-50/40 border-emerald-200/60 text-muted-foreground"
                                    : "bg-white border-slate-200 hover:border-slate-300"
                                }`}
                              >
                                <div className="flex items-center gap-2.5 min-w-0 flex-1">
                                  <span
                                    className={`w-2 h-2 rounded-full shrink-0 ${
                                      task.status === "DONE"
                                        ? "bg-emerald-500"
                                        : task.status === "DOING"
                                        ? "bg-blue-500"
                                        : task.status === "REVIEW"
                                        ? "bg-amber-500"
                                        : "bg-slate-300"
                                    }`}
                                  />
                                  <span
                                    className={`text-xs font-bold truncate ${
                                      isTaskDone ? "line-through text-muted-foreground" : "text-foreground"
                                    }`}
                                  >
                                    {task.title}
                                  </span>
                                </div>

                                <div className="flex items-center gap-3 shrink-0 flex-wrap">
                                  <span className="px-2 py-0.5 rounded-md text-[10px] font-black bg-purple-50 text-purple-700 border border-purple-200">
                                    ⚡ {sp} SP
                                  </span>

                                  {taskDivisionName ? (
                                    <span className="px-2 py-0.5 rounded-md text-[10px] font-bold bg-slate-100 text-slate-700 border border-slate-200">
                                      {taskDivisionName}
                                    </span>
                                  ) : (
                                    <span className="px-2 py-0.5 rounded-md text-[10px] font-bold bg-slate-50 text-slate-500 border border-dashed border-slate-300">
                                      Belum Ada Divisi
                                    </span>
                                  )}

                                  <div className="flex items-center -space-x-1">
                                    {taskAssignees.map((a: any, i: number) => (
                                      <div
                                        key={i}
                                        className="w-5 h-5 rounded-full bg-primary/20 text-primary border border-white flex items-center justify-center text-[8px] font-black"
                                        title={a.name}
                                      >
                                        {a.initials || a.name?.slice(0, 2)?.toUpperCase()}
                                      </div>
                                    ))}
                                  </div>

                                  <span
                                    className={`text-[10px] font-black px-2 py-0.5 rounded ${
                                      task.status === "DONE"
                                        ? "bg-emerald-100 text-emerald-700"
                                        : task.status === "DOING"
                                        ? "bg-blue-100 text-blue-700"
                                        : task.status === "REVIEW"
                                        ? "bg-amber-100 text-amber-700"
                                        : "bg-slate-100 text-slate-600"
                                    }`}
                                  >
                                    {task.status}
                                  </span>

                                  {/* Quick move back to backlog */}
                                  <button
                                    onClick={() => handleMoveTaskToSprint(task.id, null)}
                                    className="text-[10px] font-bold text-muted-foreground hover:text-red-500 px-1.5 py-0.5 border border-border rounded hover:bg-slate-50 transition-colors"
                                    title="Kembalikan ke Backlog"
                                  >
                                    Ke Backlog
                                  </button>
                                </div>
                              </div>
                            );
                          })
                        )}
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>
        </div>
      </div>

      {/* MODAL: Buat Sprint Baru */}
      {isSprintModalOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4"
          onClick={() => setIsSprintModalOpen(false)}
        >
          <div
            className="bg-white rounded-[24px] shadow-2xl w-full max-w-md p-6 flex flex-col gap-4 border border-border"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="text-base font-black text-foreground">Buat Sprint Baru</h3>

            <form onSubmit={handleCreateSprint} className="flex flex-col gap-3.5">
              <div>
                <label className="text-xs font-black text-foreground block mb-1">Nama Sprint</label>
                <input
                  type="text"
                  placeholder="Contoh: Sprint 1 - Otentikasi & Setup"
                  value={sprintForm.name}
                  onChange={(e) => setSprintForm({ ...sprintForm, name: e.target.value })}
                  className="w-full h-10 px-3.5 text-xs bg-slate-50 border border-border rounded-xl focus:outline-none focus:ring-1 focus:ring-primary"
                  required
                />
              </div>

              <div>
                <label className="text-xs font-black text-foreground block mb-1">Tujuan / Goal Sprint</label>
                <textarea
                  placeholder="Target utama yang harus diselesaikan pada sprint ini..."
                  value={sprintForm.goal}
                  onChange={(e) => setSprintForm({ ...sprintForm, goal: e.target.value })}
                  className="w-full p-3 text-xs bg-slate-50 border border-border rounded-xl focus:outline-none focus:ring-1 focus:ring-primary min-h-[70px]"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-black text-foreground block mb-1">Tanggal Mulai</label>
                  <input
                    type="date"
                    value={sprintForm.startDate}
                    onChange={(e) => setSprintForm({ ...sprintForm, startDate: e.target.value })}
                    className="w-full h-10 px-3 text-xs bg-slate-50 border border-border rounded-xl focus:outline-none focus:ring-1 focus:ring-primary"
                  />
                </div>
                <div>
                  <label className="text-xs font-black text-foreground block mb-1">Tanggal Selesai</label>
                  <input
                    type="date"
                    value={sprintForm.endDate}
                    onChange={(e) => setSprintForm({ ...sprintForm, endDate: e.target.value })}
                    className="w-full h-10 px-3 text-xs bg-slate-50 border border-border rounded-xl focus:outline-none focus:ring-1 focus:ring-primary"
                  />
                </div>
              </div>

              <div className="flex gap-2.5 pt-2">
                <button
                  type="button"
                  onClick={() => setIsSprintModalOpen(false)}
                  className="flex-1 h-10 border border-border rounded-xl text-xs font-bold text-muted-foreground hover:bg-slate-50 transition-colors"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  className="flex-1 h-10 bg-primary hover:bg-primary/90 text-white text-xs font-black rounded-xl transition-colors shadow-sm shadow-primary/20"
                >
                  Simpan Sprint
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL: Tambah / Edit Task */}
      {isTaskModalOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4"
          onClick={() => setIsTaskModalOpen(false)}
        >
          <div
            className="bg-white rounded-[24px] shadow-2xl w-full max-w-lg p-6 flex flex-col gap-4 border border-border"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="text-base font-black text-foreground">
              {isEditingTask ? "Edit Tugas Scrum" : "Tambah Tugas Baru"}
            </h3>

            <form onSubmit={handleSaveTask} className="flex flex-col gap-3.5">
              <div>
                <label className="text-xs font-black text-foreground block mb-1">Judul Tugas</label>
                <input
                  type="text"
                  placeholder="Contoh: Implementasi JWT Auth & Middleware"
                  value={taskForm.title}
                  onChange={(e) => setTaskForm({ ...taskForm, title: e.target.value })}
                  className="w-full h-10 px-3.5 text-xs bg-slate-50 border border-border rounded-xl focus:outline-none focus:ring-1 focus:ring-primary"
                  required
                />
              </div>

              <div>
                <label className="text-xs font-black text-foreground block mb-1">Deskripsi Pengerjaan</label>
                <textarea
                  placeholder="Petunjuk atau spesifikasi fitur yang perlu dikerjakan..."
                  value={taskForm.description}
                  onChange={(e) => setTaskForm({ ...taskForm, description: e.target.value })}
                  className="w-full p-3 text-xs bg-slate-50 border border-border rounded-xl focus:outline-none focus:ring-1 focus:ring-primary min-h-[70px]"
                />
              </div>

              {/* Fibonacci Story Points */}
              <div>
                <label className="text-xs font-black text-foreground block mb-1.5 flex items-center gap-1">
                  <span>Tingkat Kesulitan (Fibonacci Story Points)</span>
                  <span className="text-purple-600">⚡</span>
                </label>
                <div className="flex items-center gap-2">
                  {FIBONACCI_POINTS.map((points) => (
                    <button
                      key={points}
                      type="button"
                      onClick={() => setTaskForm({ ...taskForm, storyPoints: points })}
                      className={`flex-1 h-9 rounded-xl text-xs font-black transition-all border ${
                        taskForm.storyPoints === points
                          ? "bg-purple-600 text-white border-purple-600 shadow-sm shadow-purple-200"
                          : "bg-slate-50 hover:bg-slate-100 text-foreground border-slate-200"
                      }`}
                    >
                      {points}
                    </button>
                  ))}
                </div>
                <p className="text-[10px] text-muted-foreground mt-1.5">
                  1-2: Mudah | 3-5: Sedang | 8-13: Sulit/Kompleks | 21: Sangat Besar
                </p>
              </div>

              {/* Assignees Selection */}
              <div>
                <label className="text-xs font-black text-foreground block mb-1.5">
                  Tugaskan ke Mahasiswa (Assignee)
                </label>
                <div className="flex flex-col gap-1.5 max-h-36 overflow-y-auto p-2 bg-slate-50 border border-border rounded-xl">
                  {assignableStudents.length === 0 ? (
                    <p className="text-xs text-muted-foreground text-center py-2">
                      Belum ada mahasiswa di riset ini untuk ditugaskan.
                    </p>
                  ) : (
                    assignableStudents.map((member) => {
                      const isSelected = taskForm.assigneeIds.includes(member.userId);
                      return (
                        <label
                          key={member.userId}
                          className={`flex items-center justify-between p-2 rounded-lg cursor-pointer transition-colors ${
                            isSelected ? "bg-purple-50 text-purple-900 font-bold" : "hover:bg-slate-100 text-foreground"
                          }`}
                        >
                          <div className="flex items-center gap-2">
                            <input
                              type="checkbox"
                              checked={isSelected}
                              onChange={(e) => {
                                if (e.target.checked) {
                                  setTaskForm({
                                    ...taskForm,
                                    assigneeIds: [...taskForm.assigneeIds, member.userId]
                                  });
                                } else {
                                  setTaskForm({
                                    ...taskForm,
                                    assigneeIds: taskForm.assigneeIds.filter((id) => id !== member.userId)
                                  });
                                }
                              }}
                              className="rounded border-border text-primary focus:ring-primary"
                            />
                            <span className="text-xs">{member.name}</span>
                          </div>
                          <span className="text-[10px] text-muted-foreground">{member.role}</span>
                        </label>
                      );
                    })
                  )}
                </div>
                <p className="text-[10px] text-muted-foreground mt-1">
                  * Dosen / Pembimbing berperan sebagai pemberi tugas, sehingga hanya mahasiswa riset yang dapat ditugaskan.
                </p>
              </div>

              {/* Division Selection */}
              <div>
                <label className="text-xs font-black text-foreground block mb-1">
                  Divisi {divisions.filter((d) => d.isActive !== false).length > 0 && <span className="text-red-500">*</span>}
                </label>
                <select
                  value={taskForm.divisionId || ""}
                  onChange={(e) => setTaskForm({ ...taskForm, divisionId: e.target.value || null })}
                  className="w-full h-10 px-3 text-xs bg-slate-50 border border-border rounded-xl focus:outline-none focus:ring-1 focus:ring-primary cursor-pointer"
                >
                  {divisions.filter((d) => d.isActive !== false).length > 0 ? (
                    <option value="">-- Pilih Divisi --</option>
                  ) : (
                    <option value="">Tanpa Divisi (Proyek belum memiliki divisi)</option>
                  )}
                  {divisions.map((d) => (
                    <option key={d.id} value={d.id}>
                      {d.name} {d.isActive === false ? "(Nonaktif)" : ""}
                    </option>
                  ))}
                </select>
              </div>

              {/* Sprint Destination */}
              <div>
                <label className="text-xs font-black text-foreground block mb-1">Tujuan Sprint</label>
                <select
                  value={taskForm.sprintId || ""}
                  onChange={(e) => setTaskForm({ ...taskForm, sprintId: e.target.value || null })}
                  className="w-full h-10 px-3 text-xs bg-slate-50 border border-border rounded-xl focus:outline-none focus:ring-1 focus:ring-primary cursor-pointer"
                >
                  <option value="">Simpan di Product Backlog (Belum dijadwalkan)</option>
                  {sprints
                    .filter((s) => s.status !== "completed" && s.status !== "closed")
                    .map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.name} {s.status === "active" ? "(Sedang Aktif)" : s.status === "review" ? "(Review)" : ""}
                      </option>
                    ))}
                </select>
              </div>

              <div className="flex gap-2.5 pt-2">
                <button
                  type="button"
                  onClick={() => setIsTaskModalOpen(false)}
                  className="flex-1 h-10 border border-border rounded-xl text-xs font-bold text-muted-foreground hover:bg-slate-50 transition-colors"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  className="flex-1 h-10 bg-primary hover:bg-primary/90 text-white text-xs font-black rounded-xl transition-colors shadow-sm shadow-primary/20"
                >
                  {isEditingTask ? "Simpan Perubahan" : "Tambahkan Tugas"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ══ Kelola Divisi Modal ══ */}
      {isDivisionModalOpen && activeProject && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4"
          onClick={() => {
            setIsDivisionModalOpen(false);
            setEditingDivisionId(null);
          }}
        >
          <div
            className="bg-white rounded-[24px] shadow-2xl w-full max-w-lg p-6 flex flex-col gap-4 border border-border max-h-[85vh] overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between pb-3 border-b border-border">
              <div className="flex items-center gap-2.5">
                <span className="p-2 bg-purple-50 text-purple-600 rounded-xl">
                  <Layers size={20} />
                </span>
                <div>
                  <h3 className="text-base font-black text-foreground">Kelola Divisi Proyek</h3>
                  <p className="text-xs text-muted-foreground">{activeProject.short_title || activeProject.title}</p>
                </div>
              </div>
              <button
                onClick={() => {
                  setIsDivisionModalOpen(false);
                  setEditingDivisionId(null);
                }}
                className="w-8 h-8 rounded-full bg-slate-50 hover:bg-slate-100 text-slate-500 flex items-center justify-center transition-colors"
              >
                <X size={18} />
              </button>
            </div>

            <div className="overflow-y-auto flex flex-col gap-4 pr-1">
              {/* Form Tambah Divisi */}
              <form onSubmit={handleCreateDivision} className="flex gap-2">
                <input
                  type="text"
                  placeholder="Nama Divisi baru (cth: Web, IoT, AI)..."
                  value={newDivisionName}
                  onChange={(e) => setNewDivisionName(e.target.value)}
                  className="flex-1 h-10 px-3.5 text-xs bg-slate-50 border border-border rounded-xl focus:outline-none focus:ring-1 focus:ring-primary"
                />
                <button
                  type="submit"
                  disabled={!newDivisionName.trim() || divisionActionLoading}
                  className="px-4 h-10 bg-primary hover:bg-primary/90 disabled:opacity-50 text-white text-xs font-black rounded-xl transition-colors flex items-center gap-1.5 shrink-0 shadow-sm"
                >
                  <Plus size={14} strokeWidth={3} />
                  <span>Tambah</span>
                </button>
              </form>

              {/* Daftar Divisi */}
              <div className="flex flex-col gap-2 pt-2 border-t border-border">
                <span className="text-[11px] font-bold text-muted-foreground uppercase tracking-wider">
                  Daftar Divisi ({divisions.length})
                </span>

                {divisions.length === 0 ? (
                  <div className="p-6 text-center border-2 border-dashed border-border rounded-xl text-xs text-muted-foreground">
                    Belum ada divisi untuk proyek ini. Silakan tambah divisi di atas.
                  </div>
                ) : (
                  divisions.map((div, index) => {
                    const isEditing = editingDivisionId === div.id;
                    return (
                      <div
                        key={div.id}
                        className="p-3 bg-slate-50 border border-slate-200 rounded-xl flex items-center justify-between gap-2"
                      >
                        {isEditing ? (
                          <div className="flex items-center gap-2 flex-1">
                            <input
                              type="text"
                              value={editingDivisionName}
                              onChange={(e) => setEditingDivisionName(e.target.value)}
                              className="flex-1 h-8 px-2.5 text-xs bg-white border border-border rounded-lg focus:outline-none focus:ring-1 focus:ring-primary"
                              autoFocus
                            />
                            <button
                              onClick={() => handleRenameDivision(div.id)}
                              disabled={!editingDivisionName.trim() || divisionActionLoading}
                              className="px-2.5 h-8 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold rounded-lg"
                            >
                              Simpan
                            </button>
                            <button
                              onClick={() => setEditingDivisionId(null)}
                              className="px-2.5 h-8 bg-slate-200 hover:bg-slate-300 text-slate-700 text-xs font-bold rounded-lg"
                            >
                              Batal
                            </button>
                          </div>
                        ) : (
                          <div className="flex flex-col gap-2.5 w-full">
                            <div className="flex items-center justify-between gap-2">
                              <div className="flex items-center gap-2 min-w-0 flex-1">
                                <span
                                  className={`w-2 h-2 rounded-full shrink-0 ${
                                    div.isActive !== false ? "bg-emerald-500" : "bg-slate-300"
                                  }`}
                                />
                                <span
                                  className={`text-xs font-bold truncate ${
                                    div.isActive === false ? "text-muted-foreground line-through" : "text-foreground"
                                  }`}
                                >
                                  {div.name}
                                </span>
                                {div.isActive === false && (
                                  <span className="text-[10px] font-bold px-1.5 py-0.2 bg-slate-200 text-slate-600 rounded">
                                    Nonaktif
                                  </span>
                                )}
                              </div>

                              <div className="flex items-center gap-1 shrink-0">
                                {/* Toggle expand roles */}
                                <button
                                  type="button"
                                  onClick={() =>
                                    setExpandedDivisionRoles((prev) => ({
                                      ...prev,
                                      [div.id]: !prev[div.id]
                                    }))
                                  }
                                  className={`px-2 py-1 text-[11px] font-bold rounded-lg border flex items-center gap-1 transition-colors ${
                                    expandedDivisionRoles[div.id]
                                      ? "bg-purple-100 text-purple-800 border-purple-300"
                                      : "bg-purple-50 hover:bg-purple-100 text-purple-700 border-purple-200"
                                  }`}
                                  title="Kelola role spesifik divisi ini"
                                >
                                  <span>Role ({(divisionRolesMap[div.id] || []).length})</span>
                                  {expandedDivisionRoles[div.id] ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
                                </button>

                                {/* Reorder Up */}
                                <button
                                  type="button"
                                  onClick={() => handleReorderDivision(div.id, "up")}
                                  disabled={index === 0 || divisionActionLoading}
                                  className="p-1.5 hover:bg-white text-muted-foreground hover:text-foreground disabled:opacity-30 rounded-lg transition-colors"
                                  title="Pindah ke atas"
                                >
                                  <ChevronUp size={14} />
                                </button>
                                {/* Reorder Down */}
                                <button
                                  type="button"
                                  onClick={() => handleReorderDivision(div.id, "down")}
                                  disabled={index === divisions.length - 1 || divisionActionLoading}
                                  className="p-1.5 hover:bg-white text-muted-foreground hover:text-foreground disabled:opacity-30 rounded-lg transition-colors"
                                  title="Pindah ke bawah"
                                >
                                  <ChevronDown size={14} />
                                </button>
                                {/* Edit name */}
                                <button
                                  type="button"
                                  onClick={() => {
                                    setEditingDivisionId(div.id);
                                    setEditingDivisionName(div.name);
                                  }}
                                  className="p-1.5 hover:bg-white text-muted-foreground hover:text-foreground rounded-lg transition-colors"
                                  title="Ubah Nama"
                                >
                                  <Pencil size={13} />
                                </button>
                                {/* Toggle active */}
                                <button
                                  type="button"
                                  onClick={() => handleToggleDivisionStatus(div.id, div.isActive !== false)}
                                  disabled={divisionActionLoading}
                                  className={`px-2 py-1 text-[10px] font-black rounded-lg border transition-colors ${
                                    div.isActive !== false
                                      ? "bg-amber-50 hover:bg-amber-100 text-amber-700 border-amber-200"
                                      : "bg-emerald-50 hover:bg-emerald-100 text-emerald-700 border-emerald-200"
                                  }`}
                                  title={div.isActive !== false ? "Nonaktifkan divisi" : "Aktifkan divisi"}
                                >
                                  {div.isActive !== false ? "Nonaktifkan" : "Aktifkan"}
                                </button>
                              </div>
                            </div>

                            {/* Expandable Section: Role Divisi */}
                            {expandedDivisionRoles[div.id] && (
                              <div className="mt-1 pt-2.5 border-t border-slate-200 flex flex-col gap-2 bg-white/70 p-2.5 rounded-lg border border-purple-100">
                                <div className="flex items-center justify-between gap-1">
                                  <span className="text-[10px] font-black text-purple-950 uppercase tracking-wider">
                                    Role / Posisi Divisi ({div.name})
                                  </span>
                                  <button
                                    type="button"
                                    onClick={() => handleApplyRecommendedRoles(div.id, div.name)}
                                    className="text-[10px] font-bold text-purple-700 hover:text-purple-900 hover:underline flex items-center gap-0.5"
                                  >
                                    <Sparkles size={11} />
                                    <span>+ Saran Role</span>
                                  </button>
                                </div>

                                {/* Daftar Chip Role */}
                                <div className="flex flex-wrap gap-1.5 min-h-[24px]">
                                  {(divisionRolesMap[div.id] || []).length === 0 ? (
                                    <span className="text-[11px] text-muted-foreground italic">
                                      Belum ada role divisi khusus. Anggota akan menggunakan opsi standar.
                                    </span>
                                  ) : (
                                    (divisionRolesMap[div.id] || []).map((r) => (
                                      <span
                                        key={r.id}
                                        className="inline-flex items-center gap-1 px-2 py-0.5 bg-purple-50 text-purple-700 border border-purple-200 rounded-md text-[11px] font-medium"
                                      >
                                        <span>{r.name}</span>
                                        <button
                                          type="button"
                                          onClick={() => handleDeleteDivisionRole(div.id, r.id, r.name)}
                                          disabled={roleActionLoading}
                                          className="text-purple-400 hover:text-rose-600 transition-colors ml-0.5"
                                          title={`Hapus role ${r.name}`}
                                        >
                                          <X size={11} />
                                        </button>
                                      </span>
                                    ))
                                  )}
                                </div>

                                {/* Form tambah role divisi */}
                                <div className="flex gap-2 items-center mt-0.5">
                                  <input
                                    type="text"
                                    placeholder={`Tambah role ${div.name} (cth: Frontend Lead)...`}
                                    value={newRoleInputs[div.id] || ""}
                                    onChange={(e) => {
                                      const val = e.target.value;
                                      setNewRoleInputs((prev) => ({ ...prev, [div.id]: val }));
                                      if (roleError[div.id]) {
                                        setRoleError((prev) => ({ ...prev, [div.id]: "" }));
                                      }
                                    }}
                                    onKeyDown={(e) => {
                                      if (e.key === "Enter") {
                                        e.preventDefault();
                                        handleAddDivisionRole(div.id, div.name);
                                      }
                                    }}
                                    className="flex-1 h-7 px-2 text-xs bg-white border border-border rounded-lg focus:outline-none focus:ring-1 focus:ring-primary"
                                  />
                                  <button
                                    type="button"
                                    onClick={() => handleAddDivisionRole(div.id, div.name)}
                                    disabled={!newRoleInputs[div.id]?.trim() || roleActionLoading}
                                    className="px-2.5 h-7 bg-purple-600 hover:bg-purple-700 disabled:opacity-50 text-white text-[11px] font-bold rounded-lg transition-colors flex items-center gap-1 shrink-0"
                                  >
                                    <Plus size={12} />
                                    <span>Tambah Role</span>
                                  </button>
                                </div>

                                {roleError[div.id] && (
                                  <p className="text-[11px] text-rose-600 font-medium flex items-center gap-1">
                                    <AlertCircle size={12} />
                                    <span>{roleError[div.id]}</span>
                                  </p>
                                )}
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    );
                  })
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </LayoutComponent>
  );
}
