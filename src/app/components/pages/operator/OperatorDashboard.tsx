import React, { useEffect, useMemo, useState } from "react";
import { Link } from "react-router";
import { OperatorLayout } from "../../templates/OperatorLayout";
import {
  Users, FlaskConical, CalendarCheck, FileText, BookOpen, Kanban,
  AlertTriangle, Check, X, ChevronRight, Clock,
  TrendingDown, UserX, UserCheck, AlertCircle, ArrowRight, Bell, Lock, Search, ClipboardList,
} from "lucide-react";
import { apiGet, apiPatch, apiPost, getStoredUser } from "../../../lib/api";
import { formatDateYmd } from "../../../lib/date";
import { mapPicketLeaveRequest, PicketLeaveRequest } from "../../../lib/picket";
import { shouldShowResearchHoursFulfilledStatus } from "../../../lib/researchAttendance";
import {
  getCachedUserUiState,
  getReadAttendanceWarningIdsForDate,
  getUserUiState,
  patchUserUiState,
  setReadAttendanceWarningIdsForDate,
} from "../../../lib/userUiState";

type MahasiswaRecord = any;
type LeaveRequestAll = any;
type LetterRequestAll = any;
type AuditLogEntry = any;
type ResearchFull = any;
type WarningItem = {
  id: string;
  type: "logbook_missing" | "attendance_absent" | "low_hours";
  studentId: string;
  recipientUserId: string;
  studentName: string;
  studentInitials: string;
  studentPhotoUrl?: string | null;
  studentColor: string;
  nim: string;
  referenceDate?: string | null;
  referencePeriod?: string | null;
  attendanceStatus?: string | null;
  currentHours?: number | null;
  targetHours?: number | null;
};

type AttendanceAbsentItem = WarningItem & {
  accessLock?: StudentAccessLock;
};

type WarningData = {
  logbookMissing: WarningItem[];
  attendanceAbsent: WarningItem[];
  lowHours: WarningItem[];
};

type AttendanceMonitorToday = {
  date?: string;
  timezone?: string;
  currentTime?: string;
  lockVisibleAfter?: string;
  lockWindowOpen?: boolean;
  risetWeeklyHoursLockAfter?: string;
  risetWeeklyHoursLockWindowOpen?: boolean;
  presentIds?: string[];
  attendanceStatusByStudentId?: Record<string, string>;
  attendanceModeByStudentId?: Record<string, string>;
  leaveIds?: string[];
  absentIds?: string[];
  reportedAbsentIds?: string[];
  noInformationIds?: string[];
  isHoliday?: boolean;
  holidayToday?: string | { name?: string; date?: string; active?: boolean } | null;
  holidays?: Array<any>;
  excludeHolidaysFromWorkdays?: boolean;
  magangUnderHoursIds?: string[];
  magangMissingCheckoutIds?: string[];
  magangLockedIds?: string[];
  risetWeeklyUnderHoursIds?: string[];
  risetWeeklyUnderHoursLockIds?: string[];
  risetWeeklyMeetsMinIds?: string[];
  riset_weekly_meets_min_ids?: string[];
  risetWeeklyHoursByStudentId?: Record<string, number>;
  riset_weekly_hours_by_student_id?: Record<string, number>;
  risetWeeklyMinHours?: number;
  riset_weekly_min_hours?: number;
};

type StudentAccessLock = {
  id: string;
  studentId: string;
  studentName: string;
  studentInitials?: string;
  studentPhotoUrl?: string | null;
  nim?: string;
  studentType?: string | null;
  date?: string;
  reason?: string;
  reasonLabel?: string;
  reasonDetail?: string;
  status?: string;
  locked?: boolean;
  active?: boolean;
  lockedAt?: string;
};

type EarlyCheckoutAlert = {
  id: string;
  title: string;
  body: string;
  studentName: string;
  studentInitials: string;
  studentPhotoUrl?: string | null;
  durationHours?: number | null;
  requiredHours?: number | null;
  read: boolean;
};

type DashboardSummary = {
  totalMahasiswa: number;
  totalAlumni?: number;
  totalRisetAktif: number;
  cutiMenunggu: number;
  suratMenunggu: number;
  kelulusanMenunggu?: number;
  totalDokumen?: number;
  logbookTerbaru: Array<any>;
};

type WeeklyPicketMiss = {
  id: string;
  studentId: string;
  studentName: string;
  studentInitials: string;
  studentPhotoUrl?: string | null;
  nim: string;
  missedCount: number;
  missedDates: string[];
  taskNames: string[];
  lastMissedDate?: string | null;
  status?: string | null;
};

type WeeklyPicketMissResponse = {
  weekStart?: string;
  weekEnd?: string;
  resetDay?: string;
  items?: Array<any>;
  students?: Array<any>;
  misses?: Array<any>;
};

type OperatorWarningsResponse = {
  referenceDate?: string;
  referencePeriod?: string;
  warnings?: {
    logbookMissing?: Array<any>;
    attendanceAbsent?: Array<any>;
    lowHours?: Array<any>;
  };
};

type WithdrawalRequestRecord = {
  id: string;
  studentId: string;
  studentName: string;
  studentNim: string;
  studentInitials: string;
  studentColor: string;
  advisorName: string;
  reason: string;
  submittedAt: string;
  statusOperator: "Menunggu" | "Diteruskan" | "Ditolak";
  statusDosen: "Menunggu" | "Disetujui" | "Ditolak" | null;
  finalStatus: "Menunggu" | "Ditolak Operator" | "Menunggu Dosen" | "Ditolak Dosen" | "Disetujui";
  operatorNote?: string | null;
  advisorNote?: string | null;
};

function MiniStatCard({ icon, label, value, color, href, urgent }: { icon: React.ReactNode; label: string; value: number | string; color: string; href: string; urgent?: boolean }) {
  return (
    <Link to={href} className="bg-white border border-border rounded-[14px] p-4 shadow-sm hover:shadow-md hover:-translate-y-0.5 transition-all group flex items-center gap-4">
      <div className={`w-11 h-11 rounded-[12px] flex items-center justify-center shrink-0 ${color}`}>{icon}</div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5">
          <p className="text-xl font-black text-foreground">{value}</p>
          {urgent && Number(value) > 0 && <AlertTriangle size={13} className="text-amber-500 shrink-0" />}
        </div>
        <p className="text-[10px] font-black text-muted-foreground uppercase tracking-wide">{label}</p>
      </div>
      <ChevronRight size={15} className="text-muted-foreground group-hover:text-[#0AB600] transition-colors" />
    </Link>
  );
}

function WarningSent({ visible }: { visible: boolean }) {
  if (!visible) return null;
  return (
    <div className="fixed top-6 right-6 z-[400] flex items-center gap-3 px-5 py-3.5 rounded-[14px] shadow-xl border bg-emerald-50 border-emerald-200 text-emerald-700 text-sm font-bold">
      <Check size={16} strokeWidth={3} /> Peringatan berhasil dikirim ke mahasiswa
    </div>
  );
}

function WarningInfo({ message, tone }: { message: string; tone: "success" | "warning" }) {
  return (
    <div className={`fixed top-6 right-6 z-[400] flex items-center gap-3 px-5 py-3.5 rounded-[14px] shadow-xl border text-sm font-bold ${tone === "success"
      ? "bg-emerald-50 border-emerald-200 text-emerald-700"
      : "bg-amber-50 border-amber-200 text-amber-700"
      }`}>
      {tone === "success" ? <Check size={16} strokeWidth={3} /> : <AlertTriangle size={16} strokeWidth={3} />}
      {message}
    </div>
  );
}

function getJakartaDateKey(date = new Date()) {
  return new Intl.DateTimeFormat("sv-SE", { timeZone: "Asia/Jakarta" }).format(date);
}

function getLeaveTypeLabel(jenis?: string) {
  const type = String(jenis || "").toLowerCase();
  if (type === "izin") return "Izin";
  if (type === "sakit") return "Sakit";
  if (type === "wfh") return "WFH";
  return "Cuti";
}

function displayStatus(status: string) {
  return status.replace("Operator", "Admin");
}

function matchesSearchQuery(values: Array<string | number | null | undefined>, query: string) {
  const normalizedQuery = query.trim().toLowerCase();
  if (!normalizedQuery) return true;

  return values.some((value) => String(value || "").toLowerCase().includes(normalizedQuery));
}

const ACCESS_LOCK_REASON_LABELS: Record<string, string> = {
  ATTENDANCE_ABSENT: "Belum Ada Informasi Absensi",
  WORK_HOURS_UNDER_8: "Jam Kerja Magang Kurang dari 8 Jam",
  CHECKOUT_MISSING_22: "Belum Checkout Sampai 22.00 WIB",
  RISET_WEEKLY_HOURS_UNDER_TARGET: "Jam Kerja Riset Mingguan Tidak Terpenuhi",
  PICKET_SUBMISSION_INVALID: "Piket Tidak Sesuai",
  PICKET_SUBMISSION_MISSING: "Belum Melakukan Piket",
};

const ACCESS_LOCK_REASON_MESSAGES: Record<string, string> = {
  ATTENDANCE_ABSENT: "Belum ada informasi absensi setelah pukul 10.00 WIB.",
  WORK_HOURS_UNDER_8: "Durasi kerja Magang hari ini kurang dari 8 jam.",
  CHECKOUT_MISSING_22: "Mahasiswa Magang belum checkout sampai pukul 22.00 WIB.",
  RISET_WEEKLY_HOURS_UNDER_TARGET: "Akses dikunci karena jam kerja Riset mingguan belum memenuhi target.",
  PICKET_SUBMISSION_INVALID: "Anda telah melakukan kegiatan piket yang tidak sesuai dengan tugas anda, mohon hubungi admin untuk melepas block.",
  PICKET_SUBMISSION_MISSING: "Belum melakukan piket atau belum mengirim bukti piket dari jadwal sebelumnya.",
};

function getLockReasonLabel(reason?: string | null, reasonLabel?: string | null) {
  if (reasonLabel) return reasonLabel;
  const key = String(reason || "");
  return ACCESS_LOCK_REASON_LABELS[key] || reason || "-";
}

function getLockReasonDetail(lock?: StudentAccessLock | null) {
  if (!lock) return "";
  return lock.reasonDetail || ACCESS_LOCK_REASON_MESSAGES[String(lock.reason || "")] || "";
}

export default function OperatorDashboard() {
  const user = getStoredUser();
  const attendanceReadDate = getJakartaDateKey();
  const [students, setStudents] = useState<MahasiswaRecord[]>([]);
  const [pendingCuti, setPendingCuti] = useState<LeaveRequestAll[]>([]);
  const [pendingPicketLeaves, setPendingPicketLeaves] = useState<PicketLeaveRequest[]>([]);
  const [pendingKelulusan, setPendingKelulusan] = useState<any[]>([]);
  const [auditLogs, setAuditLogs] = useState<AuditLogEntry[]>([]);
  const [researches, setResearches] = useState<ResearchFull[]>([]);
  const [resignationRequests, setResignationRequests] = useState<WithdrawalRequestRecord[]>([]);
  const [warnings, setWarnings] = useState<WarningData>({
    logbookMissing: [],
    attendanceAbsent: [],
    lowHours: []
  });
  const [earlyCheckoutAlerts, setEarlyCheckoutAlerts] = useState<EarlyCheckoutAlert[]>([]);
  const [attendanceMonitor, setAttendanceMonitor] = useState<AttendanceMonitorToday | null>(null);
  const [accessLocks, setAccessLocks] = useState<StudentAccessLock[]>([]);
  const [weeklyPicketMisses, setWeeklyPicketMisses] = useState<WeeklyPicketMiss[]>([]);
  const [weeklyPicketPeriod, setWeeklyPicketPeriod] = useState<{ start?: string; end?: string; resetDay?: string }>({});
  const [weeklyPicketUnavailable, setWeeklyPicketUnavailable] = useState(false);
  const [risetWeeklyMinimumHours, setRisetWeeklyMinimumHours] = useState(4);
  const [summary, setSummary] = useState<DashboardSummary | null>(null);
  const [error, setError] = useState("");
  const [warningSent, setWarningSent] = useState(false);
  const [warningInfo, setWarningInfo] = useState<{ message: string; tone: "success" | "warning" } | null>(null);
  const [absentSearch, setAbsentSearch] = useState("");
  const [accessLockSearch, setAccessLockSearch] = useState("");
  const [readAttendanceItems, setReadAttendanceItems] = useState<string[]>(() =>
    getReadAttendanceWarningIdsForDate(getCachedUserUiState(), attendanceReadDate)
  );
  const todayLabel = new Date().toLocaleDateString("id-ID", { weekday: "long", day: "2-digit", month: "long", year: "numeric" });

  useEffect(() => {
    let active = true;

    getUserUiState().then((state) => {
      if (!active) return;
      setReadAttendanceItems(getReadAttendanceWarningIdsForDate(state, attendanceReadDate));
    });

    return () => {
      active = false;
    };
  }, [attendanceReadDate]);

  useEffect(() => {
    const colorByIndex = [
      "bg-[#8B6FFF] text-white",
      "bg-emerald-500 text-white",
      "bg-pink-500 text-white",
      "bg-teal-500 text-white",
      "bg-violet-500 text-white",
      "bg-blue-500 text-white"
    ];

    const mapWarningItem = (item: any, type: WarningItem["type"], index: number): WarningItem => ({
      id: String(item?.id || `${type}-${item?.student_id || item?.studentId || index}`),
      type,
      studentId: String(item?.student_id || item?.studentId || ""),
      recipientUserId: String(item?.recipient_user_id || item?.recipientUserId || ""),
      studentName: item?.student_name || item?.studentName || "Mahasiswa",
      studentInitials: item?.student_initials || item?.studentInitials || item?.student_name?.slice(0, 2)?.toUpperCase() || "M",
      studentColor: colorByIndex[index % colorByIndex.length],
      nim: item?.nim || "-",
      referenceDate: item?.reference_date || item?.referenceDate || null,
      referencePeriod: item?.reference_period || item?.referencePeriod || null,
      attendanceStatus: item?.attendance_status || item?.attendanceStatus || null,
      currentHours: item?.current_hours ?? item?.currentHours ?? null,
      targetHours: item?.target_hours ?? item?.targetHours ?? null,
    });

    const applyWarnings = (warningsRes: OperatorWarningsResponse | null | undefined) => {
      const derivedWarnings: WarningData = {
        logbookMissing: (warningsRes?.warnings?.logbookMissing || []).map((item: any, index: number) =>
          mapWarningItem(item, "logbook_missing", index)
        ),
        attendanceAbsent: (warningsRes?.warnings?.attendanceAbsent || []).map((item: any, index: number) =>
          mapWarningItem(item, "attendance_absent", index)
        ),
        lowHours: (warningsRes?.warnings?.lowHours || []).map((item: any, index: number) =>
          mapWarningItem(item, "low_hours", index)
        )
      };

      setWarnings(derivedWarnings);
    };

    const mapEarlyCheckoutNotification = (item: any): EarlyCheckoutAlert | null => {
      const title = String(item?.title || "");
      const body = String(item?.body || "");
      const content = `${title} ${body}`.toLowerCase();
      if (!content.includes("checkout") || !content.includes("bawah batas")) return null;

      const nameMatch = body.match(/^(.+?)\s*\(/);
      const durationMatch = body.match(/setelah\s+([\d.,]+)/i);
      const requiredMatch = body.match(/batas\s+([\d.,]+)/i);
      const studentName = nameMatch?.[1]?.trim() || "Mahasiswa Magang";

      return {
        id: String(item?.id || `early-checkout-${Date.now()}`),
        title: title || "Checkout Magang Kurang Jam",
        body,
        studentName,
        studentInitials: studentName.split(" ").map((chunk) => chunk[0] || "").join("").slice(0, 2).toUpperCase() || "M",
        durationHours: durationMatch?.[1] ? Number(durationMatch[1].replace(",", ".")) : null,
        requiredHours: requiredMatch?.[1] ? Number(requiredMatch[1].replace(",", ".")) : null,
        read: typeof item?.read === "boolean" ? item.read : Boolean(item?.read_at || item?.readAt)
      };
    };

    const refreshWarnings = async () => {
      const warningsRes = await apiGet<OperatorWarningsResponse>("/dashboard/operator-warnings");
      applyWarnings(warningsRes);
    };

    const mapWeeklyPicketMiss = (item: any, index: number): WeeklyPicketMiss => {
      const studentName = item?.student_name || item?.studentName || item?.name || "Mahasiswa";
      const missedDates = item?.missed_dates || item?.missedDates || item?.dates || item?.picketDates || [];
      const taskNames = item?.task_names || item?.taskNames || item?.tasks || item?.taskName || [];

      return {
        id: String(item?.id || item?.student_id || item?.studentId || `weekly-picket-miss-${index}`),
        studentId: String(item?.student_id || item?.studentId || ""),
        studentName,
        studentInitials: item?.student_initials || item?.studentInitials || studentName.slice(0, 2).toUpperCase(),
        studentPhotoUrl: item?.student_photo_url || item?.studentPhotoUrl || null,
        nim: item?.nim || item?.student_nim || item?.studentNim || "-",
        missedCount: Number(item?.missed_count ?? item?.missedCount ?? item?.total ?? (Array.isArray(missedDates) ? missedDates.length : 0)) || 0,
        missedDates: Array.isArray(missedDates) ? missedDates.map(String).filter(Boolean) : [String(missedDates)].filter(Boolean),
        taskNames: Array.isArray(taskNames) ? taskNames.map(String).filter(Boolean) : [String(taskNames)].filter(Boolean),
        lastMissedDate: item?.last_missed_date || item?.lastDate || null,
        status: item?.status || item?.submission_status || item?.submissionStatus || "Belum Submit",
      };
    };

    const loadDashboard = async () => {
      setError("");
      try {
        const requests = [
          {
            key: "summary",
            label: "ringkasan dashboard",
            request: apiGet<DashboardSummary>("/dashboard/summary"),
          },
          {
            key: "students",
            label: "data mahasiswa",
            request: apiGet<Array<any>>("/students"),
          },
          {
            key: "leave",
            label: "pengajuan cuti/izin/WFH",
            request: apiGet<Array<any>>("/leave-requests?status=Menunggu"),
          },
          {
            key: "graduations",
            label: "berkas kelulusan",
            request: apiGet<Array<any>>("/graduation-submissions?status=Dikirim,Revisi"),
          },
          {
            key: "audit",
            label: "audit log",
            request: apiGet<Array<any>>("/audit-logs?limit=5"),
          },
          {
            key: "research",
            label: "data riset",
            request: apiGet<Array<any>>("/research"),
          },
          {
            key: "warnings",
            label: "warning admin",
            request: apiGet<OperatorWarningsResponse>("/dashboard/operator-warnings"),
          },
          {
            key: "attendanceMonitor",
            label: "monitor absensi hari ini",
            request: apiGet<AttendanceMonitorToday>("/attendance/monitor/today"),
          },
          {
            key: "accessLocks",
            label: "akses terkunci",
            request: apiGet<Array<any>>("/student-access-locks?status=active"),
          },
          {
            key: "withdrawals",
            label: "pengunduran diri",
            request: apiGet<Array<any>>("/withdrawal-requests"),
          },
          {
            key: "notifications",
            label: "notifikasi admin",
            request: apiGet<Array<any>>("/notifications?limit=50"),
          },
          {
            key: "weeklyPicketMisses",
            label: "piket mingguan",
            request: apiGet<WeeklyPicketMissResponse>("/dashboard/picket-weekly-misses"),
          },
          {
            key: "picketLeaves",
            label: "pengajuan izin piket",
            request: apiGet<any>(`/picket/leave-requests?status=Menunggu&_=${Date.now()}`),
          },
          {
            key: "systemSettings",
            label: "pengaturan sistem",
            request: apiGet<any>("/system-settings"),
          },
        ] as const;

        const settled = await Promise.allSettled(requests.map((item) => item.request));
        const failures = settled.flatMap((result, index) =>
          result.status === "rejected"
              ? ["accessLocks", "weeklyPicketMisses", "systemSettings"].includes(requests[index].key)
              ? []
              : `${requests[index].label}: ${result.reason?.message || "gagal dimuat"}`
            : []
        );

        const summaryRes =
          settled[0].status === "fulfilled"
            ? settled[0].value
            : null;
        const studentsRes =
          settled[1].status === "fulfilled"
            ? settled[1].value
            : [];
        const leaveRes =
          settled[2].status === "fulfilled"
            ? settled[2].value
            : [];
        const graduationsRes =
          settled[3].status === "fulfilled"
            ? settled[3].value
            : [];
        const auditRes =
          settled[4].status === "fulfilled"
            ? settled[4].value
            : [];
        const researchRes =
          settled[5].status === "fulfilled"
            ? settled[5].value
            : [];
        const warningsRes =
          settled[6].status === "fulfilled"
            ? settled[6].value
            : [];
        const attendanceMonitorRes =
          settled[7].status === "fulfilled"
            ? settled[7].value
            : null;
        const accessLockRes =
          settled[8].status === "fulfilled"
            ? settled[8].value
            : [];
        const withdrawalRes =
          settled[9].status === "fulfilled"
            ? settled[9].value
            : [];
        const notificationsRes =
          settled[10].status === "fulfilled"
            ? settled[10].value
            : [];
        const weeklyPicketRes =
          settled[11].status === "fulfilled"
            ? settled[11].value
            : null;
        const picketLeaveRes =
          settled[12].status === "fulfilled"
            ? settled[12].value
            : [];
        const systemSettingsRes =
          settled[13].status === "fulfilled"
            ? settled[13].value
            : null;

        if (failures.length === requests.length) {
          setError("Semua data dashboard gagal dimuat. Periksa koneksi API atau endpoint backend.");
        } else if (failures.length > 0) {
          setError(`Sebagian data dashboard belum tersedia: ${failures.join(" | ")}`);
        }

        const mappedStudents: MahasiswaRecord[] = studentsRes.map((item: any, index: number) => ({
          id: item.id,
          nim: item.nim,
          name: item.name,
          initials: item.initials || item.name?.slice(0, 2)?.toUpperCase() || "M",
          photoUrl: item.photo_url || item.photoUrl || null,
          color: colorByIndex[index % colorByIndex.length],
          prodi: item.prodi || "-",
          angkatan: String(item.angkatan || "-"),
          email: item.email || "-",
          phone: item.phone || "-",
          status: item.status,
          tipe: item.tipe,
          riset: [],
          bergabung: item.bergabung || "-",
          pembimbing: item.pembimbing || "-",
          kehadiran: Number(item.kehadiran) || 0,
          totalHari: Number(item.total_hari) || 0,
          logbookCount: Number(item.logbook_count) || 0,
          jamMingguIni: Number(item.jamMingguIni ?? item.jam_minggu_ini ?? 0),
          jamMingguTarget: Number(item.jamMingguTarget ?? item.jam_minggu_target ?? 0)
        }));

        const picketLeaveRows = Array.isArray(picketLeaveRes)
          ? picketLeaveRes
          : picketLeaveRes?.requests || picketLeaveRes?.items || [];
        const mappedPicketLeaves = picketLeaveRows
          .map(mapPicketLeaveRequest)
          .filter((item: PicketLeaveRequest) => item.status.trim().toLowerCase() === "menunggu");

        const mappedLeave: LeaveRequestAll[] = leaveRes.map((item: any) => ({
          id: item.id,
          mahasiswaId: item.student_id,
          mahasiswaNama: item.student_name,
          mahasiswaInitials: item.student_initials || item.student_name?.slice(0, 2)?.toUpperCase() || "M",
          mahasiswaPhotoUrl: item.student_photo_url || null,
          mahasiswaColor: "bg-[#8B6FFF] text-white",
          nim: item.nim,
          jenis: item.jenis_pengajuan || item.jenis || item.jenisPengajuan || "cuti",
          riset: item.project_name || "-",
          periodeStart: formatDateYmd(item.periode_start),
          periodeEnd: formatDateYmd(item.periode_end),
          durasi: item.durasi,
          alasan: item.alasan,
          catatan: item.catatan || "",
          tanggalPengajuan: formatDateYmd(item.tanggal_pengajuan),
          status: item.status
        }));

        const mappedGraduations = graduationsRes.map((item: any) => {
          const sName = item.student?.name || item.student_name || "Mahasiswa";
          return {
            id: item.id,
            mahasiswaId: item.student?.id || item.student_id,
            mahasiswaNama: sName,
            mahasiswaInitials: item.student?.initials || item.student_initials || sName.slice(0, 2).toUpperCase(),
            mahasiswaPhotoUrl: item.student?.photoUrl || item.student_photo_url || null,
            mahasiswaColor: "bg-[#8B6FFF] text-white",
            nim: item.student?.nim || item.nim || "-",
            jenis: "Berkas Kelulusan",
            tanggal: formatDateYmd(item.submitted_at || item.created_at),
            status: item.status
          };
        });

        const mappedWithdrawals: WithdrawalRequestRecord[] = (withdrawalRes || []).map((item: any) => ({
          id: item.id,
          studentId: String(item.student_id || ""),
          studentName: item.student_name || "Mahasiswa",
          studentNim: item.student_nim || "-",
          studentInitials: String(item.student_name || "M").split(" ").map((chunk: string) => chunk[0] || "").join("").slice(0, 2).toUpperCase() || "M",
          studentColor: "bg-amber-500 text-white",
          advisorName: item.advisor_name || "-",
          reason: item.reason || "-",
          submittedAt: formatDateYmd(item.submitted_at),
          statusOperator: item.status_operator || "Menunggu",
          statusDosen: item.status_dosen ?? null,
          finalStatus: item.final_status || "Menunggu",
          operatorNote: item.operator_note || null,
          advisorNote: item.advisor_note || null
        }));

        const accessRows = Array.isArray(accessLockRes)
          ? accessLockRes
          : ((accessLockRes as any)?.items || (accessLockRes as any)?.locks || []);
        const mappedAccessLocks: StudentAccessLock[] = (accessRows || [])
          .filter((item: any) => Boolean(item?.locked ?? item?.active ?? String(item?.status || "").toUpperCase() === "LOCKED"))
          .map((item: any) => ({
            id: String(item.id || item.lock_id || item.lockId || ""),
            studentId: String(item.student_id || item.studentId || ""),
            studentName: item.student_name || item.studentName || "Mahasiswa",
            studentInitials: item.student_initials || item.studentInitials || item.student_name?.slice(0, 2)?.toUpperCase() || "M",
            studentPhotoUrl: item.student_photo_url || item.studentPhotoUrl || null,
            nim: item.nim || item.student_nim || "-",
            studentType: item.student_type || item.studentType || item.tipe || null,
            date: item.date || item.reference_date || item.referenceDate || null,
            reason: item.reason || item.lock_reason || item.lockReason || "ATTENDANCE_ABSENT",
            reasonLabel: item.reasonLabel || item.reason_label || null,
            reasonDetail: item.reasonDetail || item.reason_detail || item.message || null,
            status: item.status || "LOCKED",
            locked: Boolean(item.locked ?? true),
            active: Boolean(item.active ?? true),
            lockedAt: item.locked_at || item.lockedAt || null,
          }));

        const mappedAudit: AuditLogEntry[] = auditRes.map(mapAuditLogEntry);

        const mappedResearch: ResearchFull[] = researchRes.map((item: any) => ({
          id: item.id,
          title: item.title,
          shortTitle: item.short_title || item.title,
          supervisor: item.supervisor_name || "-",
          supervisorInitials: item.supervisor_initials || "-",
          period: item.period_text || "-",
          mitra: item.mitra || "-",
          status: item.status,
          progress: Number(item.progress) || 0,
          mahasiswaCount: 0,
          dosenCount: 0,
          category: item.category || "-",
          description: item.description || "-",
          funding: item.funding || "-",
          milestones: []
        }));

        setSummary(summaryRes);
        setStudents(mappedStudents);
        setPendingCuti(mappedLeave);
        setPendingPicketLeaves(mappedPicketLeaves);
        setPendingKelulusan(mappedGraduations);
        setAuditLogs(mappedAudit);
        setResearches(mappedResearch);
        setAttendanceMonitor(attendanceMonitorRes);
        const configuredRisetMinimum = Number(
          attendanceMonitorRes?.risetWeeklyMinHours ??
          attendanceMonitorRes?.riset_weekly_min_hours ??
          systemSettingsRes?.attendanceRules?.risetMinWeeklyHours ??
          4
        );
        setRisetWeeklyMinimumHours(configuredRisetMinimum > 0 ? configuredRisetMinimum : 4);
        setAccessLocks(mappedAccessLocks);
        if (weeklyPicketRes) {
          const weeklyRows = Array.isArray(weeklyPicketRes)
            ? weeklyPicketRes
            : (weeklyPicketRes.items || weeklyPicketRes.students || weeklyPicketRes.misses || []);
          setWeeklyPicketMisses(weeklyRows.map(mapWeeklyPicketMiss).filter((item) => item.missedCount > 0));
          setWeeklyPicketPeriod({
            start: weeklyPicketRes.weekStart,
            end: weeklyPicketRes.weekEnd,
            resetDay: weeklyPicketRes.resetDay || "Minggu",
          });
          setWeeklyPicketUnavailable(false);
        } else {
          setWeeklyPicketMisses([]);
          setWeeklyPicketPeriod({});
          setWeeklyPicketUnavailable(true);
        }
        applyWarnings(warningsRes);
        setEarlyCheckoutAlerts(
          (notificationsRes || [])
            .map(mapEarlyCheckoutNotification)
            .filter(Boolean)
            .slice(0, 5) as EarlyCheckoutAlert[]
        );
        setResignationRequests(mappedWithdrawals);
      } catch (err: any) {
        setError(err?.message || "Gagal memuat dashboard admin.");
      }
    };

    loadDashboard();
  }, []);

  const showWarningSent = () => {
    setWarningSent(true);
    setTimeout(() => setWarningSent(false), 3000);
  };

  const showWarningInfo = (message: string, tone: "success" | "warning") => {
    setWarningInfo({ message, tone });
    window.setTimeout(() => setWarningInfo(null), 3000);
  };

  const mapAuditLogEntry = (item: any): AuditLogEntry => {
    const role = String(item.user_role || item.userRole || "").toLowerCase();
    const loggedAt = item.logged_at || item.loggedAt || item.timestamp || null;
    const parsedDate = loggedAt ? new Date(loggedAt) : null;

    return {
      id: item.id,
      timestamp: parsedDate && !Number.isNaN(parsedDate.getTime())
        ? parsedDate.toLocaleString("id-ID", { dateStyle: "short", timeStyle: "short" })
        : "-",
      userName: item.user_name || item.userName || "System",
      userInitials: item.user_initials || item.userInitials || "SY",
      userPhotoUrl: item.user_photo_url || item.userPhotoUrl || null,
      userColor: "bg-amber-500 text-white",
      userRole: role === "operator" ? "Admin" : role === "dosen" ? "Dosen" : role === "mahasiswa" ? "Mahasiswa" : item.user_role || "System",
      action: item.action || "-",
      target: item.target || "-",
      ip: item.ip || "-",
      detail: item.detail || "{}"
    };
  };

  const refreshRecentAuditLogs = async () => {
    const response = await apiGet<Array<any>>("/audit-logs?limit=5");
    setAuditLogs(response.map(mapAuditLogEntry));
  };

  const handleSendWarning = async (warning: WarningItem) => {
    const messages = {
      logbook_missing: {
        title: "Peringatan: Logbook Belum Diisi",
        body: `${warning.studentName}, Anda belum mengisi logbook untuk tanggal ${warning.referenceDate || "acuan sebelumnya"}. Segera isi sebelum deadline hari ini.`
      },
      attendance_absent: {
        title: "Peringatan: Ketidakhadiran",
        body: `${warning.studentName}, Anda tercatat ${warning.attendanceStatus === "Belum Absen" ? "belum absen" : "tidak hadir"} pada ${warning.referenceDate || "hari ini"}. Hubungi admin jika ada keperluan.`
      },
      low_hours: {
        title: "Peringatan: Jam Riset Mingguan Kurang",
        body: `${warning.studentName}, jam kerja Riset mingguan Anda belum memenuhi target (${warning.currentHours || 0}j/${warning.targetHours || 0}j). Segera penuhi jam minimal.`
      },
    };
    const msg = messages[warning.type];
    try {
      const response = await apiPost<{ message?: string; id?: string; duplicate?: boolean; skipped?: boolean; reason?: string; eventId?: string }>("/notifications", {
        recipientUserId: warning.recipientUserId || warning.studentId,
        type: "pengumuman",
        reminderType: warning.type,
        studentId: warning.studentId,
        referenceDate: warning.referenceDate || undefined,
        referencePeriod: warning.referencePeriod || undefined,
        title: msg.title,
        body: msg.body
      });

      if (response?.skipped) {
        showWarningInfo("Notifikasi dilewati karena event sedang nonaktif.", "warning");
      } else if (response?.duplicate) {
        showWarningInfo("Reminder untuk periode ini sudah pernah dikirim.", "warning");
      } else {
        showWarningSent();
      }

      try {
        const latestWarnings = await apiGet<OperatorWarningsResponse>("/dashboard/operator-warnings");
        const colorByIndex = [
          "bg-[#8B6FFF] text-white",
          "bg-emerald-500 text-white",
          "bg-pink-500 text-white",
          "bg-teal-500 text-white",
          "bg-violet-500 text-white",
          "bg-blue-500 text-white"
        ];
        const mapWarningItem = (item: any, type: WarningItem["type"], index: number): WarningItem => ({
          id: String(item?.id || `${type}-${item?.student_id || item?.studentId || index}`),
          type,
          studentId: String(item?.student_id || item?.studentId || ""),
          recipientUserId: String(item?.recipient_user_id || item?.recipientUserId || ""),
          studentName: item?.student_name || item?.studentName || "Mahasiswa",
          studentInitials: item?.student_initials || item?.studentInitials || item?.student_name?.slice(0, 2)?.toUpperCase() || "M",
          studentPhotoUrl: item?.student_photo_url || item?.studentPhotoUrl || null,
          studentColor: colorByIndex[index % colorByIndex.length],
          nim: item?.nim || "-",
          referenceDate: item?.reference_date || item?.referenceDate || null,
          referencePeriod: item?.reference_period || item?.referencePeriod || null,
          attendanceStatus: item?.attendance_status || item?.attendanceStatus || null,
          currentHours: item?.current_hours ?? item?.currentHours ?? null,
          targetHours: item?.target_hours ?? item?.targetHours ?? null,
        });
        setWarnings({
          logbookMissing: (latestWarnings?.warnings?.logbookMissing || []).map((item: any, index: number) => mapWarningItem(item, "logbook_missing", index)),
          attendanceAbsent: (latestWarnings?.warnings?.attendanceAbsent || []).map((item: any, index: number) => mapWarningItem(item, "attendance_absent", index)),
          lowHours: (latestWarnings?.warnings?.lowHours || []).map((item: any, index: number) => mapWarningItem(item, "low_hours", index))
        });
      } catch {
        // Keep current list if refetch fails.
      }
    } catch (err: any) {
      setError(err?.message || "Gagal mengirim peringatan ke mahasiswa.");
    }
  };

  const aktifCount = summary?.totalMahasiswa ?? students.filter(m => m.status === "Aktif").length;
  const alumniCount = summary?.totalAlumni ?? students.filter(m => m.status === "Alumni").length;
  const risetAktif = summary?.totalRisetAktif ?? researches.filter(r => r.status === "Aktif").length;
  const cutiMenunggu = pendingCuti.length;
  const izinPiketMenunggu = pendingPicketLeaves.length;
  const kelulusanMenunggu = summary?.kelulusanMenunggu ?? 0;
  const totalDokumen = summary?.totalDokumen ?? 0;
  const logbookHariIni = summary?.logbookTerbaru?.length ?? 0;
  const resignCount = resignationRequests.filter(r => ["Menunggu", "Menunggu Dosen"].includes(r.finalStatus)).length;
  const lockVisibleAfter = attendanceMonitor?.lockVisibleAfter || "10:00";
  const hasPassedAttendanceCutoff = Boolean(attendanceMonitor?.lockWindowOpen);
  const risetWeeklyHoursLockAfter = attendanceMonitor?.risetWeeklyHoursLockAfter || "-";
  const hasPassedRisetWeeklyHoursLock = Boolean(attendanceMonitor?.risetWeeklyHoursLockWindowOpen);
  const isHolidayAttendanceDay = Boolean(
    attendanceMonitor?.isHoliday && attendanceMonitor?.excludeHolidaysFromWorkdays !== false
  );
  const holidayTodayName = typeof attendanceMonitor?.holidayToday === "string"
    ? attendanceMonitor.holidayToday
    : attendanceMonitor?.holidayToday?.name || "Hari Libur";
  const getAttendanceReadId = (item: WarningItem) => `${item.studentId}:${item.referenceDate || getJakartaDateKey()}`;

  const presentIdSet = new Set((attendanceMonitor?.presentIds || []).map(String));
  const getAttendanceModeForStudent = (studentId: string) => {
    const normalizedId = String(studentId || "");
    const mode = attendanceMonitor?.attendanceModeByStudentId?.[normalizedId];
    const status = attendanceMonitor?.attendanceStatusByStudentId?.[normalizedId];
    return mode || (status === "WFH" ? "wfh" : "onsite");
  };
  const hadirHariIniMhs = students.filter((item) => presentIdSet.has(String(item.id)));
  const onsitePresentCount = hadirHariIniMhs.filter((item) => getAttendanceModeForStudent(item.id) !== "wfh").length;
  const wfhPresentCount = hadirHariIniMhs.filter((item) => getAttendanceModeForStudent(item.id) === "wfh").length;
  const isDailyAttendanceLock = (lock?: StudentAccessLock | null) =>
    String(lock?.reason || "") === "ATTENDANCE_ABSENT";
  const isRisetWeeklyHoursLock = (lock?: StudentAccessLock | null) =>
    String(lock?.reason || "") === "RISET_WEEKLY_HOURS_UNDER_TARGET";
  const visibleAccessLocks = isHolidayAttendanceDay
    ? accessLocks.filter((lock) => !isDailyAttendanceLock(lock))
    : accessLocks;

  const uniqueAccessLocks = useMemo(() => {
    const studentMap = new Map<string, StudentAccessLock>();
    for (const lock of visibleAccessLocks) {
      const studentKey = String(lock.studentId || lock.id);
      if (!studentMap.has(studentKey)) {
        studentMap.set(studentKey, lock);
      } else {
        const existing = studentMap.get(studentKey)!;
        const existingTime = existing.lockedAt ? new Date(existing.lockedAt).getTime() : 0;
        const currentTime = lock.lockedAt ? new Date(lock.lockedAt).getTime() : 0;
        if (currentTime > existingTime) {
          studentMap.set(studentKey, lock);
        }
      }
    }
    return Array.from(studentMap.values());
  }, [visibleAccessLocks]);

  const getStudentById = (studentId: string) =>
    students.find((item) => String(item.id) === String(studentId));
  const getAccessLockForStudent = (studentId: string) =>
    uniqueAccessLocks.find((item) => String(item.studentId) === String(studentId));
  const getStudentTypeLabel = (studentId: string, fallbackType?: string | null) =>
    getStudentById(studentId)?.tipe || fallbackType || getAccessLockForStudent(studentId)?.studentType || "Mahasiswa";
  const isMagangStudent = (studentId: string, fallbackType?: string | null) =>
    String(getStudentTypeLabel(studentId, fallbackType)).trim().toLowerCase() === "magang";
  const isRisetStudent = (studentId: string, fallbackType?: string | null) =>
    String(getStudentTypeLabel(studentId, fallbackType)).trim().toLowerCase() === "riset";
  const leaveIdSet = new Set((attendanceMonitor?.leaveIds || []).map(String));
  const absentIdSet = new Set((attendanceMonitor?.absentIds || []).map(String));
  const reportedAbsentIdSet = new Set((attendanceMonitor?.reportedAbsentIds || []).map(String));
  const noInformationIdSet = new Set((attendanceMonitor?.noInformationIds || []).map(String));
  const risetWeeklyMeetsMinIdSet = new Set(
    (attendanceMonitor?.risetWeeklyMeetsMinIds || attendanceMonitor?.riset_weekly_meets_min_ids || []).map(String)
  );
  const risetWeeklyHoursByStudentId =
    attendanceMonitor?.risetWeeklyHoursByStudentId || attendanceMonitor?.riset_weekly_hours_by_student_id || {};
  const risetHoursFulfilledMhs = students.filter((student) =>
    shouldShowResearchHoursFulfilledStatus({
      isResearchStudent: isRisetStudent(student.id),
      isHoliday: isHolidayAttendanceDay,
      isPresent: presentIdSet.has(String(student.id)),
      isOnLeave: leaveIdSet.has(String(student.id)),
      attendanceCutoffPassed: hasPassedAttendanceCutoff,
      hasReportedAbsence: reportedAbsentIdSet.has(String(student.id)),
      hasAbsentLock: absentIdSet.has(String(student.id)),
      hasNoAttendanceInformation: noInformationIdSet.has(String(student.id)),
      explicitlyMeetsMinimum: risetWeeklyMeetsMinIdSet.has(String(student.id)),
      currentHours: risetWeeklyHoursByStudentId[String(student.id)] ?? student.jamMingguIni,
      minimumHours: risetWeeklyMinimumHours,
    })
  );

  const lockedAbsentMhs: AttendanceAbsentItem[] = uniqueAccessLocks
    .filter((lock) => isDailyAttendanceLock(lock) && !isRisetStudent(lock.studentId, lock.studentType))
    .map((lock) => ({
      id: lock.id || `lock-${lock.studentId}`,
      type: "attendance_absent",
      studentId: String(lock.studentId || ""),
      recipientUserId: String(lock.studentId || ""),
      studentName: lock.studentName || "Mahasiswa",
      studentInitials: lock.studentInitials || lock.studentName?.slice(0, 2)?.toUpperCase() || "M",
      studentPhotoUrl: lock.studentPhotoUrl || null,
      studentColor: "bg-red-500 text-white",
      nim: lock.nim || "-",
      referenceDate: lock.date || getJakartaDateKey(),
      attendanceStatus: "Tidak Hadir",
      accessLock: lock,
    }));
  const warningAbsentMhs: AttendanceAbsentItem[] = isHolidayAttendanceDay
    ? []
    : warnings.attendanceAbsent
      .filter((item) => !isRisetStudent(item.studentId))
      .filter((item) => item.attendanceStatus !== "Cuti")
      .map((item) => ({ ...item, accessLock: getAccessLockForStudent(item.studentId) }));
  const tidakHadirMhs = hasPassedAttendanceCutoff
    ? [
      ...warningAbsentMhs,
      ...lockedAbsentMhs.filter((lockItem) =>
        !warningAbsentMhs.some((warningItem) => String(warningItem.studentId) === String(lockItem.studentId))
      )
    ]
    : [];
  const filteredTidakHadirMhs = tidakHadirMhs.filter((item) =>
    matchesSearchQuery(
      [
        item.studentName,
        item.nim,
        getStudentTypeLabel(item.studentId),
        item.attendanceStatus,
        item.referenceDate,
        item.accessLock?.reasonLabel || getLockReasonLabel(item.accessLock?.reason || "ATTENDANCE_ABSENT"),
      ],
      absentSearch
    )
  );
  const risetWeeklyUnderHourIdSet = new Set((attendanceMonitor?.risetWeeklyUnderHoursIds || []).map(String));
  const risetWeeklyUnderHourLockIdSet = new Set((attendanceMonitor?.risetWeeklyUnderHoursLockIds || []).map(String));
  const risetLowHoursFromWarnings = warnings.lowHours.filter((item) => isRisetStudent(item.studentId));
  const risetLowHoursFromMonitor: WarningItem[] = students
    .filter((student) => isRisetStudent(student.id) && risetWeeklyUnderHourIdSet.has(String(student.id)))
    .filter((student) => !risetLowHoursFromWarnings.some((warning) => String(warning.studentId) === String(student.id)))
    .map((student) => {
      return {
        id: `riset-weekly-hours-${student.id}`,
        type: "low_hours",
        studentId: String(student.id),
        recipientUserId: String(student.id),
        studentName: student.name || "Mahasiswa Riset",
        studentInitials: student.initials || student.name?.slice(0, 2)?.toUpperCase() || "M",
        studentPhotoUrl: student.photoUrl || student.photo_url || null,
        studentColor: student.color || "bg-orange-500 text-white",
        nim: student.nim || "-",
        referenceDate: attendanceMonitor?.date || getJakartaDateKey(),
        referencePeriod: "Minggu ini",
        currentHours: student.jamMingguIni ?? null,
        targetHours: student.jamMingguTarget ?? null,
      };
    });
  const risetLowHours = [...risetLowHoursFromWarnings, ...risetLowHoursFromMonitor];
  const unreadEarlyCheckoutAlerts = earlyCheckoutAlerts.filter((item) => !item.read);
  const earlyCheckoutDisplay = unreadEarlyCheckoutAlerts.length > 0 ? unreadEarlyCheckoutAlerts : earlyCheckoutAlerts;
  const jamTidakTerpenuhiCount = risetLowHours.length + unreadEarlyCheckoutAlerts.length;
  const weeklyPicketPeriodLabel = weeklyPicketPeriod.start && weeklyPicketPeriod.end
    ? `${formatDateYmd(weeklyPicketPeriod.start)} - ${formatDateYmd(weeklyPicketPeriod.end)}`
    : "Minggu berjalan";
  const filteredAccessLocks = uniqueAccessLocks.filter((lock) =>
    matchesSearchQuery(
      [
        lock.studentName,
        lock.nim,
        getStudentTypeLabel(lock.studentId, lock.studentType),
        getLockReasonLabel(lock.reason, lock.reasonLabel),
        getLockReasonDetail(lock),
        lock.date,
      ],
      accessLockSearch
    )
  );

  const handleUnlockAccess = async (lock: StudentAccessLock) => {
    if (!lock?.id && !lock?.studentId) return;
    try {
      if (lock.id) {
        await apiPatch(`/student-access-locks/${encodeURIComponent(lock.id)}/unlock`, {
          unlockedBy: user?.id,
        });
      } else {
        await apiPost("/student-access-locks/unlock", {
          studentId: lock.studentId,
          unlockedBy: user?.id,
        });
      }
      setAccessLocks((prev) => prev.filter((item) => item.id !== lock.id && item.studentId !== lock.studentId));
      showWarningInfo(`Akses ${lock.studentName} berhasil dibuka.`, "success");
      void refreshRecentAuditLogs().catch(() => null);
    } catch (err: any) {
      setError(err?.message || "Gagal membuka akses mahasiswa.");
    }
  };

  const markEarlyCheckoutAsRead = async (alert: EarlyCheckoutAlert) => {
    setEarlyCheckoutAlerts((prev) => prev.map((item) => item.id === alert.id ? { ...item, read: true } : item));
    try {
      await apiPatch(`/notifications/${alert.id}/read`, {});
    } catch {
      // Keep optimistic read state even if the notification endpoint is briefly unavailable.
    }
  };

  const handleLeave = async (id: string, status: "Disetujui" | "Ditolak") => {
    try {
      await apiPatch<{ message: string }>(`/leave-requests/${id}/status`, { status });
      setPendingCuti(p => p.filter(l => l.id !== id));
      void refreshRecentAuditLogs().catch(() => null);
    } catch (err: any) {
      setError(err?.message || "Gagal memproses pengajuan.");
    }
  };

  const handleWithdrawalReview = async (id: string, status: "Diteruskan" | "Ditolak") => {
    try {
      const note = status === "Diteruskan"
        ? "Data lengkap, diteruskan ke dosen pembimbing."
        : "Pengajuan ditolak oleh admin.";

      await apiPatch<{ message: string }>(`/withdrawal-requests/${id}/operator-review`, {
        status,
        reviewedById: user?.id,
        note
      });

      setResignationRequests((prev) => prev.map((item) => item.id === id ? {
        ...item,
        statusOperator: status,
        finalStatus: status === "Diteruskan" ? "Menunggu Dosen" : "Ditolak Operator",
        operatorNote: note
      } : item));
      void refreshRecentAuditLogs().catch(() => null);
    } catch (err: any) {
      setError(err?.message || "Gagal memproses pengunduran diri.");
    }
  };

  const markAttendanceAsRead = (warning: WarningItem) => {
    const next = Array.from(new Set([...readAttendanceItems, getAttendanceReadId(warning)]));
    setReadAttendanceItems(next);
    void patchUserUiState({
      readAttendanceWarningIds: setReadAttendanceWarningIdsForDate(
        getCachedUserUiState().readAttendanceWarningIds,
        attendanceReadDate,
        next
      ),
    });
  };

  return (
    <OperatorLayout title="Dashboard Admin">
      <WarningSent visible={warningSent} />
      {warningInfo && <WarningInfo message={warningInfo.message} tone={warningInfo.tone} />}
      <div className="flex flex-col gap-6 pb-4">
        {error && (
          <div className="px-4 py-3 rounded-xl border border-red-200 bg-red-50 text-sm font-semibold text-red-600">
            {error}
          </div>
        )}
        {isHolidayAttendanceDay && (
          <div className="px-4 py-3 rounded-xl border border-rose-200 bg-rose-50 text-sm font-semibold text-rose-700">
            Hari Libur: {holidayTodayName}. Warning tidak hadir dan lock absensi harian dinonaktifkan untuk hari ini.
          </div>
        )}

        {/* Header */}
        <div className="flex items-start justify-between">
          <div>
            <h1 className="text-2xl font-black text-foreground">Selamat datang, {user?.name || "Admin"}!</h1>
            <p className="text-sm font-medium text-muted-foreground mt-1">{todayLabel}
              {cutiMenunggu > 0 && <span className="text-amber-600 font-black ml-1">{cutiMenunggu} pengajuan menunggu</span>}
              {izinPiketMenunggu > 0 && <span className="text-blue-600 font-black ml-1">{izinPiketMenunggu} izin piket menunggu</span>}
              {resignCount > 0 && <span className="text-red-500 font-black ml-1">{resignCount} pengunduran diri aktif</span>}
            </p>
          </div>
        </div>

        {/* Stat Cards */}
        <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-5 gap-4">
          <MiniStatCard icon={<Users size={22} className="text-blue-600" />} label="Mahasiswa Aktif" value={aktifCount} color="bg-blue-100" href="/operator/mahasiswa" />
          <MiniStatCard icon={<Users size={22} className="text-violet-600" />} label="Mahasiswa Alumni" value={alumniCount} color="bg-violet-100" href="/operator/mahasiswa" />
          <MiniStatCard icon={<FlaskConical size={22} className="text-[#0AB600]" />} label="Riset Berjalan" value={risetAktif} color="bg-green-100" href="/operator/riset" />
          <MiniStatCard icon={<CalendarCheck size={22} className="text-amber-600" />} label="Cuti/Izin/WFH Menunggu" value={cutiMenunggu} color="bg-amber-100" href="/operator/cuti" urgent />
          <MiniStatCard icon={<ClipboardList size={22} className="text-blue-600" />} label="Izin Piket Menunggu" value={izinPiketMenunggu} color="bg-blue-100" href="/operator/piket" urgent />
          <MiniStatCard icon={<FileText size={22} className="text-rose-500" />} label="Berkas Kelulusan" value={kelulusanMenunggu} color="bg-rose-100" href="/operator/kelulusan" urgent />
          <MiniStatCard icon={<BookOpen size={22} className="text-emerald-600" />} label="Logbook Hari Ini" value={logbookHariIni} color="bg-emerald-100" href="/operator/logbook" />
          <MiniStatCard icon={<Kanban size={22} className="text-indigo-600" />} label="Board Aktif" value={risetAktif} color="bg-indigo-100" href="/operator/riset" />
          <MiniStatCard icon={<FileText size={22} className="text-teal-600" />} label="Pusat Dokumen" value={totalDokumen} color="bg-teal-100" href="/operator/document-center" />
        </div>

        {/* Alert Sections */}
        <div className="grid grid-cols-1 lg:grid-cols-2 [@media(min-width:1900px)]:grid-cols-5 gap-5">

          {/* Hadir Hari Ini */}
          <div className="bg-white border border-emerald-200 rounded-[14px] shadow-sm overflow-hidden">
            <div className="px-4 py-3 border-b border-emerald-100 bg-emerald-50/50 flex items-center justify-between gap-3">
              <h3 className="text-xs font-black text-foreground flex min-w-0 flex-wrap items-center gap-2"><UserCheck size={13} className="text-emerald-500 shrink-0" /> Hadir Hari Ini<span className="bg-emerald-500 text-white text-[10px] font-black px-1.5 py-0.5 rounded-full">{hadirHariIniMhs.length}</span><span className="rounded-full bg-emerald-100 px-1.5 py-0.5 text-[9px] font-black text-emerald-700">Onsite {onsitePresentCount}</span><span className="rounded-full bg-sky-100 px-1.5 py-0.5 text-[9px] font-black text-sky-700">WFH {wfhPresentCount}</span></h3>
            </div>
            {hadirHariIniMhs.length === 0 ? (
              <div className="px-4 py-8 text-center">
                <p className="text-xs font-black text-foreground">Belum ada mahasiswa hadir</p>
                <p className="text-[10px] text-muted-foreground mt-1">Daftar akan terisi setelah check-in tercatat di database.</p>
              </div>
            ) : (
              <div className="max-h-[360px] overflow-y-auto">
                {hadirHariIniMhs.map(m => {
                  const mode = getAttendanceModeForStudent(m.id);
                  const isWfh = mode === "wfh";

                  return (
                    <div key={m.id} className="flex items-center gap-3 px-4 py-2.5 border-b border-border/50 last:border-0 hover:bg-slate-50 transition-colors">
                      {m.photoUrl ? (
                        <img src={m.photoUrl} alt={m.name} className="w-7 h-7 rounded-full object-cover shrink-0 border border-slate-200" />
                      ) : (
                        <div className={`w-7 h-7 rounded-full flex items-center justify-center text-[10px] font-black shrink-0 ${m.color}`}>{m.initials}</div>
                      )}
                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-black text-foreground truncate">{m.name}</p>
                        <p className="text-[10px] text-muted-foreground">{m.nim}</p>
                      </div>
                      <span className={`shrink-0 rounded-full px-2 py-0.5 text-[9px] font-black ${isWfh ? "bg-sky-100 text-sky-700" : "bg-emerald-100 text-emerald-700"}`}>
                        {isWfh ? "WFH" : "Onsite"}
                      </span>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Tidak Hadir */}
          <div className="bg-white border border-red-200 rounded-[14px] shadow-sm overflow-hidden">
            <div className="px-4 py-3 border-b border-red-100 bg-red-50/50 flex items-center justify-between gap-3">
              <h3 className="text-xs font-black text-foreground flex min-w-0 flex-wrap items-center gap-2"><UserX size={13} className="text-red-500 shrink-0" /> Tidak Hadir Hari Ini<span className="bg-red-500 text-white text-[10px] font-black px-1.5 py-0.5 rounded-full">{absentSearch.trim() ? `${filteredTidakHadirMhs.length}/${tidakHadirMhs.length}` : tidakHadirMhs.length}</span></h3>
            </div>
            {isHolidayAttendanceDay ? (
              <div className="px-4 py-8 text-center">
                <p className="text-xs font-black text-foreground">Hari ini libur</p>
                <p className="text-[10px] text-muted-foreground mt-1">Absensi tidak wajib, sehingga mahasiswa tidak ditandai tidak hadir.</p>
              </div>
            ) : !hasPassedAttendanceCutoff ? (
              <div className="px-4 py-8 text-center">
                <p className="text-xs font-black text-foreground">Daftar belum ditampilkan</p>
                <p className="text-[10px] text-muted-foreground mt-1">Mahasiswa akan masuk ke section ini jika sampai lewat pukul {lockVisibleAfter} WIB belum memiliki informasi absensi.</p>
              </div>
            ) : tidakHadirMhs.length === 0 ? (
              <div className="px-4 py-8 text-center">
                <p className="text-xs font-black text-foreground">Tidak ada mahasiswa yang melewati batas presensi</p>
                <p className="text-[10px] text-muted-foreground mt-1">Semua mahasiswa sudah hadir atau memiliki status kehadiran yang valid hari ini.</p>
              </div>
            ) : (
              <>
                <div className="border-b border-red-100 px-4 py-2.5">
                  <div className="flex h-9 items-center gap-2 rounded-[10px] border border-red-100 bg-white px-3 text-red-500">
                    <Search size={14} />
                    <input
                      value={absentSearch}
                      onChange={(event) => setAbsentSearch(event.target.value)}
                      placeholder="Cari nama, NIM, tipe..."
                      className="min-w-0 flex-1 bg-transparent text-xs font-bold text-foreground outline-none placeholder:text-muted-foreground/60"
                    />
                    {absentSearch && (
                      <button onClick={() => setAbsentSearch("")} className="text-[10px] font-black text-muted-foreground hover:text-red-600">
                        Reset
                      </button>
                    )}
                  </div>
                </div>
                {filteredTidakHadirMhs.length === 0 ? (
                  <div className="px-4 py-8 text-center">
                    <p className="text-xs font-black text-foreground">Tidak ada hasil pencarian</p>
                    <p className="text-[10px] text-muted-foreground mt-1">Coba gunakan nama, NIM, tipe, atau alasan lain.</p>
                  </div>
                ) : (
              <div className="max-h-[315px] overflow-y-auto">
                {filteredTidakHadirMhs.map(m => {
                  const studentType = getStudentTypeLabel(m.studentId);
                  const isMagang = isMagangStudent(m.studentId);

                  return (
                    <div key={m.id} className="px-4 py-3 border-b border-border/50 last:border-0 hover:bg-slate-50 transition-colors">
                      <div className="flex items-start gap-3">
                        {m.studentPhotoUrl ? (
                          <img src={m.studentPhotoUrl} alt={m.studentName} className="w-8 h-8 rounded-full object-cover shrink-0 border border-slate-200" />
                        ) : (
                          <div className={`w-8 h-8 rounded-full flex items-center justify-center text-[10px] font-black shrink-0 ${m.studentColor}`}>{m.studentInitials}</div>
                        )}
                        <div className="flex-1 min-w-0">
                          <div className="flex flex-wrap items-center gap-1.5">
                            <p className="text-xs font-black text-foreground leading-snug break-words">{m.studentName}</p>
                            <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[9px] font-black text-slate-600">{studentType}</span>
                          </div>
                          <p className="text-[10px] text-muted-foreground mt-0.5">
                            {m.referenceDate ? `${m.accessLock?.reasonLabel || getLockReasonLabel(m.accessLock?.reason || "ATTENDANCE_ABSENT")} - ${m.referenceDate}` : `Lewat batas presensi ${lockVisibleAfter} WIB`}
                          </p>
                          {m.accessLock?.lockedAt && (
                            <p className="text-[10px] font-bold text-red-500 mt-0.5">Dikunci: {new Date(m.accessLock.lockedAt).toLocaleString("id-ID")}</p>
                          )}
                          {m.accessLock && isMagang && (
                            <p className="mt-2 rounded-[8px] bg-red-50 px-2.5 py-1.5 text-[10px] font-bold leading-snug text-red-600">
                              Akses ditangguhkan. Detail dan pembukaan akses tersedia di panel Akses Ditangguhkan.
                            </p>
                          )}
                        </div>
                      </div>
                      {m.accessLock && !isMagang && (
                        <div className="mt-3 flex flex-wrap gap-2 pl-11">
                          <button
                            onClick={() => handleUnlockAccess(m.accessLock!)}
                            className="h-7 rounded-[7px] bg-emerald-500 px-2.5 text-[9px] font-black text-white transition-colors hover:bg-emerald-600"
                          >
                            Buka Akses
                          </button>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
                )}
              </>
            )}
          </div>

          {/* Jam Riset Terpenuhi */}
          <div className="bg-white border border-teal-200 rounded-[14px] shadow-sm overflow-hidden">
            <div className="px-4 py-3 border-b border-teal-100 bg-teal-50/50 flex items-center justify-between gap-3">
              <div>
                <h3 className="text-xs font-black text-foreground flex min-w-0 flex-wrap items-center gap-2">
                  <Clock size={13} className="text-teal-600 shrink-0" /> Jam Riset Sudah Terpenuhi
                  <span className="bg-teal-600 text-white text-[10px] font-black px-1.5 py-0.5 rounded-full">{risetHoursFulfilledMhs.length}</span>
                </h3>
                <p className="text-[10px] text-muted-foreground mt-1">Tidak hadir hari ini, tetapi sudah memenuhi minimal {risetWeeklyMinimumHours} jam minggu ini.</p>
              </div>
            </div>
            {isHolidayAttendanceDay ? (
              <div className="px-4 py-8 text-center">
                <p className="text-xs font-black text-foreground">Hari ini libur</p>
                <p className="text-[10px] text-muted-foreground mt-1">Status pemenuhan jam tidak menggantikan status libur.</p>
              </div>
            ) : !hasPassedAttendanceCutoff ? (
              <div className="px-4 py-8 text-center">
                <p className="text-xs font-black text-foreground">Menunggu batas presensi</p>
                <p className="text-[10px] text-muted-foreground mt-1">Status ditampilkan setelah pukul {lockVisibleAfter} WIB jika mahasiswa tidak hadir.</p>
              </div>
            ) : risetHoursFulfilledMhs.length === 0 ? (
              <div className="px-4 py-8 text-center">
                <p className="text-xs font-black text-foreground">Belum ada mahasiswa pada status ini</p>
                <p className="text-[10px] text-muted-foreground mt-1">Mahasiswa Riset yang hadir tetap tercatat sebagai Hadir atau WFH.</p>
              </div>
            ) : (
              <div className="max-h-[360px] overflow-y-auto">
                {risetHoursFulfilledMhs.map((student) => {
                  const currentHours = Number(
                    risetWeeklyHoursByStudentId[String(student.id)] ?? student.jamMingguIni ?? 0
                  );

                  return (
                    <div key={student.id} className="flex items-center gap-3 px-4 py-2.5 border-b border-border/50 last:border-0 hover:bg-teal-50/40 transition-colors">
                      {student.photoUrl ? (
                        <img src={student.photoUrl} alt={student.name} className="w-7 h-7 rounded-full object-cover shrink-0 border border-teal-200" />
                      ) : (
                        <div className={`w-7 h-7 rounded-full flex items-center justify-center text-[10px] font-black shrink-0 ${student.color}`}>{student.initials}</div>
                      )}
                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-black text-foreground truncate">{student.name}</p>
                        <p className="text-[10px] text-muted-foreground">{student.nim} · Tidak hadir hari ini</p>
                      </div>
                      <span className="shrink-0 rounded-full border border-teal-200 bg-teal-100 px-2 py-0.5 text-[9px] font-black text-teal-700">
                        {currentHours}j / min. {risetWeeklyMinimumHours}j
                      </span>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Jam Kurang */}
          <div className="bg-white border border-orange-200 rounded-[14px] shadow-sm overflow-hidden">
            <div className="px-4 py-3 border-b border-orange-100 bg-orange-50/50 flex items-center justify-between gap-3">
              <div>
                <h3 className="text-xs font-black text-foreground flex min-w-0 flex-wrap items-center gap-2"><TrendingDown size={13} className="text-orange-500 shrink-0" /> Jam Riset Mingguan Kurang<span className="bg-orange-500 text-white text-[10px] font-black px-1.5 py-0.5 rounded-full">{jamTidakTerpenuhiCount}</span></h3>
                <p className="text-[10px] text-muted-foreground mt-1">Rule mingguan Riset{risetWeeklyHoursLockAfter !== "-" ? `, lock setelah ${risetWeeklyHoursLockAfter}` : ""}.</p>
              </div>
            </div>
            {earlyCheckoutDisplay.slice(0, 2).map(alert => (
              <div key={alert.id} className="flex items-center gap-3 px-4 py-2.5 border-b border-orange-100 bg-orange-50/40 hover:bg-orange-50 transition-colors">
                {alert.studentPhotoUrl ? (
                  <img src={alert.studentPhotoUrl} alt={alert.studentName} className="w-8 h-8 rounded-full object-cover shrink-0 border border-orange-200" />
                ) : (
                  <div className="w-8 h-8 rounded-full flex items-center justify-center text-[10px] font-black shrink-0 bg-orange-500 text-white">{alert.studentInitials}</div>
                )}
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-black text-foreground">{alert.studentName}</p>
                  <p className="text-[10px] text-muted-foreground line-clamp-1">Checkout kurang dari batas magang</p>
                </div>
                <div className="text-right shrink-0">
                  <p className="text-xs font-black text-orange-600">{alert.durationHours ?? "-"}j/{alert.requiredHours ?? "-"}j</p>
                </div>
                <button onClick={() => markEarlyCheckoutAsRead(alert)} className="flex items-center gap-1 h-6 px-2 bg-orange-100 hover:bg-orange-500 text-orange-600 hover:text-white text-[9px] font-black rounded-[6px] transition-all shrink-0">
                  {alert.read ? "Dibaca" : "Baca"}
                </button>
              </div>
            ))}
            {risetLowHours.slice(0, 3).map(m => (
              <div key={m.id} className="flex items-center gap-3 px-4 py-2.5 border-b border-border/50 last:border-0 hover:bg-slate-50 transition-colors">
                {m.studentPhotoUrl ? (
                  <img src={m.studentPhotoUrl} alt={m.studentName} className="w-7 h-7 rounded-full object-cover shrink-0 border border-slate-200" />
                ) : (
                  <div className={`w-7 h-7 rounded-full flex items-center justify-center text-[10px] font-black shrink-0 ${m.studentColor}`}>{m.studentInitials}</div>
                )}
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-black text-foreground">{m.studentName}</p>
                  <p className="text-[10px] text-muted-foreground">
                    Riset mingguan{risetWeeklyUnderHourLockIdSet.has(String(m.studentId)) || isRisetWeeklyHoursLock(getAccessLockForStudent(m.studentId)) ? " - akses terkunci" : hasPassedRisetWeeklyHoursLock ? " - masuk window lock" : ""}
                  </p>
                </div>
                <div className="text-right shrink-0"><p className="text-xs font-black text-orange-600">{m.currentHours || 0}j/{m.targetHours || 0}j</p></div>
                <button onClick={() => handleSendWarning(m)} className="flex items-center gap-1 h-6 px-2 bg-orange-100 hover:bg-orange-500 text-orange-600 hover:text-white text-[9px] font-black rounded-[6px] transition-all shrink-0"><Bell size={9} /> Kirim</button>
              </div>
            ))}
            {earlyCheckoutDisplay.length === 0 && risetLowHours.length === 0 && (
              <div className="px-4 py-8 text-center">
                <p className="text-xs font-black text-foreground">Tidak ada pelanggaran jam Riset mingguan</p>
                <p className="text-[10px] text-muted-foreground mt-1">Mahasiswa Riset yang kurang jam akan muncul dari rule mingguan backend.</p>
              </div>
            )}
          </div>

          {/* Akses Ditangguhkan */}
          <div className="bg-white border border-rose-300 rounded-[14px] shadow-sm overflow-hidden">
            <div className="px-4 py-3 border-b border-rose-200 bg-rose-50/60 flex items-center justify-between gap-3">
              <h3 className="text-xs font-black text-foreground flex min-w-0 flex-wrap items-center gap-2">
                <Lock size={13} className="text-rose-700 shrink-0" /> Akses Ditangguhkan
                <span className="bg-rose-700 text-white text-[10px] font-black px-1.5 py-0.5 rounded-full">{accessLockSearch.trim() ? `${filteredAccessLocks.length}/${uniqueAccessLocks.length}` : uniqueAccessLocks.length}</span>
              </h3>
            </div>
            {uniqueAccessLocks.length === 0 ? (
              <div className="px-4 py-8 text-center">
                <p className="text-xs font-black text-foreground">Tidak ada akses ditangguhkan</p>
                <p className="text-[10px] text-muted-foreground mt-1">Semua mahasiswa memiliki akses sistem yang aktif.</p>
              </div>
            ) : (
              <>
                <div className="border-b border-rose-100 px-4 py-2.5">
                  <div className="flex h-9 items-center gap-2 rounded-[10px] border border-rose-100 bg-white px-3 text-rose-600">
                    <Search size={14} />
                    <input
                      value={accessLockSearch}
                      onChange={(event) => setAccessLockSearch(event.target.value)}
                      placeholder="Cari nama, NIM, alasan..."
                      className="min-w-0 flex-1 bg-transparent text-xs font-bold text-foreground outline-none placeholder:text-muted-foreground/60"
                    />
                    {accessLockSearch && (
                      <button onClick={() => setAccessLockSearch("")} className="text-[10px] font-black text-muted-foreground hover:text-rose-700">
                        Reset
                      </button>
                    )}
                  </div>
                </div>
                {filteredAccessLocks.length === 0 ? (
                  <div className="px-4 py-8 text-center">
                    <p className="text-xs font-black text-foreground">Tidak ada hasil pencarian</p>
                    <p className="text-[10px] text-muted-foreground mt-1">Coba gunakan nama, NIM, tipe, atau alasan lock.</p>
                  </div>
                ) : (
              <div className="max-h-[315px] overflow-y-auto">
                {filteredAccessLocks.map(lock => (
                  <div key={lock.id} className="px-4 py-3 border-b border-border/50 last:border-0 hover:bg-rose-50/30 transition-colors">
                    <div className="flex items-start gap-3">
                      {lock.studentPhotoUrl ? (
                        <img src={lock.studentPhotoUrl} alt={lock.studentName} className="w-8 h-8 rounded-full object-cover shrink-0 border border-rose-200" />
                      ) : (
                        <div className="w-8 h-8 rounded-full flex items-center justify-center text-[10px] font-black shrink-0 bg-rose-700 text-white">
                          {lock.studentInitials}
                        </div>
                      )}
                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-black text-foreground leading-snug break-words">{lock.studentName}</p>
                        <p className="text-[10px] text-muted-foreground">{lock.nim} Â· {getStudentTypeLabel(lock.studentId, lock.studentType)}</p>
                        <div className="mt-1.5 rounded-[9px] border border-rose-100 bg-rose-50 px-2.5 py-2">
                          <p className="text-[9px] font-black uppercase tracking-wide text-rose-500">Alasan Ditangguhkan</p>
                          <p className="text-[10px] font-black text-rose-700 mt-0.5">{getLockReasonLabel(lock.reason, lock.reasonLabel)}</p>
                        </div>
                        {getLockReasonDetail(lock) && (
                          <p className="text-[10px] text-muted-foreground mt-1.5 leading-snug">{getLockReasonDetail(lock)}</p>
                        )}
                        {lock.lockedAt && (
                          <p className="text-[10px] text-muted-foreground mt-0.5">
                            {new Date(lock.lockedAt).toLocaleString("id-ID")}
                          </p>
                        )}
                      </div>
                    </div>
                    <div className="mt-2 pl-11">
                      <button
                        onClick={() => handleUnlockAccess(lock)}
                        className="h-7 rounded-[7px] bg-rose-700 hover:bg-rose-800 px-2.5 text-[9px] font-black text-white transition-colors flex items-center gap-1"
                      >
                        <UserCheck size={10} /> Beri Akses Kembali
                      </button>
                    </div>
                  </div>
                ))}
              </div>
                )}
              </>
            )}
          </div>
        </div>

        {/* Piket Mingguan */}
        <div className="bg-white border border-red-200 rounded-[14px] shadow-sm overflow-hidden">
          <div className="px-5 py-4 border-b border-red-100 bg-red-50/40 flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
            <div>
              <h2 className="text-sm font-black text-foreground flex flex-wrap items-center gap-2">
                <AlertTriangle size={15} className="text-red-500" /> Mahasiswa Tidak Melaksanakan Piket
                <span className="bg-red-500 text-white text-[10px] font-black px-1.5 py-0.5 rounded-full">{weeklyPicketMisses.length}</span>
              </h2>
              <p className="mt-1 text-[10px] font-semibold text-muted-foreground">
                Periode {weeklyPicketPeriodLabel}. Data direset setiap hari {weeklyPicketPeriod.resetDay || "Minggu"}.
              </p>
            </div>
            <Link to="/operator/piket" className="inline-flex h-8 w-fit items-center justify-center gap-1 rounded-[8px] border border-red-200 bg-white px-3 text-[10px] font-black text-red-600 hover:bg-red-50">
              Kelola Piket <ChevronRight size={12} strokeWidth={3} />
            </Link>
          </div>
          {weeklyPicketUnavailable ? (
            <div className="px-5 py-8 text-center">
              <p className="text-xs font-black text-foreground">Data piket mingguan belum tersedia</p>
              <p className="mt-1 text-[10px] text-muted-foreground">Tambahkan endpoint backend untuk mengirim daftar mahasiswa yang tidak submit piket pada minggu berjalan.</p>
            </div>
          ) : weeklyPicketMisses.length === 0 ? (
            <div className="px-5 py-8 text-center">
              <p className="text-xs font-black text-foreground">Tidak ada pelanggaran piket minggu ini</p>
              <p className="mt-1 text-[10px] text-muted-foreground">Mahasiswa yang melewatkan jadwal piket akan muncul di tabel ini.</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[760px] text-left text-xs">
                <thead>
                  <tr className="border-b border-red-100 bg-red-50/50">
                    <th className="px-5 py-3 font-black uppercase tracking-wide text-muted-foreground">Mahasiswa</th>
                    <th className="px-5 py-3 font-black uppercase tracking-wide text-muted-foreground">Jumlah</th>
                    <th className="px-5 py-3 font-black uppercase tracking-wide text-muted-foreground">Tanggal Tidak Piket</th>
                    <th className="px-5 py-3 font-black uppercase tracking-wide text-muted-foreground">Tugas</th>
                    <th className="px-5 py-3 font-black uppercase tracking-wide text-muted-foreground">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {weeklyPicketMisses.map((item) => (
                    <tr key={item.id} className="hover:bg-red-50/20 transition-colors">
                      <td className="px-5 py-3">
                        <div className="flex items-center gap-3">
                          {item.studentPhotoUrl ? (
                            <img src={item.studentPhotoUrl} alt={item.studentName} className="flex h-8 w-8 shrink-0 rounded-full object-cover border border-red-200" />
                          ) : (
                            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-red-500 text-[10px] font-black text-white">{item.studentInitials}</div>
                          )}
                          <div className="min-w-0">
                            <p className="truncate text-xs font-black text-foreground">{item.studentName}</p>
                            <p className="text-[10px] text-muted-foreground">{item.nim}</p>
                          </div>
                        </div>
                      </td>
                      <td className="px-5 py-3">
                        <span className="rounded-full bg-red-100 px-2.5 py-1 text-[10px] font-black text-red-600">{item.missedCount}x</span>
                      </td>
                      <td className="px-5 py-3 text-muted-foreground">
                        {item.missedDates.length > 0 ? item.missedDates.map(formatDateYmd).join(", ") : formatDateYmd(item.lastMissedDate || "")}
                      </td>
                      <td className="px-5 py-3">
                        <p className="max-w-[260px] truncate font-bold text-foreground">{item.taskNames.length > 0 ? item.taskNames.join(", ") : "-"}</p>
                      </td>
                      <td className="px-5 py-3">
                        <span className="rounded-full border border-red-200 bg-red-50 px-2.5 py-1 text-[10px] font-black text-red-600">{item.status || "Belum Submit"}</span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Main Grid */}
        <div className="grid grid-cols-1 xl:grid-cols-12 gap-5 items-start">
          <div className="xl:col-span-8 flex flex-col gap-5">

            {/* Pengunduran Diri */}
            {resignationRequests.length > 0 && (
              <div className="bg-white border border-red-200 rounded-[14px] shadow-sm overflow-hidden">
                <div className="px-5 py-4 border-b border-red-100 bg-red-50/30 flex items-center justify-between">
                  <h2 className="text-sm font-black text-foreground flex items-center gap-2">
                    <AlertCircle size={15} className="text-red-500" /> Pengunduran Diri
                    <span className="bg-red-500 text-white text-[10px] font-black px-1.5 py-0.5 rounded-full">{resignCount}</span>
                  </h2>
                </div>
                {resignationRequests.map(r => (
                  <div key={r.id} className="px-5 py-4 flex items-center gap-4 border-b border-border/40 last:border-b-0">
                    {r.studentPhotoUrl ? (
                      <img src={r.studentPhotoUrl} alt={r.studentName} className="w-10 h-10 rounded-full object-cover shrink-0 border border-slate-200" />
                    ) : (
                      <div className={`w-10 h-10 rounded-full flex items-center justify-center text-sm font-black shrink-0 ${r.studentColor}`}>{r.studentInitials}</div>
                    )}
                    <div className="flex-1 min-w-0">
                      <p className="font-black text-foreground text-sm">{r.studentName} <span className="text-xs font-medium text-muted-foreground">({r.studentNim})</span></p>
                      <p className="text-xs text-muted-foreground mt-0.5 line-clamp-1">{r.reason}</p>
                      <p className="text-[10px] text-muted-foreground mt-1">Dosen pembimbing: {r.advisorName}</p>
                    </div>
                    <div className="flex flex-col items-end gap-2 shrink-0">
                      <div className="flex items-center gap-1.5">
                        {[{ label: "Pengajuan", done: true }, { label: "Admin", done: r.statusOperator === "Diteruskan" }, { label: "Dosen Pembimbing", done: r.statusDosen === "Disetujui" }].map((step, i, arr) => (
                          <div key={i} className="flex items-center gap-1">
                            <div className={`flex items-center gap-1 px-2 py-1 rounded-[6px] text-[9px] font-black ${step.done ? "bg-emerald-100 text-emerald-700" : "bg-slate-100 text-slate-500"}`}>
                              {step.done ? <Check size={8} strokeWidth={3} /> : <Clock size={8} />} {step.label}
                            </div>
                            {i < arr.length - 1 && <ArrowRight size={10} className="text-muted-foreground" />}
                          </div>
                        ))}
                      </div>
                      <span className={`rounded-full px-2 py-0.5 text-[10px] font-black ${r.finalStatus === "Disetujui"
                        ? "bg-emerald-100 text-emerald-700"
                        : r.finalStatus.includes("Ditolak")
                          ? "bg-red-100 text-red-600"
                          : r.finalStatus === "Menunggu Dosen"
                            ? "bg-blue-100 text-blue-700"
                            : "bg-amber-100 text-amber-700"
                        }`}>
                        {displayStatus(r.finalStatus)}
                      </span>
                      {r.statusOperator === "Menunggu" && (
                        <div className="flex gap-2">
                          <button onClick={() => handleWithdrawalReview(r.id, "Diteruskan")} className="flex items-center gap-1 h-8 px-3 bg-emerald-500 hover:bg-emerald-600 text-white text-xs font-black rounded-[8px] transition-colors"><Check size={12} strokeWidth={3} /> Teruskan</button>
                          <button onClick={() => handleWithdrawalReview(r.id, "Ditolak")} className="flex items-center gap-1 h-8 px-3 bg-red-50 hover:bg-red-100 text-red-600 text-xs font-black rounded-[8px] border border-red-200 transition-colors"><X size={12} strokeWidth={3} /> Tolak</button>
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* Aktivitas Terkini */}
            <div className="bg-white border border-border rounded-[14px] shadow-sm overflow-hidden">
              <div className="px-5 py-4 border-b border-border flex items-center justify-between">
                <h2 className="text-sm font-black text-foreground flex items-center gap-2"><Clock size={15} className="text-[#0AB600]" /> Aktivitas Terkini</h2>
                <Link to="/operator/audit" className="text-xs font-bold text-[#0AB600] flex items-center gap-0.5 hover:gap-1 transition-all">Audit Log <ChevronRight size={12} strokeWidth={3} /></Link>
              </div>
              <table className="w-full text-xs text-left">
                <thead><tr className="bg-slate-50 border-b border-border">
                  <th className="px-5 py-2.5 font-black text-muted-foreground uppercase tracking-wide">User</th>
                  <th className="px-5 py-2.5 font-black text-muted-foreground uppercase tracking-wide">Aksi</th>
                  <th className="px-5 py-2.5 font-black text-muted-foreground uppercase tracking-wide">Target</th>
                  <th className="px-5 py-2.5 font-black text-muted-foreground uppercase tracking-wide">Waktu</th>
                </tr></thead>
                <tbody className="divide-y divide-border">
                  {auditLogs.slice(0, 5).map(log => (
                    <tr key={log.id} className="hover:bg-slate-50 transition-colors">
                      <td className="px-5 py-2.5">
                        <div className="flex items-center gap-2">
                          {log.userPhotoUrl ? (
                            <img src={log.userPhotoUrl} alt={log.userName} className="w-6 h-6 rounded-full object-cover shrink-0 border border-slate-200" />
                          ) : (
                            <div className={`w-6 h-6 rounded-full flex items-center justify-center text-[9px] font-black shrink-0 ${log.userColor}`}>{log.userInitials}</div>
                          )}
                          <span className="font-black text-foreground truncate max-w-[90px]">{log.userName.split(" ")[0]}</span>
                        </div>
                      </td>
                      <td className="px-5 py-2.5"><span className={`px-2 py-0.5 rounded-md font-black text-[10px] ${log.action === "Login" ? "bg-blue-100 text-blue-700" : log.action === "Create" ? "bg-emerald-100 text-emerald-700" : log.action === "Update" ? "bg-amber-100 text-amber-700" : log.action === "Delete" ? "bg-red-100 text-red-600" : log.action === "Approve" ? "bg-emerald-100 text-emerald-700" : "bg-purple-100 text-purple-700"}`}>{log.action}</span></td>
                      <td className="px-5 py-2.5 text-muted-foreground truncate max-w-[160px]">{log.target}</td>
                      <td className="px-5 py-2.5 text-[10px] font-semibold text-muted-foreground">{log.timestamp}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Ringkasan Riset */}
            <div className="bg-white border border-border rounded-[14px] shadow-sm overflow-hidden">
              <div className="px-5 py-4 border-b border-border flex items-center justify-between">
                <h2 className="text-sm font-black text-foreground flex items-center gap-2"><FlaskConical size={15} className="text-[#0AB600]" /> Ringkasan Riset</h2>
                <Link to="/operator/riset" className="text-xs font-bold text-[#0AB600] flex items-center gap-0.5 hover:gap-1 transition-all">Semua <ChevronRight size={12} strokeWidth={3} /></Link>
              </div>
              <div className="max-h-[460px] divide-y divide-border overflow-y-auto">
                {researches.map(r => (
                  <div key={r.id} className="flex items-center gap-4 px-5 py-3.5 hover:bg-slate-50 transition-colors">
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-black text-foreground line-clamp-1">{r.title}</p>
                      <p className="text-[10px] text-muted-foreground mt-0.5">{r.supervisor} {r.mahasiswaCount + r.dosenCount} anggota</p>
                    </div>
                    <div className="flex items-center gap-3 shrink-0">
                      <div className="w-24 h-1.5 bg-slate-100 rounded-full"><div className="bg-[#0AB600] h-1.5 rounded-full" style={{ width: `${r.progress}%` }} /></div>
                      <span className="text-[10px] font-black text-[#0AB600] w-8 text-right">{r.progress}%</span>
                      <span className={`text-[10px] font-black px-2 py-0.5 rounded-full ${r.status === "Aktif" ? "bg-emerald-100 text-emerald-700" : "bg-slate-100 text-slate-600"}`}>{r.status}</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Right 4 cols */}
          <div className="xl:col-span-4 flex flex-col gap-5">
            <div className="bg-white border border-border rounded-[14px] shadow-sm overflow-hidden">
              <div className="px-5 py-4 border-b border-border flex items-center justify-between">
                <h2 className="text-sm font-black text-foreground flex items-center gap-2">
                  <AlertTriangle size={14} className="text-amber-500" /> Pengajuan Menunggu
                  {(cutiMenunggu + izinPiketMenunggu + kelulusanMenunggu) > 0 && <span className="bg-amber-500 text-white text-[10px] font-black px-1.5 py-0.5 rounded-full">{cutiMenunggu + izinPiketMenunggu + kelulusanMenunggu}</span>}
                </h2>
              </div>
              <div className="p-4 flex flex-col gap-3 max-h-[400px] overflow-y-auto [&::-webkit-scrollbar]:hidden [-ms-overflow-style:none] [scrollbar-width:none]">
                {pendingCuti.map(l => (
                  <div key={l.id} className="p-3.5 border border-amber-100 bg-amber-50/40 rounded-[12px]">
                    <div className="flex items-start gap-2 mb-2">
                      {l.mahasiswaPhotoUrl ? (
                        <img src={l.mahasiswaPhotoUrl} alt={l.mahasiswaNama} className="w-8 h-8 rounded-full object-cover shrink-0 border border-amber-200" />
                      ) : (
                        <div className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-black shrink-0 ${l.mahasiswaColor}`}>{l.mahasiswaInitials}</div>
                      )}
                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-black text-foreground">{l.mahasiswaNama}</p>
                        <p className="text-[10px] text-muted-foreground">{l.periodeStart} {l.durasi} hari</p>
                        <span className="text-[9px] font-black text-amber-700 bg-amber-100 px-1.5 py-0.5 rounded">{getLeaveTypeLabel(l.jenis)}</span>
                      </div>
                    </div>
                    <div className="flex gap-1.5">
                      <button onClick={() => handleLeave(l.id, "Disetujui")} className="flex-1 py-1.5 bg-emerald-500 hover:bg-emerald-600 text-white text-[10px] font-black rounded-[8px] transition-colors flex items-center justify-center gap-1"><Check size={10} strokeWidth={3} /> Setujui</button>
                      <button onClick={() => handleLeave(l.id, "Ditolak")} className="flex-1 py-1.5 bg-red-50 text-red-600 text-[10px] font-black rounded-[8px] border border-red-200 hover:bg-red-100 transition-colors flex items-center justify-center gap-1"><X size={10} strokeWidth={3} /> Tolak</button>
                    </div>
                  </div>
                ))}
                {pendingPicketLeaves.map((item) => (
                  <div key={item.id} className="p-3.5 border border-blue-100 bg-blue-50/40 rounded-[12px]">
                    <div className="flex items-start gap-2">
                      <div className="w-8 h-8 rounded-full flex items-center justify-center text-xs font-black shrink-0 bg-blue-600 text-white">
                        {item.studentName.split(" ").map((part) => part[0] || "").join("").slice(0, 2).toUpperCase() || "M"}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-black text-foreground">{item.studentName}</p>
                        <p className="text-[10px] text-muted-foreground mt-0.5">{formatDateYmd(item.date)}{item.taskName ? ` · ${item.taskName}` : ""}</p>
                        <p className="text-[10px] text-muted-foreground mt-1 line-clamp-2">{item.reason}</p>
                      </div>
                      <span className="rounded-full border border-blue-200 bg-white px-2 py-1 text-[9px] font-black text-blue-700">Izin Piket</span>
                    </div>
                    <Link to="/operator/piket" className="mt-2 flex items-center justify-center gap-1 py-1.5 text-[10px] font-black text-blue-600 hover:bg-blue-50 rounded-[8px] transition-colors border border-transparent hover:border-blue-100">
                      Proses Izin Piket <ArrowRight size={10} strokeWidth={3} />
                    </Link>
                  </div>
                ))}
                {pendingKelulusan.map(s => (
                  <div key={s.id} className="p-3.5 border border-rose-100 bg-rose-50/40 rounded-[12px]">
                    <div className="flex items-start gap-2">
                      {s.mahasiswaPhotoUrl ? (
                        <img src={s.mahasiswaPhotoUrl} alt={s.mahasiswaNama} className="w-8 h-8 rounded-full object-cover shrink-0 border border-rose-200" />
                      ) : (
                        <div className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-black shrink-0 ${s.mahasiswaColor}`}>{s.mahasiswaInitials}</div>
                      )}
                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-black text-foreground">{s.mahasiswaNama}</p>
                        <p className="text-[10px] font-bold text-muted-foreground mt-0.5 uppercase tracking-wide">{s.jenis}</p>
                        <p className="text-[10px] font-medium text-muted-foreground mt-1">Diajukan: <span className="font-bold">{s.tanggal}</span></p>
                      </div>
                      <div className="flex items-center gap-1 bg-white border border-rose-200 px-2 py-1 rounded-[6px] shadow-sm">
                        <Clock size={10} className="text-rose-500" />
                        <span className="text-[9px] font-black text-rose-700">{s.status}</span>
                      </div>
                    </div>
                    <Link to="/operator/kelulusan" className="mt-2 flex items-center justify-center gap-1 py-1.5 text-[10px] font-black text-rose-600 hover:bg-rose-50 rounded-[8px] transition-colors border border-transparent hover:border-rose-100">Proses Kelulusan <ArrowRight size={10} strokeWidth={3} /></Link>
                  </div>
                ))}
                {cutiMenunggu === 0 && izinPiketMenunggu === 0 && pendingKelulusan.length === 0 && (
                  <div className="px-3 py-8 text-center">
                    <p className="text-xs font-black text-foreground">Tidak ada pengajuan menunggu</p>
                    <p className="mt-1 text-[10px] text-muted-foreground">Pengajuan baru akan muncul otomatis di panel ini.</p>
                  </div>
                )}
              </div>
              <div className="px-4 py-2.5 border-t border-border bg-slate-50/50 grid grid-cols-3 gap-2">
                <Link to="/operator/cuti" className="text-center text-[10px] font-bold text-amber-600 hover:underline">Semua Cuti</Link>
                <Link to="/operator/piket" className="text-center text-[10px] font-bold text-blue-600 hover:underline">Semua Izin Piket</Link>
                <Link to="/operator/kelulusan" className="text-center text-[10px] font-bold text-rose-600 hover:underline">Semua Kelulusan</Link>
              </div>
            </div>
          </div>
        </div>
      </div>
    </OperatorLayout>
  );
}
