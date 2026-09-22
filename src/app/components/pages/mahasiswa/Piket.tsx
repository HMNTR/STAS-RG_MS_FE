import React from "react";
import { CalendarOff, CheckCircle2, ClipboardCheck, History, ImagePlus, Loader2, Send, UploadCloud, UserCog } from "lucide-react";
import { Link } from "react-router";
import { Layout } from "../../templates/Layout";
import { apiGet, apiPost } from "../../../lib/api";
import { useAuth } from "../../../context/AuthContext";
import {
  PicketAssignment,
  PicketHoliday,
  PICKET_AUTO_VALIDATED_SUCCESS_MESSAGE,
  PicketLeaveRequest,
  PicketStudentDay,
  ensurePicketPhotoPreviewable,
  fileToDataUrl,
  getJakartaDateKey,
  getPicketAssignmentStatus,
  getPicketHolidayFromTodayResponse,
  getPicketSubmissionErrorMessage,
  getPicketStudentDayFromTodayResponse,
  hasPicketPhotoSubmission,
  isPicketAssignmentSubmitted,
  isPicketHolidayResponse,
  isAlumniStudent,
  mapPicketAssignment,
  mapPicketHoliday,
  mapPicketTodayAssignment,
  mapPicketLeaveRequest,
  mapPicketSubmissionResult,
  shouldDisablePicketSubmissionSubmit,
  validatePicketPhoto,
} from "../../../lib/picket";

const statusStyle: Record<string, string> = {
  Menunggu: "border-amber-200 bg-amber-50 text-amber-700",
  Disetujui: "border-emerald-200 bg-emerald-50 text-emerald-700",
  Ditolak: "border-red-200 bg-red-50 text-red-600",
  Terkirim: "border-blue-200 bg-blue-50 text-blue-700",
  Valid: "border-emerald-200 bg-emerald-50 text-emerald-700",
  Bermasalah: "border-red-200 bg-red-50 text-red-600",
  Dijadwalkan: "border-slate-200 bg-slate-50 text-slate-600",
  Libur: "border-violet-200 bg-violet-50 text-violet-700",
  "Selesai Otomatis — WFH": "border-indigo-200 bg-indigo-50 text-indigo-700",
};

function Badge({ status }: { status?: string | null }) {
  const label = status || "-";
  return <span className={`rounded-full border px-2.5 py-1 text-[10px] font-black ${statusStyle[label] || statusStyle.Dijadwalkan}`}>{label}</span>;
}

export default function Piket() {
  const { user } = useAuth();
  const isAlumni = isAlumniStudent(user);
  const [todayAssignment, setTodayAssignment] = React.useState<PicketAssignment | null>(null);
  const [history, setHistory] = React.useState<PicketAssignment[]>([]);
  const [leaveRequests, setLeaveRequests] = React.useState<PicketLeaveRequest[]>([]);
  const [fixedDay, setFixedDay] = React.useState<PicketStudentDay | null>(null);
  const [isManager, setIsManager] = React.useState(false);
  const [reason, setReason] = React.useState("");
  const [photoFile, setPhotoFile] = React.useState<File | null>(null);
  const [photoPreview, setPhotoPreview] = React.useState("");
  const [loading, setLoading] = React.useState(true);
  const [saving, setSaving] = React.useState(false);
  const [error, setError] = React.useState("");
  const [info, setInfo] = React.useState("");
  const [todayHoliday, setTodayHoliday] = React.useState<PicketHoliday | null>(null);
  const [holidays, setHolidays] = React.useState<PicketHoliday[]>([]);
  const [wfhNoticeOpen, setWfhNoticeOpen] = React.useState(false);

  const wfhNoticeKey = todayAssignment?.autoCompletedByWfh
    ? `${todayAssignment.id}:${todayAssignment.date}`
    : "";

  React.useEffect(() => {
    if (wfhNoticeKey) setWfhNoticeOpen(true);
  }, [wfhNoticeKey]);

  const loadData = React.useCallback(async () => {
    if (!user?.id) return;
    setLoading(true);
    setError("");
    try {
      const [todayRes, historyRes, leaveRes, managerRes, holidayRes] = await Promise.allSettled([
        apiGet<any>(`/picket/today?studentId=${encodeURIComponent(user.id)}&_=${Date.now()}`),
        apiGet<any>(`/picket/history?studentId=${encodeURIComponent(user.id)}&_=${Date.now()}`),
        apiGet<any>(`/picket/leave-requests?studentId=${encodeURIComponent(user.id)}&_=${Date.now()}`),
        apiGet<any>("/picket/managers/me"),
        apiGet<any>("/picket/holidays"),
      ]);

      if (todayRes.status === "fulfilled") {
        setTodayAssignment(mapPicketTodayAssignment(todayRes.value));
        setFixedDay(getPicketStudentDayFromTodayResponse(todayRes.value));
        setTodayHoliday(isPicketHolidayResponse(todayRes.value) ? getPicketHolidayFromTodayResponse(todayRes.value) : null);
      }

      if (historyRes.status === "fulfilled") {
        const rows = Array.isArray(historyRes.value) ? historyRes.value : historyRes.value?.history || historyRes.value?.assignments || [];
        setHistory(rows.map(mapPicketAssignment));
      }

      if (leaveRes.status === "fulfilled") {
        const rows = Array.isArray(leaveRes.value) ? leaveRes.value : leaveRes.value?.requests || [];
        setLeaveRequests(rows.map(mapPicketLeaveRequest));
      }

      if (managerRes.status === "fulfilled") {
        setIsManager(Boolean(managerRes.value?.isManager ?? managerRes.value?.manager ?? managerRes.value?.allowed));
      }
      if (holidayRes.status === "fulfilled") {
        const rows = Array.isArray(holidayRes.value) ? holidayRes.value : holidayRes.value?.holidays || holidayRes.value?.items || [];
        setHolidays(rows.map(mapPicketHoliday).sort((a: PicketHoliday, b: PicketHoliday) => a.date.localeCompare(b.date)));
      }
    } catch (err: any) {
      setError(err?.message || "Gagal memuat data piket.");
    } finally {
      setLoading(false);
    }
  }, [user?.id]);

  React.useEffect(() => {
    void loadData();
  }, [loadData]);

  React.useEffect(() => {
    const refresh = () => void loadData();
    window.addEventListener("stas:picket-refresh", refresh);
    return () => window.removeEventListener("stas:picket-refresh", refresh);
  }, [loadData]);

  React.useEffect(() => {
    return () => {
      if (photoPreview) URL.revokeObjectURL(photoPreview);
    };
  }, [photoPreview]);

  const pickPhoto = async (file?: File | null) => {
    if (!file) return;
    const validation = validatePicketPhoto(file);
    if (validation) {
      setError(validation);
      return;
    }
    try {
      await ensurePicketPhotoPreviewable(file);
    } catch (err: any) {
      setError(err?.message || "Foto tidak dapat dibuka. Pastikan file benar-benar JPG, PNG, atau WEBP.");
      return;
    }
    if (photoPreview) URL.revokeObjectURL(photoPreview);
    setPhotoFile(file);
    setPhotoPreview(URL.createObjectURL(file));
    setError("");
  };

  const clearPhoto = () => {
    if (photoPreview) URL.revokeObjectURL(photoPreview);
    setPhotoFile(null);
    setPhotoPreview("");
  };

  const submitPicketPhoto = async () => {
    if (saving) return;
    if (isAlumni) {
      setError("Mahasiswa berstatus Alumni dibebaskan dari seluruh kewajiban piket.");
      return;
    }
    if (!todayAssignment) {
      setError("Bukti piket hanya dapat dikirim saat Anda punya jadwal piket hari ini.");
      return;
    }
    if (todayAssignment.isHoliday || todayAssignment.isExempt) {
      setError("Bukti piket tidak perlu dikirim karena jadwal hari ini berstatus Libur.");
      return;
    }
    if (todayAssignment.autoCompletedByWfh) {
      setError("Bukti piket tidak perlu dikirim karena piket otomatis selesai melalui WFH yang disetujui.");
      return;
    }
    if (String(todayAssignment.leaveStatus || "").toLowerCase() === "disetujui") {
      setError("Bukti piket tidak perlu dikirim karena izin piket sudah disetujui.");
      return;
    }
    if (!photoFile) {
      setError("Pilih foto bukti piket terlebih dahulu.");
      return;
    }

    try {
      setSaving(true);
      setError("");
      setInfo("");
      const result = await apiPost<any>("/picket/submissions", {
        scheduleId: todayAssignment.scheduleId || todayAssignment.id,
        assignmentId: todayAssignment.assignmentId || todayAssignment.id,
        studentId: user?.id,
        date: todayAssignment.date || getJakartaDateKey(),
        taskId: todayAssignment.taskId,
        photoFileName: photoFile.name,
        photoDataUrl: await fileToDataUrl(photoFile),
        source: "picket-page",
      });
      const submission = mapPicketSubmissionResult(result);
      setTodayAssignment((prev) => prev ? {
        ...prev,
        submitted: Boolean(submission.id || submission.photoUrl || submission.submittedAt),
        submissionId: submission.id || prev.submissionId,
        submissionStatus: submission.status || prev.submissionStatus,
        status: submission.assignmentStatus || prev.status,
        photoUrl: submission.photoUrl || prev.photoUrl,
        submittedAt: submission.submittedAt || prev.submittedAt,
        reviewedAt: submission.reviewedAt || prev.reviewedAt,
        reviewNote: submission.reviewNote || prev.reviewNote,
      } : prev);
      clearPhoto();
      setInfo(PICKET_AUTO_VALIDATED_SUCCESS_MESSAGE);
      window.dispatchEvent(new Event("stas:access-lock-refresh"));
      window.dispatchEvent(new Event("stas:picket-refresh"));
      await loadData();
    } catch (err: any) {
      setError(getPicketSubmissionErrorMessage(err));
    } finally {
      setSaving(false);
    }
  };

  const submitLeave = async () => {
    if (saving) return;
    if (isAlumni) {
      setError("Mahasiswa berstatus Alumni dibebaskan dari seluruh kewajiban piket.");
      return;
    }
    if (!todayAssignment) {
      setError("Izin tidak piket hanya dapat diajukan saat Anda punya jadwal piket hari ini.");
      return;
    }
    if (todayAssignment.isHoliday || todayAssignment.isExempt) {
      setError("Izin tidak perlu diajukan karena jadwal hari ini berstatus Libur.");
      return;
    }
    if (todayAssignment.autoCompletedByWfh) {
      setError("Izin tidak piket tidak perlu diajukan karena piket otomatis selesai melalui WFH yang disetujui.");
      return;
    }
    if (!reason.trim()) {
      setError("Alasan izin tidak piket wajib diisi.");
      return;
    }
    try {
      setSaving(true);
      setError("");
      setInfo("");
      const response = await apiPost<any>("/picket/leave-requests", {
        scheduleId: todayAssignment.scheduleId || todayAssignment.id,
        assignmentId: todayAssignment.assignmentId || todayAssignment.id,
        studentId: user?.id,
        date: todayAssignment.date || getJakartaDateKey(),
        reason: reason.trim(),
      });
      const pendingLeave = mapPicketLeaveRequest(response);
      setLeaveRequests((prev) => [pendingLeave, ...prev.filter((item) => item.id !== pendingLeave.id)]);
      setReason("");
      setInfo("Pengajuan izin piket berhasil dikirim dan menunggu persetujuan operator/PIC.");
      window.dispatchEvent(new Event("stas:picket-refresh"));
      window.dispatchEvent(new Event("stas:access-lock-refresh"));
      await loadData();
    } catch (err: any) {
      setError(err?.message || "Gagal mengajukan izin tidak piket.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Layout title="Piket">
      {wfhNoticeOpen && todayAssignment?.autoCompletedByWfh && (
        <div className="fixed inset-0 z-[520] flex items-center justify-center bg-slate-950/60 px-4 backdrop-blur-sm" role="dialog" aria-modal="true" aria-labelledby="wfh-picket-notice-title">
          <div className="w-full max-w-[440px] overflow-hidden rounded-[20px] border border-indigo-200 bg-white shadow-2xl">
            <div className="bg-indigo-600 px-5 py-5 text-white">
              <div className="flex items-start gap-3">
                <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-white/20">
                  <CheckCircle2 size={23} />
                </div>
                <div>
                  <p className="text-xs font-black uppercase tracking-[0.14em] text-indigo-100">Selesai Otomatis — WFH</p>
                  <h2 id="wfh-picket-notice-title" className="mt-1 text-lg font-black">Anda tidak perlu mengerjakan piket hari ini</h2>
                </div>
              </div>
            </div>
            <div className="p-5">
              <p className="text-sm font-semibold leading-relaxed text-slate-700">
                Hari ini merupakan jadwal piket Anda. Karena pengajuan WFH Anda telah disetujui, piket otomatis dinyatakan selesai.
              </p>
              <div className="mt-4 rounded-[12px] border border-indigo-100 bg-indigo-50 px-4 py-3 text-sm font-bold leading-relaxed text-indigo-700">
                Anda tidak perlu mengerjakan piket dan tidak perlu mengunggah foto bukti piket.
              </div>
              <button
                type="button"
                onClick={() => setWfhNoticeOpen(false)}
                className="mt-5 h-11 w-full rounded-[11px] bg-indigo-600 text-sm font-black text-white transition-colors hover:bg-indigo-700"
              >
                Saya Mengerti
              </button>
            </div>
          </div>
        </div>
      )}
      <div className="flex flex-col gap-5 pb-4">
        {error && <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-semibold text-red-600">{error}</div>}
        {info && <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-semibold text-emerald-700">{info}</div>}

        <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <h1 className="text-2xl font-black text-foreground">Piket Saya</h1>
            <p className="mt-1 text-sm font-medium text-muted-foreground">Lihat jadwal, riwayat, dan ajukan izin jika tidak bisa piket.</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Link to="/picket/history" className="inline-flex h-10 items-center justify-center gap-2 rounded-[10px] border border-border bg-white px-4 text-sm font-black text-slate-700 hover:bg-slate-50">
              <History size={16} /> Riwayat Submit
            </Link>
            {isManager && (
              <Link to="/picket/manage" className="inline-flex h-10 items-center justify-center gap-2 rounded-[10px] bg-slate-900 px-4 text-sm font-black text-white hover:bg-slate-800">
                <UserCog size={16} /> Kelola Piket
              </Link>
            )}
          </div>
        </div>

        {loading ? (
          <div className="flex items-center justify-center gap-2 rounded-[16px] border border-border bg-white p-10 text-sm font-semibold text-muted-foreground">
            <Loader2 size={16} className="animate-spin" /> Memuat data piket...
          </div>
        ) : (
          <>
            {isAlumni && (
              <div className="rounded-[16px] border border-emerald-200 bg-emerald-50 px-5 py-4">
                <div className="flex items-start gap-3">
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-[11px] bg-emerald-600 text-white">
                    <CheckCircle2 size={20} />
                  </div>
                  <div>
                    <p className="font-black text-emerald-800">Status Anda: Alumni STAS-RG</p>
                    <p className="mt-1 text-sm font-medium text-emerald-700">
                      Mahasiswa berstatus Alumni dibebaskan dari seluruh kewajiban piket laboratorium. Anda tetap dapat melihat riwayat piket terdahulu melalui menu Riwayat Submit.
                    </p>
                  </div>
                </div>
              </div>
            )}
            {!isAlumni && fixedDay && (
              <div className="rounded-[16px] border border-blue-200 bg-blue-50 px-5 py-4">
                <p className="text-xs font-black uppercase tracking-wide text-blue-600">Hari Piket Tetap</p>
                <p className="mt-1 font-black text-blue-900">{fixedDay.dayName || `Hari ke-${fixedDay.dayId}`}</p>
                <p className="mt-1 text-xs font-semibold text-blue-700">Jadwal pengganti karena izin bersifat satu kali; minggu berikutnya Anda kembali ke hari ini.</p>
              </div>
            )}
            {todayHoliday && (
              <div className="rounded-[16px] border border-violet-200 bg-violet-50 px-5 py-4">
                <div className="flex items-start gap-3">
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-[11px] bg-violet-600 text-white"><CalendarOff size={20} /></div>
                  <div>
                    <p className="font-black text-violet-800">Piket diliburkan: {todayHoliday.name}</p>
                    {todayHoliday.notes && <p className="mt-1 text-sm font-medium text-violet-700">{todayHoliday.notes}</p>}
                  </div>
                </div>
              </div>
            )}
            <section className="rounded-[18px] border border-border bg-white shadow-sm">
              <div className="border-b border-border px-5 py-4">
                <h2 className="text-sm font-black text-foreground">Jadwal Hari Ini</h2>
              </div>
              {isAlumni ? (
                <div className="p-8 text-center">
                  <CheckCircle2 className="mx-auto mb-3 text-emerald-600" size={34} />
                  <p className="text-sm font-black text-foreground">Bebas Tugas Piket</p>
                  <p className="mt-1 text-xs font-semibold text-muted-foreground">Sebagai Alumni, Anda tidak memiliki jadwal maupun kewajiban piket laboratorium.</p>
                </div>
              ) : todayAssignment ? (
                <div className={`grid grid-cols-1 gap-4 p-5 ${todayAssignment.autoCompletedByWfh ? "" : "xl:grid-cols-[minmax(0,1fr)_340px_320px]"}`}>
                  <div className={`rounded-[14px] border p-4 ${todayAssignment.isHoliday || todayAssignment.isExempt ? "border-violet-200 bg-violet-50" : "border-emerald-200 bg-emerald-50"}`}>
                    <div className="flex items-start gap-3">
                      <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-[12px] bg-emerald-500 text-white">
                        <ClipboardCheck size={22} />
                      </div>
                      <div>
                        <p className={`text-sm font-black ${todayAssignment.isHoliday || todayAssignment.isExempt ? "text-violet-800" : "text-emerald-800"}`}>{todayAssignment.isHoliday || todayAssignment.isExempt ? `Piket diliburkan: ${todayAssignment.holiday?.name || "Hari Libur Piket"}` : "Anda piket hari ini"}</p>
                        <h3 className="mt-1 text-xl font-black text-foreground">{todayAssignment.taskName}</h3>
                        {todayAssignment.taskDescription && <p className="mt-2 text-sm leading-relaxed text-emerald-800/80">{todayAssignment.taskDescription}</p>}
                        {todayAssignment.autoCompletedByWfh && (
                          <p className="mt-3 rounded-[10px] border border-indigo-200 bg-indigo-50 px-3 py-2 text-sm font-bold text-indigo-700">
                            Piket otomatis selesai karena WFH yang disetujui.
                          </p>
                        )}
                        <div className="mt-3 flex flex-wrap items-center gap-2">
                          <Badge status={getPicketAssignmentStatus(todayAssignment)} />
                          {todayAssignment.leaveStatus && <Badge status={`Izin ${todayAssignment.leaveStatus}`} />}
                          <span className="text-xs font-bold text-emerald-800">{todayAssignment.date}</span>
                        </div>
                      </div>
                    </div>
                  </div>

                  {!todayAssignment.autoCompletedByWfh && !todayAssignment.isExempt && !todayAssignment.isHoliday && <div className="rounded-[14px] border border-border p-4">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <h3 className="text-sm font-black text-foreground">Bukti Piket</h3>
                        <p className="mt-1 text-xs text-muted-foreground">Kirim foto setelah tugas piket selesai.</p>
                      </div>
                      {hasPicketPhotoSubmission(todayAssignment) && <Badge status={todayAssignment.submissionStatus || "Terkirim"} />}
                    </div>

                    {todayAssignment.photoUrl && !photoPreview ? (
                      <a href={todayAssignment.photoUrl} target="_blank" rel="noreferrer" className="mt-3 block overflow-hidden rounded-[12px] border border-border bg-slate-50">
                        <img src={todayAssignment.photoUrl} alt="Bukti piket terkirim" className="h-36 w-full object-cover" />
                      </a>
                    ) : photoPreview ? (
                      <div className="mt-3 overflow-hidden rounded-[12px] border border-border bg-slate-50">
                        <img src={photoPreview} alt="Preview bukti piket" className="h-36 w-full object-cover" />
                      </div>
                    ) : (
                      <label className="mt-3 flex h-36 cursor-pointer flex-col items-center justify-center rounded-[12px] border border-dashed border-border bg-slate-50 text-center hover:bg-slate-100">
                        <ImagePlus size={28} className="text-muted-foreground" />
                        <span className="mt-2 text-sm font-black text-foreground">Pilih foto</span>
                        <span className="mt-1 text-xs font-semibold text-muted-foreground">JPG, PNG, atau WEBP</span>
                        <input
                          type="file"
                          accept="image/jpeg,image/png,image/webp"
                          className="hidden"
                          disabled={saving || String(todayAssignment.leaveStatus || "").toLowerCase() === "disetujui"}
                          onChange={(event) => {
                            void pickPhoto(event.target.files?.[0] || null);
                            event.currentTarget.value = "";
                          }}
                        />
                      </label>
                    )}

                    {photoFile && (
                      <div className="mt-2 flex items-center justify-between gap-2 text-xs font-semibold text-muted-foreground">
                        <span className="min-w-0 truncate">{photoFile.name}</span>
                        <button onClick={clearPhoto} className="shrink-0 font-black text-red-500 hover:underline">Hapus</button>
                      </div>
                    )}

                    <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2 xl:grid-cols-1">
                      {(hasPicketPhotoSubmission(todayAssignment) || photoPreview) && (
                        <label className="inline-flex h-10 cursor-pointer items-center justify-center gap-2 rounded-[10px] border border-border bg-white px-3 text-sm font-black text-slate-700 hover:bg-slate-50">
                          <ImagePlus size={15} /> {hasPicketPhotoSubmission(todayAssignment) ? "Upload Ulang Foto" : "Ganti Foto"}
                          <input
                            type="file"
                            accept="image/jpeg,image/png,image/webp"
                            className="hidden"
                            disabled={saving || String(todayAssignment.leaveStatus || "").toLowerCase() === "disetujui"}
                            onChange={(event) => {
                              void pickPhoto(event.target.files?.[0] || null);
                              event.currentTarget.value = "";
                            }}
                          />
                        </label>
                      )}
                      <button
                        onClick={submitPicketPhoto}
                        disabled={shouldDisablePicketSubmissionSubmit(saving, Boolean(photoFile)) || String(todayAssignment.leaveStatus || "").toLowerCase() === "disetujui"}
                        className="inline-flex h-10 items-center justify-center gap-2 rounded-[10px] bg-slate-900 px-3 text-sm font-black text-white hover:bg-slate-800 disabled:opacity-60"
                      >
                        {saving ? <Loader2 size={15} className="animate-spin" /> : <UploadCloud size={15} />} {hasPicketPhotoSubmission(todayAssignment) ? "Kirim Ulang" : "Kirim Bukti"}
                      </button>
                    </div>
                  </div>}

                  {!todayAssignment.autoCompletedByWfh && !todayAssignment.isExempt && !todayAssignment.isHoliday && <div className="rounded-[14px] border border-border p-4">
                    <h3 className="text-sm font-black text-foreground">Izin Tidak Piket</h3>
                    <p className="mt-1 text-xs leading-relaxed text-muted-foreground">Pengajuan izin akan diperiksa oleh operator/PIC. Jadwal pengganti diberikan setelah izin disetujui.</p>
                    <textarea value={reason} disabled={saving} onChange={(event) => setReason(event.target.value)} rows={4} placeholder="Tulis alasan izin..." className="mt-3 w-full rounded-[10px] border border-border px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-[#0AB600]/20 disabled:bg-slate-50 disabled:opacity-70" />
                    <button onClick={submitLeave} disabled={saving || !reason.trim()} className="mt-3 inline-flex h-10 w-full items-center justify-center gap-2 rounded-[10px] bg-[#0AB600] text-sm font-black text-white hover:bg-[#099800] disabled:opacity-60">
                      {saving ? <Loader2 size={15} className="animate-spin" /> : <Send size={15} />} {saving ? "Mengirim..." : "Ajukan Izin"}
                    </button>
                  </div>}
                </div>
              ) : (
                <div className="p-8 text-center">
                  <CalendarOff className="mx-auto mb-3 text-muted-foreground" size={34} />
                  <p className="font-black text-foreground">Tidak ada jadwal piket hari ini</p>
                  <p className="mt-1 text-sm text-muted-foreground">Form foto piket saat checkout hanya muncul ketika Anda dijadwalkan piket.</p>
                </div>
              )}
            </section>

            <div className="grid grid-cols-1 gap-5 xl:grid-cols-2">
              <section className="rounded-[18px] border border-border bg-white shadow-sm">
                <div className="border-b border-border px-5 py-4">
                  <h2 className="text-sm font-black text-foreground">Riwayat Piket</h2>
                </div>
                {history.length === 0 ? (
                  <div className="p-8 text-center text-sm font-semibold text-muted-foreground">Belum ada riwayat piket.</div>
                ) : (
                  <div className="divide-y divide-border">
                    {history.map((item) => (
                      <div key={item.id} className="flex items-start justify-between gap-4 px-5 py-4">
                        <div>
                          <p className="font-black text-foreground">{item.taskName}</p>
                          <p className="text-xs text-muted-foreground">{item.date}</p>
                          {item.submittedAt && <p className="mt-1 text-[10px] font-bold text-emerald-600">Submit: {new Date(item.submittedAt).toLocaleString("id-ID")}</p>}
                        </div>
                        <Badge status={item.autoCompletedByWfh ? getPicketAssignmentStatus(item) : item.isHoliday || item.isExempt ? "Libur" : isPicketAssignmentSubmitted(item) ? item.submissionStatus || item.status || "Terkirim" : item.status || "Ditugaskan"} />
                      </div>
                    ))}
                  </div>
                )}
              </section>

              <section className="rounded-[18px] border border-border bg-white shadow-sm">
                <div className="border-b border-border px-5 py-4">
                  <h2 className="text-sm font-black text-foreground">Status Izin Tidak Piket</h2>
                </div>
                {leaveRequests.length === 0 ? (
                  <div className="p-8 text-center text-sm font-semibold text-muted-foreground">Belum ada pengajuan izin tidak piket.</div>
                ) : (
                  <div className="divide-y divide-border">
                    {leaveRequests.map((item) => (
                      <div key={item.id} className="px-5 py-4">
                        <div className="flex items-start justify-between gap-3">
                          <div>
                            <p className="font-black text-foreground">{item.date}</p>
                            <p className="mt-1 text-sm text-muted-foreground">{item.reason}</p>
                            {item.replacementDate && (
                              <p className="mt-2 text-xs font-black text-blue-700">Jadwal pengganti: {item.replacementDate}</p>
                            )}
                          </div>
                          <Badge status={item.status} />
                        </div>
                        {(item.reviewedBy || item.reviewNote) && (
                          <p className="mt-2 rounded-[10px] bg-slate-50 px-3 py-2 text-xs font-semibold text-slate-600">
                            {item.status === "Disetujui" ? <CheckCircle2 size={13} className="mr-1 inline text-emerald-600" /> : null}
                            Review: {item.reviewNote || "-"} {item.reviewedBy ? `oleh ${item.reviewedBy}` : ""}
                          </p>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </section>
            </div>
            {holidays.length > 0 && (
              <section className="rounded-[18px] border border-border bg-white shadow-sm">
                <div className="border-b border-border px-5 py-4">
                  <h2 className="text-sm font-black text-foreground">Informasi Hari Libur Piket</h2>
                </div>
                <div className="divide-y divide-border">
                  {holidays.slice(0, 10).map((holiday) => (
                    <div key={holiday.id} className="flex flex-col gap-2 px-5 py-4 sm:flex-row sm:items-start sm:justify-between">
                      <div>
                        <div className="flex flex-wrap items-center gap-2">
                          <p className="font-black text-foreground">{holiday.name}</p>
                          <span className={`rounded-full border px-2 py-0.5 text-[9px] font-black ${holiday.source === "system" ? "border-rose-200 bg-rose-50 text-rose-700" : "border-violet-200 bg-violet-50 text-violet-700"}`}>
                            {holiday.source === "system" ? "Libur Kampus" : "Libur Piket"}
                          </span>
                        </div>
                        {holiday.notes && <p className="mt-1 text-sm text-muted-foreground">{holiday.notes}</p>}
                      </div>
                      <div className="flex shrink-0 items-center gap-2">
                        <Badge status="Libur" />
                        <span className="text-xs font-black text-slate-600">{holiday.date}</span>
                      </div>
                    </div>
                  ))}
                </div>
              </section>
            )}
          </>
        )}
      </div>
    </Layout>
  );
}
