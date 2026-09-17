import React, { ChangeEvent, useEffect, useMemo, useState } from "react";
import { Layout } from "../../templates/Layout";
import { Plus, X, Check, Upload, FileText } from "lucide-react";
import { apiGet, apiPost, buildQueryPath, encodePathSegment, getStoredUser } from "../../../lib/api";
import { formatDateYmd } from "../../../lib/date";
import { getWfhSourceMeta, getWfhSummary } from "../../../lib/wfh";

type LeaveStatus = "Disetujui" | "Ditolak" | "Menunggu";
type RequestType = "cuti" | "izin" | "sakit" | "wfh";

interface LeaveRecord {
  id: string;
  jenis: RequestType;
  tanggalPengajuan: string;
  periodeMulai: string;
  periodeSelesai: string;
  durasi: number;
  alasan: string;
  buktiPendukung?: string;
  status: LeaveStatus;
  reviewedBy?: string;
  reviewedAt?: string;
}

const REQUEST_TYPE_OPTIONS: Array<{ value: RequestType; label: string }> = [
  { value: "cuti", label: "Cuti" },
  { value: "izin", label: "Izin" },
  { value: "sakit", label: "Sakit" },
  { value: "wfh", label: "WFH" },
];

const REQUEST_TYPE_LABEL: Record<RequestType, string> = {
  cuti: "Cuti",
  izin: "Izin",
  sakit: "Sakit",
  wfh: "WFH",
};

const REQUEST_TYPE_BADGE: Record<RequestType, string> = {
  cuti: "bg-indigo-100 text-indigo-700 border border-indigo-200",
  izin: "bg-amber-100 text-amber-700 border border-amber-200",
  sakit: "bg-rose-100 text-rose-700 border border-rose-200",
  wfh: "bg-sky-100 text-sky-700 border border-sky-200",
};

const ALLOWED_ATTACHMENT_EXTENSIONS = ["pdf", "doc", "docx", "png", "jpg", "jpeg"];

const ALLOWED_ATTACHMENT_MIME_TYPES = new Set([
  "application/pdf",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "image/png",
  "image/jpeg",
]);

function parseRequestType(item: any): RequestType {
  const rawJenis = String(
    item?.jenisPengajuan || item?.jenis_pengajuan || item?.jenis || ""
  ).toLowerCase();

  if (rawJenis === "izin" || rawJenis === "sakit" || rawJenis === "cuti" || rawJenis === "wfh") {
    return rawJenis as RequestType;
  }

  const note = String(item?.catatan || "").toLowerCase();

  if (note.includes("jenis pengajuan: izin")) return "izin";
  if (note.includes("jenis pengajuan: sakit")) return "sakit";
  if (note.includes("jenis pengajuan: wfh")) return "wfh";

  return "cuti";
}

const initialFormState = {
  jenis: "cuti" as RequestType,
  periodeMulai: "",
  periodeSelesai: "",
  alasan: "",
  buktiPendukung: null as File | null,
};

function fileToDataUrl(file: File) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();

    reader.onload = () => resolve(String(reader.result || ""));
    reader.onerror = () => reject(new Error("Gagal membaca file lampiran."));

    reader.readAsDataURL(file);
  });
}

function validateAttachmentFile(file: File) {
  const extension = file.name.split(".").pop()?.toLowerCase() || "";
  const allowedExtension = ALLOWED_ATTACHMENT_EXTENSIONS.includes(extension);
  const allowedMime = !file.type || ALLOWED_ATTACHMENT_MIME_TYPES.has(file.type);

  if (!allowedExtension || !allowedMime) {
    return "Format lampiran tidak didukung. Gunakan PDF, DOC, DOCX, PNG, JPG, atau JPEG.";
  }

  return "";
}

function isRisetStudentType(tipe?: string | null) {
  return String(tipe || "").trim().toLowerCase() === "riset";
}

export default function LeaveRequest() {
  const user = getStoredUser();

  const [studentId, setStudentId] = useState("");
  const [studentType, setStudentType] = useState(String(user?.tipe || ""));
  const [wfhSummary, setWfhSummary] = useState(() => getWfhSummary());
  const [leaveData, setLeaveData] = useState<LeaveRecord[]>([]);
  const [cutiRule, setCutiRule] = useState<{
    maxSemesterDays: number;
    maxMonthDays: number;
    minAttendancePct: number;
  } | null>(null);

  const [error, setError] = useState("");
  const [requestModal, setRequestModal] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [formData, setFormData] = useState(initialFormState);

  const isRisetStudent = isRisetStudentType(studentType);
  const wfhSourceMeta = getWfhSourceMeta(wfhSummary.wfhQuotaSource);

  const requestTypeOptions = isRisetStudent
    ? REQUEST_TYPE_OPTIONS.filter((option) => !["cuti", "wfh"].includes(option.value))
    : REQUEST_TYPE_OPTIONS;

  const loadStudentProfileContext = async () => {
    if (user?.role !== "mahasiswa" || !user?.id) return;

    try {
      const profile = await apiGet<any>(`/profile/${encodePathSegment(user.id)}`);

      const resolvedId = String(
        profile?.student_id ||
        profile?.studentId ||
        profile?.id ||
        ""
      ).trim();

      if (profile?.tipe) {
        setStudentType(String(profile.tipe));
      }

      setWfhSummary(getWfhSummary(profile));
      setStudentId(resolvedId || String(user.id || ""));
    } catch {
      setStudentId(String(user?.id || ""));
      setWfhSummary(getWfhSummary());
    }
  };

  const loadLeaveHistory = async (resolvedStudentId: string) => {
    try {
      const [rows, settings] = await Promise.all([
        apiGet<Array<any>>(buildQueryPath("/leave-requests", { studentId: resolvedStudentId })),
        apiGet<any>("/system-settings"),
      ]);

      const mapped: LeaveRecord[] = (rows || []).map((item) => ({
        id: item.id,
        jenis: parseRequestType(item),
        tanggalPengajuan: formatDateYmd(item.tanggal_pengajuan),
        periodeMulai: formatDateYmd(item.periode_start),
        periodeSelesai: formatDateYmd(item.periode_end),
        durasi: item.durasi || 1,
        alasan: item.alasan,
        buktiPendukung:
          item.bukti_pendukung_name ||
          item.buktiPendukung ||
          item.file_name ||
          item.fileName ||
          item.attachment_name ||
          item.attachmentName ||
          "",
        status: item.status,
        reviewedBy: item.reviewed_by_name,
        reviewedAt: item.reviewed_at ? formatDateYmd(item.reviewed_at) : undefined,
      }));

      setLeaveData(mapped);

      setCutiRule({
        maxSemesterDays: Number(settings?.cuti?.maxSemesterDays || 0),
        maxMonthDays: Number(settings?.cuti?.maxMonthDays || 0),
        minAttendancePct: Number(settings?.cuti?.minAttendancePct || 0),
      });
    } catch (err: any) {
      setError(err?.message || "Gagal memuat data pengajuan.");
    }
  };

  useEffect(() => {
    void loadStudentProfileContext();
  }, [user?.id, user?.role]);

  useEffect(() => {
    if (!isRisetStudent) return;
    if (formData.jenis === "cuti" || formData.jenis === "wfh") {
      setFormData((prev) => ({ ...prev, jenis: "izin" }));
    }
  }, [formData.jenis, isRisetStudent]);

  useEffect(() => {
    if (formData.jenis !== "wfh" || !formData.periodeMulai) return;

    setFormData((prev) => ({
      ...prev,
      periodeSelesai: prev.periodeMulai,
    }));
  }, [formData.jenis, formData.periodeMulai]);

  useEffect(() => {
    if (!studentId) return;

    void loadLeaveHistory(studentId);
  }, [studentId, user?.id]);

  const resetForm = () => {
    setFormData(initialFormState);
    setError("");
  };

  const calculateDuration = (start: string, end: string): number => {
    if (!start || !end) return 0;

    const startDate = new Date(start);
    const endDate = new Date(end);
    const diffTime = endDate.getTime() - startDate.getTime();

    if (diffTime < 0) return 0;

    return Math.ceil(diffTime / (1000 * 60 * 60 * 24)) + 1;
  };

  const duration = useMemo(
    () => calculateDuration(formData.periodeMulai, formData.periodeSelesai),
    [formData.periodeMulai, formData.periodeSelesai]
  );

  const isSingleDayWfh = formData.jenis === "wfh";
  const effectiveDuration = isSingleDayWfh && formData.periodeMulai ? 1 : duration;

  const visibleLeaveData = isRisetStudent
    ? leaveData.filter((item) => !["cuti", "wfh"].includes(item.jenis))
    : leaveData;

  const handleFileChange = (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0] || null;

    if (file) {
      const validation = validateAttachmentFile(file);

      if (validation) {
        setError(validation);
        e.target.value = "";
        return;
      }
    }

    setError("");

    setFormData((prev) => ({
      ...prev,
      buktiPendukung: file,
    }));
  };

  const handleSubmitLeaveRequest = async () => {
    setError("");

    const effectiveEndDate = isSingleDayWfh
      ? formData.periodeMulai
      : formData.periodeSelesai;

    if (!formData.jenis || !formData.periodeMulai || !effectiveEndDate || !formData.alasan.trim()) {
      setError(
        formData.jenis === "wfh"
          ? "Jenis pengajuan, tanggal WFH, dan alasan harus diisi."
          : "Jenis pengajuan, tanggal mulai, tanggal selesai, dan alasan harus diisi."
      );
      return;
    }

    if (isRisetStudent && (formData.jenis === "cuti" || formData.jenis === "wfh")) {
      setError("Mahasiswa Riset hanya dapat mengajukan izin atau sakit.");
      return;
    }

    if (isSingleDayWfh && wfhSummary.wfhRemaining <= 0) {
      setError("Anda tidak punya jatah WFH.");
      return;
    }

    if (effectiveDuration <= 0) {
      setError("Tanggal selesai tidak boleh lebih awal dari tanggal mulai.");
      return;
    }

    if (isSingleDayWfh && effectiveDuration !== 1) {
      setError("Pengajuan WFH hanya berlaku untuk satu hari.");
      return;
    }

    if (formData.jenis === "cuti") {
      if (cutiRule?.maxMonthDays && effectiveDuration > cutiRule.maxMonthDays) {
        setError(`Maksimal cuti per bulan adalah ${cutiRule.maxMonthDays} hari.`);
        return;
      }

      if (cutiRule?.maxSemesterDays && effectiveDuration > cutiRule.maxSemesterDays) {
        setError(`Maksimal cuti per semester adalah ${cutiRule.maxSemesterDays} hari.`);
        return;
      }
    }

    const requestId = `LR${Date.now()}`;
    const activeStudentId = studentId || String(user?.id || "");

    try {
      setSubmitting(true);

      const selectedFile = formData.buktiPendukung;

      const payload: Record<string, unknown> = {
        id: requestId,
        studentId: activeStudentId,
        jenis: formData.jenis,
        jenisPengajuan: formData.jenis,
        countsAgainstLeaveQuota: formData.jenis === "cuti",
        countsAgainstWfhQuota: isSingleDayWfh,
        periodeStart: formData.periodeMulai,
        periodeEnd: effectiveEndDate,
        durasi: effectiveDuration,
        alasan: formData.alasan.trim(),
        tanggalPengajuan: new Date().toISOString().split("T")[0],
        catatan: selectedFile
          ? `Jenis pengajuan: ${formData.jenis}. Lampiran frontend: ${selectedFile.name}`
          : `Jenis pengajuan: ${formData.jenis}`,
      };

      if (selectedFile) {
        payload.fileDataUrl = await fileToDataUrl(selectedFile);
        payload.fileName = selectedFile.name;
      }

      await apiPost<{ message: string }>("/leave-requests", payload);

      await Promise.all([
        loadStudentProfileContext(),
        loadLeaveHistory(activeStudentId),
      ]);

      setRequestModal(false);
      resetForm();
    } catch (err: any) {
      setError(err?.message || "Gagal mengajukan data.");
    } finally {
      setSubmitting(false);
    }
  };

  const StatusBadge = ({ status }: { status: LeaveStatus }) => {
    const colors = {
      Disetujui: "bg-emerald-100 text-emerald-700",
      Ditolak: "bg-red-100 text-red-600",
      Menunggu: "bg-amber-100 text-amber-700",
    };

    return (
      <span
        className={`inline-flex items-center justify-center gap-1.5 px-2.5 py-1 rounded-lg text-[11px] font-bold ${colors[status]}`}
      >
        {status}
      </span>
    );
  };

  const TypeBadge = ({ jenis }: { jenis: RequestType }) => {
    return (
      <span
        className={`inline-flex items-center px-2.5 py-1 rounded-lg text-[11px] font-bold ${REQUEST_TYPE_BADGE[jenis]}`}
      >
        {REQUEST_TYPE_LABEL[jenis]}
      </span>
    );
  };

  return (
    <Layout title={isRisetStudent ? "Pengajuan Izin dan Sakit" : "Pengajuan Cuti, Izin, Sakit, dan WFH"}>
      <div className="flex flex-col gap-4 sm:gap-5 p-4 sm:p-6 max-w-4xl">
        {!requestModal && error && (
          <div className="px-4 py-3 rounded-xl border border-red-200 bg-red-50 text-sm font-semibold text-red-600">
            {error}
          </div>
        )}

        {cutiRule && !isRisetStudent && (
          <div className="px-4 py-3 rounded-xl border border-blue-200 bg-blue-50 text-sm font-semibold text-blue-700 leading-relaxed">
            Aturan cuti aktif: {cutiRule.maxSemesterDays} hari/semester, {cutiRule.maxMonthDays} hari/bulan,
            minimum kehadiran {cutiRule.minAttendancePct}%. Aturan ini hanya diterapkan untuk pengajuan jenis <b>cuti</b>.
          </div>
        )}

        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="text-lg sm:text-xl font-bold">Riwayat Pengajuan</h2>
            <p className="text-sm text-muted-foreground mt-1">
              {isRisetStudent
                ? "Mahasiswa Riset dapat mengajukan izin dan sakit."
                : "Form pengajuan kini mendukung cuti, izin, sakit, dan WFH."}
            </p>
          </div>

          <button
            onClick={() => {
              resetForm();
              setRequestModal(true);
            }}
            className="h-10 px-4 bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-black rounded-[10px] transition-colors flex items-center justify-center gap-2 w-full sm:w-auto"
          >
            <Plus size={14} /> Ajukan Pengajuan Baru
          </button>
        </div>

        <div className="bg-white border border-border rounded-lg p-4 sm:p-6 shadow-sm">
          <p className="text-xs font-black text-muted-foreground mb-3 uppercase tracking-wide">
            Riwayat ({visibleLeaveData.length} entri)
          </p>

          {visibleLeaveData.length === 0 ? (
            <p className="text-muted-foreground italic">Tidak ada riwayat pengajuan.</p>
          ) : (
            <div className="space-y-3">
              {visibleLeaveData.map((leave) => (
                <div
                  key={leave.id}
                  className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between border-b pb-4 last:border-0"
                >
                  <div className="flex-1 min-w-0">
                    <div className="flex flex-wrap items-center gap-2 mb-1.5">
                      <p className="font-bold break-words">{leave.tanggalPengajuan}</p>
                      <TypeBadge jenis={leave.jenis} />
                    </div>

                    <p className="text-sm text-muted-foreground">
                      {leave.periodeMulai} - {leave.periodeSelesai} ({leave.durasi} hari)
                    </p>

                    <p className="text-sm mt-1 break-words">{leave.alasan}</p>

                    {leave.buktiPendukung && (
                      <div className="mt-2 inline-flex max-w-full items-center gap-2 rounded-lg bg-slate-50 border border-slate-200 px-3 py-2 text-xs text-slate-700">
                        <FileText size={14} className="shrink-0" />
                        <span className="truncate">{leave.buktiPendukung}</span>
                      </div>
                    )}
                  </div>

                  <div className="sm:pl-4 self-start">
                    <StatusBadge status={leave.status} />
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {requestModal && (
          <div
            className="fixed inset-0 z-[200] flex items-center justify-center bg-black/50 backdrop-blur-sm p-4"
            onClick={() => {
              setRequestModal(false);
              resetForm();
            }}
          >
            <div
              className="bg-white rounded-[20px] shadow-2xl w-full max-w-[560px] max-h-[90vh] overflow-y-auto"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="px-5 sm:px-6 py-4 sm:py-5 border-b border-border flex items-center justify-between">
                <h3 className="font-black text-foreground">
                  {isRisetStudent ? "Ajukan Izin / Sakit" : "Ajukan Cuti / Izin / Sakit / WFH"}
                </h3>

                <button
                  onClick={() => {
                    setRequestModal(false);
                    resetForm();
                  }}
                  className="w-8 h-8 rounded-full flex items-center justify-center hover:bg-slate-100 text-muted-foreground"
                >
                  <X size={16} />
                </button>
              </div>

              <div className="p-5 sm:p-6 flex flex-col gap-4">
                {error && (
                  <div className="px-4 py-3 rounded-xl border border-red-200 bg-red-50 text-sm font-semibold text-red-600">
                    {error}
                  </div>
                )}

                <div>
                  <label className="text-xs font-black text-foreground block mb-1.5">
                    Jenis Pengajuan
                  </label>

                  <select
                    value={formData.jenis}
                    onChange={(e) =>
                      setFormData((prev) => ({
                        ...prev,
                        jenis: e.target.value as RequestType,
                      }))
                    }
                    className="w-full h-10 px-3 rounded-[10px] border border-border text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300 transition-all bg-white"
                  >
                    {requestTypeOptions.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>

                  {formData.jenis === "wfh" && (
                    <div className="mt-1.5 flex flex-col gap-1">
                      <p className="text-[11px] font-semibold text-sky-700">
                        {wfhSummary.wfhQuota > 0
                          ? `Jatah WFH ${wfhSummary.wfhQuota} hari, terpakai ${wfhSummary.wfhUsed} hari, sisa ${wfhSummary.wfhRemaining} hari.`
                          : "Anda tidak punya jatah WFH."}
                      </p>
                    </div>
                  )}
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="text-xs font-black text-foreground block mb-1.5">
                      Tanggal Mulai
                    </label>

                    <input
                      type="date"
                      value={formData.periodeMulai}
                      onChange={(e) =>
                        setFormData((prev) => ({
                          ...prev,
                          periodeMulai: e.target.value,
                          periodeSelesai: prev.jenis === "wfh" ? e.target.value : prev.periodeSelesai,
                        }))
                      }
                      className="w-full h-10 px-3 rounded-[10px] border border-border text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300 transition-all"
                    />
                  </div>

                  <div>
                    <label className="text-xs font-black text-foreground block mb-1.5">
                      Tanggal Selesai
                    </label>

                    <input
                      type="date"
                      value={formData.periodeSelesai}
                      onChange={(e) =>
                        setFormData((prev) => ({
                          ...prev,
                          periodeSelesai: e.target.value,
                        }))
                      }
                      disabled={isSingleDayWfh}
                      className="w-full h-10 px-3 rounded-[10px] border border-border text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300 transition-all"
                    />

                    {formData.jenis === "wfh" && (
                      <p className="mt-1.5 text-[11px] font-semibold text-muted-foreground">
                        WFH hanya berlaku pada tanggal mulai (1 hari).
                      </p>
                    )}
                  </div>
                </div>

                {formData.periodeMulai && (formData.jenis === "wfh" || formData.periodeSelesai) && (
                  <div className="p-3 bg-blue-50 border border-blue-200 rounded-[10px]">
                    <p className="text-xs font-bold text-blue-700">
                      Durasi Pengajuan: <span className="font-black">{effectiveDuration} hari</span>
                    </p>
                  </div>
                )}

                <div>
                  <label className="text-xs font-black text-foreground block mb-1.5">
                    Alasan Pengajuan
                  </label>

                  <textarea
                    value={formData.alasan}
                    onChange={(e) =>
                      setFormData((prev) => ({
                        ...prev,
                        alasan: e.target.value,
                      }))
                    }
                    rows={4}
                    placeholder="Jelaskan alasan pengajuan Anda..."
                    className="w-full px-3 py-2 rounded-[10px] border border-border text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300 transition-all resize-none"
                  />
                </div>

                <div>
                  <label className="text-xs font-black text-foreground block mb-1.5">
                    Lampiran Pendukung{" "}
                    <span className="font-bold text-muted-foreground">(opsional)</span>
                  </label>

                  <label className="w-full min-h-[108px] border border-dashed border-slate-300 rounded-[14px] bg-slate-50 hover:bg-slate-100 transition-colors flex flex-col items-center justify-center gap-2 px-4 py-5 text-center cursor-pointer">
                    <Upload size={18} className="text-slate-500" />

                    <div>
                      <p className="text-sm font-bold text-slate-700">Klik untuk memilih file</p>
                      <p className="text-xs text-slate-500 mt-1">
                        PDF, DOC, DOCX, PNG, JPG, atau JPEG
                      </p>
                    </div>

                    <input
                      type="file"
                      accept=".pdf,.jpg,.jpeg,.png,.doc,.docx"
                      onChange={handleFileChange}
                      className="hidden"
                    />
                  </label>

                  {formData.buktiPendukung && (
                    <div className="mt-3 flex items-center gap-2 rounded-[10px] border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-700">
                      <FileText size={15} className="shrink-0" />
                      <span className="truncate">{formData.buktiPendukung.name}</span>
                    </div>
                  )}
                </div>
              </div>

              <div className="px-5 sm:px-6 pb-5 sm:pb-6 flex flex-col-reverse sm:flex-row gap-3">
                <button
                  onClick={() => {
                    setRequestModal(false);
                    resetForm();
                  }}
                  className="flex-1 h-10 border border-border rounded-[10px] text-sm font-bold text-muted-foreground hover:bg-slate-50 transition-colors"
                  disabled={submitting}
                >
                  Batal
                </button>

                <button
                  onClick={handleSubmitLeaveRequest}
                  disabled={submitting || (isSingleDayWfh && wfhSummary.wfhRemaining <= 0)}
                  className="flex-1 h-10 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-60 disabled:cursor-not-allowed text-white text-sm font-black rounded-[10px] transition-colors flex items-center justify-center gap-2"
                >
                  <Check size={14} strokeWidth={3} />
                  {submitting ? "Mengajukan..." : "Ajukan"}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </Layout>
  );
}