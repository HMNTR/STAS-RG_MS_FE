import React from "react";
import { Link, useNavigate } from "react-router";
import { Layout } from "../../templates/Layout";
import {
  UserCheck, BookOpen, ClipboardCheck, CalendarOff, MapPin, Clock,
  ChevronRight, FileText, FileCheck, FlaskConical, ScrollText, Award, Kanban,
  ArrowRight, AlertTriangle, CheckCircle2, Hourglass, Check,
  Target, GitBranch, TrendingUp, MessageSquare, Calendar,
} from "lucide-react";
import { apiGet, apiPost } from "../../../lib/api";
import { useAuth } from "../../../context/AuthContext";
import { getWfhSourceMeta, getWfhSummary } from "../../../lib/wfh";
import { PicketAssignment, PicketHoliday, getPicketHolidayFromTodayResponse, hasPicketPhotoSubmission, isPicketHolidayResponse, mapPicketTodayAssignment } from "../../../lib/picket";

function getActiveMilestone(project: any) {
  const milestones = project?.milestones || [];
  return milestones.find((item: any) => !item.done)?.label || "Semua Selesai";
}

function normalizeBoardStatus(value?: string) {
  const normalized = String(value || "").trim().toUpperCase();
  if (normalized === "TODO") return "TO DO";
  if (normalized === "TO DO" || normalized === "DOING" || normalized === "REVIEW" || normalized === "DONE") {
    return normalized;
  }
  return "TO DO";
}

function getTaskAssigneeIds(task: any) {
  if (Array.isArray(task?.assignee_ids)) return task.assignee_ids.map((value: any) => String(value));
  if (Array.isArray(task?.assigneeIds)) return task.assigneeIds.map((value: any) => String(value));
  if (Array.isArray(task?.assignees)) {
    return task.assignees
      .map((assignee: any) => String(assignee?.user_id || assignee?.userId || ""))
      .filter(Boolean);
  }
  return [];
}

function getLeaveTypeLabel(item: any) {
  const type = String(item?.jenis_pengajuan || item?.jenis || item?.jenisPengajuan || "cuti").toLowerCase();
  if (type === "izin") return "Izin";
  if (type === "sakit") return "Sakit";
  if (type === "wfh") return "WFH";
  return "Cuti";
}

function getLeaveTypeStyle(item: any) {
  const label = getLeaveTypeLabel(item);
  if (label === "Izin") return "bg-amber-100 text-amber-700";
  if (label === "Sakit") return "bg-rose-100 text-rose-700";
  if (label === "WFH") return "bg-sky-100 text-sky-700";
  return "bg-indigo-100 text-indigo-700";
}

function isRisetStudentType(tipe?: string | null) {
  return String(tipe || "").trim().toLowerCase() === "riset";
}

function formatHourValue(value: unknown) {
  const number = Number(value || 0);
  if (!Number.isFinite(number)) return "0";
  const formatted = number.toFixed(1);
  return formatted.endsWith(".0") ? formatted.slice(0, -2) : formatted;
}

function getPositiveHourValue(value: unknown, fallback: number) {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? number : fallback;
}

// ─────────────────────────────────────────────────────────────────────────────
// HELPERS
// ─────────────────────────────────────────────────────────────────────────────

function StatCard({
  icon, label, value, sub, barPct, barColor, href,
}: {
  icon: React.ReactNode; label: string; value: React.ReactNode;
  sub?: string; barPct: number; barColor: string; href: string;
}) {
  return (
    <Link
      to={href}
      className="bg-white border border-border rounded-[14px] p-4 md:p-5 shadow-sm flex flex-col justify-between hover:shadow-md hover:border-primary/30 hover:-translate-y-0.5 transition-all group h-full"
    >
      <div className="flex items-start justify-between mb-3 md:mb-4 gap-3">
        <div className="w-10 h-10 md:w-11 md:h-11 rounded-[12px] bg-slate-100 flex items-center justify-center shrink-0">
          {icon}
        </div>
        <div className="text-right min-w-0">
          <p className="text-[10px] font-black text-muted-foreground uppercase tracking-widest mb-0.5">{label}</p>
          <div className="text-xl md:text-2xl font-black text-foreground leading-none">{value}</div>
          {sub && <p className="text-[11px] text-muted-foreground font-medium mt-0.5">{sub}</p>}
        </div>
      </div>
      <div className="w-full bg-muted rounded-full h-1.5">
        <div className={`${barColor} h-1.5 rounded-full transition-all`} style={{ width: `${barPct}%` }} />
      </div>
    </Link>
  );
}

function SectionHeader({
  icon, title, href, linkLabel = "Lihat Semua",
}: {
  icon: React.ReactNode; title: string; href: string; linkLabel?: string;
}) {
  return (
    <div className="px-4 md:px-5 py-3.5 md:py-4 border-b border-border flex items-center justify-between gap-3">
      <h2 className="text-sm font-black text-foreground flex items-center gap-2 min-w-0">
        {icon} <span className="truncate">{title}</span>
      </h2>
      <Link to={href} className="shrink-0 text-[11px] md:text-xs font-bold text-primary hover:gap-1.5 flex items-center gap-1 transition-all">
        {linkLabel} <ChevronRight size={13} strokeWidth={3} />
      </Link>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// MILESTONE MINI-STEPS
// ─────────────────────────────────────────────────────────────────────────────

function MiniMilestones({ milestones, color }: { milestones: { label: string; done: boolean }[]; color: string }) {
  return (
    <div className="flex items-center gap-0 mt-3 overflow-x-auto pb-1">
      {milestones.map((m, i, arr) => (
        <div key={i} className="contents">
          <div className="flex flex-col items-center gap-1 shrink-0">
            <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center transition-all ${m.done ? `${color} border-transparent text-white` : "bg-white border-slate-200"
              }`}>
              {m.done && (
                <svg viewBox="0 0 12 12" className="w-2.5 h-2.5">
                  <path d="M1 6l3.5 3.5L11 2" stroke="white" strokeWidth="2" fill="none" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              )}
            </div>
            <span className={`text-[8px] font-bold whitespace-nowrap ${m.done ? "text-slate-500" : "text-slate-300"}`}>
              {m.label.length > 8 ? m.label.slice(0, 7) + "…" : m.label}
            </span>
          </div>
          {i < arr.length - 1 && (
            <div className={`h-0.5 min-w-6 flex-1 mx-0.5 mb-3.5 ${m.done && arr[i + 1].done ? color : "bg-slate-100"}`} />
          )}
        </div>
      ))}
    </div>
  );
}

function AlumniReactivationCard() {
  const [isSubmitting, setIsSubmitting] = React.useState(false);

  const handleSubmit = async () => {
    if (!window.confirm("Ajukan permohonan untuk kembali menjadi mahasiswa aktif?")) return;
    setIsSubmitting(true);
    try {
      const res = await apiPost<any>("/reactivations/me/request", {});
      alert(res.message || "Pengajuan berhasil dikirim");
    } catch (err: any) {
      alert(err.message || "Gagal mengirim pengajuan");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="bg-gradient-to-r from-emerald-50 to-teal-50 border border-emerald-100 rounded-[14px] shadow-sm overflow-hidden p-4 md:p-5 flex flex-col sm:flex-row gap-4 items-start sm:items-center justify-between mb-4">
      <div>
        <h3 className="text-sm font-black text-emerald-800 flex items-center gap-2">
          <FlaskConical size={16} className="text-emerald-600" /> Reaktivasi Mahasiswa
        </h3>
        <p className="text-xs text-emerald-700 mt-1 font-medium">Anda saat ini adalah Alumni. Anda dapat mengajukan permohonan untuk kembali menjadi mahasiswa aktif riset.</p>
      </div>
      <div className="flex gap-2 w-full sm:w-auto">
        <button 
          onClick={handleSubmit}
          disabled={isSubmitting}
          className="bg-emerald-600 text-white px-4 py-2 rounded-[10px] text-xs font-bold hover:bg-emerald-700 transition-colors disabled:opacity-50 shrink-0"
        >
          {isSubmitting ? "Mengirim..." : "Ajukan Reaktivasi"}
        </button>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// DASHBOARD
// ─────────────────────────────────────────────────────────────────────────────

export default function Dashboard() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [dashboardData, setDashboardData] = React.useState<any>(null);
  const [boardProjectsData, setBoardProjectsData] = React.useState<any[]>([]);
  const [boardSprintTasks, setBoardSprintTasks] = React.useState<any[]>([]);
  const [todayPicket, setTodayPicket] = React.useState<PicketAssignment | null>(null);
  const [todayPicketHoliday, setTodayPicketHoliday] = React.useState<PicketHoliday | null>(null);

  React.useEffect(() => {
    const loadDashboard = async () => {
      if (!user?.id) return;
      try {
        const [data, picket] = await Promise.all([
          apiGet<any>(`/dashboard/student?userId=${encodeURIComponent(user.id)}`),
          apiGet<any>(`/picket/today?studentId=${encodeURIComponent(user.id)}&_=${Date.now()}`).catch(() => null),
        ]);
        setDashboardData(data);
        setTodayPicket(mapPicketTodayAssignment(picket));
        setTodayPicketHoliday(isPicketHolidayResponse(picket) ? getPicketHolidayFromTodayResponse(picket) : null);
      } catch {
      }
    };

    loadDashboard();
  }, [user?.id]);

  React.useEffect(() => {
    const loadBoardOverview = async () => {
      if (!user?.id || !Array.isArray(dashboardData?.projects) || dashboardData.projects.length === 0) {
        setBoardProjectsData(dashboardData?.projects || []);
        setBoardSprintTasks([]);
        return;
      }

      const settled = await Promise.allSettled(
        dashboardData.projects.map((project: any) => apiGet<any>(`/research/${project.id}/board`))
      );

      const nextProjects = dashboardData.projects.map((project: any, index: number) => {
        const boardResult = settled[index];
        if (boardResult.status !== "fulfilled") {
          return project;
        }

        const board = boardResult.value;
        const allTasks = [
          ...(board?.columns?.todo || []),
          ...(board?.columns?.doing || []),
          ...(board?.columns?.review || []),
          ...(board?.columns?.done || [])
        ];

        const personalTasks = allTasks.filter((task: any) => {
          const assigneeIds = getTaskAssigneeIds(task);
          return assigneeIds.length === 0 || assigneeIds.includes(String(user.id));
        });

        const todoCount = personalTasks.filter((task: any) => normalizeBoardStatus(task?.status) === "TO DO").length;
        const activeCount = personalTasks.filter((task: any) => normalizeBoardStatus(task?.status) !== "DONE").length;
        const totalCount = personalTasks.length;

        return {
          ...project,
          tugasTodo: todoCount,
          tugasAktif: activeCount,
          tugasTotalBoard: totalCount
        };
      });

      const nextSprintTasks = settled.flatMap((boardResult, index) => {
        if (boardResult.status !== "fulfilled") return [];
        const project = dashboardData.projects[index];
        const board = boardResult.value;
        const allTasks = [
          ...(board?.columns?.todo || []),
          ...(board?.columns?.doing || []),
          ...(board?.columns?.review || [])
        ];

        return allTasks
          .filter((task: any) => {
            const assigneeIds = getTaskAssigneeIds(task);
            return assigneeIds.length === 0 || assigneeIds.includes(String(user.id));
          })
          .map((task: any) => ({
            id: String(task?.id || `${project.id}-${task?.title || "task"}`),
            title: task?.title || "Task",
            status: normalizeBoardStatus(task?.status),
            progress: task?.progress !== undefined && task?.progress !== null ? Number(task.progress) : undefined,
            deadline: task?.deadline
              ? new Date(task.deadline).toLocaleDateString("id-ID", { day: "2-digit", month: "short" })
              : "-",
            overdue: Boolean(task?.deadline && !Number.isNaN(new Date(task.deadline).getTime()) && new Date(task.deadline).getTime() < Date.now()),
            tag: task?.tag || project.shortTitle || "Riset",
            projectId: project.id
          }));
      });

      setBoardProjectsData(nextProjects);
      setBoardSprintTasks(nextSprintTasks);
    };

    void loadBoardOverview();
  }, [dashboardData?.projects, user?.id]);

  const researchProjectsData = boardProjectsData.length ? boardProjectsData : dashboardData?.projects?.length ? dashboardData.projects : [];

  // ── Data dari halaman lain (sumber kebenaran tunggal) ──────────────────────

  // Attendance (dari Attendance.tsx)
  const attendanceHadir = dashboardData?.stats?.attendanceHadir ?? 0;
  const attendanceTotal = dashboardData?.stats?.attendanceTotal ?? 0;
  const attendancePct = attendanceTotal > 0 ? Math.round((attendanceHadir / attendanceTotal) * 100) : 0;

  // Logbook (dari Logbook.tsx — 3 riset: 9+5+12)
  const logbookEntries = dashboardData?.stats?.logbookEntries ?? 0;
  const logbookTarget = dashboardData?.stats?.logbookTarget ?? 0;
  const logbookPct = logbookTarget > 0 ? Math.round((logbookEntries / logbookTarget) * 100) : 0;

  // Tasks dari progress board mahasiswa (khusus TO DO)
  const tasksTodo = researchProjectsData.reduce((s: number, r: any) => s + (r.tugasTodo || 0), 0);
  const tasksActive = researchProjectsData.reduce((s: number, r: any) => s + (r.tugasAktif || 0), 0);
  const tasksPct = tasksActive > 0 ? Math.round((tasksTodo / tasksActive) * 100) : 0;

  // Leave (dari LeaveRequest.tsx — sisa 1/3)
  const sisaCuti = dashboardData?.stats?.sisaCuti ?? 0;
  const totalCuti = dashboardData?.stats?.totalCuti ?? 0;
  const cutiPct = totalCuti > 0 ? Math.round((sisaCuti / totalCuti) * 100) : 0;
  const wfhSummary = getWfhSummary(dashboardData?.stats, dashboardData?.student, dashboardData?.profile);
  const totalWfh = wfhSummary.wfhQuota;
  const usedWfh = wfhSummary.wfhUsed;
  const remainingWfh = wfhSummary.wfhRemaining;
  const wfhSourceMeta = getWfhSourceMeta(wfhSummary.wfhQuotaSource);
  const wfhPct = totalWfh > 0 ? Math.round((remainingWfh / totalWfh) * 100) : 0;

  const draftRecent = dashboardData?.draftRecent || [];
  const draftDiReview = draftRecent.filter((item: any) => item.status === "Dalam Review").length;
  const draftDisetujui = draftRecent.filter((item: any) => item.status === "Disetujui").length;
  const draftTotal = draftRecent.length;

  // Dokumen (dari Documents.tsx)
  const dokSiapUnduh = dashboardData?.stats?.dokSiapUnduh ?? 0;

  const logbookRecent = (dashboardData?.logbookRecent || []).map((item: any) => ({
    ...item,
    tag: item?.riset?.toLowerCase?.().includes("b") ? "bg-emerald-50 text-emerald-700" : "bg-[#F8F5FF] text-[#6C47FF]"
  }));

  // Active sprint tasks (dari ScrumBoard — todo & doing)
  const sprintTasks = boardSprintTasks;

  const rawLeaveRecent = dashboardData?.leaveRecent || [];
  const letterRecent = dashboardData?.letterRecent || [];
  const attendanceToday = dashboardData?.attendanceToday || {};
  const studentStatus = String(dashboardData?.student?.status || dashboardData?.header?.studentStatus || user?.studentStatus || user?.status || "");
  const isAlumni = studentStatus.toLowerCase() === "alumni";
  const isRisetStudent = isRisetStudentType(user?.tipe || dashboardData?.header?.tipe || dashboardData?.student?.tipe);
  const risetWeeklyHours = Number(dashboardData?.stats?.risetWeeklyHours ?? dashboardData?.student?.jamMingguIni ?? dashboardData?.student?.jam_minggu_ini ?? 0);
  const risetWeeklyTargetHours = getPositiveHourValue(dashboardData?.stats?.risetWeeklyTargetHours ?? dashboardData?.student?.jamMingguTarget ?? dashboardData?.student?.jam_minggu_target, 6);
  const risetWeeklyMinHours = getPositiveHourValue(dashboardData?.stats?.risetWeeklyMinHours, 4);
  const risetWeeklyRemainingTarget = Math.max(0, risetWeeklyTargetHours - risetWeeklyHours);
  const risetWeeklyRemainingMin = Math.max(0, risetWeeklyMinHours - risetWeeklyHours);
  const risetWeeklyPct = risetWeeklyTargetHours > 0 ? Math.min(100, Math.round((risetWeeklyHours / risetWeeklyTargetHours) * 100)) : 0;
  const risetWeeklySub = risetWeeklyTargetHours <= 0
    ? "Target mingguan belum diatur"
    : risetWeeklyRemainingTarget <= 0
      ? `Target ${formatHourValue(risetWeeklyTargetHours)} jam terpenuhi`
      : risetWeeklyMinHours > 0 && risetWeeklyRemainingMin <= 0
        ? `Aman minimal, kurang ${formatHourValue(risetWeeklyRemainingTarget)} jam ke target`
        : risetWeeklyMinHours > 0
          ? `Kurang ${formatHourValue(risetWeeklyRemainingMin)} jam dari minimal`
          : `Kurang ${formatHourValue(risetWeeklyRemainingTarget)} jam ke target`;
  const cutiRecent = isRisetStudent
    ? rawLeaveRecent.filter((item: any) => !["Cuti", "WFH"].includes(getLeaveTypeLabel(item)))
    : rawLeaveRecent;

  // Quick links
  const quickLinks = [
    { label: "Logbook", icon: <BookOpen size={18} />, href: "/logbook", color: "bg-indigo-50 text-indigo-600 border-indigo-100" },
    { label: "Piket", icon: <ClipboardCheck size={18} />, href: "/picket", color: "bg-emerald-50 text-emerald-600 border-emerald-100" },
    { label: "Riset & Board", icon: <FlaskConical size={18} />, href: "/research", color: "bg-[#F0FFF0] text-[#0AB600] border-green-200" },
    { label: isRisetStudent ? "Izin / Sakit" : "Cuti / Izin / WFH", icon: <CalendarOff size={18} />, href: "/leave", color: "bg-amber-50 text-amber-600 border-amber-100" },
    { label: "Dokumen & Sertifikat", icon: <Award size={18} />, href: "/documents", color: "bg-emerald-50 text-emerald-600 border-emerald-100" },
    { label: "Berkas Kelulusan", icon: <FileCheck size={18} />, href: "/graduation", color: "bg-teal-50 text-teal-600 border-teal-100" },
    { label: "Draft TA / Jurnal", icon: <ScrollText size={18} />, href: "/draft", color: "bg-blue-50 text-blue-600 border-blue-100" },
    { label: "Kehadiran GPS", icon: <MapPin size={18} />, href: "/attendance", color: "bg-rose-50 text-rose-600 border-rose-100" },
  ];

  const statusStyles = {
    "Disetujui": "bg-emerald-50 text-emerald-700 border border-emerald-200",
    "Ditolak": "bg-red-50 text-red-600 border border-red-200",
    "Menunggu": "bg-amber-50 text-amber-700 border border-amber-200",
    "Dalam Review": "bg-blue-50 text-blue-700 border border-blue-200",
    "Diproses": "bg-blue-50 text-blue-700 border border-blue-200",
    "Siap Unduh": "bg-emerald-50 text-emerald-700 border border-emerald-200",
  };

  return (
    <Layout title="Dashboard">
      <div className="flex flex-col gap-4 md:gap-6 pb-4">

        {/* ── Header ── */}
        <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
          <div className="min-w-0">
            <h1 className="text-xl md:text-2xl font-black text-foreground break-words">
              Selamat datang, {user?.name || "Mahasiswa"}!
            </h1>
            <p className="text-xs md:text-sm font-medium text-muted-foreground mt-1 flex flex-wrap items-center gap-x-2 gap-y-1">
              <span>
                {new Date().toLocaleDateString("id-ID", { weekday: "long", day: "2-digit", month: "long", year: "numeric" })}
              </span>
              <span className="hidden sm:inline">·</span>
              <span className="text-[#6C47FF] font-black">
                {researchProjectsData.filter((r: any) => r.status === "Aktif").length} Riset Aktif
              </span>
              {!!dashboardData?.header?.nim && (
                <>
                  <span className="hidden sm:inline">·</span>
                  <span>NIM {dashboardData.header.nim}</span>
                </>
              )}
              {studentStatus && (
                <>
                  <span className="hidden sm:inline">·</span>
                  <span>Status {studentStatus}</span>
                </>
              )}
            </p>
          </div>
          <div className="shrink-0">
            {isAlumni ? (
              <span className="inline-flex items-center gap-2 rounded-[12px] border border-emerald-200 bg-emerald-50 px-4 py-2 text-xs font-black text-emerald-700">
                <CheckCircle2 size={15} /> Alumni STAS-RG
              </span>
            ) : (
              <button
                onClick={() => navigate("/graduation")}
                className="inline-flex items-center justify-center gap-2 rounded-[12px] bg-amber-500 px-4 py-2 text-xs font-black text-white shadow-sm shadow-amber-200 transition-colors hover:bg-amber-600 disabled:opacity-60"
              >
                <CheckCircle2 size={15} /> Isi Berkas Kelulusan
              </button>
            )}
          </div>
        </div>

        {isAlumni && <AlumniReactivationCard />}

        {/* ── Stat Cards ── */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 md:gap-4 xl:grid-cols-4 2xl:grid-cols-5">
          <StatCard
            icon={<UserCheck size={20} className="md:w-[22px] md:h-[22px] text-[#6C47FF]" />}
            label="Kehadiran"
            value={<><span>{attendanceHadir}</span><span className="text-sm md:text-base text-muted-foreground font-bold">/{attendanceTotal}</span></>}
            sub={`${attendancePct}% bulan ini`}
            barPct={attendancePct}
            barColor="bg-[#6C47FF]"
            href="/attendance"
          />
          {isRisetStudent && (
            <StatCard
              icon={<Hourglass size={20} className="md:w-[22px] md:h-[22px] text-emerald-500" />}
              label="Jam Riset Minggu Ini"
              value={<><span>{formatHourValue(risetWeeklyHours)}</span><span className="text-sm md:text-base text-muted-foreground font-bold">/{formatHourValue(risetWeeklyTargetHours)} jam</span></>}
              sub={risetWeeklySub}
              barPct={risetWeeklyPct}
              barColor={risetWeeklyRemainingTarget <= 0 ? "bg-emerald-500" : risetWeeklyRemainingMin <= 0 ? "bg-sky-500" : "bg-amber-500"}
              href="/attendance"
            />
          )}
          <StatCard
            icon={<BookOpen size={20} className="md:w-[22px] md:h-[22px] text-indigo-500" />}
            label="Entri Logbook"
            value={logbookEntries}
            sub={`Target ${logbookTarget} entri`}
            barPct={logbookPct}
            barColor="bg-indigo-500"
            href="/logbook"
          />
          <StatCard
            icon={<ClipboardCheck size={20} className="md:w-[22px] md:h-[22px] text-emerald-500" />}
            label="Tugas TO DO"
            value={<><span>{tasksTodo}</span><span className="text-sm md:text-base text-muted-foreground font-bold">/{tasksActive}</span></>}
            sub="Dari progress board aktif"
            barPct={tasksPct}
            barColor="bg-emerald-500"
            href="/research"
          />
          {!isRisetStudent && (
            <StatCard
              icon={<CalendarOff size={20} className="md:w-[22px] md:h-[22px] text-amber-500" />}
              label="Sisa Cuti"
              value={<><span>{sisaCuti}</span><span className="text-sm md:text-base text-muted-foreground font-bold">/{totalCuti}</span></>}
              sub="Hanya terpakai oleh cuti"
              barPct={cutiPct}
              barColor="bg-amber-500"
              href="/leave"
            />
          )}
          <StatCard
            icon={<Calendar size={20} className="md:w-[22px] md:h-[22px] text-sky-500" />}
            label="Jatah WFH"
            value={totalWfh > 0
              ? <><span>{remainingWfh}</span><span className="text-sm md:text-base text-muted-foreground font-bold">/{totalWfh}</span></>
              : <span className="text-base md:text-lg">Tidak ada</span>}
            sub={wfhSourceMeta.helperText || (totalWfh > 0 ? "Hari WFH tersisa" : "Anda tidak punya jatah WFH")}
            barPct={wfhPct}
            barColor="bg-sky-500"
            href="/leave"
          />
        </div>

        {/* ── Attendance Banner ── */}
        <Link
          to="/attendance"
          className="bg-gradient-to-r from-[#0AB600] to-[#065e00] rounded-[14px] p-4 md:p-5 text-white shadow-md relative overflow-hidden flex flex-col sm:flex-row sm:items-center justify-between gap-3 md:gap-4 hover:shadow-lg transition-all group"
        >
          <div className="absolute inset-0 opacity-[0.08]" style={{ backgroundImage: "radial-gradient(circle at 10% 50%, white 1px, transparent 1px)", backgroundSize: "18px 18px" }} />
          <div className="relative z-10 flex items-center gap-3 md:gap-5 min-w-0">
            <div className="w-10 h-10 md:w-12 md:h-12 rounded-full bg-white/15 border border-white/20 flex items-center justify-center shrink-0">
              <MapPin size={20} className="md:w-[22px] md:h-[22px] text-white" />
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2 mb-1">
                <div className="w-2 h-2 rounded-full bg-white animate-pulse" />
                <span className="text-[9px] md:text-[10px] font-black text-white/90 uppercase tracking-wider">Status Kehadiran Hari Ini</span>
              </div>
              <p className="font-black text-sm md:text-base break-words">
                {attendanceToday?.checkInAt
                  ? `Check-in ${new Date(attendanceToday.checkInAt).toLocaleTimeString("id-ID", { hour: "2-digit", minute: "2-digit" })}`
                  : "Belum Check-in"}
              </p>
              <p className="text-xs text-white/60 mt-0.5 flex items-center gap-1.5 flex-wrap">
                <Clock size={11} /> Status: {attendanceToday?.status || "Belum Check-in"}
              </p>
            </div>
          </div>
          <div className="relative z-10 flex items-center gap-3 shrink-0 w-full sm:w-auto">
            <div className="bg-white/15 hover:bg-white/25 text-white px-4 md:px-5 py-2 md:py-2.5 rounded-[12px] font-bold text-xs md:text-sm flex items-center gap-2 group-hover:gap-3 transition-all w-full sm:w-auto justify-center">
              Lihat Riwayat <ArrowRight size={14} strokeWidth={3} />
            </div>
          </div>
        </Link>

        {/* ── Main Grid 8-4 ── */}
        {(todayPicket || todayPicketHoliday) && (
          <Link
            to="/picket"
            className={`rounded-[14px] border p-4 shadow-sm transition-colors ${todayPicketHoliday || todayPicket?.isHoliday || todayPicket?.isExempt ? "border-violet-200 bg-violet-50 hover:bg-violet-100" : "border-emerald-200 bg-emerald-50 hover:bg-emerald-100"}`}
          >
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex items-start gap-3">
                <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-[12px] bg-emerald-500 text-white">
                  <ClipboardCheck size={22} />
                </div>
                <div>
                  <p className="text-xs font-black uppercase tracking-wide text-emerald-700">{todayPicketHoliday || todayPicket?.isHoliday || todayPicket?.isExempt ? "Hari Libur Piket" : "Jadwal Piket Hari Ini"}</p>
                  <h2 className="mt-1 text-base font-black text-foreground">{todayPicketHoliday?.name || todayPicket?.holiday?.name || todayPicket?.taskName}</h2>
                  <p className="mt-1 text-xs font-semibold text-emerald-700">
                    {todayPicketHoliday || todayPicket?.isHoliday || todayPicket?.isExempt
                      ? "Piket diliburkan dan tidak menjadi kewajiban aktif."
                      : todayPicket?.autoCompletedByWfh
                        ? "Piket otomatis selesai karena WFH yang disetujui."
                        : hasPicketPhotoSubmission(todayPicket)
                          ? "Foto piket sudah dikirim."
                          : String(todayPicket?.leaveStatus || "").toLowerCase() === "disetujui"
                            ? "Izin piket disetujui; foto tidak diperlukan."
                            : "Foto piket akan diminta sebelum checkout."}
                  </p>
                </div>
              </div>
              <span className="text-xs font-black text-emerald-700">Lihat detail</span>
            </div>
          </Link>
        )}

        <div className="grid grid-cols-1 xl:grid-cols-12 gap-4 md:gap-6 items-start">

          {/* ─── LEFT (8 cols) ─── */}
          <div className="xl:col-span-8 flex flex-col gap-4 md:gap-6">

            {/* Riset Progress — both projects */}
            <div className="bg-white border border-border rounded-[14px] shadow-sm overflow-hidden">
              <SectionHeader icon={<FlaskConical size={16} className="text-[#6C47FF]" />} title="Progres Riset Aktif" href="/research" />
              <div className="p-4 md:p-5 grid grid-cols-1 md:grid-cols-2 gap-3 md:gap-4">
                {researchProjectsData.map((r: any) => {
                  const milestones = r.milestones || [];
                  const activeMilestone = getActiveMilestone(r);
                  const doneCount = milestones.filter((m: any) => m.done).length;
                  const milestonePct = milestones.length > 0 ? Math.round((doneCount / milestones.length) * 100) : 0;
                  return (
                    <Link
                      key={r.id}
                      to="/research"
                      className="flex flex-col p-3 md:p-4 bg-slate-50/60 border border-border rounded-[12px] hover:border-[#6C47FF]/30 hover:bg-[#FDFCFF] hover:shadow-sm transition-all group"
                    >
                      <div className="flex items-start justify-between mb-2 gap-2">
                        <h3 className="text-xs md:text-sm font-black text-foreground leading-snug group-hover:text-[#6C47FF] transition-colors line-clamp-2 min-w-0">
                          {r.shortTitle}
                        </h3>
                        <span className={`shrink-0 text-[10px] md:text-xs font-black px-1.5 md:px-2 py-0.5 rounded-lg ${r.peranColor}`}>{r.peranSaya}</span>
                      </div>
                      <div className="flex items-center gap-2 md:gap-3 mb-2 md:mb-3 flex-wrap">
                        <span className="inline-flex items-center gap-1 text-[9px] md:text-[10px] font-bold text-emerald-600 bg-emerald-50 border border-emerald-200 px-1.5 md:px-2 py-0.5 rounded-md">
                          <div className="w-1.5 h-1.5 rounded-full bg-emerald-500" /> {r.status}
                        </span>
                        <span className="text-[9px] md:text-[10px] font-medium text-muted-foreground">{r.period}</span>
                      </div>
                      {/* Progress bar */}
                      <div className="mb-1 flex items-center justify-between gap-2">
                        <span className="text-[9px] md:text-[10px] font-black text-muted-foreground uppercase tracking-wide">TO DO</span>
                        <span className="text-[10px] md:text-xs font-black text-foreground">{r.tugasTodo || 0}/{r.tugasAktif || 0}</span>
                      </div>
                      <div className="w-full bg-slate-200 rounded-full h-1.5 mb-2 md:mb-3">
                        <div className={`${r.progressColor} h-1.5 rounded-full`} style={{ width: `${r.progress}%` }} />
                      </div>
                      {/* Active milestone */}
                      <div className="flex items-center gap-1.5 mb-2 min-w-0">
                        <Target size={10} className="md:w-[11px] md:h-[11px] text-muted-foreground shrink-0" />
                        <span className="text-[10px] md:text-[11px] font-bold text-foreground line-clamp-1">{activeMilestone}</span>
                      </div>
                      {/* Mini milestone steps */}
                      <MiniMilestones milestones={milestones} color={r.progressColor} />
                      <div className="mt-2 md:mt-3 flex items-center justify-between gap-2">
                        <span className="text-[9px] md:text-[10px] font-medium text-muted-foreground">{doneCount}/{milestones.length} milestone</span>
                        <span className="text-[9px] md:text-[10px] font-black text-[#6C47FF] flex items-center gap-0.5 shrink-0">
                          {milestonePct}% <ChevronRight size={11} strokeWidth={3} />
                        </span>
                      </div>
                    </Link>
                  );
                })}
              </div>
            </div>

            {/* Sprint Tasks — aktif dari board */}
            <div className="bg-white border border-border rounded-[14px] shadow-sm overflow-hidden">
              <SectionHeader icon={<Kanban size={16} className="text-[#6C47FF]" />} title="Tugas Sprint Aktif" href="/research" linkLabel="Buka Board" />
              <div className="divide-y divide-border">
                {sprintTasks.map((task: any, i: number) => (
                  <Link
                    key={i}
                    to="/research"
                    className="flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-4 px-4 md:px-5 py-3 md:py-3.5 hover:bg-slate-50/60 transition-colors group"
                  >
                    <div className="flex items-center gap-2 sm:gap-3 flex-1 min-w-0">
                      <span className={`shrink-0 text-[9px] md:text-[10px] font-black px-1.5 md:px-2 py-0.5 md:py-1 rounded-md uppercase tracking-wide ${task.status === "DOING" ? "bg-blue-100 text-blue-700" : "bg-slate-100 text-slate-600"
                        }`}>
                        {task.status}
                      </span>
                      <p className="flex-1 text-xs md:text-sm font-bold text-foreground group-hover:text-[#6C47FF] transition-colors line-clamp-2 sm:line-clamp-1">
                        {task.title}
                      </p>
                    </div>

                    <div className="flex flex-wrap items-center gap-2 sm:gap-3 sm:ml-auto">
                      {task.progress !== undefined && (
                        <div className="flex items-center gap-1.5 md:gap-2 shrink-0">
                          <div className="w-16 md:w-20 h-1.5 bg-slate-100 rounded-full">
                            <div className="bg-[#6C47FF] h-1.5 rounded-full" style={{ width: `${task.progress}%` }} />
                          </div>
                          <span className="text-[9px] md:text-[10px] font-black text-[#6C47FF]">{task.progress}%</span>
                        </div>
                      )}
                      <div className={`flex items-center gap-1 text-[10px] md:text-[11px] font-bold shrink-0 ${task.overdue ? "text-red-500" : "text-muted-foreground"}`}>
                        {task.overdue && <AlertTriangle size={11} strokeWidth={3} />}
                        {task.deadline}
                      </div>
                      <span className="shrink-0 text-[9px] md:text-[10px] font-black px-1.5 md:px-2 py-0.5 rounded bg-[#F8F5FF] text-[#6C47FF]">
                        {task.tag}
                      </span>
                    </div>
                  </Link>
                ))}
              </div>
              <div className="px-4 md:px-5 py-2.5 md:py-3 border-t border-border bg-slate-50/50">
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
                  <p className="text-xs font-medium text-muted-foreground">
                    <span className="font-black text-foreground">{tasksTodo}</span> dari <span className="font-black text-foreground">{tasksActive}</span> tugas aktif masih berada di kolom TO DO
                  </p>
                  <Link to="/research" className="text-xs font-black text-[#6C47FF] flex items-center gap-1 hover:gap-1.5 transition-all">
                    Kelola Board <ArrowRight size={12} strokeWidth={3} />
                  </Link>
                </div>
              </div>
            </div>

            {/* Draft & Dokumen row */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-3 md:gap-4">

              {/* Draft TA / Jurnal */}
              <div className="bg-white border border-border rounded-[14px] shadow-sm overflow-hidden">
                <SectionHeader icon={<ScrollText size={16} className="text-blue-600" />} title="Draft TA & Jurnal" href="/draft" />
                <div className="divide-y divide-border">
                  {draftRecent.map((d: any, i: number) => (
                    <div key={i} className="px-4 md:px-5 py-2.5 md:py-3 flex items-start gap-2 md:gap-3 hover:bg-slate-50/60 transition-colors">
                      <div className="flex flex-col flex-1 min-w-0">
                        <p className="text-xs font-bold text-foreground line-clamp-2 sm:line-clamp-1">{d.title}</p>
                        <p className="text-[10px] font-medium text-muted-foreground mt-0.5">{d.riset} · {d.version}</p>
                      </div>
                      <span className={`shrink-0 text-[9px] md:text-[10px] font-black px-1.5 md:px-2 py-0.5 rounded-md ${statusStyles[d.status as keyof typeof statusStyles] || "bg-slate-100 text-slate-600 border border-slate-200"}`}>
                        {d.status}
                      </span>
                    </div>
                  ))}
                  {draftRecent.length === 0 && (
                    <div className="px-4 md:px-5 py-4 text-xs text-muted-foreground">Belum ada draft terbaru.</div>
                  )}
                </div>
                <div className="px-4 md:px-5 py-2 md:py-2.5 border-t border-border bg-slate-50/50 flex items-center justify-between gap-2">
                  <span className="text-[9px] md:text-[10px] font-medium text-muted-foreground">{draftDisetujui} disetujui · {draftDiReview} dalam review</span>
                  <Link to="/draft" className="shrink-0 text-[9px] md:text-[10px] font-black text-[#6C47FF] flex items-center gap-0.5">Upload <ChevronRight size={11} strokeWidth={3} /></Link>
                </div>
              </div>

              {/* Dokumen & Sertifikat */}
              <div className="bg-white border border-border rounded-[14px] shadow-sm overflow-hidden">
                <SectionHeader icon={<Award size={16} className="text-amber-600" />} title="Dokumen & Sertifikat" href="/documents" />
                <div className="p-4 md:p-5 flex flex-col gap-2 md:gap-3">
                  {letterRecent.slice(0, 3).map((doc: any, i: number) => (
                    <div key={i} className="flex items-center justify-between gap-2">
                      <div className="flex flex-col min-w-0">
                        <p className="text-xs font-bold text-foreground truncate">{doc.jenis}</p>
                        <p className="text-[10px] font-medium text-muted-foreground">{doc.tanggal ? new Date(doc.tanggal).toLocaleDateString("id-ID") : "-"}</p>
                      </div>
                      <span className={`shrink-0 text-[9px] md:text-[10px] font-black px-1.5 md:px-2 py-0.5 rounded-md ${statusStyles[doc.status as keyof typeof statusStyles] || "bg-slate-100 text-slate-600 border border-slate-200"}`}>
                        {doc.status}
                      </span>
                    </div>
                  ))}
                  {letterRecent.length === 0 && (
                    <p className="text-xs text-muted-foreground">Belum ada pengajuan dokumen terbaru.</p>
                  )}
                </div>
                <div className="px-4 md:px-5 py-2 md:py-2.5 border-t border-border bg-slate-50/50 flex items-center justify-between gap-2">
                  <span className="text-[9px] md:text-[10px] font-medium text-muted-foreground">{dokSiapUnduh} siap diunduh</span>
                  <Link to="/documents" className="shrink-0 text-[9px] md:text-[10px] font-black text-[#6C47FF] flex items-center gap-0.5">Kelola <ChevronRight size={11} strokeWidth={3} /></Link>
                </div>
              </div>
            </div>
          </div>

          {/* ─── RIGHT (4 cols) ─── */}
          <div className="xl:col-span-4 flex flex-col gap-4 md:gap-6">

            {/* Logbook Terbaru */}
            <div className="bg-white border border-border rounded-[14px] shadow-sm overflow-hidden">
              <SectionHeader icon={<BookOpen size={16} className="text-indigo-600" />} title="Logbook Terbaru" href="/logbook" />
              <div className="p-4 md:p-5">
                <div className="relative border-l-2 border-slate-100 ml-2 flex flex-col gap-4 md:gap-5">
                  {logbookRecent.map((log: any, i: number) => (
                    <div key={i} className="relative pl-4 md:pl-5 group">
                      <div className="absolute -left-[9px] top-1 w-4 h-4 rounded-full border-2 border-white bg-primary shadow-sm" />
                      <div className="flex flex-col gap-1">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="text-[9px] font-black text-muted-foreground uppercase tracking-wide">{log.date}</span>
                          <span className={`text-[9px] font-black px-1.5 py-0.5 rounded ${log.tag}`}>{log.riset}</span>
                        </div>
                        <p className="text-xs font-medium text-foreground leading-relaxed line-clamp-2">{log.desc}</p>
                      </div>
                    </div>
                  ))}
                  {logbookRecent.length === 0 && (
                    <p className="pl-4 text-xs text-muted-foreground">Belum ada logbook terbaru.</p>
                  )}
                </div>
                <Link
                  to="/logbook/new"
                  className="mt-4 md:mt-5 w-full flex items-center justify-center gap-2 py-2.5 rounded-[10px] border-2 border-dashed border-slate-200 text-xs font-bold text-muted-foreground hover:border-primary/40 hover:text-primary hover:bg-primary/5 transition-all"
                >
                  + Tambah Entri Logbook
                </Link>
              </div>
            </div>

            <div className="bg-white border border-border rounded-[14px] shadow-sm overflow-hidden">
              <SectionHeader icon={<Calendar size={16} className="text-amber-600" />} title={isRisetStudent ? "Pengajuan Izin / Sakit" : "Pengajuan Cuti / Izin / WFH"} href="/leave" linkLabel="Ajukan" />
              <div className="p-4 md:p-5 flex flex-col gap-2 md:gap-3">
                {/* Sisa cuti visual */}
                {!isRisetStudent && <div className="flex items-center gap-3 p-3 bg-amber-50 border border-amber-100 rounded-[10px]">
                  <div className="flex gap-1 flex-wrap">
                    {Array.from({ length: totalCuti }).map((_, i) => (
                      <div key={i} className={`w-7 h-7 md:w-8 md:h-8 rounded-lg flex items-center justify-center text-xs font-black ${i < sisaCuti ? "bg-amber-400 text-white" : "bg-amber-100 text-amber-300"
                        }`}>
                        {i < sisaCuti ? "✓" : "–"}
                      </div>
                    ))}
                  </div>
                  <div>
                    <p className="text-xs font-black text-amber-800">{sisaCuti} hari tersisa</p>
                    <p className="text-[10px] font-medium text-amber-600">dari {totalCuti} jatah cuti</p>
                  </div>
                </div>}
                <div className="flex items-center gap-3 p-3 bg-sky-50 border border-sky-100 rounded-[10px]">
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-black text-sky-800">
                      {totalWfh > 0 ? `${remainingWfh} hari WFH tersisa` : "Anda tidak punya jatah WFH"}
                    </p>
                    <p className="text-[10px] font-medium text-sky-600">
                      {totalWfh > 0 ? `dari ${totalWfh} jatah WFH • terpakai ${usedWfh} hari` : "Hubungi admin jika membutuhkan akses WFH"}
                    </p>
                    {wfhSourceMeta.helperText && (
                      <p className="mt-1 text-[10px] font-semibold text-sky-700">
                        {wfhSourceMeta.helperText}
                      </p>
                    )}
                  </div>
                  {wfhSummary.wfhQuotaSource !== "unknown" && (
                    <span className={`shrink-0 rounded-full px-2 py-1 text-[10px] font-black ${wfhSummary.wfhQuotaSource === "mentor"
                        ? "bg-sky-100 text-sky-700 border border-sky-200"
                        : "bg-amber-100 text-amber-700 border border-amber-200"
                      }`}>
                      {wfhSourceMeta.label}
                    </span>
                  )}
                </div>
                {/* Recent list */}
                {cutiRecent.map((c: any) => (
                  <div key={c.id} className="flex items-center justify-between gap-2">
                    <div className="flex flex-col min-w-0">
                      <div className="flex items-center gap-1.5 min-w-0">
                        <p className="text-[10px] font-black text-muted-foreground truncate">{c.id}</p>
                        <span className={`shrink-0 text-[9px] font-black px-1.5 py-0.5 rounded ${getLeaveTypeStyle(c)}`}>
                          {getLeaveTypeLabel(c)}
                        </span>
                      </div>
                      <p className="text-xs font-bold text-foreground">{c.period}</p>
                      <p className="text-[10px] font-medium text-muted-foreground">{c.durasi}</p>
                    </div>
                    <span className={`shrink-0 text-[9px] md:text-[10px] font-black px-1.5 md:px-2 py-0.5 rounded-md ${statusStyles[c.status as keyof typeof statusStyles] || "bg-slate-100 text-slate-600 border border-slate-200"}`}>
                      {c.status}
                    </span>
                  </div>
                ))}
                {cutiRecent.length === 0 && (
                  <p className="text-xs text-muted-foreground">Belum ada riwayat pengajuan terbaru.</p>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
    </Layout>
  );
}
