import React, { useState, useEffect } from "react";
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
  X
} from "lucide-react";
import { apiGet, apiPatch, apiPost, resolveApiAssetUrl } from "../../../lib/api";
import { formatDateReadable } from "../../../lib/date";
import {
  ProjectDivision,
  getDivisionTabs,
  normalizeDivisionItem,
  normalizeTaskDivisionFields
} from "../../../lib/scrum";
import { RichTaskDescription } from "../../molecules/RichTaskDescription";

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
  subtasks: Array<{
    id: string;
    title: string;
    done: boolean;
  }>;
  attachments: Array<{
    id: string;
    file_url: string;
    file_name: string;
    file_size?: number;
    mime_type?: string;
  }>;
}

export default function ScrumBoard() {
  const navigate = useNavigate();
  const { researchId } = useParams();

  const [tasks, setTasks] = useState<ScrumTask[]>([]);
  const [divisions, setDivisions] = useState<ProjectDivision[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [selectedTask, setSelectedTask] = useState<ScrumTask | null>(null);
  const [selectedProjectFilter, setSelectedProjectFilter] = useState<string>(researchId || "all");
  const [selectedDivisionFilter, setSelectedDivisionFilter] = useState<string>("all");

  const [movingTaskId, setMovingTaskId] = useState<string | null>(null);
  const [uploadingAttachment, setUploadingAttachment] = useState(false);

  // Load student's assigned scrum tasks
  const loadMyTasks = async () => {
    setLoading(true);
    setError("");
    try {
      const data = await apiGet<any[]>("/research/my-scrum-tasks");
      const mapped: ScrumTask[] = (data || []).map((item) => {
        const norm = normalizeTaskDivisionFields(item);
        return {
          ...item,
          divisionId: norm.divisionId,
          divisionName: norm.divisionName,
          divisionIsActive: norm.divisionIsActive,
          sprintId: norm.sprintId,
          storyPoints: norm.storyPoints ?? item.storyPoints ?? item.story_points ?? item.sp ?? 0,
          subtasks: item.subtasks || [],
          attachments: item.attachments || [],
        };
      });
      setTasks(mapped);
    } catch (err: any) {
      setError(err?.message || "Gagal memuat tugas Scrum Anda.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadMyTasks();
  }, []);

  // Fetch divisions when a specific project is selected
  useEffect(() => {
    if (selectedProjectFilter && selectedProjectFilter !== "all") {
      apiGet<any[]>(`/research/${selectedProjectFilter}/divisions`)
        .then((data) => setDivisions((data || []).map(normalizeDivisionItem)))
        .catch(() => setDivisions([]));
    } else {
      setDivisions([]);
    }
    setSelectedDivisionFilter("all");
  }, [selectedProjectFilter]);

  // Filter tasks based on project and division
  const filteredTasks = tasks.filter((t) => {
    if (selectedProjectFilter !== "all" && t.projectId !== selectedProjectFilter) {
      return false;
    }
    if (selectedDivisionFilter !== "all") {
      if (selectedDivisionFilter === "unassigned") {
        if (t.divisionId) return false;
      } else {
        if (t.divisionId !== selectedDivisionFilter) return false;
      }
    }
    return true;
  });

  // Extract unique projects from assigned tasks
  const projectOptions = Array.from(
    new Map(tasks.map((t) => [t.projectId, { id: t.projectId, title: t.projectTitle }])).values()
  );

  // Calculate dynamic division tabs
  const divisionTabs = React.useMemo(() => {
    if (selectedProjectFilter === "all") {
      return [
        {
          id: "all",
          label: "Semua Divisi",
          count: tasks.length,
        },
      ];
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
          await loadMyTasks();
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

  return (
    <Layout title="Scrum Board Saya">
      <div className="flex flex-col gap-6 pb-12">
        {/* Top Header Card */}
        <div className="bg-white border border-border rounded-[24px] p-6 shadow-sm flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 mb-1.5">
              <span className="p-2 rounded-xl bg-purple-50 text-purple-600">
                <Kanban size={22} />
              </span>
              <h1 className="text-xl font-black text-foreground">Scrum Board Saya</h1>
              <span className="px-2.5 py-0.5 rounded-full text-[11px] font-black bg-purple-100 text-purple-700">
                Tugas Ditugaskan
              </span>
            </div>
            <p className="text-xs text-muted-foreground">
              Berikut adalah daftar tugas Scrum yang telah ditugaskan secara resmi oleh Admin/Ketua untuk Anda kerjakan.
            </p>
          </div>

          {/* Project Filter Switcher */}
          {projectOptions.length > 0 && (
            <div className="flex items-center gap-2">
              <label className="text-xs font-bold text-muted-foreground">Proyek:</label>
              <select
                value={selectedProjectFilter}
                onChange={(e) => setSelectedProjectFilter(e.target.value)}
                className="h-10 px-3 text-xs font-bold bg-slate-50 border border-border rounded-xl focus:outline-none cursor-pointer"
              >
                <option value="all">Semua Proyek Riset ({tasks.length})</option>
                {projectOptions.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.title}
                  </option>
                ))}
              </select>
            </div>
          )}
        </div>

        {/* Progress & Velocity Summary */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div className="bg-white p-4 rounded-2xl border border-border shadow-sm">
            <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider block mb-1">
              Total Tugas Saya
            </span>
            <div className="flex items-baseline gap-2">
              <span className="text-2xl font-black text-foreground">{totalTasks}</span>
              <span className="text-xs text-muted-foreground">task</span>
            </div>
          </div>

          <div className="bg-white p-4 rounded-2xl border border-border shadow-sm">
            <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider block mb-1">
              Beban Kerja (Story Points)
            </span>
            <div className="flex items-baseline gap-2">
              <span className="text-2xl font-black text-purple-700">{totalPoints}</span>
              <span className="text-xs font-bold text-purple-600">SP Total</span>
            </div>
          </div>

          <div className="bg-white p-4 rounded-2xl border border-border shadow-sm">
            <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider block mb-1">
              Sedang Dikerjakan
            </span>
            <div className="flex items-baseline gap-2">
              <span className="text-2xl font-black text-blue-600">{inProgressTasks}</span>
              <span className="text-xs text-muted-foreground">in progress</span>
            </div>
          </div>

          <div className="bg-white p-4 rounded-2xl border border-border shadow-sm">
            <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider block mb-1">
              Selesai Dikonfirmasi
            </span>
            <div className="flex items-baseline gap-2">
              <span className="text-2xl font-black text-emerald-600">{completedTasks}</span>
              <span className="text-xs font-bold text-emerald-600">({progressPercent}%)</span>
            </div>
          </div>
        </div>

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
                    ? "bg-purple-600 text-white shadow-sm"
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
            <p className="text-xs font-bold text-muted-foreground">Memuat daftar tugas Scrum Anda...</p>
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
              Admin atau Pembimbing riset belum menetapkan tugas Scrum untuk Anda. Tugas yang ditugaskan kepada Anda akan langsung muncul di sini.
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 flex-1">
            {columns.map((col) => {
              const colTasks = filteredTasks.filter((t) => t.status === col.id);

              return (
                <div
                  key={col.id}
                  className={`flex flex-col rounded-[20px] ${col.bg} border ${col.border} p-4 transition-all min-h-[450px] shadow-sm`}
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
                            onClick={() => setSelectedTask(task)}
                            className={`bg-white rounded-[16px] p-4 shadow-sm border border-slate-200/90 hover:shadow-md hover:border-purple-300 transition-all cursor-pointer flex flex-col gap-2.5 group relative ${
                              isDone ? "opacity-80" : ""
                            }`}
                          >
                            {/* Project & Sprint Tag */}
                            <div className="flex items-center justify-between gap-2">
                              <span className="text-[10px] font-bold text-muted-foreground truncate max-w-[150px]">
                                {task.projectTitle}
                              </span>
                              {task.sprintName && (
                                <span className="text-[9px] font-black px-1.5 py-0.5 rounded bg-purple-50 text-purple-700">
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

                            {/* Subtask Check Progress (if any) */}
                            {subtasksCount > 0 && (
                              <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground bg-slate-50 px-2 py-1 rounded-lg">
                                <CheckSquare size={12} className="text-primary" />
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

                              <div className="flex items-center gap-1.5 text-muted-foreground">
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

        {/* MODAL: Task Detail & Work Execution */}
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
                    Instruksi Tugas dari Admin
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

              {/* Confirm Done Button */}
              {selectedTask.status !== "DONE" ? (
                <div className="pt-2">
                  <button
                    onClick={() => handleUpdateStatus(selectedTask, "DONE")}
                    className="w-full h-11 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-black rounded-xl transition-colors flex items-center justify-center gap-2 shadow-sm shadow-emerald-200"
                  >
                    <CheckCircle2 size={16} />
                    <span>Konfirmasi Tugas Selesai (Pindahkan ke DONE)</span>
                  </button>
                </div>
              ) : (
                <div className="p-3 rounded-xl bg-emerald-50 border border-emerald-200 flex items-center gap-2 text-emerald-800 text-xs font-bold justify-center">
                  <CheckCircle2 size={16} className="text-emerald-600" />
                  <span>Tugas ini telah Anda selesaikan dan berstatus DONE!</span>
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </Layout>
  );
}