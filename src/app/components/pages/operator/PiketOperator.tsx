import React from "react";
import {
  AlertTriangle,
  CalendarDays,
  CalendarOff,
  History,
  ImageIcon,
  Loader2,
  Plus,
  Search,
  Shuffle,
  Trash2,
  UserCog,
  X,
} from "lucide-react";
import { Link } from "react-router";
import { OperatorLayout } from "../../templates/OperatorLayout";
import { apiDelete, apiGet, apiPatch, apiPost, getStoredUser } from "../../../lib/api";
import { useConfirmDialog } from "../../molecules/ConfirmDialog";
import {
  PicketAssignment,
  PicketHoliday,
  PicketLeaveRequest,
  PicketStudentDay,
  PicketSubmission,
  PicketTask,
  getDuplicatePicketTaskAssignments,
  getJakartaDateKey,
  getManualPicketSchedulePayloads,
  getManualPicketTaskPayload,
  getPicketAssignmentStatus,
  getPicketScheduleGeneratePayload,
  getPicketTaskConflict,
  isPicketAssignmentSubmitted,
  mapPicketAssignment,
  mapPicketHoliday,
  mapPicketLeaveRequest,
  mapPicketStudentDay,
  mapPicketSubmission,
  mapPicketTask,
  mergePicketAssignmentsWithSubmissions,
} from "../../../lib/picket";

type StudentOption = {
  id: string;
  name: string;
  nim?: string | null;
  initials: string;
  tipe?: string | null;
};

type PicketSettings = {
  peoplePerDay: number;
  randomizeEnabled: boolean;
  weeklySchedule: WeeklyPicketDay[];
};

type WeeklyPicketDay = {
  dayOfWeek: number;
  label: string;
  enabled: boolean;
  peoplePerDay: number;
  studentIds: string[];
};

type ScheduleForm = {
  studentId: string;
  taskId: string;
  status: string;
  notes: string;
};

const WEEKDAY_OPTIONS: WeeklyPicketDay[] = [
  { dayOfWeek: 1, label: "Senin", enabled: true, peoplePerDay: 2, studentIds: [] },
  { dayOfWeek: 2, label: "Selasa", enabled: true, peoplePerDay: 2, studentIds: [] },
  { dayOfWeek: 3, label: "Rabu", enabled: true, peoplePerDay: 2, studentIds: [] },
  { dayOfWeek: 4, label: "Kamis", enabled: true, peoplePerDay: 2, studentIds: [] },
  { dayOfWeek: 5, label: "Jumat", enabled: true, peoplePerDay: 2, studentIds: [] },
];

function normalizeStudentIds(value: any): string[] {
  const rows = Array.isArray(value) ? value : [];
  return rows
    .map((item) => String(item?.studentId || item?.student_id || item?.id || item || ""))
    .filter(Boolean);
}

function normalizeWeeklySchedule(value: any, fallbackPeoplePerDay = 2): WeeklyPicketDay[] {
  const rows = Array.isArray(value) ? value : [];
  return WEEKDAY_OPTIONS.map((day) => {
    const match = rows.find((item: any) => Number(item?.dayOfWeek ?? item?.day_of_week ?? item?.weekday) === day.dayOfWeek);
    return {
      ...day,
      enabled: true,
      peoplePerDay: Number(match?.peoplePerDay ?? match?.people_per_day ?? match?.quota ?? fallbackPeoplePerDay) || fallbackPeoplePerDay,
      studentIds: normalizeStudentIds(match?.studentIds ?? match?.student_ids ?? match?.memberIds ?? match?.member_ids ?? match?.students ?? match?.members),
    };
  });
}

const statusStyle: Record<string, string> = {
  Ditugaskan: "border-slate-200 bg-slate-50 text-slate-700",
  Menunggu: "border-amber-200 bg-amber-50 text-amber-700",
  Disetujui: "border-emerald-200 bg-emerald-50 text-emerald-700",
  Izin: "border-cyan-200 bg-cyan-50 text-cyan-700",
  Ditolak: "border-red-200 bg-red-50 text-red-600",
  Terkirim: "border-blue-200 bg-blue-50 text-blue-700",
  Valid: "border-emerald-200 bg-emerald-50 text-emerald-700",
  Bermasalah: "border-red-200 bg-red-50 text-red-600",
  Libur: "border-violet-200 bg-violet-50 text-violet-700",
  "Selesai Otomatis — WFH": "border-indigo-200 bg-indigo-50 text-indigo-700",
};

const emptyScheduleForm: ScheduleForm = {
  studentId: "",
  taskId: "",
  status: "Ditugaskan",
  notes: "",
};

function normalizeStudent(row: any): StudentOption {
  const name = row?.name || row?.student_name || row?.studentName || "Mahasiswa";
  return {
    id: String(row?.id || row?.student_id || row?.studentId || ""),
    name,
    nim: row?.nim || row?.student_nim || row?.studentNim || null,
    initials: row?.initials || name.slice(0, 2).toUpperCase(),
    tipe: row?.tipe || row?.student_type || row?.studentType || null,
  };
}

function Badge({ status }: { status?: string | null }) {
  const label = status || "-";
  return (
    <span className={`rounded-full border px-2.5 py-1 text-[10px] font-black ${statusStyle[label] || "border-slate-200 bg-slate-50 text-slate-600"}`}>
      {label}
    </span>
  );
}

function getPicketScheduleErrorMessage(err: any, fallback: string) {
  const message = String(err?.body?.message || err?.message || "").trim();
  if (/belum ada tugas piket aktif/i.test(message)) {
    return "Tambahkan atau aktifkan tugas piket terlebih dahulu sebelum resync.";
  }
  if (err?.status === 409 && (err?.body?.code === "PICKET_TASK_ALREADY_ASSIGNED" || /tugas.*(?:sudah|telah).*digunakan/i.test(message))) {
    return message || "Tugas piket tersebut sudah diberikan kepada mahasiswa lain pada tanggal yang sama.";
  }
  if (err?.status === 409 && err?.body?.code === "PICKET_STUDENT_ALREADY_SCHEDULED") {
    return message || "Mahasiswa tersebut sudah memiliki jadwal piket pada tanggal yang sama.";
  }
  return message || fallback;
}

export default function PiketOperator() {
  const user = getStoredUser();
  const reviewSectionRef = React.useRef<HTMLElement | null>(null);
  const isStudentPicShell = user?.role === "mahasiswa";
  const [date, setDate] = React.useState(getJakartaDateKey());
  const [loading, setLoading] = React.useState(true);
  const [saving, setSaving] = React.useState(false);
  const [error, setError] = React.useState("");
  const [info, setInfo] = React.useState("");
  const [settings, setSettings] = React.useState<PicketSettings>({
    peoplePerDay: 2,
    randomizeEnabled: true,
    weeklySchedule: normalizeWeeklySchedule([], 2),
  });
  const [tasks, setTasks] = React.useState<PicketTask[]>([]);
  const [taskName, setTaskName] = React.useState("");
  const [taskDescription, setTaskDescription] = React.useState("");
  const [students, setStudents] = React.useState<StudentOption[]>([]);
  const [studentDays, setStudentDays] = React.useState<PicketStudentDay[]>([]);
  const [managerIds, setManagerIds] = React.useState<string[]>([]);
  const [assignments, setAssignments] = React.useState<PicketAssignment[]>([]);
  const [submissions, setSubmissions] = React.useState<PicketSubmission[]>([]);
  const [leaveRequests, setLeaveRequests] = React.useState<PicketLeaveRequest[]>([]);
  const [query, setQuery] = React.useState("");
  const [selectedDayOfWeek, setSelectedDayOfWeek] = React.useState(1);
  const [editingScheduleId, setEditingScheduleId] = React.useState<string | null>(null);
  const [scheduleForm, setScheduleForm] = React.useState<ScheduleForm>(emptyScheduleForm);
  const [scheduleTaskMode, setScheduleTaskMode] = React.useState<"existing" | "manual">("existing");
  const [manualScheduleTaskName, setManualScheduleTaskName] = React.useState("");
  const [manualScheduleTaskDescription, setManualScheduleTaskDescription] = React.useState("");
  const [allowed, setAllowed] = React.useState(user?.role === "operator");
  const [holidays, setHolidays] = React.useState<PicketHoliday[]>([]);
  const [holidayForm, setHolidayForm] = React.useState({ date: "", name: "", notes: "" });
  const [editingHolidayId, setEditingHolidayId] = React.useState<string | null>(null);
  const { confirm, confirmDialog } = useConfirmDialog();

  const holidayRange = React.useMemo(() => {
    const current = new Date(`${date}T00:00:00`);
    const year = current.getFullYear();
    const month = current.getMonth();
    const startDate = `${year}-${String(month + 1).padStart(2, "0")}-01`;
    const endDate = new Date(year, month + 1, 0);
    return {
      startDate,
      endDate: `${year}-${String(month + 1).padStart(2, "0")}-${String(endDate.getDate()).padStart(2, "0")}`,
    };
  }, [date]);

  const loadData = React.useCallback(async () => {
    setLoading(true);
    setError("");
    let loadedSettings: PicketSettings | null = null;
    try {
      if (user?.role === "mahasiswa") {
        const managerCheck = await apiGet<any>("/picket/managers/me");
        const isManager = Boolean(managerCheck?.isManager);
        setAllowed(isManager);
        if (!isManager) {
          setError("Anda bukan penanggung jawab piket.");
          setLoading(false);
          return null;
        }
      } else {
        setAllowed(true);
      }

      const [settingsRes, taskRes, studentRes, managerRes, overviewRes, schedulesRes, leaveRes, holidayRes, submissionsRes, studentDaysRes] = await Promise.allSettled([
        apiGet<any>("/picket/settings"),
        apiGet<any>("/picket/tasks?includeInactive=true"),
        apiGet<any>("/picket/students"),
        apiGet<any>("/picket/managers"),
        apiGet<any>(`/picket/operator/overview?date=${encodeURIComponent(date)}&_=${Date.now()}`),
        apiGet<any>(`/picket/schedules?date=${encodeURIComponent(date)}&_=${Date.now()}`),
        apiGet<any>(`/picket/leave-requests?_=${Date.now()}`),
        apiGet<any>(`/picket/holidays?startDate=${holidayRange.startDate}&endDate=${holidayRange.endDate}&_=${Date.now()}`),
        apiGet<any>(`/picket/submissions?date=${encodeURIComponent(date)}&_=${Date.now()}`),
        apiGet<any>(`/picket/student-days?_=${Date.now()}`),
      ]);
      let overviewAssignmentRowsLoaded = false;
      let overviewSubmissions: PicketSubmission[] | null = null;
      let overviewAssignments: PicketAssignment[] | null = null;

      if (settingsRes.status === "fulfilled") {
        const raw = settingsRes.value?.settings || settingsRes.value || {};
        const peoplePerDay = Number(raw.peoplePerDay ?? raw.people_per_day ?? raw.dailyQuota ?? raw.daily_quota) || 2;
        loadedSettings = {
          peoplePerDay,
          randomizeEnabled: Boolean(raw.randomizeEnabled ?? raw.randomize_enabled ?? true),
          weeklySchedule: normalizeWeeklySchedule(raw.weeklySchedule ?? raw.weekly_schedule ?? raw.recurringSchedule ?? raw.recurring_schedule, peoplePerDay),
        };
      }

      if (studentDaysRes.status === "fulfilled") {
        const rows = Array.isArray(studentDaysRes.value)
          ? studentDaysRes.value
          : studentDaysRes.value?.items || studentDaysRes.value?.assignments || [];
        const mappedStudentDays = rows.map(mapPicketStudentDay).filter((item: PicketStudentDay) => item.studentId && Number.isInteger(item.dayId));
        setStudentDays(mappedStudentDays);
        const baseSettings = loadedSettings || {
          peoplePerDay: 2,
          randomizeEnabled: false,
          weeklySchedule: normalizeWeeklySchedule([], 2),
        };
        loadedSettings = {
          ...baseSettings,
          weeklySchedule: baseSettings.weeklySchedule.map((day) => ({
            ...day,
            peoplePerDay: Math.max(1, mappedStudentDays.filter((item: PicketStudentDay) => item.dayId === day.dayOfWeek).length),
            studentIds: mappedStudentDays.filter((item: PicketStudentDay) => item.dayId === day.dayOfWeek).map((item: PicketStudentDay) => item.studentId),
          })),
        };
      }
      if (loadedSettings) setSettings(loadedSettings);

      if (taskRes.status === "fulfilled") {
        const rows = Array.isArray(taskRes.value) ? taskRes.value : taskRes.value?.tasks || taskRes.value?.items || [];
        setTasks(rows.map(mapPicketTask));
      }

      if (studentRes.status === "fulfilled") {
        const rows = Array.isArray(studentRes.value) ? studentRes.value : studentRes.value?.students || studentRes.value?.items || [];
        setStudents(rows.map(normalizeStudent).filter((item) => item.id));
      }

      if (managerRes.status === "fulfilled") {
        const rows = Array.isArray(managerRes.value) ? managerRes.value : managerRes.value?.managers || managerRes.value?.studentIds || [];
        setManagerIds(rows.map((item: any) => String(item?.student_id || item?.studentId || item?.id || item)).filter(Boolean));
      }

      if (overviewRes.status === "fulfilled") {
        const raw = overviewRes.value || {};
        const rows = raw.schedules || raw.assignments || [];
        overviewAssignmentRowsLoaded = rows.length > 0;
        overviewAssignments = rows.map(mapPicketAssignment);
        overviewSubmissions = (raw.submissions || []).map(mapPicketSubmission);
        setAssignments(mergePicketAssignmentsWithSubmissions(overviewAssignments, overviewSubmissions));
      }

      if ((overviewRes.status !== "fulfilled" || !overviewAssignmentRowsLoaded) && schedulesRes.status === "fulfilled") {
        const rawSchedules = schedulesRes.value || {};
        const rows = Array.isArray(rawSchedules) ? rawSchedules : rawSchedules.items || rawSchedules.schedules || rawSchedules.assignments || [];
        setAssignments(rows.map(mapPicketAssignment));
      } else if (overviewRes.status !== "fulfilled") {
        setAssignments([]);
      }

      if (submissionsRes.status === "fulfilled") {
        const rows = Array.isArray(submissionsRes.value)
          ? submissionsRes.value
          : submissionsRes.value?.submissions || submissionsRes.value?.items || [];
        const mappedSubmissions = rows.map(mapPicketSubmission);
        setSubmissions(mappedSubmissions);
        if (overviewAssignments) {
          setAssignments(mergePicketAssignmentsWithSubmissions(overviewAssignments, overviewSubmissions || mappedSubmissions));
        }
      } else {
        setSubmissions(overviewSubmissions || []);
      }

      if (leaveRes.status === "fulfilled") {
        const rows = Array.isArray(leaveRes.value) ? leaveRes.value : leaveRes.value?.requests || [];
        setLeaveRequests(rows.map(mapPicketLeaveRequest));
      }
      if (holidayRes.status === "fulfilled") {
        const rows = Array.isArray(holidayRes.value)
          ? holidayRes.value
          : holidayRes.value?.holidays || holidayRes.value?.items || [];
        setHolidays(rows.map(mapPicketHoliday).sort((a: PicketHoliday, b: PicketHoliday) => a.date.localeCompare(b.date)));
      }
      return loadedSettings;
    } catch (err: any) {
      setError(err?.message || "Gagal memuat data piket.");
      return null;
    } finally {
      setLoading(false);
    }
  }, [date, holidayRange.endDate, holidayRange.startDate, user?.role]);

  React.useEffect(() => {
    void loadData();
  }, [loadData]);

  React.useEffect(() => {
    const refresh = () => void loadData();
    window.addEventListener("stas:picket-refresh", refresh);
    return () => window.removeEventListener("stas:picket-refresh", refresh);
  }, [loadData]);

  React.useEffect(() => {
    const dateDay = new Date(`${date}T00:00:00`).getDay();
    if (dateDay >= 1 && dateDay <= 5) {
      setSelectedDayOfWeek(dateDay);
    }
  }, [date]);

  const addTask = async () => {
    if (!taskName.trim()) {
      setError("Nama tugas piket wajib diisi.");
      return;
    }
    try {
      setSaving(true);
      await apiPost("/picket/tasks", { name: taskName.trim(), description: taskDescription.trim() || null, active: true });
      setTaskName("");
      setTaskDescription("");
      setInfo("Jenis tugas piket ditambahkan.");
      await loadData();
    } catch (err: any) {
      setError(err?.message || "Gagal menambah tugas piket.");
    } finally {
      setSaving(false);
    }
  };

  const toggleTask = async (task: PicketTask) => {
    try {
      await apiPatch(`/picket/tasks/${encodeURIComponent(task.id)}`, { active: !task.active });
      setTasks((prev) => prev.map((item) => item.id === task.id ? { ...item, active: !item.active } : item));
    } catch (err: any) {
      setError(err?.message || "Gagal mengubah status tugas.");
    }
  };

  const deleteTask = async (task: PicketTask) => {
    try {
      await apiDelete(`/picket/tasks/${encodeURIComponent(task.id)}`);
      setTasks((prev) => prev.filter((item) => item.id !== task.id));
    } catch (err: any) {
      setError(err?.message || "Gagal menghapus tugas piket.");
    }
  };

  const generateSchedule = React.useCallback(async (targetDate: string = date) => {
    try {
      setSaving(true);
      setError("");
      const payload = getPicketScheduleGeneratePayload(targetDate);
      await apiPost("/picket/schedules/generate", payload);
      await loadData();
      setInfo(`Jadwal tanggal ${targetDate} disinkronkan dari hari piket tetap. Setiap mahasiswa harus memperoleh tugas yang berbeda pada tanggal tersebut.`);
    } catch (err: any) {
      setError(getPicketScheduleErrorMessage(err, "Gagal generate jadwal piket."));
    } finally {
      setSaving(false);
    }
  }, [date, loadData]);

  const randomizeFixedStudentDays = async () => {
    const approved = await confirm({
      title: "Acak ulang seluruh hari piket tetap?",
      description: "Semua mahasiswa aktif akan memperoleh hari piket tetap baru yang berlaku mulai besok. Jadwal lama dan jadwal yang sudah memiliki submission tidak diubah.",
      confirmLabel: "Acak Ulang Hari Tetap",
      variant: "danger",
    });
    if (!approved) return;
    try {
      setSaving(true);
      setError("");
      await apiPost("/picket/student-days/randomize", {});
      await loadData();
      setInfo("Hari piket tetap seluruh mahasiswa berhasil diacak ulang dan berlaku mulai besok.");
    } catch (err: any) {
      setError(err?.message || "Gagal mengacak ulang hari piket tetap.");
    } finally {
      setSaving(false);
    }
  };

  const resetScheduleForm = () => {
    setEditingScheduleId(null);
    setScheduleForm(emptyScheduleForm);
    setScheduleTaskMode("existing");
    setManualScheduleTaskName("");
    setManualScheduleTaskDescription("");
  };

  const startEditSchedule = (item: PicketAssignment) => {
    setEditingScheduleId(item.scheduleId || item.id);
    setScheduleTaskMode("existing");
    setManualScheduleTaskName("");
    setManualScheduleTaskDescription("");
    setScheduleForm({
      studentId: item.studentId,
      taskId: item.taskId || "",
      status: item.status || "Ditugaskan",
      notes: item.notes || "",
    });
  };

  const saveDailySchedule = async () => {
    const useManualTask = scheduleTaskMode === "manual";
    if (!scheduleForm.studentId || (!useManualTask && !scheduleForm.taskId) || (useManualTask && !manualScheduleTaskName.trim())) {
      setError("Pilih mahasiswa dan isi tugas piket terlebih dahulu.");
      return;
    }

    const currentScheduleId = editingScheduleId || "";
    const studentConflict = assignments.find((item) => (
      item.scheduleDate === date &&
      item.studentId === scheduleForm.studentId &&
      String(item.scheduleId || item.id) !== currentScheduleId
    ));
    if (studentConflict) {
      setError(`${studentConflict.studentName} sudah memiliki jadwal piket pada ${date}.`);
      return;
    }

    const selectedTask = useManualTask ? null : tasks.find((task) => task.id === scheduleForm.taskId);
    const taskConflict = getPicketTaskConflict(assignments, {
      scheduleDate: date,
      taskId: useManualTask ? null : scheduleForm.taskId,
      taskName: useManualTask ? manualScheduleTaskName : selectedTask?.name,
      excludeScheduleId: editingScheduleId,
    });
    if (taskConflict) {
      const taskLabel = useManualTask ? manualScheduleTaskName.trim() : selectedTask?.name || taskConflict.taskName;
      setError(`Tugas “${taskLabel}” sudah diberikan kepada ${taskConflict.studentName} pada ${date}. Pilih tugas lain.`);
      return;
    }

    try {
      setSaving(true);
      setError("");
      let taskId = scheduleForm.taskId;
      if (useManualTask) {
        const task = await apiPost<PicketTask>("/picket/tasks", getManualPicketTaskPayload({
          name: manualScheduleTaskName,
          description: manualScheduleTaskDescription,
        }));
        const normalizedTask = mapPicketTask(task);
        taskId = normalizedTask.id;
        setTasks((prev) => prev.some((item) => item.id === normalizedTask.id) ? prev : [normalizedTask, ...prev]);
      }

      const payload = getManualPicketSchedulePayloads({
        scheduleDate: date,
        studentIds: [scheduleForm.studentId],
        taskId,
        status: scheduleForm.status || "Ditugaskan",
        notes: scheduleForm.notes.trim() || null,
      })[0];

      if (editingScheduleId) {
        await apiPatch(`/picket/schedules/${encodeURIComponent(editingScheduleId)}`, payload);
        setInfo("Jadwal piket berhasil diperbarui.");
      } else {
        await apiPost("/picket/schedules", payload);
        setInfo(useManualTask ? "Jadwal piket dengan tugas manual berhasil ditambahkan." : "Jadwal piket berhasil ditambahkan.");
      }
      resetScheduleForm();
      await loadData();
    } catch (err: any) {
      setError(getPicketScheduleErrorMessage(err, "Gagal menyimpan jadwal piket."));
    } finally {
      setSaving(false);
    }
  };

  const removeDailySchedule = async (item: PicketAssignment) => {
    try {
      setSaving(true);
      setError("");
      await apiDelete(`/picket/schedules/${encodeURIComponent(item.scheduleId || item.id)}`);
      if (editingScheduleId === (item.scheduleId || item.id)) resetScheduleForm();
      setInfo("Jadwal piket berhasil dihapus.");
      await loadData();
    } catch (err: any) {
      setError(getPicketScheduleErrorMessage(err, "Gagal menghapus jadwal piket."));
    } finally {
      setSaving(false);
    }
  };

  const updateFixedStudentDay = async (studentId: string, dayId: number) => {
    try {
      setSaving(true);
      setError("");
      await apiPatch(`/picket/student-days/${encodeURIComponent(studentId)}`, { dayId });
      await loadData();
      const dayName = WEEKDAY_OPTIONS.find((day) => day.dayOfWeek === dayId)?.label || `hari ${dayId}`;
      setInfo(`Hari piket tetap mahasiswa berhasil dipindahkan ke ${dayName} dan berlaku mulai besok.`);
    } catch (err: any) {
      setError(err?.message || "Gagal mengubah hari piket tetap mahasiswa.");
    } finally {
      setSaving(false);
    }
  };

  const saveManagers = async () => {
    try {
      setSaving(true);
      await apiPatch("/picket/managers", { studentIds: managerIds });
      setInfo("Penanggung jawab piket diperbarui.");
    } catch (err: any) {
      setError(err?.message || "Gagal menyimpan penanggung jawab piket.");
    } finally {
      setSaving(false);
    }
  };

  const reviewLeave = async (request: PicketLeaveRequest, status: "Menunggu" | "Disetujui" | "Ditolak") => {
    if (status === "Menunggu" && request.status === "Disetujui") {
      const approved = await confirm({
        title: "Batalkan persetujuan izin?",
        description: "Jadwal pengganti akan dihapus dan jadwal asal kembali menjadi Ditugaskan. Pembatalan akan ditolak jika jadwal pengganti sudah memiliki submission.",
        confirmLabel: "Batalkan Persetujuan",
        variant: "danger",
      });
      if (!approved) return;
    }
    try {
      setSaving(true);
      setError("");
      const response = await apiPatch<any>(`/picket/leave-requests/${encodeURIComponent(request.id)}/status`, {
        status,
        reviewNote: status === "Disetujui"
          ? "Izin disetujui"
          : status === "Ditolak"
            ? "Izin ditolak"
            : "Persetujuan izin dibatalkan",
      });
      const reviewed = mapPicketLeaveRequest(response);
      const replacementDate = reviewed.replacementDate || request.replacementDate;
      await Promise.allSettled([
        apiGet<any>(`/picket/leave-requests?_=${Date.now()}`),
        apiGet<any>(`/picket/schedules?date=${encodeURIComponent(request.date)}&_=${Date.now()}`),
        replacementDate
          ? apiGet<any>(`/picket/schedules?date=${encodeURIComponent(replacementDate)}&_=${Date.now()}`)
          : Promise.resolve(null),
        request.studentId
          ? apiGet<any>(`/picket/history?studentId=${encodeURIComponent(request.studentId)}&_=${Date.now()}`)
          : Promise.resolve(null),
        request.studentId
          ? apiGet<any>(`/picket/today?studentId=${encodeURIComponent(request.studentId)}&_=${Date.now()}`)
          : Promise.resolve(null),
      ]);
      await loadData();
      window.dispatchEvent(new Event("stas:picket-refresh"));
      if (status === "Disetujui") {
        setInfo(reviewed.replacementDate
          ? `Izin disetujui. Jadwal pengganti dibuat pada ${reviewed.replacementDate}.`
          : "Izin disetujui. Jadwal pengganti sedang diproses backend.");
      } else if (status === "Menunggu") {
        setInfo("Persetujuan izin dibatalkan. Jadwal asal kembali Ditugaskan dan jadwal pengganti dihapus.");
      } else {
        setInfo("Izin tidak piket ditolak.");
      }
    } catch (err: any) {
      setError(err?.status === 409
        ? err?.message || "Status izin tidak dapat dibatalkan karena jadwal pengganti sudah memiliki submission."
        : err?.message || "Gagal memproses izin tidak piket.");
    } finally {
      setSaving(false);
    }
  };

  const resetHolidayForm = () => {
    setEditingHolidayId(null);
    setHolidayForm({ date: "", name: "", notes: "" });
  };

  const saveHoliday = async () => {
    if (!holidayForm.date || !holidayForm.name.trim()) {
      setError("Tanggal dan nama hari libur wajib diisi.");
      return;
    }
    const day = new Date(`${holidayForm.date}T00:00:00`).getDay();
    if (day === 0 || day === 6) {
      setError("Hari libur piket hanya dapat dipilih pada Senin sampai Jumat.");
      return;
    }
    const payload = {
      date: holidayForm.date,
      name: holidayForm.name.trim(),
      notes: holidayForm.notes.trim() || null,
    };
    try {
      setSaving(true);
      setError("");
      if (editingHolidayId) {
        await apiPatch(`/picket/holidays/${encodeURIComponent(editingHolidayId)}`, payload);
        setInfo("Hari libur piket berhasil diperbarui.");
      } else {
        await apiPost("/picket/holidays", payload);
        setInfo("Hari libur piket berhasil ditambahkan.");
      }
      setDate(holidayForm.date);
      resetHolidayForm();
      await loadData();
    } catch (err: any) {
      setError(err?.message || "Gagal menyimpan hari libur piket.");
    } finally {
      setSaving(false);
    }
  };

  const editHoliday = (holiday: PicketHoliday) => {
    if (!holiday.editable || holiday.source === "system") {
      setError("Libur kampus dikelola dari Pengaturan Sistem dan tidak dapat diubah dari halaman piket.");
      return;
    }
    setEditingHolidayId(holiday.id);
    setHolidayForm({ date: holiday.date, name: holiday.name, notes: holiday.notes || "" });
  };

  const deleteHoliday = async (holiday: PicketHoliday) => {
    if (!holiday.editable || holiday.source === "system") {
      setError("Libur kampus hanya dapat dihapus melalui Pengaturan Sistem.");
      return;
    }
    const approved = await confirm({
      title: "Hapus hari libur piket?",
      description: `Setelah “${holiday.name}” dihapus, jadwal pada ${holiday.date} kembali menjadi kewajiban piket normal.`,
      confirmLabel: "Hapus Hari Libur",
      variant: "danger",
    });
    if (!approved) return;
    try {
      setSaving(true);
      setError("");
      await apiDelete(`/picket/holidays/${encodeURIComponent(holiday.id)}`);
      if (editingHolidayId === holiday.id) resetHolidayForm();
      setInfo("Hari libur piket berhasil dihapus. Jadwal tanggal tersebut kembali aktif.");
      await loadData();
    } catch (err: any) {
      setError(err?.message || "Gagal menghapus hari libur piket.");
    } finally {
      setSaving(false);
    }
  };

  const selectedHoliday = holidays.find((holiday) => holiday.date === date) || assignments.find((item) => item.isHoliday)?.holiday || null;
  const duplicateTaskAssignments = getDuplicatePicketTaskAssignments(assignments);
  const missingAssignments = assignments.filter((item) => !item.isHoliday && !item.isExempt && !isPicketAssignmentSubmitted(item));
  const filteredSubmissions = submissions.filter((item) => {
    const haystack = `${item.studentName} ${item.nim || ""} ${item.taskName} ${item.status}`.toLowerCase();
    return haystack.includes(query.trim().toLowerCase());
  });
  const selectedWeekday = settings.weeklySchedule.find((day) => day.dayOfWeek === selectedDayOfWeek) || settings.weeklySchedule[0];
  const selectedWeekdayStudentIds = selectedWeekday?.studentIds || [];

  const Shell = isStudentPicShell ? Layout : OperatorLayout;
  const scrollToReviewSubmissions = () => {
    setQuery("");
    reviewSectionRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  return (
    <Shell title="Manajemen Piket">
      <div className="flex flex-col gap-5 pb-4">
        {confirmDialog}
        {error && <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-semibold text-red-600">{error}</div>}
        {info && <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-semibold text-emerald-700">{info}</div>}
        {!allowed && !loading ? (
          <div className="rounded-[16px] border border-border bg-white p-8 text-center shadow-sm">
            <p className="text-base font-black text-foreground">Akses modul piket ditolak</p>
            <p className="mt-1 text-sm text-muted-foreground">Hanya operator dan mahasiswa PIC Piket yang dapat mengelola modul ini.</p>
          </div>
        ) : (
        <>

        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <h1 className="text-2xl font-black text-foreground">Piket Harian</h1>
            <p className="mt-1 text-sm font-medium text-muted-foreground">Atur random picker, tugas, penanggung jawab, dan lihat riwayat bukti piket.</p>
          </div>
          <Link
            to={isStudentPicShell ? "/picket/manage/history" : "/operator/piket/history"}
            className="inline-flex h-10 w-fit items-center justify-center gap-2 rounded-[10px] border border-border bg-white px-4 text-sm font-black text-slate-700 hover:bg-slate-50"
          >
            <History size={16} /> Riwayat Submit
          </Link>
        </div>

        <div className="grid grid-cols-2 gap-4 xl:grid-cols-4">
          {[
            { label: "Piket Hari Ini", value: assignments.length, icon: <CalendarDays size={18} />, tone: "blue" },
            {
              label: "Submission Hari Ini",
              value: submissions.length,
              icon: <ImageIcon size={18} />,
              tone: "emerald",
              onClick: scrollToReviewSubmissions,
              helper: "Submission baru divalidasi otomatis oleh sistem",
            },
            { label: "Belum Piket", value: missingAssignments.length, icon: <AlertTriangle size={18} />, tone: "red" },
            { label: "PIC Piket", value: managerIds.length, icon: <UserCog size={18} />, tone: "amber" },
          ].map((item) => (
            <button
              key={item.label}
              type="button"
              onClick={"onClick" in item ? item.onClick : undefined}
              className={`rounded-[16px] border border-border bg-white p-4 text-left shadow-sm ${"onClick" in item ? "transition hover:-translate-y-0.5 hover:border-[#0AB600]/40 hover:shadow-md focus:outline-none focus:ring-2 focus:ring-[#0AB600]/20" : "cursor-default"}`}
            >
              <div className="mb-3 flex items-center gap-2 text-muted-foreground">{item.icon}<span className="text-xs font-black uppercase tracking-wide">{item.label}</span></div>
              <p className="text-2xl font-black text-foreground">{item.value}</p>
              {"helper" in item && item.helper && <p className="mt-2 line-clamp-2 text-[11px] font-bold leading-relaxed text-slate-500">{item.helper}</p>}
            </button>
          ))}
        </div>

        <section className="rounded-[16px] border border-border bg-white shadow-sm">
          <div className="flex flex-col gap-2 border-b border-border px-5 py-4 md:flex-row md:items-start md:justify-between">
            <div>
              <div className="flex items-center gap-2">
                <CalendarOff size={18} className="text-violet-600" />
                <h2 className="text-sm font-black text-foreground">Hari Libur Piket</h2>
              </div>
              <p className="mt-1 text-xs text-muted-foreground">Libur kampus dari Pengaturan Sistem berlaku otomatis. Form ini hanya untuk menambahkan libur khusus piket.</p>
            </div>
            <span className="w-fit rounded-full border border-violet-200 bg-violet-50 px-3 py-1 text-[10px] font-black text-violet-700">
              {holidays.length} libur bulan ini
            </span>
          </div>
          <div className="grid grid-cols-1 gap-5 p-5 xl:grid-cols-[340px_minmax(0,1fr)]">
            <div className="rounded-[14px] border border-violet-200 bg-violet-50/60 p-4">
              <h3 className="text-sm font-black text-foreground">{editingHolidayId ? "Ubah Libur Khusus Piket" : "Tambah Libur Khusus Piket"}</h3>
              <div className="mt-4 flex flex-col gap-3">
                <label className="text-xs font-black text-slate-700">
                  Tanggal Libur
                  <input
                    type="date"
                    value={holidayForm.date}
                    onChange={(event) => {
                      const nextDate = event.target.value;
                      const nextDay = nextDate ? new Date(`${nextDate}T00:00:00`).getDay() : -1;
                      if (nextDate && (nextDay === 0 || nextDay === 6)) {
                        setError("Tanggal libur piket hanya dapat dipilih pada Senin sampai Jumat.");
                        return;
                      }
                      setError("");
                      setHolidayForm((prev) => ({ ...prev, date: nextDate }));
                    }}
                    className="mt-1.5 h-10 w-full rounded-[10px] border border-border bg-white px-3 text-sm font-bold outline-none focus:ring-2 focus:ring-violet-200"
                  />
                  <span className="mt-1 block text-[10px] font-semibold text-muted-foreground">Hanya Senin–Jumat.</span>
                </label>
                <label className="text-xs font-black text-slate-700">
                  Nama Hari Libur
                  <input
                    value={holidayForm.name}
                    onChange={(event) => setHolidayForm((prev) => ({ ...prev, name: event.target.value }))}
                    placeholder="Contoh: Hari Kemerdekaan"
                    className="mt-1.5 h-10 w-full rounded-[10px] border border-border bg-white px-3 text-sm font-bold outline-none focus:ring-2 focus:ring-violet-200"
                  />
                </label>
                <label className="text-xs font-black text-slate-700">
                  Catatan
                  <textarea
                    value={holidayForm.notes}
                    onChange={(event) => setHolidayForm((prev) => ({ ...prev, notes: event.target.value }))}
                    rows={3}
                    placeholder="Catatan opsional"
                    className="mt-1.5 w-full rounded-[10px] border border-border bg-white px-3 py-2 text-sm font-medium outline-none focus:ring-2 focus:ring-violet-200"
                  />
                </label>
                <div className="grid grid-cols-2 gap-2">
                  <button onClick={saveHoliday} disabled={saving} className="h-10 rounded-[10px] bg-violet-600 text-sm font-black text-white hover:bg-violet-700 disabled:opacity-60">
                    {saving ? "Menyimpan..." : "Simpan"}
                  </button>
                  <button onClick={resetHolidayForm} type="button" className="h-10 rounded-[10px] border border-border bg-white text-sm font-black text-slate-700 hover:bg-slate-50">Batal</button>
                </div>
              </div>
            </div>
            {holidays.length === 0 ? (
              <div className="flex min-h-[220px] items-center justify-center rounded-[14px] border border-dashed border-border p-8 text-center text-sm font-semibold text-muted-foreground">
                Belum ada hari libur piket pada bulan ini.
              </div>
            ) : (
              <div className="overflow-x-auto rounded-[14px] border border-border">
                <table className="w-full min-w-[720px] text-left text-sm">
                  <thead className="border-b border-border bg-slate-50 text-xs uppercase text-muted-foreground">
                    <tr><th className="px-4 py-3">Tanggal</th><th className="px-4 py-3">Hari</th><th className="px-4 py-3">Nama Hari Libur</th><th className="px-4 py-3">Catatan</th><th className="px-4 py-3">Aksi</th></tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {holidays.map((holiday) => (
                      <tr key={holiday.id} className={holiday.date === date ? "bg-violet-50/70" : ""}>
                        <td className="px-4 py-3 font-black text-foreground">{holiday.date}</td>
                        <td className="px-4 py-3 font-bold text-slate-600">{new Date(`${holiday.date}T00:00:00`).toLocaleDateString("id-ID", { weekday: "long" })}</td>
                        <td className="px-4 py-3">
                          <div className="flex flex-wrap items-center gap-2">
                            <Badge status="Libur" />
                            <span className="font-black text-foreground">{holiday.name}</span>
                            <span className={`rounded-full border px-2 py-0.5 text-[9px] font-black ${holiday.source === "system" ? "border-rose-200 bg-rose-50 text-rose-700" : "border-violet-200 bg-violet-50 text-violet-700"}`}>
                              {holiday.source === "system" ? "Libur Kampus" : "Khusus Piket"}
                            </span>
                          </div>
                        </td>
                        <td className="px-4 py-3 text-sm text-muted-foreground">{holiday.notes || "-"}</td>
                        <td className="px-4 py-3">
                          {holiday.editable && holiday.source !== "system" ? (
                            <div className="flex gap-2">
                              <button onClick={() => editHoliday(holiday)} className="h-8 rounded-[8px] border border-border bg-white px-3 text-xs font-black text-slate-700 hover:bg-slate-50">Edit</button>
                              <button onClick={() => void deleteHoliday(holiday)} disabled={saving} className="inline-flex h-8 items-center gap-1 rounded-[8px] bg-red-500 px-3 text-xs font-black text-white disabled:opacity-60"><Trash2 size={13} /> Hapus</button>
                            </div>
                          ) : (
                            <span className="text-[10px] font-bold text-muted-foreground">Kelola di Pengaturan Sistem</span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </section>

        <div className="grid grid-cols-1 gap-5 xl:grid-cols-[360px_minmax(0,1fr)]">
          <div className="flex flex-col gap-5">
            <section className="rounded-[16px] border border-border bg-white p-5 shadow-sm">
              <h2 className="text-sm font-black text-foreground">Hari Piket Tetap</h2>
              <p className="mt-1 text-xs leading-relaxed text-muted-foreground">Hari mahasiswa tidak berubah setiap minggu. Random picker hanya dijalankan manual atau saat mahasiswa baru ditambahkan.</p>
              <div className="mt-4 grid grid-cols-1 gap-2">
                <button onClick={() => void generateSchedule()} disabled={saving} className="inline-flex h-10 items-center justify-center gap-2 rounded-[10px] bg-slate-900 text-sm font-black text-white hover:bg-slate-800 disabled:opacity-60"><CalendarDays size={15} /> Sinkronkan Tanggal Terpilih</button>
                <button onClick={() => void randomizeFixedStudentDays()} disabled={saving} className="inline-flex h-10 items-center justify-center gap-2 rounded-[10px] bg-[#0B61B6] text-sm font-black text-white hover:bg-[#094F96] disabled:opacity-60"><Shuffle size={15} /> Acak Ulang Hari Tetap</button>
              </div>
              <div className="mt-4 flex flex-col gap-2 rounded-[12px] border border-emerald-200 bg-emerald-50 p-3">
                {settings.weeklySchedule.map((day) => (
                  <button
                    key={day.dayOfWeek}
                    type="button"
                    onClick={() => setSelectedDayOfWeek(day.dayOfWeek)}
                    className={`flex items-center justify-between rounded-[10px] border px-3 py-2 text-left transition ${selectedDayOfWeek === day.dayOfWeek ? "border-emerald-500 bg-emerald-100 ring-2 ring-emerald-200" : "border-emerald-200 bg-white hover:border-emerald-300"}`}
                  >
                    <span className="text-sm font-black text-foreground">{day.label}</span>
                    <span className="text-[10px] font-black text-emerald-700">{day.studentIds.length} mahasiswa</span>
                  </button>
                ))}
              </div>
            </section>

            <section className="rounded-[16px] border border-border bg-white p-5 shadow-sm">
              <h2 className="text-sm font-black text-foreground">Jenis Tugas</h2>
              <div className="mt-4 flex flex-col gap-2">
                <input value={taskName} onChange={(event) => setTaskName(event.target.value)} placeholder="Nama tugas, contoh: Bersihkan meja lab" className="h-10 rounded-[10px] border border-border px-3 text-sm font-bold outline-none" />
                <textarea value={taskDescription} onChange={(event) => setTaskDescription(event.target.value)} rows={2} placeholder="Catatan tugas opsional" className="rounded-[10px] border border-border px-3 py-2 text-sm outline-none" />
                <button onClick={addTask} disabled={saving} className="inline-flex h-10 items-center justify-center gap-2 rounded-[10px] bg-[#0AB600] text-sm font-black text-white hover:bg-[#099800]"><Plus size={15} /> Tambah Tugas</button>
              </div>
              <div className="mt-4 flex flex-col gap-2">
                {tasks.length === 0 ? <p className="text-xs font-semibold text-muted-foreground">Belum ada jenis tugas.</p> : tasks.map((task) => (
                  <div key={task.id} className="rounded-[10px] border border-border p-3">
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <p className="text-sm font-black text-foreground">{task.name}</p>
                        {task.description && <p className="mt-1 text-xs text-muted-foreground">{task.description}</p>}
                      </div>
                      <Badge status={task.active ? "Aktif" : "Nonaktif"} />
                    </div>
                    <div className="mt-3 flex gap-2">
                      <button onClick={() => toggleTask(task)} className="h-7 rounded-[7px] border border-border px-2 text-[10px] font-black text-slate-600">{task.active ? "Nonaktifkan" : "Aktifkan"}</button>
                      <button onClick={() => deleteTask(task)} className="inline-flex h-7 items-center gap-1 rounded-[7px] bg-red-50 px-2 text-[10px] font-black text-red-600"><Trash2 size={12} /> Hapus</button>
                    </div>
                  </div>
                ))}
              </div>
            </section>

            <section className="rounded-[16px] border border-border bg-white p-5 shadow-sm">
              <h2 className="text-sm font-black text-foreground">Penanggung Jawab Piket</h2>
              <p className="mt-1 text-xs text-muted-foreground">Mahasiswa terpilih dapat membantu mengelola fitur piket seperti admin.</p>
              <div className="mt-4 max-h-[260px] overflow-y-auto rounded-[10px] border border-border">
                {students.map((student) => (
                  <label key={student.id} className="flex items-center gap-3 border-b border-border px-3 py-2.5 last:border-b-0">
                    <input
                      type="checkbox"
                      checked={managerIds.includes(student.id)}
                      onChange={(event) => setManagerIds((prev) => event.target.checked ? [...prev, student.id] : prev.filter((id) => id !== student.id))}
                      className="accent-[#0AB600]"
                    />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-xs font-black text-foreground">{student.name}</span>
                      <span className="block truncate text-[10px] text-muted-foreground">{student.nim || "-"} {student.tipe ? `- ${student.tipe}` : ""}</span>
                    </span>
                  </label>
                ))}
              </div>
              <button onClick={saveManagers} disabled={saving} className="mt-3 h-10 w-full rounded-[10px] bg-slate-900 text-sm font-black text-white hover:bg-slate-800 disabled:opacity-60">Simpan PIC</button>
            </section>
          </div>

          <div className="flex flex-col gap-5">
            <section className="rounded-[16px] border border-border bg-white p-5 shadow-sm">
              <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                <div>
                  <h2 className="text-sm font-black text-foreground">Hari Piket Tetap Mahasiswa</h2>
                  <p className="mt-1 text-xs text-muted-foreground">Perubahan hari berlaku mulai besok dan tidak memindahkan kejadian izin sementara.</p>
                </div>
                <span className="w-fit rounded-full border border-blue-200 bg-blue-50 px-3 py-1 text-[10px] font-black text-blue-700">{selectedWeekday?.label}: {selectedWeekdayStudentIds.length} mahasiswa</span>
              </div>
              <div className="mt-4 max-h-[420px] overflow-y-auto rounded-[12px] border border-border">
                {students.length === 0 ? (
                  <div className="p-5 text-center text-sm font-semibold text-muted-foreground">Belum ada mahasiswa aktif.</div>
                ) : students.map((student) => {
                  const fixedDay = studentDays.find((item) => item.studentId === student.id);
                  return (
                    <div key={student.id} className="grid grid-cols-1 gap-3 border-b border-border px-3 py-3 last:border-b-0 sm:grid-cols-[minmax(0,1fr)_180px] sm:items-center">
                      <div className="flex min-w-0 items-center gap-3">
                        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-slate-100 text-[11px] font-black text-slate-700">{student.initials}</span>
                        <span className="min-w-0">
                          <span className="block truncate text-xs font-black text-foreground">{student.name}</span>
                          <span className="block truncate text-[10px] text-muted-foreground">{student.nim || "-"}{fixedDay?.effectiveFrom ? ` · berlaku ${fixedDay.effectiveFrom}` : ""}</span>
                        </span>
                      </div>
                      <select
                        value={Number.isInteger(fixedDay?.dayId) ? String(fixedDay?.dayId) : ""}
                        disabled={saving}
                        onChange={(event) => void updateFixedStudentDay(student.id, Number(event.target.value))}
                        className="h-9 rounded-[9px] border border-border bg-white px-3 text-xs font-black outline-none disabled:opacity-60"
                      >
                        <option value="" disabled>Pilih hari tetap</option>
                        {WEEKDAY_OPTIONS.map((day) => <option key={day.dayOfWeek} value={day.dayOfWeek}>{day.label}</option>)}
                      </select>
                    </div>
                  );
                })}
              </div>
            </section>

            <section className="rounded-[16px] border border-border bg-white shadow-sm">
              <div className="border-b border-border px-5 py-4">
                <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                  <div>
                    <h2 className="text-sm font-black text-foreground">Jadwal dan Status Hari Ini</h2>
                    <p className="mt-1 text-xs text-muted-foreground">Tambah, edit, atau hapus jadwal piket tanggal {date}; setiap tugas hanya boleh diberikan kepada satu mahasiswa.</p>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <input type="date" value={date} onChange={(event) => setDate(event.target.value)} className="h-9 rounded-[9px] border border-border bg-white px-3 text-xs font-black outline-none" />
                    {selectedHoliday && <Badge status="Libur" />}
                  </div>
                  {editingScheduleId && (
                    <button onClick={resetScheduleForm} className="inline-flex h-9 items-center justify-center gap-2 rounded-[9px] border border-border bg-white px-3 text-xs font-black text-slate-700 hover:bg-slate-50">
                      <X size={14} /> Batal Edit
                    </button>
                  )}
                </div>

                {duplicateTaskAssignments.length > 0 && (
                  <div className="mt-4 rounded-[10px] border border-amber-300 bg-amber-50 px-3 py-2 text-xs font-semibold text-amber-800">
                    <p className="font-black">Terdeteksi tugas piket ganda pada data backend.</p>
                    {duplicateTaskAssignments.map((group) => (
                      <p key={`${group[0].scheduleDate}-${group[0].taskId || group[0].taskName}`} className="mt-1">
                        {group[0].taskName}: {group.map((item) => item.studentName).join(", ")}
                      </p>
                    ))}
                  </div>
                )}

                <div className="mt-4 grid grid-cols-1 gap-3 lg:grid-cols-6">
                  <select
                    value={scheduleForm.studentId}
                    onChange={(event) => setScheduleForm((prev) => ({ ...prev, studentId: event.target.value }))}
                    className="h-10 min-w-0 rounded-[10px] border border-border bg-white px-3 text-sm font-bold outline-none lg:col-span-2"
                  >
                    <option value="">Pilih mahasiswa</option>
                    {students.map((student) => {
                      const usedByAnotherSchedule = assignments.some((item) => (
                        item.scheduleDate === date &&
                        item.studentId === student.id &&
                        String(item.scheduleId || item.id) !== String(editingScheduleId || "")
                      ));
                      return (
                        <option key={student.id} value={student.id} disabled={usedByAnotherSchedule}>
                          {student.name} {student.nim ? `- ${student.nim}` : ""}{usedByAnotherSchedule ? " (sudah dijadwalkan)" : ""}
                        </option>
                      );
                    })}
                  </select>
                  <div className="flex min-w-0 flex-col gap-2 lg:col-span-4">
                    <div className="grid grid-cols-2 gap-2 rounded-[10px] border border-border bg-slate-50 p-1">
                      <button
                        type="button"
                        onClick={() => setScheduleTaskMode("existing")}
                        className={`h-8 min-w-0 rounded-[8px] px-2 text-xs font-black ${scheduleTaskMode === "existing" ? "bg-white text-slate-900 shadow-sm" : "text-muted-foreground hover:bg-white/70"}`}
                      >
                        <span className="block truncate">Pilih Tugas</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => setScheduleTaskMode("manual")}
                        className={`h-8 min-w-0 rounded-[8px] px-2 text-xs font-black ${scheduleTaskMode === "manual" ? "bg-white text-slate-900 shadow-sm" : "text-muted-foreground hover:bg-white/70"}`}
                      >
                        <span className="block truncate">Tugas Manual</span>
                      </button>
                    </div>
                    {scheduleTaskMode === "existing" ? (
                      <select
                        value={scheduleForm.taskId}
                        onChange={(event) => setScheduleForm((prev) => ({ ...prev, taskId: event.target.value }))}
                        className="h-10 min-w-0 rounded-[10px] border border-border bg-white px-3 text-sm font-bold outline-none"
                      >
                        <option value="">Pilih tugas</option>
                        {tasks.map((task) => {
                          const conflict = getPicketTaskConflict(assignments, {
                            scheduleDate: date,
                            taskId: task.id,
                            taskName: task.name,
                            excludeScheduleId: editingScheduleId,
                          });
                          return (
                            <option key={task.id} value={task.id} disabled={Boolean(conflict)}>
                              {task.name}{task.active ? "" : " (nonaktif)"}{conflict ? ` (dipakai ${conflict.studentName})` : ""}
                            </option>
                          );
                        })}
                      </select>
                    ) : (
                      <div className="grid grid-cols-1 gap-2">
                        <input
                          value={manualScheduleTaskName}
                          onChange={(event) => setManualScheduleTaskName(event.target.value)}
                          placeholder="Tulis tugas piket manual"
                          className="h-10 min-w-0 rounded-[10px] border border-border bg-white px-3 text-sm font-bold outline-none"
                        />
                        <input
                          value={manualScheduleTaskDescription}
                          onChange={(event) => setManualScheduleTaskDescription(event.target.value)}
                          placeholder="Deskripsi tugas opsional"
                          className="h-10 min-w-0 rounded-[10px] border border-border bg-white px-3 text-sm font-bold outline-none"
                        />
                      </div>
                    )}
                  </div>
                  <select
                    value={scheduleForm.status}
                    onChange={(event) => setScheduleForm((prev) => ({ ...prev, status: event.target.value }))}
                    className="h-10 min-w-0 rounded-[10px] border border-border bg-white px-3 text-sm font-bold outline-none lg:col-span-2"
                  >
                    <option value="Ditugaskan">Ditugaskan</option>
                    <option value="Menunggu">Menunggu</option>
                    <option value="Selesai">Selesai</option>
                    <option value="Diganti">Diganti</option>
                  </select>
                  <input
                    value={scheduleForm.notes}
                    onChange={(event) => setScheduleForm((prev) => ({ ...prev, notes: event.target.value }))}
                    placeholder="Catatan opsional"
                    className="h-10 min-w-0 rounded-[10px] border border-border bg-white px-3 text-sm font-bold outline-none lg:col-span-3"
                  />
                  <button
                    onClick={saveDailySchedule}
                    disabled={saving || !scheduleForm.studentId || (scheduleTaskMode === "manual" ? !manualScheduleTaskName.trim() : !scheduleForm.taskId)}
                    className="inline-flex h-10 min-w-0 w-full items-center justify-center gap-2 whitespace-nowrap rounded-[10px] bg-slate-900 px-3 text-sm font-black text-white hover:bg-slate-800 disabled:opacity-60 md:col-span-2 lg:col-span-1"
                  >
                    {saving ? <Loader2 size={15} className="animate-spin" /> : <Plus size={15} />}
                    {editingScheduleId ? "Update" : "Tambah"}
                  </button>
                </div>
              </div>
              {loading ? (
                <div className="flex items-center justify-center gap-2 p-8 text-sm text-muted-foreground"><Loader2 size={16} className="animate-spin" /> Memuat jadwal...</div>
              ) : assignments.length === 0 ? (
                <div className="p-8 text-center text-sm font-semibold text-muted-foreground">Belum ada jadwal piket untuk tanggal ini.</div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[720px] text-left text-sm">
                    <thead className="border-b border-border bg-slate-50 text-xs uppercase text-muted-foreground">
                      <tr><th className="px-5 py-3">Mahasiswa</th><th className="px-5 py-3">Tugas</th><th className="px-5 py-3">Status</th><th className="px-5 py-3">Bukti</th><th className="px-5 py-3">Aksi</th></tr>
                    </thead>
                    <tbody className="divide-y divide-border">
                      {assignments.map((item) => (
                        <tr key={item.id}>
                          <td className="px-5 py-3"><p className="font-black text-foreground">{item.studentName}</p><p className="text-xs text-muted-foreground">{item.nim || "-"}</p></td>
                          <td className="px-5 py-3"><p className="font-bold text-foreground">{item.taskName}</p>{item.taskDescription && <p className="text-xs text-muted-foreground">{item.taskDescription}</p>}{item.notes && <p className="text-xs text-muted-foreground">Catatan: {item.notes}</p>}</td>
                          <td className="px-5 py-3"><Badge status={getPicketAssignmentStatus(item)} /></td>
                          <td className="px-5 py-3">{item.autoCompletedByWfh ? <span className="text-xs font-semibold text-indigo-700">Otomatis via WFH</span> : item.photoUrl ? <a href={item.photoUrl} target="_blank" rel="noreferrer" className="text-xs font-black text-blue-600 hover:underline">Lihat Foto</a> : <span className="text-xs text-muted-foreground">Belum submit</span>}</td>
                          <td className="px-5 py-3">
                            <div className="flex flex-wrap gap-2">
                              <button onClick={() => startEditSchedule(item)} className="h-8 rounded-[8px] border border-border bg-white px-3 text-xs font-black text-slate-700 hover:bg-slate-50">Edit</button>
                              <button onClick={() => removeDailySchedule(item)} disabled={saving} className="inline-flex h-8 items-center gap-1 rounded-[8px] bg-red-500 px-3 text-xs font-black text-white disabled:opacity-60"><Trash2 size={13} /> Hapus</button>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </section>

            <section ref={reviewSectionRef} id="review-foto-piket" className="scroll-mt-24 rounded-[16px] border border-border bg-white shadow-sm">
              <div className="flex flex-col gap-3 border-b border-border px-5 py-4 md:flex-row md:items-center md:justify-between">
                <div>
                  <h2 className="text-sm font-black text-foreground">Riwayat Submission Piket</h2>
                  <p className="mt-1 text-xs text-muted-foreground">Submission baru divalidasi otomatis. Status data historis tetap ditampilkan.</p>
                </div>
                <div className="flex h-10 items-center gap-2 rounded-[10px] border border-border bg-white px-3">
                  <Search size={15} className="text-muted-foreground" />
                  <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Cari submission..." className="bg-transparent text-sm outline-none" />
                </div>
              </div>
              {filteredSubmissions.length === 0 ? (
                <div className="p-8 text-center text-sm font-semibold text-muted-foreground">Belum ada foto piket yang dikirim.</div>
              ) : (
                <div className="grid grid-cols-1 gap-4 p-5 lg:grid-cols-2">
                  {filteredSubmissions.map((item) => (
                    <div key={item.id} className="rounded-[14px] border border-border p-4">
                      <div className="mb-3 flex items-start justify-between gap-3">
                        <div>
                          <p className="font-black text-foreground">{item.studentName}</p>
                          <p className="text-xs text-muted-foreground">{item.taskName} - {item.date}</p>
                        </div>
                        <Badge status={item.status} />
                      </div>
                      {item.photoUrl ? (
                        <a href={item.photoUrl} target="_blank" rel="noreferrer" className="block overflow-hidden rounded-[12px] border border-border bg-slate-50">
                          <img src={item.photoUrl} alt={`Foto piket ${item.studentName}`} className="h-48 w-full object-cover" />
                        </a>
                      ) : (
                        <div className="flex h-48 items-center justify-center rounded-[12px] border border-dashed border-border bg-slate-50 text-sm font-semibold text-muted-foreground">Foto tidak tersedia</div>
                      )}
                      {(item.reviewedAt || item.reviewNote) && (
                        <div className="mt-3 rounded-[10px] bg-slate-50 px-3 py-2 text-xs font-semibold text-slate-600">
                          {item.reviewNote || "Status submission telah diperbarui."}
                          {item.reviewedAt && <span className="mt-1 block text-[10px] text-muted-foreground">{new Date(item.reviewedAt).toLocaleString("id-ID")}</span>}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </section>

            <section className="rounded-[16px] border border-border bg-white shadow-sm">
              <div className="border-b border-border px-5 py-4">
                <h2 className="text-sm font-black text-foreground">Pengajuan Izin Piket</h2>
                <p className="mt-1 text-xs text-muted-foreground">Operator/PIC menyetujui atau menolak pengajuan. Status historis tetap ditampilkan.</p>
              </div>
              {leaveRequests.length === 0 ? (
                <div className="p-8 text-center text-sm font-semibold text-muted-foreground">Belum ada riwayat izin piket.</div>
              ) : (
                <div className="divide-y divide-border">
                  {leaveRequests.map((item) => (
                    <div key={item.id} className="flex flex-col gap-3 px-5 py-4 md:flex-row md:items-center md:justify-between">
                      <div>
                        <p className="font-black text-foreground">{item.studentName}</p>
                        <p className="text-xs text-muted-foreground">{item.date} - {item.reason}</p>
                        {item.replacementDate && (
                          <p className="mt-1 text-xs font-black text-blue-700">Jadwal pengganti: {item.replacementDate}{item.replacementScheduleId ? ` · ${item.replacementScheduleId}` : ""}</p>
                        )}
                      </div>
                      <div className="flex flex-wrap items-center gap-2">
                        <Badge status={item.status} />
                        {item.status === "Menunggu" && (
                          <>
                            <button disabled={saving} onClick={() => void reviewLeave(item, "Disetujui")} className="h-8 rounded-[8px] bg-emerald-500 px-3 text-xs font-black text-white disabled:opacity-60">Setujui</button>
                            <button disabled={saving} onClick={() => void reviewLeave(item, "Ditolak")} className="h-8 rounded-[8px] bg-red-500 px-3 text-xs font-black text-white disabled:opacity-60">Tolak</button>
                          </>
                        )}
                        {item.status === "Disetujui" && (
                          <button disabled={saving} onClick={() => void reviewLeave(item, "Menunggu")} className="h-8 rounded-[8px] border border-red-200 bg-red-50 px-3 text-xs font-black text-red-600 disabled:opacity-60">Batalkan Persetujuan</button>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </section>
          </div>
        </div>
        </>
        )}
      </div>
    </Shell>
  );
}
