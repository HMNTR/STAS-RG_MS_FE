import React, { useState, useEffect, useMemo, useCallback } from "react";
import { useLocation, useNavigate, useSearchParams } from "react-router";
import {
  GitBranch,
  GitCommit,
  GitPullRequest,
  ExternalLink,
  Plus,
  RefreshCw,
  Search,
  Filter,
  CheckCircle2,
  AlertCircle,
  Info,
  X,
  Layers,
  FlaskConical,
  Copy,
  Check,
  Lock,
  Unlock,
  Settings,
  Edit3,
  Calendar,
  AlertTriangle,
} from "lucide-react";
import { useAuth } from "../../../context/AuthContext";
import { apiGet, apiPost, apiPatch } from "../../../lib/api";
import { OperatorLayout } from "../../templates/OperatorLayout";
import { DosenLayout } from "../../templates/DosenLayout";
import {
  GitHubRepository,
  GitHubActivity,
  GitHubIntegrationStatus,
  normalizeGitHubRepository,
  normalizeGitHubActivity,
  normalizeGitHubConfigStatus,
  formatTaskKey,
  generateBranchTemplate,
  formatShortSha,
  getActivityTypeMeta,
  getSuggestedStatusMeta,
  isValidGitHubUrl,
  formatGitHubActor,
  calculateGitHubActivitySummary,
  canApplySuggestedStatus,
  formatGitHubError,
} from "../../../lib/githubIntegration";
import { normalizeDivisionItem } from "../../../lib/scrum";

interface Project {
  id: string;
  title: string;
  short_title?: string;
  status: string;
}

interface ProjectDivision {
  id: string;
  name: string;
  isActive?: boolean;
}

interface SprintItem {
  id: string;
  name: string;
  status: string;
}

export default function GitHubIntegration() {
  const { user: currentUser } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();

  const isDosen = location.pathname.startsWith("/dosen");
  const LayoutComponent = isDosen ? DosenLayout : OperatorLayout;
  const canManage = currentUser?.role === "operator" || currentUser?.role === "dosen";

  // Data states
  const [projects, setProjects] = useState<Project[]>([]);
  const [selectedProjectId, setSelectedProjectId] = useState<string>(
    searchParams.get("projectId") || ""
  );
  const [divisions, setDivisions] = useState<ProjectDivision[]>([]);
  const [sprints, setSprints] = useState<SprintItem[]>([]);
  const [repositories, setRepositories] = useState<GitHubRepository[]>([]);
  const [configStatus, setConfigStatus] = useState<GitHubIntegrationStatus>({ configured: false });
  const [activities, setActivities] = useState<GitHubActivity[]>([]);

  // Filter states
  const [selectedSprintId, setSelectedSprintId] = useState<string>(
    searchParams.get("sprintId") || ""
  );
  const [selectedDivisionId, setSelectedDivisionId] = useState<string>(
    searchParams.get("divisionId") || ""
  );
  const [selectedRepoFilter, setSelectedRepoFilter] = useState<string>("");
  const [selectedTypeFilter, setSelectedTypeFilter] = useState<string>("");

  // Loading & feedback states
  const [initialLoading, setInitialLoading] = useState<boolean>(true);
  const [reposLoading, setReposLoading] = useState<boolean>(false);
  const [activitiesLoading, setActivitiesLoading] = useState<boolean>(false);
  const [error, setError] = useState<string>("");
  const [successMessage, setSuccessMessage] = useState<string>("");

  // Modals state
  const [showAddModal, setShowAddModal] = useState<boolean>(false);
  const [editingRepo, setEditingRepo] = useState<GitHubRepository | null>(null);
  const [savingRepo, setSavingRepo] = useState<boolean>(false);

  // Status Apply confirmation modal
  const [confirmApply, setConfirmApply] = useState<{
    activity: GitHubActivity;
    targetStatus: string;
  } | null>(null);
  const [applyingStatus, setApplyingStatus] = useState<boolean>(false);

  // Add/Edit form
  const [repoForm, setRepoForm] = useState({
    owner: "",
    repo: "",
    divisionId: "",
    defaultBranch: "main",
    githubRepositoryId: "",
    githubInstallationId: "",
    isPrivate: false,
    isActive: true,
  });

  // Copied feedback
  const [copiedKey, setCopiedKey] = useState<string>("");

  const handleCopy = (text: string, id: string) => {
    navigator.clipboard.writeText(text);
    setCopiedKey(id);
    setTimeout(() => setCopiedKey(""), 2000);
  };

  // Sync selection to query params
  const updateQueryParams = (projId: string, spId: string, divId: string) => {
    const params = new URLSearchParams();
    if (projId) params.set("projectId", projId);
    if (spId) params.set("sprintId", spId);
    if (divId) params.set("divisionId", divId);
    setSearchParams(params, { replace: true });
  };

  // Initial load: Projects
  useEffect(() => {
    let mounted = true;
    async function loadProjects() {
      try {
        setInitialLoading(true);
        setError("");
        const endpoint = isDosen ? "/research/assigned" : "/research/projects";
        const data = await apiGet<Project[]>(endpoint);
        const list = Array.isArray(data) ? data : [];
        if (mounted) {
          setProjects(list);
          const currentParam = searchParams.get("projectId");
          const target = list.find((p) => p.id === currentParam)?.id || list[0]?.id || "";
          setSelectedProjectId(target);
          if (target && target !== currentParam) {
            updateQueryParams(target, selectedSprintId, selectedDivisionId);
          }
        }
      } catch (err: any) {
        if (mounted) setError("Gagal memuat daftar proyek riset.");
      } finally {
        if (mounted) setInitialLoading(false);
      }
    }
    loadProjects();
    return () => {
      mounted = false;
    };
  }, [isDosen]);

  // When selected project changes: load divisions, sprints, repositories, and config
  const loadProjectData = useCallback(async (projectId: string) => {
    if (!projectId) return;
    try {
      setReposLoading(true);
      setError("");

      const [divsRes, sprintsRes, reposRes] = await Promise.all([
        apiGet<any[]>(`/research/${projectId}/divisions`).catch(() => []),
        apiGet<any[]>(`/research/${projectId}/sprints`).catch(() => []),
        apiGet<{ configured?: boolean; repositories?: any[] }>(`/research/${projectId}/repositories`).catch(() => ({ configured: false, repositories: [] })),
      ]);

      setDivisions((divsRes || []).map(normalizeDivisionItem));
      setSprints(Array.isArray(sprintsRes) ? sprintsRes : []);
      setConfigStatus(normalizeGitHubConfigStatus(reposRes));
      const rawRepos = Array.isArray(reposRes?.repositories) ? reposRes.repositories : [];
      setRepositories(rawRepos.map(normalizeGitHubRepository));
    } catch (err: any) {
      setError(formatGitHubError(err));
    } finally {
      setReposLoading(false);
    }
  }, []);

  useEffect(() => {
    if (selectedProjectId) {
      loadProjectData(selectedProjectId);
    }
  }, [selectedProjectId, loadProjectData]);

  // Load activities with filters (sprintId, divisionId)
  const loadActivities = useCallback(async () => {
    if (!selectedProjectId) return;
    try {
      setActivitiesLoading(true);
      const queryParts: string[] = [];
      if (selectedSprintId) queryParts.push(`sprintId=${encodeURIComponent(selectedSprintId)}`);
      if (selectedDivisionId) queryParts.push(`divisionId=${encodeURIComponent(selectedDivisionId)}`);
      const qs = queryParts.length ? `?${queryParts.join("&")}` : "";

      const res = await apiGet<any[]>(`/research/${selectedProjectId}/github-activity${qs}`);
      const list = Array.isArray(res) ? res : [];
      setActivities(list.map(normalizeGitHubActivity));
    } catch (err: any) {
      setError("Aktivitas GitHub tidak dapat dimuat saat ini.");
    } finally {
      setActivitiesLoading(false);
    }
  }, [selectedProjectId, selectedSprintId, selectedDivisionId]);

  useEffect(() => {
    if (selectedProjectId) {
      loadActivities();
    }
  }, [selectedProjectId, selectedSprintId, selectedDivisionId, loadActivities]);

  // Filtered activities on frontend for repo & activity type
  const filteredActivities = useMemo(() => {
    return activities.filter((act) => {
      if (selectedRepoFilter && act.repositoryId !== selectedRepoFilter) return false;
      if (selectedTypeFilter) {
        if (selectedTypeFilter === "push" && act.activityType !== "push") return false;
        if (selectedTypeFilter === "pr_opened" && act.activityType !== "pull_request_opened") return false;
        if (selectedTypeFilter === "pr_merged" && act.activityType !== "pull_request_merged" && act.prMerged !== true) return false;
        if (selectedTypeFilter === "pr_closed" && (act.activityType !== "pull_request_closed" || act.prMerged === true)) return false;
      }
      return true;
    });
  }, [activities, selectedRepoFilter, selectedTypeFilter]);

  // Metrics summary
  const summaryMetrics = useMemo(() => {
    return calculateGitHubActivitySummary(activities);
  }, [activities]);

  // Open Add Repo Modal
  const openAddModal = () => {
    setRepoForm({
      owner: "",
      repo: "",
      divisionId: "",
      defaultBranch: "main",
      githubRepositoryId: "",
      githubInstallationId: "",
      isPrivate: false,
      isActive: true,
    });
    setShowAddModal(true);
    setError("");
  };

  // Open Edit Repo Modal
  const openEditModal = (r: GitHubRepository) => {
    setEditingRepo(r);
    setRepoForm({
      owner: r.owner,
      repo: r.repo,
      divisionId: r.divisionId || "",
      defaultBranch: r.defaultBranch || "main",
      githubRepositoryId: r.githubRepositoryId || "",
      githubInstallationId: r.githubInstallationId || "",
      isPrivate: r.isPrivate,
      isActive: r.isActive,
    });
    setError("");
  };

  // Submit Add Repo
  const handleCreateRepo = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!repoForm.owner.trim() || !repoForm.repo.trim()) {
      setError("Owner dan Nama Repository wajib diisi.");
      return;
    }
    try {
      setSavingRepo(true);
      setError("");
      await apiPost(`/research/${selectedProjectId}/repositories`, {
        owner: repoForm.owner.trim(),
        repo: repoForm.repo.trim(),
        divisionId: repoForm.divisionId || null,
        defaultBranch: repoForm.defaultBranch.trim() || "main",
        githubRepositoryId: repoForm.githubRepositoryId.trim() || null,
        githubInstallationId: repoForm.githubInstallationId.trim() || null,
        isPrivate: repoForm.isPrivate,
      });
      setShowAddModal(false);
      setSuccessMessage("Repository berhasil ditambahkan ke project.");
      setTimeout(() => setSuccessMessage(""), 3000);
      await loadProjectData(selectedProjectId);
    } catch (err: any) {
      setError(formatGitHubError(err));
    } finally {
      setSavingRepo(false);
    }
  };

  // Submit Edit Repo
  const handleUpdateRepo = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingRepo) return;
    try {
      setSavingRepo(true);
      setError("");
      await apiPatch(`/research/${selectedProjectId}/repositories/${editingRepo.id}`, {
        divisionId: repoForm.divisionId || null,
        defaultBranch: repoForm.defaultBranch.trim() || "main",
        githubInstallationId: repoForm.githubInstallationId.trim() || null,
        isPrivate: repoForm.isPrivate,
        isActive: repoForm.isActive,
      });
      setEditingRepo(null);
      setSuccessMessage("Pengaturan repository berhasil diperbarui.");
      setTimeout(() => setSuccessMessage(""), 3000);
      await loadProjectData(selectedProjectId);
    } catch (err: any) {
      setError(formatGitHubError(err));
    } finally {
      setSavingRepo(false);
    }
  };

  // Quick toggle active status
  const handleToggleRepoActive = async (r: GitHubRepository) => {
    try {
      setError("");
      await apiPatch(`/research/${selectedProjectId}/repositories/${r.id}`, {
        isActive: !r.isActive,
      });
      setSuccessMessage(`Repository ${r.fullName} berhasil ${!r.isActive ? "diaktifkan" : "dinonaktifkan"}.`);
      setTimeout(() => setSuccessMessage(""), 3000);
      await loadProjectData(selectedProjectId);
    } catch (err: any) {
      setError(formatGitHubError(err));
    }
  };

  // Execute Human Confirmation for Status Suggestion
  const handleApplySuggestedStatus = async () => {
    if (!confirmApply?.activity?.taskId || !confirmApply.targetStatus) return;
    try {
      setApplyingStatus(true);
      setError("");
      // Call standard Task update API (NOT a GitHub mutation)
      await apiPatch(`/research/${selectedProjectId}/board/tasks/${confirmApply.activity.taskId}`, {
        status: confirmApply.targetStatus,
      });
      setSuccessMessage(`Status task berhasil diubah menjadi ${confirmApply.targetStatus}.`);
      setTimeout(() => setSuccessMessage(""), 3000);
      setConfirmApply(null);
      await loadActivities();
    } catch (err: any) {
      setError(err?.message || "Gagal menerapkan status task.");
    } finally {
      setApplyingStatus(false);
    }
  };

  const selectedSprint = sprints.find((s) => s.id === selectedSprintId);
  const isSelectedSprintClosed = selectedSprint?.status === "closed";

  return (
    <LayoutComponent title="GitHub Development">
      <div className="p-6 max-w-7xl mx-auto space-y-6">
        {/* Header with Project Selector */}
        <div className="bg-white rounded-2xl p-6 border border-border shadow-sm flex flex-col md:flex-row md:items-center md:justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <div className="w-8 h-8 rounded-lg bg-slate-900 text-white flex items-center justify-center">
                <GitBranch size={18} />
              </div>
              <h1 className="text-xl font-black text-foreground">GitHub Development</h1>
              <span className="px-2.5 py-0.5 rounded-full text-xs font-bold bg-slate-100 text-slate-700 border border-slate-200">
                Scrum V2
              </span>
            </div>
            <p className="text-xs text-muted-foreground">
              Bukti aktivitas commit dan pull request untuk mendukung verifikasi Scrum.
            </p>
          </div>

          <div className="flex items-center gap-3 flex-wrap">
            <div className="flex items-center gap-2">
              <FlaskConical size={16} className="text-muted-foreground" />
              <select
                value={selectedProjectId}
                onChange={(e) => {
                  const val = e.target.value;
                  setSelectedProjectId(val);
                  updateQueryParams(val, selectedSprintId, selectedDivisionId);
                }}
                disabled={initialLoading || projects.length === 0}
                className="text-sm font-bold border border-slate-200 rounded-xl px-3 py-2 bg-slate-50 text-slate-800 focus:outline-none focus:ring-2 focus:ring-primary/20"
              >
                {projects.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.short_title || p.title}
                  </option>
                ))}
              </select>
            </div>

            {canManage && (
              <button
                onClick={openAddModal}
                className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-primary text-white text-sm font-bold hover:bg-primary/90 transition-colors shadow-sm"
              >
                <Plus size={16} />
                <span>Tambah Repository</span>
              </button>
            )}
          </div>
        </div>

        {/* Global Feedback Banner */}
        {error && (
          <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-xl text-sm flex items-center justify-between">
            <div className="flex items-center gap-2">
              <AlertCircle size={16} className="shrink-0" />
              <span>{error}</span>
            </div>
            <button onClick={() => setError("")} className="text-red-500 hover:text-red-700">
              <X size={16} />
            </button>
          </div>
        )}

        {successMessage && (
          <div className="bg-emerald-50 border border-emerald-200 text-emerald-700 px-4 py-3 rounded-xl text-sm flex items-center justify-between">
            <div className="flex items-center gap-2">
              <CheckCircle2 size={16} className="shrink-0" />
              <span>{successMessage}</span>
            </div>
            <button onClick={() => setSuccessMessage("")} className="text-emerald-500 hover:text-emerald-700">
              <X size={16} />
            </button>
          </div>
        )}

        {/* GitHub App Configuration State Banner */}
        {!configStatus.configured ? (
          <div className="bg-amber-50 border border-amber-200 text-amber-800 px-5 py-4 rounded-2xl flex items-start gap-3 shadow-sm">
            <Info size={20} className="text-amber-600 mt-0.5 shrink-0" />
            <div className="text-sm space-y-1">
              <p className="font-bold">Informasi Konfigurasi Server</p>
              <p className="text-xs text-amber-700 leading-relaxed">
                GitHub App belum dikonfigurasi pada server. Repository dapat dilihat/dikelola sesuai kemampuan backend, tetapi sinkronisasi GitHub live belum tersedia.
              </p>
            </div>
          </div>
        ) : (
          <div className="bg-emerald-50 border border-emerald-200 text-emerald-800 px-5 py-3 rounded-2xl flex items-center justify-between text-xs font-semibold shadow-sm">
            <div className="flex items-center gap-2">
              <CheckCircle2 size={16} className="text-emerald-600 shrink-0" />
              <span>GitHub App terhubung dan aktif pada server. Webhook live siap menerima event.</span>
            </div>
          </div>
        )}

        {/* Overview Summary Cards */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          <div className="bg-white p-4 rounded-2xl border border-border shadow-sm">
            <span className="text-[11px] font-bold text-muted-foreground uppercase tracking-wider block mb-1">
              Total Aktivitas
            </span>
            <div className="flex items-center justify-between">
              <span className="text-2xl font-black text-foreground">
                {summaryMetrics.totalActivities}
              </span>
              <div className="w-8 h-8 rounded-lg bg-slate-100 flex items-center justify-center text-slate-600">
                <GitBranch size={16} />
              </div>
            </div>
          </div>

          <div className="bg-white p-4 rounded-2xl border border-border shadow-sm">
            <span className="text-[11px] font-bold text-muted-foreground uppercase tracking-wider block mb-1">
              Commits / Push
            </span>
            <div className="flex items-center justify-between">
              <span className="text-2xl font-black text-blue-600">
                {summaryMetrics.commitsCount}
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
                {summaryMetrics.prCount}
              </span>
              <div className="w-8 h-8 rounded-lg bg-purple-50 flex items-center justify-center text-purple-600">
                <GitPullRequest size={16} />
              </div>
            </div>
          </div>

          <div className="bg-white p-4 rounded-2xl border border-border shadow-sm">
            <span className="text-[11px] font-bold text-muted-foreground uppercase tracking-wider block mb-1">
              PR Di-merge
            </span>
            <div className="flex items-center justify-between">
              <span className="text-2xl font-black text-emerald-600">
                {summaryMetrics.mergedPrCount}
              </span>
              <div className="w-8 h-8 rounded-lg bg-emerald-50 flex items-center justify-center text-emerald-600">
                <CheckCircle2 size={16} />
              </div>
            </div>
          </div>
        </div>

        {/* Repository Management Section */}
        <div className="bg-white rounded-2xl border border-border shadow-sm overflow-hidden">
          <div className="p-6 border-b border-border flex items-center justify-between flex-wrap gap-3">
            <div>
              <h2 className="text-lg font-black text-foreground flex items-center gap-2">
                <span>Repository Terdaftar</span>
                <span className="px-2 py-0.5 rounded-full text-xs font-bold bg-slate-100 text-slate-700">
                  {repositories.length}
                </span>
              </h2>
              <p className="text-xs text-muted-foreground mt-0.5">
                Daftar repository GitHub yang terhubung dengan project ini.
              </p>
            </div>
          </div>

          {reposLoading ? (
            <div className="p-8 text-center text-sm text-muted-foreground">
              Memuat repository...
            </div>
          ) : repositories.length === 0 ? (
            <div className="p-12 text-center">
              <div className="w-12 h-12 rounded-2xl bg-slate-100 text-slate-400 flex items-center justify-center mx-auto mb-3">
                <GitBranch size={24} />
              </div>
              <h3 className="text-sm font-bold text-foreground mb-1">Belum ada repository pada project ini</h3>
              <p className="text-xs text-muted-foreground max-w-sm mx-auto mb-4">
                Hubungkan repository GitHub Anda untuk mulai mencatat bukti commit dan pull request.
              </p>
              {canManage && (
                <button
                  onClick={openAddModal}
                  className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-primary text-white text-xs font-bold hover:bg-primary/90 transition-colors"
                >
                  <Plus size={14} />
                  <span>Tambah Repository</span>
                </button>
              )}
            </div>
          ) : (
            <div className="divide-y divide-border">
              {repositories.map((repo) => {
                const div = divisions.find((d) => d.id === repo.divisionId);
                const safeUrl = `https://github.com/${repo.owner}/${repo.repo}`;
                return (
                  <div
                    key={repo.id}
                    className="p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4 hover:bg-slate-50/60 transition-colors"
                  >
                    <div className="space-y-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-bold text-sm text-foreground flex items-center gap-1.5">
                          {repo.fullName}
                        </span>
                        {isValidGitHubUrl(safeUrl) && (
                          <a
                            href={safeUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-slate-400 hover:text-slate-700 transition-colors"
                            title="Buka di GitHub"
                          >
                            <ExternalLink size={13} />
                          </a>
                        )}
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
                          Divisi:{" "}
                          <strong className="text-foreground">
                            {div?.name || "Lintas Divisi (Semua Divisi)"}
                          </strong>
                        </span>
                        <span>•</span>
                        <span>
                          Default branch:{" "}
                          <code className="px-1.5 py-0.5 rounded bg-slate-100 text-slate-700 text-[11px] font-mono">
                            {repo.defaultBranch}
                          </code>
                        </span>
                        {repo.githubRepositoryId && (
                          <>
                            <span>•</span>
                            <span>Repo ID: {repo.githubRepositoryId}</span>
                          </>
                        )}
                      </div>
                    </div>

                    {canManage && (
                      <div className="flex items-center gap-2 shrink-0">
                        <button
                          onClick={() => openEditModal(repo)}
                          className="px-3 py-1.5 rounded-lg border border-slate-200 text-slate-700 text-xs font-bold hover:bg-slate-100 transition-colors flex items-center gap-1"
                        >
                          <Edit3 size={13} />
                          <span>Edit</span>
                        </button>
                        <button
                          onClick={() => handleToggleRepoActive(repo)}
                          className={`px-3 py-1.5 rounded-lg text-xs font-bold border transition-colors ${
                            repo.isActive
                              ? "border-amber-200 text-amber-700 hover:bg-amber-50"
                              : "border-emerald-200 text-emerald-700 hover:bg-emerald-50"
                          }`}
                        >
                          {repo.isActive ? "Nonaktifkan" : "Aktifkan"}
                        </button>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Development Activity Section */}
        <div className="bg-white rounded-2xl border border-border shadow-sm overflow-hidden">
          <div className="p-6 border-b border-border space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div>
                <h2 className="text-lg font-black text-foreground flex items-center gap-2">
                  <span>Development Activity</span>
                  <span className="px-2 py-0.5 rounded-full text-xs font-bold bg-slate-100 text-slate-700">
                    {filteredActivities.length}
                  </span>
                </h2>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Bukti riwayat commit, push, dan pull request dari seluruh aktivitas pengembangan.
                </p>
              </div>

              <button
                onClick={loadActivities}
                disabled={activitiesLoading}
                className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl border border-slate-200 text-slate-700 text-xs font-bold hover:bg-slate-50 transition-colors self-start sm:self-auto"
              >
                <RefreshCw size={13} className={activitiesLoading ? "animate-spin" : ""} />
                <span>Refresh Activity</span>
              </button>
            </div>

            {/* Filter controls */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 pt-2">
              {/* Sprint Filter */}
              <div>
                <label className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider block mb-1">
                  Sprint
                </label>
                <select
                  value={selectedSprintId}
                  onChange={(e) => {
                    const val = e.target.value;
                    setSelectedSprintId(val);
                    updateQueryParams(selectedProjectId, val, selectedDivisionId);
                  }}
                  className="w-full text-xs font-bold border border-slate-200 rounded-xl px-3 py-2 bg-slate-50 text-slate-800 focus:outline-none focus:ring-2 focus:ring-primary/20"
                >
                  <option value="">Semua Sprint</option>
                  {sprints.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name} ({s.status})
                    </option>
                  ))}
                </select>
              </div>

              {/* Division Filter */}
              <div>
                <label className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider block mb-1">
                  Divisi
                </label>
                <select
                  value={selectedDivisionId}
                  onChange={(e) => {
                    const val = e.target.value;
                    setSelectedDivisionId(val);
                    updateQueryParams(selectedProjectId, selectedSprintId, val);
                  }}
                  className="w-full text-xs font-bold border border-slate-200 rounded-xl px-3 py-2 bg-slate-50 text-slate-800 focus:outline-none focus:ring-2 focus:ring-primary/20"
                >
                  <option value="">Semua Divisi</option>
                  {divisions.map((d) => (
                    <option key={d.id} value={d.id}>
                      {d.name}
                    </option>
                  ))}
                </select>
              </div>

              {/* Repository Filter */}
              <div>
                <label className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider block mb-1">
                  Repository
                </label>
                <select
                  value={selectedRepoFilter}
                  onChange={(e) => setSelectedRepoFilter(e.target.value)}
                  className="w-full text-xs font-bold border border-slate-200 rounded-xl px-3 py-2 bg-slate-50 text-slate-800 focus:outline-none focus:ring-2 focus:ring-primary/20"
                >
                  <option value="">Semua Repository</option>
                  {repositories.map((r) => (
                    <option key={r.id} value={r.id}>
                      {r.fullName}
                    </option>
                  ))}
                </select>
              </div>

              {/* Activity Type Filter */}
              <div>
                <label className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider block mb-1">
                  Tipe Aktivitas
                </label>
                <select
                  value={selectedTypeFilter}
                  onChange={(e) => setSelectedTypeFilter(e.target.value)}
                  className="w-full text-xs font-bold border border-slate-200 rounded-xl px-3 py-2 bg-slate-50 text-slate-800 focus:outline-none focus:ring-2 focus:ring-primary/20"
                >
                  <option value="">Semua Tipe</option>
                  <option value="push">Push / Commit</option>
                  <option value="pr_opened">PR Dibuka</option>
                  <option value="pr_merged">PR Di-merge</option>
                  <option value="pr_closed">PR Ditutup</option>
                </select>
              </div>
            </div>
          </div>

          {/* Activity List */}
          {activitiesLoading ? (
            <div className="p-8 text-center text-sm text-muted-foreground">
              Memuat aktivitas GitHub...
            </div>
          ) : filteredActivities.length === 0 ? (
            <div className="p-12 text-center">
              <div className="w-12 h-12 rounded-2xl bg-slate-100 text-slate-400 flex items-center justify-center mx-auto mb-3">
                <GitCommit size={24} />
              </div>
              <h3 className="text-sm font-bold text-foreground mb-1">Belum ada aktivitas pada filter ini</h3>
              <p className="text-xs text-muted-foreground max-w-sm mx-auto">
                Aktivitas akan tercatat otomatis saat commit atau pull request dengan TASK-Key diproses oleh webhook GitHub.
              </p>
            </div>
          ) : (
            <div className="divide-y divide-border">
              {filteredActivities.map((act) => {
                const typeMeta = getActivityTypeMeta(act.activityType, act.prMerged);
                const statusMeta = getSuggestedStatusMeta(act.suggestedTaskStatus);
                const repo = repositories.find((r) => r.id === act.repositoryId);
                const repoLabel = repo?.fullName || "Repository";
                const isPush = act.activityType === "push";
                const hasValidUrl = isValidGitHubUrl(act.htmlUrl);

                return (
                  <div
                    key={act.id}
                    className="p-5 flex flex-col md:flex-row md:items-start justify-between gap-4 hover:bg-slate-50/50 transition-colors"
                  >
                    <div className="space-y-2 flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className={`px-2.5 py-0.5 rounded text-[10px] font-bold border ${typeMeta.badgeClass}`}>
                          {typeMeta.label}
                        </span>
                        <span className="text-xs font-bold text-slate-700 bg-slate-100 px-2 py-0.5 rounded">
                          {repoLabel}
                        </span>
                        {act.branchName && (
                          <span className="text-xs font-mono text-slate-600 flex items-center gap-1 bg-slate-50 px-2 py-0.5 rounded border border-slate-200">
                            <GitBranch size={11} />
                            {act.branchName}
                          </span>
                        )}
                        {statusMeta && (
                          <span className={`px-2 py-0.5 rounded text-[10px] font-bold border ${statusMeta.badgeClass}`}>
                            {statusMeta.label}
                          </span>
                        )}
                      </div>

                      {/* Content details */}
                      {isPush ? (
                        <div className="space-y-1">
                          <div className="flex items-center gap-2 flex-wrap text-xs">
                            {act.commitSha && (
                              <code className="px-1.5 py-0.5 rounded bg-slate-100 text-slate-800 font-mono font-bold">
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
                          <div className="flex items-center gap-2 flex-wrap text-xs">
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

                      {/* Metadata row */}
                      <div className="flex items-center gap-3 text-xs text-muted-foreground flex-wrap">
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
                              className="inline-flex items-center gap-1 text-primary hover:underline font-medium"
                            >
                              <span>Buka di GitHub</span>
                              <ExternalLink size={11} />
                            </a>
                          </>
                        )}
                      </div>
                    </div>

                    {/* Human confirmation action button for suggestions */}
                    {canManage && act.taskId && act.suggestedTaskStatus && !isSelectedSprintClosed && (
                      <div className="shrink-0 flex items-center">
                        <button
                          onClick={() =>
                            setConfirmApply({
                              activity: act,
                              targetStatus: act.suggestedTaskStatus!,
                            })
                          }
                          className="px-3 py-1.5 rounded-xl bg-slate-900 text-white text-xs font-bold hover:bg-slate-800 transition-colors shadow-sm"
                        >
                          Terapkan Status {act.suggestedTaskStatus}
                        </button>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Add Repository Modal */}
        {showAddModal && (
          <div className="fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-sm flex items-center justify-center p-4">
            <div className="bg-white rounded-2xl max-w-lg w-full p-6 shadow-2xl space-y-4 animate-in fade-in zoom-in-95">
              <div className="flex items-center justify-between border-b border-border pb-3">
                <h3 className="text-base font-black text-foreground flex items-center gap-2">
                  <GitBranch size={18} />
                  <span>Tambah Repository</span>
                </h3>
                <button onClick={() => setShowAddModal(false)} className="text-slate-400 hover:text-slate-600">
                  <X size={18} />
                </button>
              </div>

              <form onSubmit={handleCreateRepo} className="space-y-4">
                <div>
                  <label className="text-xs font-bold text-slate-700 block mb-1">
                    Owner / Organisasi <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="Contoh: stas-rg atau organization"
                    value={repoForm.owner}
                    onChange={(e) => setRepoForm({ ...repoForm, owner: e.target.value })}
                    className="w-full text-xs border border-slate-200 rounded-xl px-3 py-2 bg-slate-50 focus:bg-white focus:outline-none focus:ring-2 focus:ring-primary/20"
                  />
                </div>

                <div>
                  <label className="text-xs font-bold text-slate-700 block mb-1">
                    Nama Repository <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="Contoh: orbit-api"
                    value={repoForm.repo}
                    onChange={(e) => setRepoForm({ ...repoForm, repo: e.target.value })}
                    className="w-full text-xs border border-slate-200 rounded-xl px-3 py-2 bg-slate-50 focus:bg-white focus:outline-none focus:ring-2 focus:ring-primary/20"
                  />
                </div>

                <div>
                  <label className="text-xs font-bold text-slate-700 block mb-1">
                    Mapping Divisi (Opsional)
                  </label>
                  <select
                    value={repoForm.divisionId}
                    onChange={(e) => setRepoForm({ ...repoForm, divisionId: e.target.value })}
                    className="w-full text-xs font-bold border border-slate-200 rounded-xl px-3 py-2 bg-slate-50 text-slate-800 focus:outline-none focus:ring-2 focus:ring-primary/20"
                  >
                    <option value="">Semua Divisi (Lintas Divisi)</option>
                    {divisions.map((d) => (
                      <option key={d.id} value={d.id}>
                        {d.name}
                      </option>
                    ))}
                  </select>
                  <p className="text-[11px] text-muted-foreground mt-1">
                    Opsional. Repository tanpa mapping Divisi dapat digunakan lintas divisi dalam Project.
                  </p>
                </div>

                <div>
                  <label className="text-xs font-bold text-slate-700 block mb-1">
                    Default Branch
                  </label>
                  <input
                    type="text"
                    placeholder="main"
                    value={repoForm.defaultBranch}
                    onChange={(e) => setRepoForm({ ...repoForm, defaultBranch: e.target.value })}
                    className="w-full text-xs border border-slate-200 rounded-xl px-3 py-2 bg-slate-50 focus:bg-white focus:outline-none focus:ring-2 focus:ring-primary/20"
                  />
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-[11px] font-bold text-slate-700 block mb-1">
                      GitHub Repo ID (Opsional)
                    </label>
                    <input
                      type="text"
                      placeholder="Contoh: 12345678"
                      value={repoForm.githubRepositoryId}
                      onChange={(e) => setRepoForm({ ...repoForm, githubRepositoryId: e.target.value })}
                      className="w-full text-xs border border-slate-200 rounded-xl px-3 py-2 bg-slate-50 focus:outline-none"
                    />
                  </div>
                  <div>
                    <label className="text-[11px] font-bold text-slate-700 block mb-1">
                      Installation ID (Opsional)
                    </label>
                    <input
                      type="text"
                      placeholder="Contoh: 987654"
                      value={repoForm.githubInstallationId}
                      onChange={(e) => setRepoForm({ ...repoForm, githubInstallationId: e.target.value })}
                      className="w-full text-xs border border-slate-200 rounded-xl px-3 py-2 bg-slate-50 focus:outline-none"
                    />
                  </div>
                </div>

                <div className="flex items-center gap-2 pt-1">
                  <input
                    type="checkbox"
                    id="isPrivateCheck"
                    checked={repoForm.isPrivate}
                    onChange={(e) => setRepoForm({ ...repoForm, isPrivate: e.target.checked })}
                    className="rounded border-slate-300 text-primary focus:ring-primary/20"
                  />
                  <label htmlFor="isPrivateCheck" className="text-xs font-medium text-slate-700 cursor-pointer">
                    Repository Private
                  </label>
                </div>

                <div className="flex items-center justify-end gap-2 pt-3 border-t border-border">
                  <button
                    type="button"
                    onClick={() => setShowAddModal(false)}
                    className="px-4 py-2 rounded-xl text-xs font-bold text-slate-600 hover:bg-slate-100 transition-colors"
                  >
                    Batal
                  </button>
                  <button
                    type="submit"
                    disabled={savingRepo}
                    className="px-4 py-2 rounded-xl bg-primary text-white text-xs font-bold hover:bg-primary/90 transition-colors shadow-sm disabled:opacity-50"
                  >
                    {savingRepo ? "Menyimpan..." : "Simpan Repository"}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* Edit Repository Modal */}
        {editingRepo && (
          <div className="fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-sm flex items-center justify-center p-4">
            <div className="bg-white rounded-2xl max-w-lg w-full p-6 shadow-2xl space-y-4 animate-in fade-in zoom-in-95">
              <div className="flex items-center justify-between border-b border-border pb-3">
                <h3 className="text-base font-black text-foreground flex items-center gap-2">
                  <Edit3 size={18} />
                  <span>Edit Repository: {editingRepo.fullName}</span>
                </h3>
                <button onClick={() => setEditingRepo(null)} className="text-slate-400 hover:text-slate-600">
                  <X size={18} />
                </button>
              </div>

              <form onSubmit={handleUpdateRepo} className="space-y-4">
                <div>
                  <label className="text-xs font-bold text-slate-700 block mb-1">
                    Mapping Divisi
                  </label>
                  <select
                    value={repoForm.divisionId}
                    onChange={(e) => setRepoForm({ ...repoForm, divisionId: e.target.value })}
                    className="w-full text-xs font-bold border border-slate-200 rounded-xl px-3 py-2 bg-slate-50 text-slate-800 focus:outline-none focus:ring-2 focus:ring-primary/20"
                  >
                    <option value="">Semua Divisi (Lintas Divisi)</option>
                    {divisions.map((d) => (
                      <option key={d.id} value={d.id}>
                        {d.name}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="text-xs font-bold text-slate-700 block mb-1">
                    Default Branch
                  </label>
                  <input
                    type="text"
                    value={repoForm.defaultBranch}
                    onChange={(e) => setRepoForm({ ...repoForm, defaultBranch: e.target.value })}
                    className="w-full text-xs border border-slate-200 rounded-xl px-3 py-2 bg-slate-50 focus:bg-white focus:outline-none focus:ring-2 focus:ring-primary/20"
                  />
                </div>

                <div>
                  <label className="text-xs font-bold text-slate-700 block mb-1">
                    Installation ID (Opsional)
                  </label>
                  <input
                    type="text"
                    value={repoForm.githubInstallationId}
                    onChange={(e) => setRepoForm({ ...repoForm, githubInstallationId: e.target.value })}
                    className="w-full text-xs border border-slate-200 rounded-xl px-3 py-2 bg-slate-50 focus:outline-none"
                  />
                </div>

                <div className="space-y-2 pt-1">
                  <div className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      id="editIsPrivate"
                      checked={repoForm.isPrivate}
                      onChange={(e) => setRepoForm({ ...repoForm, isPrivate: e.target.checked })}
                      className="rounded border-slate-300 text-primary focus:ring-primary/20"
                    />
                    <label htmlFor="editIsPrivate" className="text-xs font-medium text-slate-700 cursor-pointer">
                      Repository Private
                    </label>
                  </div>

                  <div className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      id="editIsActive"
                      checked={repoForm.isActive}
                      onChange={(e) => setRepoForm({ ...repoForm, isActive: e.target.checked })}
                      className="rounded border-slate-300 text-primary focus:ring-primary/20"
                    />
                    <label htmlFor="editIsActive" className="text-xs font-medium text-slate-700 cursor-pointer">
                      Status Aktif
                    </label>
                  </div>
                </div>

                <div className="flex items-center justify-end gap-2 pt-3 border-t border-border">
                  <button
                    type="button"
                    onClick={() => setEditingRepo(null)}
                    className="px-4 py-2 rounded-xl text-xs font-bold text-slate-600 hover:bg-slate-100 transition-colors"
                  >
                    Batal
                  </button>
                  <button
                    type="submit"
                    disabled={savingRepo}
                    className="px-4 py-2 rounded-xl bg-primary text-white text-xs font-bold hover:bg-primary/90 transition-colors shadow-sm disabled:opacity-50"
                  >
                    {savingRepo ? "Menyimpan..." : "Simpan Perubahan"}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* Human Confirmation Modal for Status Suggestion */}
        {confirmApply && (
          <div className="fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-sm flex items-center justify-center p-4">
            <div className="bg-white rounded-2xl max-w-sm w-full p-6 shadow-2xl space-y-4 animate-in fade-in zoom-in-95 text-center">
              <div className="w-12 h-12 rounded-full bg-blue-100 text-blue-600 flex items-center justify-center mx-auto">
                <CheckCircle2 size={24} />
              </div>
              <div>
                <h3 className="text-base font-black text-foreground mb-1">
                  Terapkan Saran Status?
                </h3>
                <p className="text-xs text-muted-foreground">
                  GitHub menyarankan status{" "}
                  <strong className="text-foreground">{confirmApply.targetStatus}</strong>{" "}
                  berdasarkan bukti aktivitas pull request / commit.
                </p>
                <p className="text-[11px] text-amber-600 font-medium mt-2 bg-amber-50 p-2 rounded-lg">
                  Perubahan status ini dilakukan atas konfirmasi manual Anda dan menggunakan API update Task standar.
                </p>
              </div>

              <div className="flex items-center gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setConfirmApply(null)}
                  disabled={applyingStatus}
                  className="flex-1 py-2 rounded-xl text-xs font-bold text-slate-700 bg-slate-100 hover:bg-slate-200 transition-colors"
                >
                  Batal
                </button>
                <button
                  type="button"
                  onClick={handleApplySuggestedStatus}
                  disabled={applyingStatus}
                  className="flex-1 py-2 rounded-xl text-xs font-bold text-white bg-primary hover:bg-primary/90 transition-colors shadow-sm"
                >
                  {applyingStatus ? "Menerapkan..." : `Terapkan ${confirmApply.targetStatus}`}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </LayoutComponent>
  );
}
