import React, { useEffect, useState, useMemo } from "react";
import { useLocation, useNavigate, useSearchParams } from "react-router";
import {
  Layers,
  Calendar,
  CheckCircle2,
  AlertCircle,
  Clock,
  User,
  Users,
  ExternalLink,
  Save,
  Check,
  ArrowRight,
  Sparkles,
  FileText,
  FileSpreadsheet,
  Award,
  ChevronRight,
  Info,
  AlertTriangle,
  GitBranch,
  GitCommit,
  GitPullRequest,
  RefreshCw
} from "lucide-react";
import { useAuth } from "../../../context/AuthContext";
import { OperatorLayout } from "../../templates/OperatorLayout";
import { DosenLayout } from "../../templates/DosenLayout";
import { apiGet, apiPut, apiPost } from "../../../lib/api";
import {
  NormalizedSprintSummary,
  normalizeSprintSummary,
  selectDefaultSprint,
  getSprintStatusBadge,
  validateEvaluationForm,
  formatScrumError,
  FINALIZE_CONFIRMATION_MESSAGE,
  MemberEvaluation,
  ReviewMeetingAttendee
} from "../../../lib/scrumSummary";
import {
  GitHubActivity,
  GitHubRepository,
  normalizeGitHubActivity,
  normalizeGitHubRepository,
  getActivityTypeMeta,
  getSuggestedStatusMeta,
  isValidGitHubUrl,
  formatGitHubActor,
  formatShortSha,
  calculateGitHubActivitySummary,
  formatTaskKey,
} from "../../../lib/githubIntegration";

interface Project {
  id: string;
  title: string;
  short_title?: string;
  status?: string;
}

interface SprintItem {
  id: string;
  name: string;
  goal?: string;
  status: string;
  startDate?: string;
  endDate?: string;
  start_date?: string;
  end_date?: string;
  closedAt?: string;
  closed_at?: string;
}

interface ProjectMember {
  id: string;
  name: string;
  role?: string;
  initials?: string;
}

type TabKey = "overview" | "hasil" | "rapat" | "evaluasi" | "carry_over" | "development";

export default function SprintSummary() {
  const { user: currentUser } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();

  const isDosen = location.pathname.startsWith("/dosen");
  const LayoutComponent = isDosen ? DosenLayout : OperatorLayout;
  const planningRoute = isDosen ? "/dosen/scrum/planning" : "/operator/scrum/planning";

  // Data selection states
  const [projects, setProjects] = useState<Project[]>([]);
  const [selectedProjectId, setSelectedProjectId] = useState<string>("");
  const [sprints, setSprints] = useState<SprintItem[]>([]);
  const [selectedSprintId, setSelectedSprintId] = useState<string>("");
  const [projectMembers, setProjectMembers] = useState<ProjectMember[]>([]);

  // Page states
  const [activeTab, setActiveTab] = useState<TabKey>("overview");
  const [loading, setLoading] = useState<boolean>(true);
  const [summaryLoading, setSummaryLoading] = useState<boolean>(false);
  const [error, setError] = useState<string>("");
  const [successMessage, setSuccessMessage] = useState<string>("");

  // Summary payload normalized state
  const [summaryData, setSummaryData] = useState<NormalizedSprintSummary | null>(null);

  // Form states for Review Sprint (when status === "review")
  // 1. Narrative
  const [narrativeForm, setNarrativeForm] = useState({
    summary: "",
    achievements: "",
    challenges: "",
    lessonsLearned: "",
    nextSprintPlan: ""
  });
  const [savingNarrative, setSavingNarrative] = useState(false);

  // 2. Meeting
  const [meetingForm, setMeetingForm] = useState({
    meetingDate: "",
    startTime: "",
    location: "",
    meetingLink: "",
    chairUserId: "",
    agenda: "",
    notes: "",
    decisions: "",
    attendeeUserIds: [] as string[]
  });
  const [savingMeeting, setSavingMeeting] = useState(false);

  // 3. Evaluations: map of memberId -> form
  const [evalForms, setEvalForms] = useState<Record<string, {
    taskCompletion: number | null;
    quality: number | null;
    timeliness: number | null;
    collaboration: number | null;
    initiative: number | null;
    notes: string;
  }>>({});
  const [savingEvalMemberId, setSavingEvalMemberId] = useState<string | null>(null);

  // 4. Carry Over outcomes: map of taskId -> { outcome, targetSprintId }
  const [outcomeDrafts, setOutcomeDrafts] = useState<Record<string, { outcome: string; targetSprintId: string }>>({});
  const [savingTaskId, setSavingTaskId] = useState<string | null>(null);

  // 5. Finalize dialog
  const [finalizing, setFinalizing] = useState(false);

  // 6. Sprint GitHub Development Activities
  const [sprintActivities, setSprintActivities] = useState<GitHubActivity[]>([]);
  const [sprintActivitiesLoading, setSprintActivitiesLoading] = useState<boolean>(false);
  const [sprintRepos, setSprintRepos] = useState<GitHubRepository[]>([]);

  const loadSprintActivities = React.useCallback(async (projId: string, spId: string) => {
    if (!projId || !spId) return;
    try {
      setSprintActivitiesLoading(true);
      const [actRes, repoRes] = await Promise.all([
        apiGet<any[]>(`/research/${projId}/github-activity?sprintId=${encodeURIComponent(spId)}`).catch(() => []),
        apiGet<{ repositories?: any[] }>(`/research/${projId}/repositories`).catch(() => ({ repositories: [] }))
      ]);
      setSprintActivities((actRes || []).map(normalizeGitHubActivity));
      if (repoRes?.repositories) {
        setSprintRepos((repoRes.repositories || []).map(normalizeGitHubRepository));
      }
    } catch {
      // Soft failure: GitHub is development evidence only
    } finally {
      setSprintActivitiesLoading(false);
    }
  }, []);

  // Load Projects on mount
  useEffect(() => {
    const loadProjects = async () => {
      try {
        setLoading(true);
        const endpoint = isDosen && currentUser?.id
          ? `/research/assigned?userId=${encodeURIComponent(currentUser.id)}`
          : "/research";
        const data = await apiGet<Project[]>(endpoint);
        const list = data || [];
        setProjects(list);

        const queryProjectId = searchParams.get("projectId");
        const defaultProject = (queryProjectId && list.find(p => p.id === queryProjectId)) || list[0];
        if (defaultProject) {
          setSelectedProjectId(defaultProject.id);
        }
      } catch (err: any) {
        setError(formatScrumError(err));
      } finally {
        setLoading(false);
      }
    };
    loadProjects();
  }, [isDosen, currentUser?.id]);

  // Load Sprints & Project Members whenever selectedProjectId changes
  useEffect(() => {
    if (!selectedProjectId) return;

    const loadProjectDetails = async () => {
      try {
        setSummaryLoading(true);
        setError("");
        setSuccessMessage("");

        const [sprintsRes, membersRes] = await Promise.all([
          apiGet<any[]>(`/research/${selectedProjectId}/sprints`).catch(() => []),
          apiGet<any[]>(`/research/${selectedProjectId}/members`).catch(() => [])
        ]);

        const sprintList: SprintItem[] = (sprintsRes || []).map((s: any) => ({
          id: s.id,
          name: s.name,
          goal: s.goal,
          status: s.status,
          startDate: s.startDate || s.start_date,
          endDate: s.endDate || s.end_date,
          closedAt: s.closedAt || s.closed_at
        }));
        setSprints(sprintList);

        const memberList: ProjectMember[] = (membersRes || []).map((m: any) => {
          const userObj = m.user || m;
          return {
            id: userObj.id || m.userId || m.user_id,
            name: userObj.name || m.name || "Anggota",
            role: userObj.role || m.peran || m.memberType || "Anggota",
            initials: userObj.initials || (userObj.name ? userObj.name.slice(0, 2).toUpperCase() : "AG")
          };
        });
        setProjectMembers(memberList);

        // Select Sprint based on query param or default order
        const querySprintId = searchParams.get("sprintId");
        let targetSprint = querySprintId ? sprintList.find(s => s.id === querySprintId) : null;
        if (!targetSprint) {
          targetSprint = selectDefaultSprint(sprintList);
        }

        if (targetSprint) {
          setSelectedSprintId(targetSprint.id);
        } else {
          setSelectedSprintId("");
          setSummaryData(null);
        }
      } catch (err: any) {
        setError(formatScrumError(err));
      } finally {
        setSummaryLoading(false);
      }
    };

    loadProjectDetails();
  }, [selectedProjectId]);

  // Load Sprint Summary when selectedSprintId changes
  const loadSprintSummary = async (sprintId: string) => {
    if (!selectedProjectId || !sprintId) return;
    try {
      setSummaryLoading(true);
      setError("");
      const res = await apiGet<any>(`/research/${selectedProjectId}/sprints/${sprintId}/summary`);
      const normalized = normalizeSprintSummary(res);
      setSummaryData(normalized);

      // Populate form states
      setNarrativeForm({
        summary: normalized.summary.summary || "",
        achievements: normalized.summary.achievements || "",
        challenges: normalized.summary.challenges || "",
        lessonsLearned: normalized.summary.lessonsLearned || "",
        nextSprintPlan: normalized.summary.nextSprintPlan || ""
      });

      setMeetingForm({
        meetingDate: normalized.meeting.meetingDate || "",
        startTime: normalized.meeting.startTime || "",
        location: normalized.meeting.location || "",
        meetingLink: normalized.meeting.meetingLink || "",
        chairUserId: normalized.meeting.chairUserId || "",
        agenda: normalized.meeting.agenda || "",
        notes: normalized.meeting.notes || "",
        decisions: normalized.meeting.decisions || "",
        attendeeUserIds: normalized.meeting.attendees.map(a => a.userId)
      });

      // Populate evaluations (prefill only saved evaluations; unevaluated members remain null/empty)
      const initialEvalMap: Record<string, any> = {};
      normalized.requiredEvaluations.forEach(req => {
        const existing = normalized.evaluations.find(e => e.userId === req.id);
        initialEvalMap[req.id] = {
          taskCompletion: existing?.taskCompletion ?? null,
          quality: existing?.quality ?? null,
          timeliness: existing?.timeliness ?? null,
          collaboration: existing?.collaboration ?? null,
          initiative: existing?.initiative ?? null,
          notes: existing?.notes ?? ""
        };
      });
      setEvalForms(initialEvalMap);

      // Populate unfinished outcome drafts
      const initialDrafts: Record<string, any> = {};
      normalized.unfinishedWork.forEach(task => {
        initialDrafts[task.taskId] = {
          outcome: task.outcome || "",
          targetSprintId: task.targetSprintId || (normalized.planningTargetSprints[0]?.id || "")
        };
      });
      setOutcomeDrafts(initialDrafts);
    } catch (err: any) {
      setError(formatScrumError(err));
      setSummaryData(null);
    } finally {
      setSummaryLoading(false);
    }
  };

  useEffect(() => {
    if (selectedSprintId) {
      loadSprintSummary(selectedSprintId);
    }
  }, [selectedSprintId]);

  useEffect(() => {
    if (selectedProjectId && selectedSprintId && activeTab === "development") {
      void loadSprintActivities(selectedProjectId, selectedSprintId);
    }
  }, [selectedProjectId, selectedSprintId, activeTab, loadSprintActivities]);

  // Selected Sprint item
  const currentSprint = useMemo(() => {
    return sprints.find(s => s.id === selectedSprintId) || summaryData?.sprint || null;
  }, [sprints, selectedSprintId, summaryData]);

  const sprintStatus = currentSprint?.status?.toLowerCase() || "";
  const isReviewSprint = sprintStatus === "review";
  const isClosedSprint = sprintStatus === "closed" || sprintStatus === "completed";
  const isActiveSprint = sprintStatus === "active";
  const isPlanningSprint = sprintStatus === "planning";
  const statusBadge = getSprintStatusBadge(sprintStatus);

  // Sync query params
  const handleSelectProject = (projectId: string) => {
    setSelectedProjectId(projectId);
    setSearchParams(prev => {
      const next = new URLSearchParams(prev);
      next.set("projectId", projectId);
      next.delete("sprintId");
      return next;
    });
  };

  const handleSelectSprint = (sprintId: string) => {
    setSelectedSprintId(sprintId);
    setSearchParams(prev => {
      const next = new URLSearchParams(prev);
      next.set("sprintId", sprintId);
      return next;
    });
  };

  // Actions
  const handleSaveNarrative = async () => {
    if (!selectedProjectId || !selectedSprintId) return;
    try {
      setSavingNarrative(true);
      setError("");
      setSuccessMessage("");
      await apiPut(`/research/${selectedProjectId}/sprints/${selectedSprintId}/summary`, narrativeForm);
      setSuccessMessage("Ringkasan Sprint berhasil disimpan.");
      await loadSprintSummary(selectedSprintId);
    } catch (err: any) {
      setError(formatScrumError(err));
    } finally {
      setSavingNarrative(false);
    }
  };

  const handleSaveMeeting = async () => {
    if (!selectedProjectId || !selectedSprintId) return;
    try {
      setSavingMeeting(true);
      setError("");
      setSuccessMessage("");
      await apiPut(`/research/${selectedProjectId}/sprints/${selectedSprintId}/review-meeting`, {
        meetingDate: meetingForm.meetingDate || null,
        startTime: meetingForm.startTime || null,
        location: meetingForm.location || null,
        meetingLink: meetingForm.meetingLink || null,
        chairUserId: meetingForm.chairUserId || null,
        agenda: meetingForm.agenda || null,
        notes: meetingForm.notes || null,
        decisions: meetingForm.decisions || null,
        attendeeUserIds: meetingForm.attendeeUserIds
      });
      setSuccessMessage("Rapat Review Sprint berhasil disimpan.");
      await loadSprintSummary(selectedSprintId);
    } catch (err: any) {
      setError(formatScrumError(err));
    } finally {
      setSavingMeeting(false);
    }
  };

  const handleSaveEvaluation = async (userId: string) => {
    if (!selectedProjectId || !selectedSprintId) return;
    const form = evalForms[userId];
    if (!form) return;

    const validation = validateEvaluationForm(form);
    if (!validation.valid) {
      setError(validation.error || "Form evaluasi tidak valid.");
      return;
    }

    try {
      setSavingEvalMemberId(userId);
      setError("");
      setSuccessMessage("");
      await apiPut(`/research/${selectedProjectId}/sprints/${selectedSprintId}/evaluations/${userId}`, {
        taskCompletion: form.taskCompletion,
        quality: form.quality,
        timeliness: form.timeliness,
        collaboration: form.collaboration,
        initiative: form.initiative,
        notes: form.notes
      });
      setSuccessMessage("Evaluasi anggota berhasil disimpan.");
      await loadSprintSummary(selectedSprintId);
    } catch (err: any) {
      setError(formatScrumError(err));
    } finally {
      setSavingEvalMemberId(null);
    }
  };

  const handleSaveTaskOutcome = async (taskId: string) => {
    if (!selectedProjectId || !selectedSprintId) return;
    const draft = outcomeDrafts[taskId];
    if (!draft || !draft.outcome) {
      setError("Pilih keputusan outcome terlebih dahulu.");
      return;
    }
    if (draft.outcome === "carry_over" && !draft.targetSprintId) {
      setError("Sprint target planning wajib dipilih untuk carry-over.");
      return;
    }

    try {
      setSavingTaskId(taskId);
      setError("");
      setSuccessMessage("");
      await apiPut(`/research/${selectedProjectId}/sprints/${selectedSprintId}/tasks/${taskId}/outcome`, {
        outcome: draft.outcome,
        targetSprintId: draft.outcome === "carry_over" ? draft.targetSprintId : null
      });
      setSuccessMessage("Keputusan task berhasil disimpan.");
      await loadSprintSummary(selectedSprintId);
    } catch (err: any) {
      setError(formatScrumError(err));
    } finally {
      setSavingTaskId(null);
    }
  };

  const handleFinalizeSprint = async () => {
    if (!selectedProjectId || !selectedSprintId) return;
    const confirmed = window.confirm(FINALIZE_CONFIRMATION_MESSAGE);
    if (!confirmed) return;

    try {
      setFinalizing(true);
      setError("");
      setSuccessMessage("");
      await apiPost(`/research/${selectedProjectId}/sprints/${selectedSprintId}/finalize`);
      setSuccessMessage("Sprint berhasil difinalisasi dan ditutup.");
      // Reload sprints list and reload summary
      const sprintsRes = await apiGet<any[]>(`/research/${selectedProjectId}/sprints`);
      setSprints(sprintsRes || []);
      await loadSprintSummary(selectedSprintId);
    } catch (err: any) {
      setError(formatScrumError(err));
    } finally {
      setFinalizing(false);
    }
  };

  const toggleAttendee = (userId: string) => {
    setMeetingForm(prev => {
      const exists = prev.attendeeUserIds.includes(userId);
      return {
        ...prev,
        attendeeUserIds: exists
          ? prev.attendeeUserIds.filter(id => id !== userId)
          : [...prev.attendeeUserIds, userId]
      };
    });
  };

  return (
    <LayoutComponent>
      <div className="flex flex-col gap-6 p-6 max-w-7xl mx-auto w-full">
        {/* Top Header */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-white p-5 rounded-[24px] border border-border shadow-sm">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <div className="w-8 h-8 rounded-xl bg-purple-100 text-purple-700 flex items-center justify-center font-black">
                <Sparkles size={16} />
              </div>
              <h1 className="text-xl font-black text-foreground">Sprint Summary & Review</h1>
            </div>
            <p className="text-xs text-muted-foreground">
              Evaluasi kinerja sprint, rekap hasil divisi & anggota, dan kelola kelanjutan tugas riset.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            {/* Project Selector */}
            <select
              value={selectedProjectId}
              onChange={(e) => handleSelectProject(e.target.value)}
              className="h-10 px-3 text-xs font-bold bg-slate-50 border border-border rounded-xl focus:outline-none focus:ring-2 focus:ring-primary/20 cursor-pointer min-w-[200px]"
            >
              {projects.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.short_title || p.title}
                </option>
              ))}
            </select>

            {/* Sprint Selector */}
            <select
              value={selectedSprintId}
              onChange={(e) => handleSelectSprint(e.target.value)}
              className="h-10 px-3 text-xs font-bold bg-slate-50 border border-border rounded-xl focus:outline-none focus:ring-2 focus:ring-primary/20 cursor-pointer min-w-[180px]"
              disabled={sprints.length === 0}
            >
              {sprints.length === 0 && <option value="">Belum ada Sprint</option>}
              {sprints.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name} ({s.status.toUpperCase()})
                </option>
              ))}
            </select>

            {/* Action button to Sprint Planning */}
            <button
              onClick={() => navigate(`${planningRoute}?projectId=${selectedProjectId}`)}
              className="h-10 px-4 bg-slate-900 hover:bg-slate-800 text-white text-xs font-black rounded-xl transition-colors flex items-center gap-2 shadow-sm"
              title="Buka Papan Sprint Planning"
            >
              <Layers size={14} />
              <span>Buka Sprint Planning</span>
              <ExternalLink size={12} />
            </button>
          </div>
        </div>

        {/* Global Alert Messages */}
        {error && (
          <div className="p-4 bg-red-50 border border-red-200 rounded-2xl flex items-start gap-3 text-xs text-red-800 animate-in fade-in">
            <AlertCircle size={16} className="shrink-0 mt-0.5 text-red-600" />
            <div className="flex-1 font-semibold">{error}</div>
            <button onClick={() => setError("")} className="text-red-500 font-bold hover:text-red-700">×</button>
          </div>
        )}

        {successMessage && (
          <div className="p-4 bg-emerald-50 border border-emerald-200 rounded-2xl flex items-start gap-3 text-xs text-emerald-800 animate-in fade-in">
            <CheckCircle2 size={16} className="shrink-0 mt-0.5 text-emerald-600" />
            <div className="flex-1 font-semibold">{successMessage}</div>
            <button onClick={() => setSuccessMessage("")} className="text-emerald-500 font-bold hover:text-emerald-700">×</button>
          </div>
        )}

        {/* Sprint Highlight Card */}
        {currentSprint && (
          <div className="bg-white p-5 rounded-[24px] border border-border shadow-sm flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div className="flex flex-col gap-2">
              <div className="flex items-center gap-3">
                <h2 className="text-lg font-black text-foreground">{currentSprint.name}</h2>
                <span className={`px-3 py-0.5 rounded-full text-[10px] tracking-wider uppercase ${statusBadge.className}`}>
                  {statusBadge.label}
                </span>
                {summaryData?.summary?.isFinalized && (
                  <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-emerald-100 text-emerald-800 border border-emerald-300">
                    ✓ Finalized {summaryData.summary.finalizedAt ? `(${new Date(summaryData.summary.finalizedAt).toLocaleDateString("id-ID")})` : ""}
                  </span>
                )}
              </div>
              {currentSprint.goal && (
                <p className="text-xs text-muted-foreground font-medium flex items-center gap-1.5">
                  <span className="font-bold text-foreground">Goal:</span> {currentSprint.goal}
                </p>
              )}
              {(currentSprint.startDate || currentSprint.endDate) && (
                <div className="flex items-center gap-2 text-[11px] text-muted-foreground">
                  <Calendar size={13} />
                  <span>
                    Periode: {currentSprint.startDate || "?"} s/d {currentSprint.endDate || "?"}
                  </span>
                  {currentSprint.closedAt && (
                    <span>• Ditutup pada {new Date(currentSprint.closedAt).toLocaleDateString("id-ID")}</span>
                  )}
                </div>
              )}
            </div>

            {/* Quick action for Review Sprint finalization */}
            {isReviewSprint && summaryData && (
              <div className="flex items-center gap-3">
                <button
                  onClick={handleFinalizeSprint}
                  disabled={!summaryData.canFinalize || finalizing}
                  className={`h-11 px-5 rounded-xl text-xs font-black transition-all flex items-center gap-2 shadow-sm ${
                    summaryData.canFinalize
                      ? "bg-emerald-600 hover:bg-emerald-700 text-white cursor-pointer"
                      : "bg-slate-100 text-slate-400 border border-slate-200 cursor-not-allowed"
                  }`}
                  title={summaryData.canFinalize ? "Finalisasi Sprint sekarang" : "Lengkapi semua syarat di tab Carry Over & Checklist untuk memfinalisasi"}
                >
                  <CheckCircle2 size={16} />
                  <span>{finalizing ? "Memfinalisasi..." : "Finalize Sprint"}</span>
                </button>
              </div>
            )}
          </div>
        )}

        {/* State Banners: Active, Planning, Legacy Closed, Empty */}
        {isActiveSprint && (
          <div className="p-8 text-center bg-purple-50/60 border-2 border-dashed border-purple-200 rounded-[24px]">
            <div className="w-12 h-12 rounded-2xl bg-purple-100 text-purple-700 flex items-center justify-center mx-auto mb-3">
              <Clock size={24} />
            </div>
            <h3 className="text-base font-black text-purple-950 mb-1">Sprint Masih Berjalan</h3>
            <p className="text-xs text-purple-800/80 max-w-md mx-auto mb-4">
              Sprint masih berjalan. Summary dapat diisi setelah Sprint diakhiri dan masuk tahap Review.
            </p>
            <button
              onClick={() => navigate(`${planningRoute}?projectId=${selectedProjectId}`)}
              className="px-4 py-2 bg-purple-700 hover:bg-purple-800 text-white text-xs font-black rounded-xl transition-colors inline-flex items-center gap-2"
            >
              <span>Buka Sprint Planning & Live Board</span>
              <ArrowRight size={14} />
            </button>
          </div>
        )}

        {isPlanningSprint && (
          <div className="p-8 text-center bg-blue-50/60 border-2 border-dashed border-blue-200 rounded-[24px]">
            <div className="w-12 h-12 rounded-2xl bg-blue-100 text-blue-700 flex items-center justify-center mx-auto mb-3">
              <Calendar size={24} />
            </div>
            <h3 className="text-base font-black text-blue-950 mb-1">Sprint Belum Dimulai</h3>
            <p className="text-xs text-blue-800/80 max-w-md mx-auto mb-4">
              Sprint belum dimulai. Anda dapat mengelola backlog dan memulai sprint dari papan Sprint Planning.
            </p>
            <button
              onClick={() => navigate(`${planningRoute}?projectId=${selectedProjectId}`)}
              className="px-4 py-2 bg-blue-700 hover:bg-blue-800 text-white text-xs font-black rounded-xl transition-colors inline-flex items-center gap-2"
            >
              <span>Buka Sprint Planning</span>
              <ArrowRight size={14} />
            </button>
          </div>
        )}

        {sprints.length === 0 && !loading && (
          <div className="p-12 text-center bg-white border-2 border-dashed border-border rounded-[24px]">
            <div className="w-12 h-12 rounded-2xl bg-slate-100 text-slate-500 flex items-center justify-center mx-auto mb-3">
              <Layers size={24} />
            </div>
            <h3 className="text-base font-black text-foreground mb-1">Belum Ada Sprint</h3>
            <p className="text-xs text-muted-foreground max-w-md mx-auto mb-4">
              Proyek ini belum memiliki sprint apapun. Buat sprint pertama di papan perencanaan.
            </p>
            <button
              onClick={() => navigate(`${planningRoute}?projectId=${selectedProjectId}`)}
              className="px-4 py-2 bg-primary text-white text-xs font-black rounded-xl"
            >
              Buat Sprint Pertama
            </button>
          </div>
        )}

        {/* Main Content Area for Review and Closed Sprints */}
        {(isReviewSprint || isClosedSprint) && (
          <div className="flex flex-col gap-5">
            {/* Graceful legacy closed Sprint notification if summary not present */}
            {isClosedSprint && !summaryData?.summary?.id && !summaryData?.summary?.summary && (
              <div className="p-4 bg-slate-50 border border-slate-200 rounded-2xl flex items-center gap-3 text-xs text-slate-700">
                <Info size={16} className="text-slate-500 shrink-0" />
                <span>Sprint ini diselesaikan sebelum fitur Sprint Summary diterapkan.</span>
              </div>
            )}

            {/* Tabs Navigation */}
            <div className="flex items-center gap-2 bg-white p-2 rounded-[20px] border border-border shadow-sm overflow-x-auto">
              {[
                { key: "overview", label: "Overview", icon: Layers },
                { key: "hasil", label: "Hasil & Ringkasan", icon: FileText },
                { key: "rapat", label: "Rapat Review", icon: Users },
                { key: "evaluasi", label: "Evaluasi Anggota", icon: Award },
                { key: "carry_over", label: "Carry Over & Kesiapan", icon: ArrowRight },
                { key: "development", label: "Development Activity", icon: GitBranch },
              ].map((tab) => {
                const Icon = tab.icon;
                const isActive = activeTab === tab.key;
                return (
                  <button
                    key={tab.key}
                    onClick={() => setActiveTab(tab.key as TabKey)}
                    className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs font-black transition-all whitespace-nowrap ${
                      isActive
                        ? "bg-slate-900 text-white shadow-sm"
                        : "text-muted-foreground hover:text-foreground hover:bg-slate-50"
                    }`}
                  >
                    <Icon size={14} />
                    <span>{tab.label}</span>
                  </button>
                );
              })}

              <button
                onClick={() =>
                  navigate(
                    `${isDosen ? "/dosen/github" : "/operator/github"}?projectId=${selectedProjectId}&sprintId=${selectedSprintId}`
                  )
                }
                className="ml-auto flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-bold text-slate-700 hover:bg-slate-100 transition-colors whitespace-nowrap"
                title="Buka Halaman GitHub Development"
              >
                <GitBranch size={13} />
                <span>Buka GitHub Development</span>
                <ExternalLink size={11} />
              </button>
            </div>

            {/* Loading Indicator */}
            {summaryLoading && (
              <div className="p-8 text-center bg-white border border-border rounded-[24px] text-xs font-bold text-muted-foreground flex items-center justify-center gap-2">
                <div className="w-4 h-4 border-2 border-primary border-t-transparent rounded-full animate-spin" />
                <span>Memuat data Sprint Summary...</span>
              </div>
            )}

            {/* TAB 1: OVERVIEW */}
            {activeTab === "overview" && summaryData && (
              <div className="flex flex-col gap-6">
                {/* Metric Cards Grid */}
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  <div className="bg-white p-5 rounded-[20px] border border-border shadow-sm flex flex-col gap-1">
                    <span className="text-[11px] font-bold text-muted-foreground uppercase tracking-wider">Planned SP</span>
                    <div className="flex items-baseline gap-2">
                      <span className="text-2xl font-black text-foreground">{summaryData.overview.plannedStoryPoints}</span>
                      <span className="text-xs font-bold text-purple-600">Points</span>
                    </div>
                  </div>

                  <div className="bg-white p-5 rounded-[20px] border border-border shadow-sm flex flex-col gap-1">
                    <span className="text-[11px] font-bold text-muted-foreground uppercase tracking-wider">Completed SP</span>
                    <div className="flex items-baseline gap-2">
                      <span className="text-2xl font-black text-emerald-600">{summaryData.overview.completedStoryPoints}</span>
                      <span className="text-xs font-bold text-emerald-600">Points</span>
                    </div>
                  </div>

                  <div className="bg-white p-5 rounded-[20px] border border-border shadow-sm flex flex-col gap-1">
                    <span className="text-[11px] font-bold text-muted-foreground uppercase tracking-wider">Selesai / Total</span>
                    <div className="flex items-baseline gap-2">
                      <span className="text-2xl font-black text-foreground">
                        {summaryData.overview.completedTasks}
                        <span className="text-sm font-bold text-muted-foreground">/{summaryData.overview.totalTasks}</span>
                      </span>
                      <span className="text-xs font-bold text-muted-foreground">Task</span>
                    </div>
                  </div>

                  <div className="bg-white p-5 rounded-[20px] border border-border shadow-sm flex flex-col gap-1">
                    <span className="text-[11px] font-bold text-muted-foreground uppercase tracking-wider">Capaian (Achievement)</span>
                    <div className="flex items-baseline gap-2">
                      <span className="text-2xl font-black text-purple-700">{summaryData.overview.achievementPercent}%</span>
                    </div>
                  </div>
                </div>

                {/* Historical Division Results Table */}
                <div className="bg-white p-5 rounded-[24px] border border-border shadow-sm flex flex-col gap-4">
                  <div className="flex items-center justify-between pb-3 border-b border-border/60">
                    <div>
                      <h3 className="text-sm font-black text-foreground">Hasil Rekap Divisi (Historical)</h3>
                      <p className="text-xs text-muted-foreground">
                        Snapshot performa tiap divisi berdasarkan ledger tugas saat Sprint berjalan.
                      </p>
                    </div>
                  </div>

                  {summaryData.divisionResults.length === 0 ? (
                    <div className="p-6 text-center text-xs text-muted-foreground border border-dashed border-border rounded-xl">
                      Belum ada data rekap divisi pada Sprint ini.
                    </div>
                  ) : (
                    <div className="overflow-x-auto">
                      <table className="w-full text-left text-xs">
                        <thead>
                          <tr className="border-b border-border/60 text-muted-foreground uppercase font-bold text-[10px]">
                            <th className="py-2.5 px-3">Divisi</th>
                            <th className="py-2.5 px-3 text-center">Total Task</th>
                            <th className="py-2.5 px-3 text-center">Selesai</th>
                            <th className="py-2.5 px-3 text-center">Belum Selesai</th>
                            <th className="py-2.5 px-3 text-center">Planned SP</th>
                            <th className="py-2.5 px-3 text-center">Completed SP</th>
                            <th className="py-2.5 px-3 text-right">Capaian</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-border/40 font-medium">
                          {summaryData.divisionResults.map((div, i) => (
                            <tr key={i} className="hover:bg-slate-50/80 transition-colors">
                              <td className="py-3 px-3 font-bold text-foreground flex items-center gap-2">
                                <span className="w-2 h-2 rounded-full bg-purple-500" />
                                <span>{div.divisionName}</span>
                              </td>
                              <td className="py-3 px-3 text-center font-bold">{div.totalTasks}</td>
                              <td className="py-3 px-3 text-center text-emerald-600 font-bold">{div.completedTasks}</td>
                              <td className="py-3 px-3 text-center text-amber-600 font-bold">{div.unfinishedTasks}</td>
                              <td className="py-3 px-3 text-center">{div.plannedStoryPoints}</td>
                              <td className="py-3 px-3 text-center text-emerald-600 font-bold">{div.completedStoryPoints}</td>
                              <td className="py-3 px-3 text-right">
                                <span className="px-2 py-0.5 rounded-md text-[10px] font-black bg-purple-50 text-purple-700 border border-purple-200">
                                  {div.achievementPercent}%
                                </span>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* TAB 2: HASIL / RESULTS & NARRATIVE */}
            {activeTab === "hasil" && summaryData && (
              <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
                {/* Left: Completed & Unfinished Task Lists (7 cols) */}
                <div className="lg:col-span-7 flex flex-col gap-6">
                  {/* Completed Tasks Card */}
                  <div className="bg-white p-5 rounded-[24px] border border-border shadow-sm flex flex-col gap-4">
                    <div className="flex items-center justify-between pb-2 border-b border-border/60">
                      <div className="flex items-center gap-2">
                        <CheckCircle2 size={16} className="text-emerald-600" />
                        <h3 className="text-sm font-black text-foreground">Tugas Selesai (Completed Work)</h3>
                      </div>
                      <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-100 text-emerald-800">
                        {summaryData.completedWork.length} Task
                      </span>
                    </div>

                    {summaryData.completedWork.length === 0 ? (
                      <p className="text-xs text-muted-foreground italic py-3">Tidak ada tugas yang diselesaikan.</p>
                    ) : (
                      <div className="flex flex-col gap-2">
                        {summaryData.completedWork.map((t) => (
                          <div
                            key={t.taskId}
                            className="p-3 bg-emerald-50/40 border border-emerald-100 rounded-xl flex items-center justify-between gap-3 text-xs"
                          >
                            <div className="flex flex-col gap-1 min-w-0">
                              <span className="font-bold text-foreground truncate">{t.title}</span>
                              <span className="text-[10px] text-muted-foreground">{t.divisionName}</span>
                            </div>
                            <div className="flex items-center gap-2 shrink-0">
                              <span className="px-2 py-0.5 rounded-md text-[10px] font-black bg-purple-50 text-purple-700 border border-purple-200">
                                ⚡ {t.storyPoints} SP
                              </span>
                              <span className="px-2 py-0.5 rounded-md text-[10px] font-bold bg-emerald-100 text-emerald-700 uppercase">
                                DONE
                              </span>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>

                  {/* Unfinished Tasks Card */}
                  <div className="bg-white p-5 rounded-[24px] border border-border shadow-sm flex flex-col gap-4">
                    <div className="flex items-center justify-between pb-2 border-b border-border/60">
                      <div className="flex items-center gap-2">
                        <AlertTriangle size={16} className="text-amber-600" />
                        <h3 className="text-sm font-black text-foreground">Tugas Belum Selesai (Unfinished Work)</h3>
                      </div>
                      <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-100 text-amber-800">
                        {summaryData.unfinishedWork.length} Task
                      </span>
                    </div>

                    {summaryData.unfinishedWork.length === 0 ? (
                      <p className="text-xs text-muted-foreground italic py-3">Semua tugas berhasil diselesaikan.</p>
                    ) : (
                      <div className="flex flex-col gap-2">
                        {summaryData.unfinishedWork.map((t) => (
                          <div
                            key={t.taskId}
                            className="p-3 bg-amber-50/30 border border-amber-100 rounded-xl flex items-center justify-between gap-3 text-xs"
                          >
                            <div className="flex flex-col gap-1 min-w-0">
                              <span className="font-bold text-foreground truncate">{t.title}</span>
                              <div className="flex items-center gap-2 text-[10px] text-muted-foreground">
                                <span>{t.divisionName}</span>
                                <span>•</span>
                                <span>Progress {t.progress}%</span>
                              </div>
                            </div>
                            <div className="flex items-center gap-2 shrink-0">
                              <span className="px-2 py-0.5 rounded-md text-[10px] font-black bg-purple-50 text-purple-700 border border-purple-200">
                                ⚡ {t.storyPoints} SP
                              </span>
                              <span className="px-2 py-0.5 rounded-md text-[10px] font-bold bg-slate-100 text-slate-700 uppercase">
                                {t.status}
                              </span>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>

                {/* Right: Narrative Form (5 cols) */}
                <div className="lg:col-span-5 flex flex-col gap-4">
                  <div className="bg-white p-5 rounded-[24px] border border-border shadow-sm flex flex-col gap-4">
                    <div className="flex items-center justify-between pb-2 border-b border-border/60">
                      <h3 className="text-sm font-black text-foreground">Narasi Ringkasan Sprint</h3>
                      {isClosedSprint && (
                        <span className="text-[10px] font-bold text-muted-foreground uppercase bg-slate-100 px-2 py-0.5 rounded">
                          Read-only
                        </span>
                      )}
                    </div>

                    <div className="flex flex-col gap-3 text-xs">
                      <div>
                        <label className="font-bold text-foreground block mb-1">
                          Ringkasan Utama <span className="text-red-500">*</span>
                        </label>
                        <textarea
                          rows={3}
                          value={narrativeForm.summary}
                          onChange={(e) => setNarrativeForm({ ...narrativeForm, summary: e.target.value })}
                          disabled={isClosedSprint}
                          placeholder="Ringkasan eksekutif perjalanan sprint ini..."
                          className="w-full p-3 bg-slate-50 border border-border rounded-xl focus:ring-2 focus:ring-primary/20 focus:outline-none disabled:bg-slate-100 disabled:cursor-not-allowed"
                        />
                      </div>

                      <div>
                        <label className="font-bold text-foreground block mb-1">Capaian (Achievements)</label>
                        <textarea
                          rows={2}
                          value={narrativeForm.achievements}
                          onChange={(e) => setNarrativeForm({ ...narrativeForm, achievements: e.target.value })}
                          disabled={isClosedSprint}
                          placeholder="Pencapaian utama atau fitur yang selesai..."
                          className="w-full p-3 bg-slate-50 border border-border rounded-xl focus:ring-2 focus:ring-primary/20 focus:outline-none disabled:bg-slate-100 disabled:cursor-not-allowed"
                        />
                      </div>

                      <div>
                        <label className="font-bold text-foreground block mb-1">Kendala & Tantangan (Challenges)</label>
                        <textarea
                          rows={2}
                          value={narrativeForm.challenges}
                          onChange={(e) => setNarrativeForm({ ...narrativeForm, challenges: e.target.value })}
                          disabled={isClosedSprint}
                          placeholder="Hambatan teknis atau waktu..."
                          className="w-full p-3 bg-slate-50 border border-border rounded-xl focus:ring-2 focus:ring-primary/20 focus:outline-none disabled:bg-slate-100 disabled:cursor-not-allowed"
                        />
                      </div>

                      <div>
                        <label className="font-bold text-foreground block mb-1">Pelajaran (Lessons Learned)</label>
                        <textarea
                          rows={2}
                          value={narrativeForm.lessonsLearned}
                          onChange={(e) => setNarrativeForm({ ...narrativeForm, lessonsLearned: e.target.value })}
                          disabled={isClosedSprint}
                          placeholder="Hal yang dipelajari dan perlu diperbaiki..."
                          className="w-full p-3 bg-slate-50 border border-border rounded-xl focus:ring-2 focus:ring-primary/20 focus:outline-none disabled:bg-slate-100 disabled:cursor-not-allowed"
                        />
                      </div>

                      <div>
                        <label className="font-bold text-foreground block mb-1">Rencana Sprint Berikutnya</label>
                        <textarea
                          rows={2}
                          value={narrativeForm.nextSprintPlan}
                          onChange={(e) => setNarrativeForm({ ...narrativeForm, nextSprintPlan: e.target.value })}
                          disabled={isClosedSprint}
                          placeholder="Target prioritas sprint selanjutnya..."
                          className="w-full p-3 bg-slate-50 border border-border rounded-xl focus:ring-2 focus:ring-primary/20 focus:outline-none disabled:bg-slate-100 disabled:cursor-not-allowed"
                        />
                      </div>

                      {isReviewSprint && (
                        <button
                          onClick={handleSaveNarrative}
                          disabled={savingNarrative || !narrativeForm.summary.trim()}
                          className="mt-2 h-10 px-4 bg-slate-900 hover:bg-slate-800 text-white font-black rounded-xl transition-colors flex items-center justify-center gap-2 shadow-sm disabled:opacity-50 cursor-pointer"
                        >
                          <Save size={14} />
                          <span>{savingNarrative ? "Menyimpan..." : "Simpan Ringkasan"}</span>
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* TAB 3: RAPAT REVIEW (MEETING) */}
            {activeTab === "rapat" && summaryData && (
              <div className="bg-white p-6 rounded-[24px] border border-border shadow-sm flex flex-col gap-5 max-w-4xl mx-auto w-full">
                <div className="flex items-center justify-between pb-3 border-b border-border/60">
                  <div>
                    <h3 className="text-sm font-black text-foreground">Notula Rapat Sprint Review</h3>
                    <p className="text-xs text-muted-foreground">Catat kehadiran peserta, agenda, dan keputusan bersama.</p>
                  </div>
                  {isClosedSprint && (
                    <span className="text-[10px] font-bold text-muted-foreground uppercase bg-slate-100 px-2.5 py-0.5 rounded">
                      Read-only
                    </span>
                  )}
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
                  <div>
                    <label className="font-bold text-foreground block mb-1">Tanggal Rapat</label>
                    <input
                      type="date"
                      value={meetingForm.meetingDate}
                      onChange={(e) => setMeetingForm({ ...meetingForm, meetingDate: e.target.value })}
                      disabled={isClosedSprint}
                      className="w-full h-10 px-3 bg-slate-50 border border-border rounded-xl focus:ring-2 focus:ring-primary/20 focus:outline-none disabled:bg-slate-100"
                    />
                  </div>

                  <div>
                    <label className="font-bold text-foreground block mb-1">Waktu Mulai</label>
                    <input
                      type="time"
                      value={meetingForm.startTime}
                      onChange={(e) => setMeetingForm({ ...meetingForm, startTime: e.target.value })}
                      disabled={isClosedSprint}
                      className="w-full h-10 px-3 bg-slate-50 border border-border rounded-xl focus:ring-2 focus:ring-primary/20 focus:outline-none disabled:bg-slate-100"
                    />
                  </div>

                  <div>
                    <label className="font-bold text-foreground block mb-1">Lokasi Rapat</label>
                    <input
                      type="text"
                      value={meetingForm.location}
                      onChange={(e) => setMeetingForm({ ...meetingForm, location: e.target.value })}
                      disabled={isClosedSprint}
                      placeholder="e.g. Lab STAS / Ruang Riset 302"
                      className="w-full h-10 px-3 bg-slate-50 border border-border rounded-xl focus:ring-2 focus:ring-primary/20 focus:outline-none disabled:bg-slate-100"
                    />
                  </div>

                  <div>
                    <label className="font-bold text-foreground block mb-1">Link Pertemuan Online (Opsional)</label>
                    <input
                      type="text"
                      value={meetingForm.meetingLink}
                      onChange={(e) => setMeetingForm({ ...meetingForm, meetingLink: e.target.value })}
                      disabled={isClosedSprint}
                      placeholder="https://meet.google.com/..."
                      className="w-full h-10 px-3 bg-slate-50 border border-border rounded-xl focus:ring-2 focus:ring-primary/20 focus:outline-none disabled:bg-slate-100"
                    />
                  </div>

                  <div className="md:col-span-2">
                    <label className="font-bold text-foreground block mb-1">Pemimpin Rapat (Chair)</label>
                    <select
                      value={meetingForm.chairUserId}
                      onChange={(e) => setMeetingForm({ ...meetingForm, chairUserId: e.target.value })}
                      disabled={isClosedSprint}
                      className="w-full h-10 px-3 bg-slate-50 border border-border rounded-xl focus:ring-2 focus:ring-primary/20 focus:outline-none disabled:bg-slate-100 cursor-pointer"
                    >
                      <option value="">Pilih Pemimpin Rapat...</option>
                      {projectMembers.map((m) => (
                        <option key={m.id} value={m.id}>
                          {m.name} ({m.role || "Anggota"})
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

                {/* Attendees Checklist */}
                <div className="text-xs">
                  <label className="font-bold text-foreground block mb-2">Daftar Kehadiran Anggota (Attendees)</label>
                  <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2 p-3 bg-slate-50 border border-border rounded-xl max-h-52 overflow-y-auto">
                    {projectMembers.map((m) => {
                      const isSelected = meetingForm.attendeeUserIds.includes(m.id);
                      return (
                        <label
                          key={m.id}
                          className={`flex items-center gap-2 p-2 rounded-lg border cursor-pointer select-none transition-colors ${
                            isSelected
                              ? "bg-purple-50 border-purple-200 text-purple-950 font-bold"
                              : "bg-white border-slate-200 text-foreground"
                          }`}
                        >
                          <input
                            type="checkbox"
                            checked={isSelected}
                            onChange={() => toggleAttendee(m.id)}
                            disabled={isClosedSprint}
                            className="rounded border-slate-300 text-primary focus:ring-primary/20"
                          />
                          <span className="truncate">{m.name}</span>
                        </label>
                      );
                    })}
                  </div>
                </div>

                <div className="flex flex-col gap-3 text-xs">
                  <div>
                    <label className="font-bold text-foreground block mb-1">Agenda Rapat</label>
                    <textarea
                      rows={2}
                      value={meetingForm.agenda}
                      onChange={(e) => setMeetingForm({ ...meetingForm, agenda: e.target.value })}
                      disabled={isClosedSprint}
                      placeholder="Agenda pembahasan review..."
                      className="w-full p-3 bg-slate-50 border border-border rounded-xl focus:ring-2 focus:ring-primary/20 focus:outline-none disabled:bg-slate-100"
                    />
                  </div>

                  <div>
                    <label className="font-bold text-foreground block mb-1">Catatan Rapat</label>
                    <textarea
                      rows={3}
                      value={meetingForm.notes}
                      onChange={(e) => setMeetingForm({ ...meetingForm, notes: e.target.value })}
                      disabled={isClosedSprint}
                      placeholder="Catatan diskusi jalannya rapat review..."
                      className="w-full p-3 bg-slate-50 border border-border rounded-xl focus:ring-2 focus:ring-primary/20 focus:outline-none disabled:bg-slate-100"
                    />
                  </div>

                  <div>
                    <label className="font-bold text-foreground block mb-1">Keputusan Rapat</label>
                    <textarea
                      rows={2}
                      value={meetingForm.decisions}
                      onChange={(e) => setMeetingForm({ ...meetingForm, decisions: e.target.value })}
                      disabled={isClosedSprint}
                      placeholder="Kesimpulan dan keputusan aksi lanjut..."
                      className="w-full p-3 bg-slate-50 border border-border rounded-xl focus:ring-2 focus:ring-primary/20 focus:outline-none disabled:bg-slate-100"
                    />
                  </div>
                </div>

                {isReviewSprint && (
                  <div className="flex justify-end pt-3 border-t border-border/60">
                    <button
                      onClick={handleSaveMeeting}
                      disabled={savingMeeting}
                      className="h-10 px-5 bg-slate-900 hover:bg-slate-800 text-white text-xs font-black rounded-xl transition-colors flex items-center gap-2 shadow-sm cursor-pointer"
                    >
                      <Save size={14} />
                      <span>{savingMeeting ? "Menyimpan..." : "Simpan Rapat Review"}</span>
                    </button>
                  </div>
                )}
              </div>
            )}

            {/* TAB 4: EVALUASI ANGGOTA (MEMBER EVALUATION) */}
            {activeTab === "evaluasi" && summaryData && (
              <div className="flex flex-col gap-6">
                <div className="flex items-center justify-between bg-white p-4 rounded-[20px] border border-border shadow-sm">
                  <div>
                    <h3 className="text-sm font-black text-foreground">Evaluasi Kontribusi Anggota</h3>
                    <p className="text-xs text-muted-foreground">
                      Beri penilaian objektif (1–10) berdasarkan kontribusi nyata anggota pada Sprint ini.
                    </p>
                  </div>
                  <span className="px-3 py-1 rounded-full text-xs font-black bg-purple-100 text-purple-700">
                    {summaryData.evaluations.length} / {summaryData.requiredEvaluations.length} Dievaluasi
                  </span>
                </div>

                {summaryData.requiredEvaluations.length === 0 ? (
                  <div className="p-8 text-center bg-white border border-dashed border-border rounded-[24px] text-xs text-muted-foreground">
                    Tidak ada anggota yang perlu dievaluasi pada Sprint ini.
                  </div>
                ) : (
                  <div className="flex flex-col gap-5">
                    {summaryData.requiredEvaluations.map((member) => {
                      const metrics = summaryData.memberMetrics.find((m) => m.id === member.id);
                      const savedEval = summaryData.evaluations.find((e) => e.userId === member.id);
                      const form = evalForms[member.id] || {
                        taskCompletion: savedEval?.taskCompletion ?? null,
                        quality: savedEval?.quality ?? null,
                        timeliness: savedEval?.timeliness ?? null,
                        collaboration: savedEval?.collaboration ?? null,
                        initiative: savedEval?.initiative ?? null,
                        notes: savedEval?.notes ?? ""
                      };
                      const isSaving = savingEvalMemberId === member.id;
                      const isSelf = String(currentUser?.id) === String(member.id);
                      const hasAllScores =
                        form.taskCompletion !== null &&
                        form.quality !== null &&
                        form.timeliness !== null &&
                        form.collaboration !== null &&
                        form.initiative !== null;

                      return (
                        <div
                          key={member.id}
                          className="bg-white p-5 rounded-[24px] border border-border shadow-sm flex flex-col gap-4"
                        >
                          {/* Member Header & Contribution Evidence */}
                          <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 pb-3 border-b border-border/60">
                            <div className="flex items-center gap-3">
                              <div className="w-10 h-10 rounded-xl bg-purple-100 text-purple-700 flex items-center justify-center text-xs font-black">
                                {member.initials || member.name.slice(0, 2).toUpperCase()}
                              </div>
                              <div>
                                <h4 className="text-sm font-black text-foreground flex items-center gap-2">
                                  <span>{member.name}</span>
                                  {isSelf && (
                                    <span className="text-[10px] font-bold text-amber-700 bg-amber-100 px-2 py-0.5 rounded">
                                      Anda Sendiri
                                    </span>
                                  )}
                                </h4>
                                <span className="text-[11px] text-muted-foreground">{member.role || "Mahasiswa"}</span>
                              </div>
                            </div>

                            {/* Evidence Metrics Pill */}
                            {metrics && (
                              <div className="flex items-center gap-2 flex-wrap text-[11px] font-bold">
                                <span className="px-2.5 py-1 bg-slate-100 rounded-lg text-slate-700">
                                  Assigned: {metrics.assignedTasks}
                                </span>
                                <span className="px-2.5 py-1 bg-emerald-50 text-emerald-700 rounded-lg">
                                  Selesai: {metrics.completedTasks}
                                </span>
                                <span className="px-2.5 py-1 bg-purple-50 text-purple-700 rounded-lg">
                                  SP: {metrics.completedStoryPoints}/{metrics.plannedStoryPoints}
                                </span>
                                {metrics.carryOverCount > 0 && (
                                  <span className="px-2.5 py-1 bg-amber-50 text-amber-700 rounded-lg">
                                    Carry Over: {metrics.carryOverCount}
                                  </span>
                                )}
                              </div>
                            )}
                          </div>

                          {/* 5 Score Inputs (1–10) + Backend Overall Score Display */}
                          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-6 gap-3 text-xs">
                            {[
                              { key: "taskCompletion", label: "Task Completion" },
                              { key: "quality", label: "Quality" },
                              { key: "timeliness", label: "Timeliness" },
                              { key: "collaboration", label: "Collaboration" },
                              { key: "initiative", label: "Initiative" },
                            ].map((f) => {
                              const val = (form as any)[f.key];
                              return (
                                <div key={f.key} className="flex flex-col gap-1">
                                  <label className="text-[11px] font-bold text-muted-foreground">{f.label}</label>
                                  <input
                                    type="number"
                                    min={1}
                                    max={10}
                                    placeholder="1–10"
                                    value={val !== null && val !== undefined ? val : ""}
                                    onChange={(e) => {
                                      const rawVal = e.target.value.trim();
                                      const parsed = rawVal === "" ? null : Math.max(1, Math.min(10, parseInt(rawVal) || 1));
                                      setEvalForms({
                                        ...evalForms,
                                        [member.id]: {
                                          ...form,
                                          [f.key]: parsed
                                        }
                                      });
                                    }}
                                    disabled={isClosedSprint || isSelf}
                                    className="h-10 px-3 bg-slate-50 border border-border rounded-xl font-bold text-center focus:ring-2 focus:ring-primary/20 focus:outline-none disabled:bg-slate-100"
                                  />
                                </div>
                              );
                            })}

                            {/* Overall Score Box */}
                            <div className="flex flex-col gap-1">
                              <label className="text-[11px] font-bold text-purple-700">Overall (Backend)</label>
                              <div className="h-10 px-3 bg-purple-50 border border-purple-200 rounded-xl flex items-center justify-center font-black text-purple-700 text-sm">
                                {savedEval?.overallScore !== null && savedEval?.overallScore !== undefined
                                  ? savedEval.overallScore
                                  : "—"}
                              </div>
                            </div>
                          </div>

                          {/* Notes and Save button */}
                          <div className="flex flex-col md:flex-row gap-3 items-end">
                            <div className="flex-1 w-full text-xs">
                              <label className="font-bold text-foreground block mb-1">
                                Catatan Evaluasi <span className="text-red-500">*</span>
                              </label>
                              <input
                                type="text"
                                value={form.notes}
                                onChange={(e) =>
                                  setEvalForms({
                                    ...evalForms,
                                    [member.id]: {
                                      ...form,
                                      notes: e.target.value
                                    }
                                  })
                                }
                                disabled={isClosedSprint || isSelf}
                                placeholder="Ulasan pencapaian, inisiatif, atau area peningkatan..."
                                className="w-full h-10 px-3 bg-slate-50 border border-border rounded-xl focus:ring-2 focus:ring-primary/20 focus:outline-none disabled:bg-slate-100"
                              />
                            </div>

                            {isReviewSprint && !isSelf && (
                              <button
                                onClick={() => handleSaveEvaluation(member.id)}
                                disabled={isSaving || !hasAllScores || !form.notes.trim()}
                                className="h-10 px-4 bg-purple-700 hover:bg-purple-800 text-white text-xs font-black rounded-xl transition-colors flex items-center gap-1.5 shrink-0 disabled:opacity-50 cursor-pointer shadow-sm"
                              >
                                <Save size={13} />
                                <span>{isSaving ? "Menyimpan..." : "Simpan Evaluasi"}</span>
                              </button>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            )}

            {/* TAB 5: CARRY OVER & KESIAPAN (OUTCOMES & FINALIZATION READINESS) */}
            {activeTab === "carry_over" && summaryData && (
              <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
                {/* Left: Unfinished Task Decisions (8 cols) */}
                <div className="lg:col-span-8 flex flex-col gap-5">
                  <div className="bg-white p-5 rounded-[24px] border border-border shadow-sm flex flex-col gap-4">
                    <div className="flex items-center justify-between pb-2 border-b border-border/60">
                      <div>
                        <h3 className="text-sm font-black text-foreground">Keputusan Tugas Belum Selesai</h3>
                        <p className="text-xs text-muted-foreground">
                          Tentukan aksi untuk setiap tugas sebelum Sprint dapat difinalisasi.
                        </p>
                      </div>
                      <span className="px-2.5 py-0.5 rounded-full text-xs font-black bg-amber-100 text-amber-800">
                        {summaryData.unfinishedWork.length} Tugas
                      </span>
                    </div>

                    {summaryData.unfinishedWork.length === 0 ? (
                      <div className="p-8 text-center bg-emerald-50/50 border border-dashed border-emerald-200 rounded-xl text-xs text-emerald-800 font-bold">
                        ✓ Tidak ada tugas carry-over. Seluruh tugas sprint telah diselesaikan!
                      </div>
                    ) : (
                      <div className="flex flex-col gap-4">
                        {summaryData.unfinishedWork.map((t) => {
                          const draft = outcomeDrafts[t.taskId] || { outcome: "", targetSprintId: "" };
                          const isSaving = savingTaskId === t.taskId;

                          return (
                            <div
                              key={t.taskId}
                              className="p-4 bg-slate-50 border border-slate-200 rounded-2xl flex flex-col gap-3 text-xs"
                            >
                              <div className="flex items-start justify-between gap-3">
                                <div>
                                  <h4 className="font-black text-foreground">{t.title}</h4>
                                  <div className="flex items-center gap-2 text-[11px] text-muted-foreground mt-0.5">
                                    <span>{t.divisionName}</span>
                                    <span>•</span>
                                    <span>Status: {t.status}</span>
                                    <span>•</span>
                                    <span>⚡ {t.storyPoints} SP</span>
                                    <span>•</span>
                                    <span>Progress {t.progress}%</span>
                                  </div>
                                </div>

                                {/* Current saved status badge */}
                                {t.outcome && (
                                  <span
                                    className={`px-2.5 py-0.5 rounded-md text-[10px] font-black uppercase ${
                                      t.outcome === "carry_over"
                                        ? "bg-purple-100 text-purple-700 border border-purple-200"
                                        : t.outcome === "backlog"
                                        ? "bg-blue-100 text-blue-700 border border-blue-200"
                                        : "bg-red-100 text-red-700 border border-red-200"
                                    }`}
                                  >
                                    {t.outcome === "carry_over"
                                      ? "Akan Dipindahkan (Carry Over)"
                                      : t.outcome === "backlog"
                                      ? "Kembali ke Backlog"
                                      : "Dibatalkan"}
                                  </span>
                                )}
                              </div>

                              {/* Decision controls (disabled if closed) */}
                              {!isClosedSprint && (
                                <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2 pt-2 border-t border-slate-200/60">
                                  {/* Outcome Choice */}
                                  <select
                                    value={draft.outcome}
                                    onChange={(e) =>
                                      setOutcomeDrafts({
                                        ...outcomeDrafts,
                                        [t.taskId]: {
                                          ...draft,
                                          outcome: e.target.value
                                        }
                                      })
                                    }
                                    className="h-9 px-3 text-xs font-bold bg-white border border-border rounded-xl focus:ring-2 focus:ring-primary/20 focus:outline-none cursor-pointer"
                                  >
                                    <option value="">Pilih Keputusan...</option>
                                    <option value="carry_over">Pindahkan ke Sprint Berikutnya</option>
                                    <option value="backlog">Kembalikan ke Product Backlog</option>
                                    <option value="cancelled">Batalkan Tugas</option>
                                  </select>

                                  {/* Target Sprint Selector for carry_over */}
                                  {draft.outcome === "carry_over" && (
                                    <select
                                      value={draft.targetSprintId}
                                      onChange={(e) =>
                                        setOutcomeDrafts({
                                          ...outcomeDrafts,
                                          [t.taskId]: {
                                            ...draft,
                                            targetSprintId: e.target.value
                                          }
                                        })
                                      }
                                      className="h-9 px-3 text-xs font-bold bg-white border border-border rounded-xl focus:ring-2 focus:ring-primary/20 focus:outline-none cursor-pointer min-w-[180px]"
                                    >
                                      {summaryData.planningTargetSprints.length === 0 && (
                                        <option value="">Tidak ada Sprint Planning</option>
                                      )}
                                      {summaryData.planningTargetSprints.map((s) => (
                                        <option key={s.id} value={s.id}>
                                          Target: {s.name}
                                        </option>
                                      ))}
                                    </select>
                                  )}

                                  {/* Save button */}
                                  <button
                                    onClick={() => handleSaveTaskOutcome(t.taskId)}
                                    disabled={isSaving || !draft.outcome}
                                    className="h-9 px-3.5 bg-slate-900 hover:bg-slate-800 text-white font-black rounded-xl transition-colors flex items-center justify-center gap-1.5 shrink-0 shadow-sm disabled:opacity-50 cursor-pointer"
                                  >
                                    <Check size={12} />
                                    <span>{isSaving ? "Menyimpan..." : "Terapkan Keputusan"}</span>
                                  </button>
                                </div>
                              )}

                              {draft.outcome === "carry_over" && summaryData.planningTargetSprints.length === 0 && (
                                <p className="text-[11px] text-amber-700 font-bold mt-1">
                                  ⚠️ Tidak ada Sprint Planning target. Buat Sprint Planning berikutnya terlebih dahulu di halaman Planning.
                                </p>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                </div>

                {/* Right: Finalization Checklist & Action Card (4 cols) */}
                <div className="lg:col-span-4 flex flex-col gap-4">
                  <div className="bg-white p-5 rounded-[24px] border border-border shadow-sm flex flex-col gap-4">
                    <div className="pb-2 border-b border-border/60">
                      <h3 className="text-sm font-black text-foreground">Kesiapan Finalisasi</h3>
                      <p className="text-xs text-muted-foreground">
                        Status kelengkapan sebelum Sprint dapat ditutup resmi.
                      </p>
                    </div>

                    <div className="flex flex-col gap-2 text-xs">
                      {/* 1. Ringkasan */}
                      <div className="flex items-center justify-between p-2.5 rounded-xl bg-slate-50 border border-slate-200">
                        <span className="font-bold text-foreground">Ringkasan Sprint</span>
                        {summaryData.summary.summary.trim() ? (
                          <span className="text-emerald-600 font-black flex items-center gap-1">✓ Lengkap</span>
                        ) : (
                          <span className="text-amber-600 font-bold">Wajib diisi</span>
                        )}
                      </div>

                      {/* 2. Rapat */}
                      <div className="flex items-center justify-between p-2.5 rounded-xl bg-slate-50 border border-slate-200">
                        <span className="font-bold text-foreground">Rapat Review</span>
                        {summaryData.meeting.meetingDate && (summaryData.meeting.notes.trim() || summaryData.meeting.decisions.trim()) ? (
                          <span className="text-emerald-600 font-black flex items-center gap-1">✓ Lengkap</span>
                        ) : summaryData.meeting.meetingDate ? (
                          <span className="text-amber-600 font-bold">Catatan belum diisi</span>
                        ) : (
                          <span className="text-amber-600 font-bold">Wajib dilengkapi</span>
                        )}
                      </div>

                      {/* 3. Evaluasi Anggota */}
                      <div className="flex items-center justify-between p-2.5 rounded-xl bg-slate-50 border border-slate-200">
                        <span className="font-bold text-foreground">Evaluasi Anggota</span>
                        <span
                          className={`font-black ${
                            summaryData.evaluations.length >= summaryData.requiredEvaluations.length
                              ? "text-emerald-600"
                              : "text-amber-600"
                          }`}
                        >
                          {summaryData.evaluations.length} / {summaryData.requiredEvaluations.length}
                        </span>
                      </div>

                      {/* 4. Keputusan Task Unfinished */}
                      <div className="flex items-center justify-between p-2.5 rounded-xl bg-slate-50 border border-slate-200">
                        <span className="font-bold text-foreground">Keputusan Task</span>
                        {summaryData.unfinishedWork.length === 0 ? (
                          <span className="text-emerald-600 font-black">✓ Selesai Semua</span>
                        ) : (
                          <span
                            className={`font-black ${
                              summaryData.unfinishedWork.filter((t) => Boolean(t.outcome)).length >=
                              summaryData.unfinishedWork.length
                                ? "text-emerald-600"
                                : "text-amber-600"
                            }`}
                          >
                            {summaryData.unfinishedWork.filter((t) => Boolean(t.outcome)).length} /{" "}
                            {summaryData.unfinishedWork.length}
                          </span>
                        )}
                      </div>
                    </div>

                    {/* Finalize button */}
                    {isReviewSprint && (
                      <div className="pt-2">
                        <button
                          onClick={handleFinalizeSprint}
                          disabled={!summaryData.canFinalize || finalizing}
                          className={`w-full h-11 px-4 rounded-xl text-xs font-black transition-all flex items-center justify-center gap-2 shadow-sm ${
                            summaryData.canFinalize
                              ? "bg-emerald-600 hover:bg-emerald-700 text-white cursor-pointer"
                              : "bg-slate-100 text-slate-400 border border-slate-200 cursor-not-allowed"
                          }`}
                        >
                          <CheckCircle2 size={16} />
                          <span>{finalizing ? "Memfinalisasi..." : "Finalize Sprint"}</span>
                        </button>

                        {!summaryData.canFinalize && summaryData.finalizationErrors.length > 0 && (
                          <div className="mt-2 p-2.5 bg-amber-50 rounded-xl border border-amber-200 text-[11px] text-amber-800">
                            <span className="font-bold block mb-1">Syarat belum terpenuhi:</span>
                            <ul className="list-disc list-inside space-y-0.5">
                              {summaryData.finalizationErrors.map((err, i) => (
                                <li key={i}>{err.message}</li>
                              ))}
                            </ul>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            )}

            {/* TAB 6: DEVELOPMENT ACTIVITY */}
            {activeTab === "development" && (
              <div className="flex flex-col gap-6">
                {/* Informational Disclaimer Banner */}
                <div className="bg-slate-50 border border-slate-200 text-slate-700 px-5 py-4 rounded-2xl text-xs flex flex-col sm:flex-row sm:items-center justify-between gap-3 shadow-sm">
                  <div className="flex items-center gap-2.5">
                    <Info size={18} className="text-slate-500 shrink-0" />
                    <span className="leading-relaxed">
                      Aktivitas GitHub adalah bukti pengembangan dan tidak digunakan untuk menghitung nilai evaluasi anggota secara otomatis.
                    </span>
                  </div>
                  <button
                    onClick={() =>
                      navigate(
                        `${isDosen ? "/dosen/github" : "/operator/github"}?projectId=${selectedProjectId}&sprintId=${selectedSprintId}`
                      )
                    }
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-slate-900 text-white text-xs font-bold hover:bg-slate-800 transition-colors shrink-0 self-start sm:self-auto"
                  >
                    <span>Buka GitHub Development</span>
                    <ExternalLink size={12} />
                  </button>
                </div>

                {/* Summary Metrics Cards */}
                {(() => {
                  const summary = calculateGitHubActivitySummary(sprintActivities);
                  return (
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                      <div className="bg-white p-4 rounded-2xl border border-border shadow-sm">
                        <span className="text-[11px] font-bold text-muted-foreground uppercase tracking-wider block mb-1">
                          Linked Commits
                        </span>
                        <div className="flex items-center justify-between">
                          <span className="text-2xl font-black text-blue-600">
                            {summary.commitsCount}
                          </span>
                          <div className="w-8 h-8 rounded-lg bg-blue-50 flex items-center justify-center text-blue-600">
                            <GitCommit size={16} />
                          </div>
                        </div>
                      </div>

                      <div className="bg-white p-4 rounded-2xl border border-border shadow-sm">
                        <span className="text-[11px] font-bold text-muted-foreground uppercase tracking-wider block mb-1">
                          Pull Requests
                        </span>
                        <div className="flex items-center justify-between">
                          <span className="text-2xl font-black text-purple-600">
                            {summary.prCount}
                          </span>
                          <div className="w-8 h-8 rounded-lg bg-purple-50 flex items-center justify-center text-purple-600">
                            <GitPullRequest size={16} />
                          </div>
                        </div>
                      </div>

                      <div className="bg-white p-4 rounded-2xl border border-border shadow-sm">
                        <span className="text-[11px] font-bold text-muted-foreground uppercase tracking-wider block mb-1">
                          Merged PRs
                        </span>
                        <div className="flex items-center justify-between">
                          <span className="text-2xl font-black text-emerald-600">
                            {summary.mergedPrCount}
                          </span>
                          <div className="w-8 h-8 rounded-lg bg-emerald-50 flex items-center justify-center text-emerald-600">
                            <CheckCircle2 size={16} />
                          </div>
                        </div>
                      </div>

                      <div className="bg-white p-4 rounded-2xl border border-border shadow-sm">
                        <span className="text-[11px] font-bold text-muted-foreground uppercase tracking-wider block mb-1">
                          Repositories
                        </span>
                        <div className="flex items-center justify-between">
                          <span className="text-2xl font-black text-foreground">
                            {summary.uniqueRepositoriesCount}
                          </span>
                          <div className="w-8 h-8 rounded-lg bg-slate-100 flex items-center justify-center text-slate-700">
                            <GitBranch size={16} />
                          </div>
                        </div>
                      </div>
                    </div>
                  );
                })()}

                {/* Activities Timeline */}
                <div className="bg-white rounded-[24px] border border-border p-6 shadow-sm space-y-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <h3 className="text-sm font-black text-foreground uppercase tracking-wider">
                        Riwayat Aktivitas pada Sprint Ini ({sprintActivities.length})
                      </h3>
                      <p className="text-xs text-muted-foreground mt-0.5">
                        Menampilkan bukti pengembangan dari task yang terhubung dengan sprint ini (termasuk riwayat task dari historical ledger).
                      </p>
                    </div>

                    <button
                      onClick={() => loadSprintActivities(selectedProjectId, selectedSprintId)}
                      disabled={sprintActivitiesLoading}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-slate-200 text-slate-700 text-xs font-bold hover:bg-slate-50 transition-colors"
                    >
                      <RefreshCw size={13} className={sprintActivitiesLoading ? "animate-spin" : ""} />
                      <span>Refresh</span>
                    </button>
                  </div>

                  {sprintActivitiesLoading ? (
                    <div className="py-8 text-center text-xs text-muted-foreground">
                      Memuat aktivitas GitHub...
                    </div>
                  ) : sprintActivities.length === 0 ? (
                    <div className="py-12 text-center text-xs text-muted-foreground space-y-1">
                      <p className="font-bold text-slate-700">Belum ada aktivitas GitHub pada Sprint ini</p>
                      <p className="text-[11px] max-w-sm mx-auto">
                        Aktivitas commit atau PR yang menyertakan task key yang ditugaskan pada Sprint ini akan muncul di sini.
                      </p>
                    </div>
                  ) : (
                    <div className="divide-y divide-border">
                      {sprintActivities.map((act) => {
                        const typeMeta = getActivityTypeMeta(act.activityType, act.prMerged);
                        const statusMeta = getSuggestedStatusMeta(act.suggestedTaskStatus);
                        const isPush = act.activityType === "push";
                        const repo = sprintRepos.find((r) => r.id === act.repositoryId);
                        const repoLabel = repo?.fullName || "Repository";
                        const hasValidUrl = isValidGitHubUrl(act.htmlUrl);

                        return (
                          <div
                            key={act.id}
                            className="py-4 flex flex-col md:flex-row md:items-start justify-between gap-3 text-xs"
                          >
                            <div className="space-y-1.5 flex-1 min-w-0">
                              <div className="flex items-center gap-2 flex-wrap">
                                <span className={`px-2 py-0.5 rounded text-[10px] font-bold border ${typeMeta.badgeClass}`}>
                                  {typeMeta.label}
                                </span>
                                <span className="font-bold text-slate-700 bg-slate-100 px-2 py-0.5 rounded text-[11px]">
                                  {repoLabel}
                                </span>
                                {act.branchName && (
                                  <span className="font-mono text-slate-600 bg-slate-50 px-1.5 py-0.5 rounded border border-slate-200 text-[11px]">
                                    {act.branchName}
                                  </span>
                                )}
                                {statusMeta && (
                                  <span className={`px-2 py-0.5 rounded text-[10px] font-bold border ${statusMeta.badgeClass}`}>
                                    {statusMeta.label}
                                  </span>
                                )}
                              </div>

                              {isPush ? (
                                <div className="space-y-1">
                                  <div className="flex items-center gap-2 flex-wrap">
                                    {act.commitSha && (
                                      <code className="px-1.5 py-0.5 rounded bg-slate-100 text-slate-800 font-mono font-bold text-[11px]">
                                        {formatShortSha(act.commitSha)}
                                      </code>
                                    )}
                                    <span className="font-semibold text-foreground break-words">
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
                                    <span className="font-semibold text-foreground break-words">
                                      {act.prTitle || "(Tanpa judul PR)"}
                                    </span>
                                  </div>
                                </div>
                              )}

                              <div className="flex items-center gap-3 text-muted-foreground text-[11px] flex-wrap">
                                <span>
                                  Oleh: <strong className="text-foreground">{formatGitHubActor(act.actorLogin)}</strong>
                                </span>
                                {act.occurredAt && (
                                  <>
                                    <span>•</span>
                                    <span>{new Date(act.occurredAt).toLocaleString("id-ID")}</span>
                                  </>
                                )}
                                {hasValidUrl && (
                                  <>
                                    <span>•</span>
                                    <a
                                      href={act.htmlUrl!}
                                      target="_blank"
                                      rel="noopener noreferrer"
                                      className="inline-flex items-center gap-1 text-primary hover:underline font-semibold"
                                    >
                                      <span>Buka di GitHub</span>
                                      <ExternalLink size={10} />
                                    </a>
                                  </>
                                )}
                              </div>
                            </div>

                            {/* On closed sprint or sprint summary, suggestions are purely evidence (no Apply button) */}
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </LayoutComponent>
  );
}
