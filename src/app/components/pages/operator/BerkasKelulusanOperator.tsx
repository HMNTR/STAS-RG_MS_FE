import React, { useEffect, useMemo, useState } from "react";
import { AlertTriangle, CheckCircle2, ExternalLink, Eye, FileCheck, GraduationCap, Loader2, Search, X } from "lucide-react";
import { apiGet, apiPatch, apiPost } from "../../../lib/api";
import { OperatorLayout } from "../../templates/OperatorLayout";

type GraduationFieldKey =
  | "reportUrl"
  | "productPhotoFolderUrl"
  | "manualBookUrl"
  | "demoVideoUrl"
  | "githubUrl"
  | "repositoryUrl"
  | "deployedUrl"
  | "datasetModelUrl"
  | "designDocumentationUrl";

type FieldReview = {
  status?: "accepted" | "rejected" | "pending";
  note?: string | null;
  reviewedAt?: string | null;
  reviewedBy?: string | null;
};

type GraduationSubmission = {
  id: string;
  status: string;
  submittedAt?: string | null;
  submitted_at?: string | null;
  createdAt?: string | null;
  created_at?: string | null;
  updatedAt?: string | null;
  updated_at?: string | null;
  projectCount?: number;
  project_count?: number;
  projectSummary?: string;
  project_summary?: string;
  graduationAllowedAt?: string | null;
  graduation_allowed_at?: string | null;
  graduationCompletedAt?: string | null;
  graduation_completed_at?: string | null;
  certificateEligible?: boolean;
  certificate_eligible?: boolean;
  student?: {
    id?: string;
    nim?: string;
    name?: string;
    initials?: string;
    photoUrl?: string | null;
    status?: string;
    tipe?: string;
  };
  projects?: any[];
};

type LinkField = {
  key: GraduationFieldKey;
  snakeKey: string;
  label: string;
};

const STATUS_STYLE: Record<string, string> = {
  Draft: "bg-slate-100 text-slate-600 border border-slate-200",
  Dikirim: "bg-blue-100 text-blue-700 border border-blue-200",
  Valid: "bg-emerald-100 text-emerald-700 border border-emerald-200",
  Revisi: "bg-amber-100 text-amber-700 border border-amber-200"
};

const REVIEW_STYLE: Record<string, string> = {
  accepted: "bg-emerald-100 text-emerald-700 border border-emerald-200",
  rejected: "bg-red-100 text-red-700 border border-red-200",
  pending: "bg-slate-100 text-slate-600 border border-slate-200"
};

const COMMON_LINK_FIELDS: LinkField[] = [
  { key: "reportUrl", snakeKey: "report_url", label: "Link Laporan PA/Magang" },
  { key: "productPhotoFolderUrl", snakeKey: "product_photo_folder_url", label: "Link Folder Foto Produk" },
  { key: "manualBookUrl", snakeKey: "manual_book_url", label: "Link Manual Book" },
  { key: "demoVideoUrl", snakeKey: "demo_video_url", label: "Link Video Demo Project" },
  { key: "githubUrl", snakeKey: "github_url", label: "Link GitHub" }
];

const SPECIAL_LINK_FIELDS: LinkField[] = [
  { key: "repositoryUrl", snakeKey: "repository_url", label: "Link Repository GitHub / GitLab" },
  { key: "deployedUrl", snakeKey: "deployed_url", label: "Link Website Ter-deploy / Live" },
  { key: "datasetModelUrl", snakeKey: "dataset_model_url", label: "Link Dataset & Model Weights" },
  { key: "designDocumentationUrl", snakeKey: "design_documentation_url", label: "Link Master Desain & Dokumentasi Konten" }
];

const REQUIRED_COMMON_GRADUATION_FIELD_KEYS = new Set<GraduationFieldKey>([
  "reportUrl",
  "productPhotoFolderUrl",
  "manualBookUrl",
  "demoVideoUrl"
]);

function text(value: unknown, fallback = "-") {
  const normalized = String(value ?? "").trim();
  return normalized || fallback;
}

function formatDateTimeJakarta(value?: string | null) {
  const raw = String(value || "").trim();
  if (!raw) return "-";

  const parsed = new Date(raw);
  if (Number.isNaN(parsed.getTime())) return raw;

  try {
    return parsed.toLocaleString("id-ID", {
      day: "2-digit",
      month: "short",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
      timeZone: "Asia/Jakarta"
    }).replace(",", "");
  } catch {
    return raw;
  }
}

function getStudentInitials(item: GraduationSubmission) {
  const student = item.student || {};
  if (student.initials) return student.initials;
  return text(student.name, "M")
    .split(/\s+/)
    .map((part) => part[0])
    .join("")
    .slice(0, 2)
    .toUpperCase() || "M";
}

function getSubmittedAt(item: GraduationSubmission) {
  return item.submittedAt || item.submitted_at || null;
}

function getSavedAt(item: GraduationSubmission) {
  return item.submittedAt || item.submitted_at || item.updatedAt || item.updated_at || item.createdAt || item.created_at || null;
}

function getProjectCount(item: GraduationSubmission) {
  return Number(item.projectCount ?? item.project_count ?? item.projects?.length ?? 0);
}

function getProjectSummary(item: GraduationSubmission) {
  return text(item.projectSummary || item.project_summary, "Belum ada ringkasan riset");
}

function getGraduationAllowedAt(item?: GraduationSubmission | null) {
  return item?.graduationAllowedAt || item?.graduation_allowed_at || null;
}

function getFieldValue(project: any, field: LinkField) {
  return text(project?.[field.key] || project?.[field.snakeKey], "");
}

function getFieldReview(project: any, field: LinkField): FieldReview {
  const reviews = project?.fieldReviews || project?.field_reviews || {};
  return reviews?.[field.key] || {};
}

function getReviewStatus(review: FieldReview) {
  if (review.status === "accepted") return "accepted";
  if (review.status === "rejected") return "rejected";
  return "pending";
}

function getReviewLabel(review: FieldReview) {
  const status = getReviewStatus(review);
  if (status === "accepted") return "ACC";
  if (status === "rejected") return "Ditolak";
  return "Menunggu";
}

function getRequiredSpecialFieldKeys(project: any) {
  const required = Array.isArray(project?.requiredSpecialFields)
    ? project.requiredSpecialFields
    : Array.isArray(project?.required_special_fields)
      ? project.required_special_fields
      : [];

  return new Set(
    required
      .filter((field: any) => field?.key && field.required !== false)
      .map((field: any) => field.key)
  );
}

function getSpecialFields(project: any) {
  const requiredKeys = getRequiredSpecialFieldKeys(project);

  return SPECIAL_LINK_FIELDS.filter((field) => requiredKeys.has(field.key) || Boolean(getFieldValue(project, field)));
}

function getProjectRowId(project: any) {
  return String(project?.id || project?.projectRowId || project?.project_row_id || "");
}

function getFieldsRequiredForGraduation(project: any) {
  const commonFields = COMMON_LINK_FIELDS.filter((field) => REQUIRED_COMMON_GRADUATION_FIELD_KEYS.has(field.key) || Boolean(getFieldValue(project, field)));
  return [...commonFields, ...getSpecialFields(project)];
}

function isProjectFullyAccepted(project: any) {
  const fields = getFieldsRequiredForGraduation(project);
  return fields.length > 0 && fields.every((field) => {
    const value = getFieldValue(project, field);
    const review = getFieldReview(project, field);
    return Boolean(value) && getReviewStatus(review) === "accepted";
  });
}

function isSubmissionFullyAccepted(item?: GraduationSubmission | null) {
  const projects = item?.projects || [];
  return projects.length > 0 && projects.every(isProjectFullyAccepted);
}

function LinkRow({
  project,
  field,
  reviewingKey,
  onReview,
  canReview = true
}: {
  project: any;
  field: LinkField;
  reviewingKey: string | null;
  canReview?: boolean;
  onReview: (projectRowId: string, fieldKey: GraduationFieldKey, status: "accepted" | "rejected", currentReview: FieldReview) => void;
}) {
  const value = getFieldValue(project, field);
  const review = getFieldReview(project, field);
  const reviewStatus = getReviewStatus(review);
  const projectRowId = getProjectRowId(project);
  const accKey = `${projectRowId}:${field.key}:accepted`;
  const rejectKey = `${projectRowId}:${field.key}:rejected`;
  const disabled = !canReview || !value || !projectRowId || Boolean(reviewingKey);

  return (
    <div className="rounded-[12px] border border-slate-200 bg-white p-3">
      <div className="mb-2 flex items-start justify-between gap-2">
        <p className="text-[10px] font-black uppercase tracking-wide text-muted-foreground">{field.label}</p>
        {value && (
          <span className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-black ${REVIEW_STYLE[reviewStatus]}`}>
            {getReviewLabel(review)}
          </span>
        )}
      </div>
      {value ? (
        <div className="flex flex-col gap-3">
          <p className="min-w-0 break-all text-xs font-semibold text-foreground">{value}</p>
          {reviewStatus === "rejected" && review.note && (
            <p className="rounded-[10px] bg-red-50 px-3 py-2 text-xs font-bold text-red-600">
              Catatan: {review.note}
            </p>
          )}
          {!canReview && (
            <p className="rounded-[10px] bg-slate-50 px-3 py-2 text-xs font-bold text-slate-500">
              Link sudah tersimpan. Admin bisa ACC/Tolak kolom ini selama link sudah diisi.
            </p>
          )}
          <div className="flex flex-wrap gap-2">
            <a
              href={value}
              target="_blank"
              rel="noreferrer"
              className="inline-flex h-8 shrink-0 items-center justify-center gap-1.5 rounded-[9px] bg-slate-900 px-3 text-[11px] font-black text-white transition-colors hover:bg-slate-800"
            >
              Buka <ExternalLink size={12} />
            </a>
            <button
              type="button"
              onClick={() => onReview(projectRowId, field.key, "accepted", review)}
              disabled={disabled}
              className={`inline-flex h-8 items-center justify-center gap-1.5 rounded-[9px] px-3 text-[11px] font-black transition-colors disabled:cursor-not-allowed disabled:opacity-60 ${
                reviewStatus === "accepted"
                  ? "bg-emerald-600 text-white hover:bg-emerald-700"
                  : "bg-emerald-50 text-emerald-700 hover:bg-emerald-100"
              }`}
            >
              {reviewingKey === accKey ? <Loader2 size={12} className="animate-spin" /> : <CheckCircle2 size={12} />} ACC
            </button>
            <button
              type="button"
              onClick={() => onReview(projectRowId, field.key, "rejected", review)}
              disabled={disabled}
              className={`inline-flex h-8 items-center justify-center gap-1.5 rounded-[9px] px-3 text-[11px] font-black transition-colors disabled:cursor-not-allowed disabled:opacity-60 ${
                reviewStatus === "rejected"
                  ? "bg-red-600 text-white hover:bg-red-700"
                  : "bg-red-50 text-red-700 hover:bg-red-100"
              }`}
            >
              {reviewingKey === rejectKey ? <Loader2 size={12} className="animate-spin" /> : <X size={12} />} Tolak
            </button>
          </div>
        </div>
      ) : (
        <p className="text-xs font-semibold text-slate-400">Belum diisi</p>
      )}
    </div>
  );
}

export default function BerkasKelulusanOperator() {
  const [items, setItems] = useState<GraduationSubmission[]>([]);
  const [selected, setSelected] = useState<GraduationSubmission | null>(null);
  const [loading, setLoading] = useState(true);
  const [detailLoadingId, setDetailLoadingId] = useState<string | null>(null);
  const [reviewingKey, setReviewingKey] = useState<string | null>(null);
  const [allowing, setAllowing] = useState(false);
  const [graduating, setGraduating] = useState(false);
  const [directGraduateModalOpen, setDirectGraduateModalOpen] = useState(false);
  const [activeStudents, setActiveStudents] = useState<any[]>([]);
  const [loadingActiveStudents, setLoadingActiveStudents] = useState(false);
  const [selectedStudentToGraduate, setSelectedStudentToGraduate] = useState<string>("");
  const [directGraduateSubmitting, setDirectGraduateSubmitting] = useState(false);
  const [search, setSearch] = useState("");
  const [error, setError] = useState("");

  const loadItems = async () => {
    setLoading(true);
    setError("");
    try {
      const rows = await apiGet<GraduationSubmission[]>("/graduation-submissions");
      setItems(Array.isArray(rows) ? rows : []);
    } catch (err: any) {
      setError(err?.message || "Gagal memuat berkas kelulusan.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadItems();
  }, []);

  const filtered = useMemo(() => {
    const keyword = search.trim().toLowerCase();
    if (!keyword) return items;

    return items.filter((item) => {
      const student = item.student || {};
      return [
        student.name,
        student.nim,
        student.status,
        item.status,
        item.projectSummary,
        item.project_summary
      ].some((value) => String(value || "").toLowerCase().includes(keyword));
    });
  }, [items, search]);

  const summary = useMemo(() => ({
    total: items.length,
    draft: items.filter((item) => item.status === "Draft").length,
    dikirim: items.filter((item) => item.status === "Dikirim").length,
    valid: items.filter((item) => item.status === "Valid").length,
    revisi: items.filter((item) => item.status === "Revisi").length
  }), [items]);

  const syncSelectedDetail = (detail: GraduationSubmission) => {
    setSelected(detail);
    setItems((prev) => prev.map((row) => row.id === detail.id ? { ...row, ...detail } : row));
  };

  const openDetail = async (item: GraduationSubmission) => {
    setSelected(item);
    if (!item.id) return;

    setDetailLoadingId(item.id);
    try {
      const detail = await apiGet<GraduationSubmission>(`/graduation-submissions/${encodeURIComponent(item.id)}`);
      syncSelectedDetail(detail);
    } catch (err: any) {
      setError(err?.message || "Gagal memuat detail berkas kelulusan.");
    } finally {
      setDetailLoadingId(null);
    }
  };

  const handleReview = async (
    projectRowId: string,
    fieldKey: GraduationFieldKey,
    status: "accepted" | "rejected",
    currentReview: FieldReview
  ) => {
    if (!selected?.id || !projectRowId) return;

    let note: string | null = null;
    if (status === "rejected") {
      const input = window.prompt("Catatan penolakan untuk mahasiswa (opsional):", currentReview.note || "");
      if (input === null) return;
      note = input.trim() || null;
    }

    const actionKey = `${projectRowId}:${fieldKey}:${status}`;
    setReviewingKey(actionKey);
    setError("");
    try {
      const detail = await apiPatch<GraduationSubmission>(
        `/graduation-submissions/${encodeURIComponent(selected.id)}/projects/${encodeURIComponent(projectRowId)}/fields/${encodeURIComponent(fieldKey)}/review`,
        { status, note }
      );
      syncSelectedDetail(detail);
    } catch (err: any) {
      setError(err?.message || "Gagal menyimpan review berkas.");
    } finally {
      setReviewingKey(null);
    }
  };

  const handleAllowGraduation = async () => {
    if (!selected?.id || allowing) return;
    if (selected?.student?.status === "Alumni") {
      setError("Mahasiswa ini sudah menjadi Alumni STAS-RG.");
      return;
    }

    if (getGraduationAllowedAt(selected)) {
      setError("Mahasiswa ini sudah diberi izin lulus.");
      return;
    }

    if (!isSubmissionFullyAccepted(selected)) {
      const proceed = window.confirm(
        "⚠️ Peringatan: Tidak semua link wajib terisi dan ACC.\n\nApakah Anda tetap ingin memberi izin lulus untuk mahasiswa ini? Mahasiswa tetap harus klik Jadi Alumni STAS-RG sendiri."
      );
      if (!proceed) return;
    } else {
      const confirmed = window.confirm("Beri izin lulus untuk mahasiswa ini? Setelah diizinkan, mahasiswa bisa klik Jadi Alumni STAS-RG sendiri.");
      if (!confirmed) return;
    }

    setAllowing(true);
    setError("");
    try {
      const detail = await apiPost<GraduationSubmission>(`/graduation-submissions/${encodeURIComponent(selected.id)}/allow-graduation`);
      syncSelectedDetail(detail);
    } catch (err: any) {
      setError(err?.message || "Gagal memberi izin lulus.");
    } finally {
      setAllowing(false);
    }
  };

  const handleGraduateByAdmin = async () => {
    if (!selected?.id || graduating) return;
    if (selected?.student?.status === "Alumni") {
      setError("Mahasiswa ini sudah berstatus Alumni STAS-RG.");
      return;
    }

    const fullyAccepted = isSubmissionFullyAccepted(selected);
    if (!fullyAccepted) {
      const confirmed = window.confirm(
        "⚠️ PERINGATAN KELULUSAN DISPENSASI:\n\nBerkas kelulusan mahasiswa ini BELUM LENGKAP atau BELUM SEMUA DI-ACC.\n\nJika diluluskan sekarang, mahasiswa akan resmi menjadi Alumni STAS-RG namun TIDAK MENDAPATKAN SERTIFIKAT (sertifikat ditangguhkan sampai berkas dipenuhi).\n\nApakah Anda yakin ingin meluluskan mahasiswa ini sekarang?"
      );
      if (!confirmed) return;
    } else {
      const confirmed = window.confirm(
        "Luluskan mahasiswa ini sekarang menjadi Alumni STAS-RG?\n\nBerkas kelulusan sudah lengkap dan ACC. Sertifikat berhak diterbitkan."
      );
      if (!confirmed) return;
    }

    setGraduating(true);
    setError("");
    try {
      const detail = await apiPost<GraduationSubmission>(
        `/graduation-submissions/${encodeURIComponent(selected.id)}/graduate-by-admin`
      );
      syncSelectedDetail(detail);
      await loadItems();
    } catch (err: any) {
      setError(err?.message || "Gagal meluluskan mahasiswa.");
    } finally {
      setGraduating(false);
    }
  };

  const openDirectGraduateModal = async () => {
    setDirectGraduateModalOpen(true);
    setSelectedStudentToGraduate("");
    setLoadingActiveStudents(true);
    try {
      const data = await apiGet<any>("/students?status=Aktif&limit=100");
      const list = Array.isArray(data) ? data : data?.students || data?.items || [];
      setActiveStudents(list);
    } catch {
      setActiveStudents([]);
    } finally {
      setLoadingActiveStudents(false);
    }
  };

  const handleDirectGraduateSubmit = async () => {
    if (!selectedStudentToGraduate || directGraduateSubmitting) return;
    const student = activeStudents.find((s) => s.id === selectedStudentToGraduate);
    const studentName = student?.name || "Mahasiswa ini";

    const confirmed = window.confirm(
      `⚠️ PERINGATAN KELULUSAN DISPENSASI:\n\nLuluskan ${studentName} secara langsung menjadi Alumni STAS-RG tanpa menunggu pengisian berkas kelulusan?\n\nMahasiswa TIDAK AKAN MENDAPATKAN SERTIFIKAT sampai berkas kelulusan dilengkapi.`
    );
    if (!confirmed) return;

    setDirectGraduateSubmitting(true);
    setError("");
    try {
      await apiPost("/graduation-submissions/direct-graduate", {
        studentId: selectedStudentToGraduate,
        note: "Diluluskan langsung oleh Admin/Operator tanpa berkas kelulusan (Sertifikat ditangguhkan)."
      });
      setDirectGraduateModalOpen(false);
      await loadItems();
    } catch (err: any) {
      setError(err?.message || "Gagal meluluskan mahasiswa secara langsung.");
    } finally {
      setDirectGraduateSubmitting(false);
    }
  };

  const graduationAlreadyAllowed = Boolean(getGraduationAllowedAt(selected));
  const selectedFullyAccepted = isSubmissionFullyAccepted(selected);
  const canAllowSelected = selected?.student?.status !== "Alumni" && !graduationAlreadyAllowed;
  const allowGraduationLabel = selected?.student?.status === "Alumni"
    ? "Sudah Alumni"
    : graduationAlreadyAllowed
      ? "Sudah Diizinkan"
      : !selectedFullyAccepted
        ? "Izinkan Lulus (Belum Lengkap)"
        : "Izinkan Lulus";
  const allowGraduationHint = !selectedFullyAccepted
    ? "Tidak semua link ACC — Anda tetap bisa izinkan lulus dengan konfirmasi."
    : undefined;

  return (
    <OperatorLayout title="Berkas Kelulusan Mahasiswa">
      <div className="flex flex-col gap-5 pb-6">
        {error && (
          <div className="flex items-center gap-2 rounded-[14px] border border-red-200 bg-red-50 px-4 py-3 text-sm font-bold text-red-600">
            <AlertTriangle size={16} /> {error}
          </div>
        )}

        <div className="rounded-[20px] border border-emerald-100 bg-gradient-to-br from-emerald-50 via-white to-teal-50 p-5 shadow-sm">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <div className="mb-2 inline-flex items-center gap-2 rounded-full bg-emerald-100 px-3 py-1 text-[11px] font-black uppercase tracking-wide text-emerald-700">
                <FileCheck size={13} /> Review Berkas Kelulusan
              </div>
              <h2 className="text-2xl font-black text-foreground">Submit form kelulusan mahasiswa</h2>
              <p className="mt-1 max-w-2xl text-sm font-medium text-muted-foreground">
                Admin bisa ACC/Tolak setiap link. Setelah semua link ACC, admin memberi izin lulus agar tombol Alumni muncul di mahasiswa.
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={() => void openDirectGraduateModal()}
                className="inline-flex h-10 items-center gap-2 rounded-[12px] bg-sky-600 px-4 text-xs font-black text-white shadow-sm transition-colors hover:bg-sky-700"
              >
                <GraduationCap size={15} /> Luluskan Mahasiswa Langsung
              </button>
              <button
                onClick={() => void loadItems()}
                className="h-10 rounded-[12px] bg-emerald-600 px-4 text-xs font-black text-white transition-colors hover:bg-emerald-700"
              >
                Refresh Data
              </button>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4 xl:grid-cols-5">
          {[
            { label: "Total Data", value: summary.total, color: "bg-slate-100 text-slate-700" },
            { label: "Draft", value: summary.draft, color: "bg-slate-100 text-slate-700" },
            { label: "Dikirim", value: summary.dikirim, color: "bg-blue-100 text-blue-700" },
            { label: "Valid", value: summary.valid, color: "bg-emerald-100 text-emerald-700" },
            { label: "Revisi", value: summary.revisi, color: "bg-amber-100 text-amber-700" }
          ].map((item) => (
            <div key={item.label} className="rounded-[16px] border border-border bg-white p-4 shadow-sm">
              <div className={`mb-3 flex h-10 w-10 items-center justify-center rounded-[12px] ${item.color}`}>
                <CheckCircle2 size={19} />
              </div>
              <p className="text-2xl font-black text-foreground">{item.value}</p>
              <p className="text-[10px] font-black uppercase tracking-wide text-muted-foreground">{item.label}</p>
            </div>
          ))}
        </div>

        <div className="rounded-[18px] border border-border bg-white shadow-sm">
          <div className="flex flex-col gap-3 border-b border-border px-5 py-4 md:flex-row md:items-center md:justify-between">
            <div>
              <h3 className="font-black text-foreground">Daftar Berkas Kelulusan</h3>
              <p className="text-xs font-semibold text-muted-foreground">Klik detail untuk melihat semua link per riset.</p>
            </div>
            <div className="relative w-full md:w-[320px]">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={15} />
              <input
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Cari nama, NIM, riset, status..."
                className="h-10 w-full rounded-[12px] border border-border bg-slate-50 pl-9 pr-3 text-sm font-semibold outline-none transition-all focus:border-emerald-300 focus:bg-white focus:ring-2 focus:ring-emerald-100"
              />
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-border bg-slate-50">
                  {["Mahasiswa", "Status Mhs", "Riset", "Waktu Simpan/Kirim", "Status Berkas", "Aksi"].map((header) => (
                    <th key={header} className="whitespace-nowrap px-5 py-3 text-xs font-black uppercase tracking-wide text-muted-foreground">{header}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {loading ? (
                  <tr>
                    <td colSpan={6} className="px-5 py-10 text-center text-sm font-bold text-muted-foreground">
                      <span className="inline-flex items-center gap-2"><Loader2 size={16} className="animate-spin" /> Memuat data...</span>
                    </td>
                  </tr>
                ) : filtered.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="px-5 py-10 text-center text-sm font-bold text-muted-foreground">Belum ada draft atau berkas kelulusan yang tersimpan.</td>
                  </tr>
                ) : filtered.map((item) => {
                  const student = item.student || {};
                  return (
                    <tr key={item.id} className="transition-colors hover:bg-slate-50">
                      <td className="px-5 py-3.5">
                        <div className="flex items-center gap-3">
                          {student.photoUrl ? (
                            <img src={student.photoUrl} alt={text(student.name, "Mahasiswa")} className="h-9 w-9 shrink-0 rounded-full object-cover border border-gray-200" />
                          ) : (
                            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-emerald-600 text-xs font-black text-white">
                              {getStudentInitials(item)}
                            </div>
                          )}
                          <div>
                            <p className="text-xs font-black text-foreground">{text(student.name, "Mahasiswa")}</p>
                            <p className="text-[10px] font-semibold text-muted-foreground">{text(student.nim)}</p>
                          </div>
                        </div>
                      </td>
                      <td className="px-5 py-3.5">
                        <div className="flex flex-col gap-1">
                          <span className="text-xs font-black text-foreground">{text(student.status)}</span>
                          <span className="text-[10px] font-bold text-muted-foreground">{text(student.tipe)}</span>
                        </div>
                      </td>
                      <td className="px-5 py-3.5">
                        <p className="text-xs font-black text-foreground">{getProjectCount(item)} riset</p>
                        <p className="max-w-[280px] truncate text-[10px] font-semibold text-muted-foreground">{getProjectSummary(item)}</p>
                      </td>
                      <td className="whitespace-nowrap px-5 py-3.5 text-xs font-bold text-muted-foreground">{formatDateTimeJakarta(getSavedAt(item))}</td>
                      <td className="px-5 py-3.5">
                        <span className={`inline-flex rounded-full px-2.5 py-1 text-[10px] font-black ${STATUS_STYLE[item.status] || STATUS_STYLE.Dikirim}`}>{text(item.status, "Dikirim")}</span>
                      </td>
                      <td className="px-5 py-3.5">
                        <button
                          onClick={() => void openDetail(item)}
                          className="inline-flex h-8 items-center gap-1.5 rounded-[9px] bg-emerald-50 px-3 text-[11px] font-black text-emerald-700 transition-colors hover:bg-emerald-100"
                        >
                          {detailLoadingId === item.id ? <Loader2 size={13} className="animate-spin" /> : <Eye size={13} />} Detail
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {selected && (
        <div className="fixed inset-0 z-[240] flex items-start justify-center overflow-y-auto bg-slate-950/45 p-4 pt-[5vh] backdrop-blur-sm" onClick={() => setSelected(null)}>
          <div className="w-full max-w-[940px] overflow-hidden rounded-[22px] bg-white shadow-2xl" onClick={(event) => event.stopPropagation()}>
            <div className="flex items-start justify-between gap-4 border-b border-border px-6 py-5">
              <div className="flex gap-4">
                {selected.student?.photoUrl ? (
                  <img src={selected.student.photoUrl} alt="Photo" className="h-12 w-12 rounded-full object-cover border border-gray-200" />
                ) : (
                  <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-emerald-600 text-lg font-black text-white">
                    {getStudentInitials(selected)}
                  </div>
                )}
                <div>
                  <p className="text-[10px] font-black uppercase tracking-wide text-emerald-600">Detail Berkas Kelulusan</p>
                  <h3 className="mt-1 text-xl font-black text-foreground">{text(selected.student?.name, "Mahasiswa")}</h3>
                  <p className="text-xs font-semibold text-muted-foreground">{text(selected.student?.nim)} - {formatDateTimeJakarta(getSavedAt(selected))}</p>
                </div>
              </div>
              <button onClick={() => setSelected(null)} className="flex h-9 w-9 items-center justify-center rounded-full bg-slate-100 text-slate-500 transition-colors hover:bg-slate-200">
                <X size={17} />
              </button>
            </div>

            <div className="max-h-[72vh] overflow-y-auto p-6">
              <div className="mb-5 grid grid-cols-2 gap-3 md:grid-cols-4">
                <div className="rounded-[14px] border border-border bg-slate-50 p-3">
                  <p className="text-[10px] font-black uppercase text-muted-foreground">Status Berkas</p>
                  <p className="mt-1 font-black text-foreground">{text(selected.status, "Dikirim")}</p>
                </div>
                <div className="rounded-[14px] border border-border bg-slate-50 p-3">
                  <p className="text-[10px] font-black uppercase text-muted-foreground">Status Mahasiswa</p>
                  <p className="mt-1 font-black text-foreground">{text(selected?.student?.status)}</p>
                </div>
                <div className="rounded-[14px] border border-border bg-slate-50 p-3">
                  <p className="text-[10px] font-black uppercase text-muted-foreground">Tipe</p>
                  <p className="mt-1 font-black text-foreground">{text(selected.student?.tipe)}</p>
                </div>
                <div className="rounded-[14px] border border-border bg-slate-50 p-3">
                  <p className="text-[10px] font-black uppercase text-muted-foreground">Jumlah Riset</p>
                  <p className="mt-1 font-black text-foreground">{getProjectCount(selected)} riset</p>
                </div>
              </div>

              <div className="mb-5 rounded-[16px] border border-emerald-200 bg-emerald-50/80 p-4">
                <div className="flex flex-col gap-3">
                  <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
                    <div>
                      <p className="text-sm font-black text-emerald-950">Kelulusan Mahasiswa (Aksi Admin)</p>
                      <p className="mt-0.5 text-xs font-semibold text-emerald-800">
                        Admin dapat meluluskan mahasiswa langsung menjadi Alumni meskipun berkas belum lengkap (dispensasi). Sesuai aturan, mahasiswa tidak mendapatkan sertifikat jika berkas tidak dipenuhi.
                      </p>
                    </div>
                    <div>
                      {isSubmissionFullyAccepted(selected) ? (
                        <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-3 py-1 text-[11px] font-black text-emerald-800 border border-emerald-300">
                          <CheckCircle2 size={13} /> Sertifikat Berhak Diterbitkan
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-3 py-1 text-[11px] font-black text-amber-800 border border-amber-300">
                          <AlertTriangle size={13} /> Sertifikat Ditangguhkan (Berkas Belum Lengkap)
                        </span>
                      )}
                    </div>
                  </div>

                  <div className="flex flex-wrap items-center gap-3 pt-2 border-t border-emerald-200">
                    <button
                      type="button"
                      onClick={() => void handleGraduateByAdmin()}
                      disabled={selected?.student?.status === "Alumni" || graduating}
                      className="inline-flex h-10 items-center justify-center gap-2 rounded-[12px] bg-sky-600 px-4 text-xs font-black text-white shadow-sm transition-colors hover:bg-sky-700 disabled:cursor-not-allowed disabled:bg-slate-300"
                    >
                      {graduating ? <Loader2 size={15} className="animate-spin" /> : <GraduationCap size={15} />}
                      {selected?.student?.status === "Alumni" ? "Sudah Alumni" : "Luluskan Mahasiswa Sekarang"}
                    </button>

                    <button
                      type="button"
                      onClick={() => void handleAllowGraduation()}
                      disabled={!canAllowSelected || allowing}
                      title={allowGraduationHint}
                      className="inline-flex h-10 items-center justify-center gap-2 rounded-[12px] border border-emerald-600 bg-white px-4 text-xs font-black text-emerald-700 transition-colors hover:bg-emerald-50 disabled:cursor-not-allowed disabled:border-slate-300 disabled:bg-slate-100 disabled:text-slate-400"
                    >
                      {allowing ? <Loader2 size={15} className="animate-spin" /> : <CheckCircle2 size={15} />}
                      {allowGraduationLabel}
                    </button>
                  </div>
                </div>
              </div>

              <div className="flex flex-col gap-4">
                {(selected.projects || []).length === 0 ? (
                  <div className="rounded-[14px] border border-amber-200 bg-amber-50 p-4 text-sm font-bold text-amber-700">Detail proyek belum tersedia.</div>
                ) : (selected.projects || []).map((project: any) => {
                  const specialFields = getSpecialFields(project);
                  return (
                    <div key={project.id || project.projectId || project.project_id} className="rounded-[18px] border border-border bg-slate-50 p-4">
                      <div className="mb-4 flex flex-col gap-1 sm:flex-row sm:items-start sm:justify-between">
                        <div>
                          <h4 className="font-black text-foreground">{text(project.projectTitle || project.project_title, "Riset")}</h4>
                          <p className="text-xs font-semibold text-muted-foreground">Posisi: {text(project.positionLabel || project.position_label, "Anggota")}</p>
                        </div>
                      </div>
                      <div className="grid gap-3 md:grid-cols-2">
                        {COMMON_LINK_FIELDS.map((field) => (
                          <LinkRow
                            key={field.key}
                            project={project}
                            field={field}
                            reviewingKey={reviewingKey}
                            onReview={handleReview}
                            canReview={selected?.student?.status !== "Alumni"}
                          />
                        ))}
                        {specialFields.map((field) => (
                          <LinkRow
                            key={field.key}
                            project={project}
                            field={field}
                            reviewingKey={reviewingKey}
                            onReview={handleReview}
                            canReview={selected?.student?.status !== "Alumni"}
                          />
                        ))}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        </div>
      )}
      {directGraduateModalOpen && (
        <div
          className="fixed inset-0 z-[250] flex items-center justify-center bg-slate-950/45 p-4 backdrop-blur-sm"
          onClick={() => setDirectGraduateModalOpen(false)}
        >
          <div
            className="w-full max-w-lg rounded-[22px] bg-white p-6 shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start justify-between gap-4 border-b border-border pb-4">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-sky-100 text-sky-700">
                  <GraduationCap size={20} />
                </div>
                <div>
                  <h3 className="text-lg font-black text-foreground">Luluskan Mahasiswa Langsung</h3>
                  <p className="text-xs font-semibold text-muted-foreground">
                    Pilih mahasiswa aktif untuk diluluskan langsung menjadi Alumni.
                  </p>
                </div>
              </div>
              <button
                onClick={() => setDirectGraduateModalOpen(false)}
                className="flex h-8 w-8 items-center justify-center rounded-full bg-slate-100 text-slate-500 hover:bg-slate-200"
              >
                <X size={16} />
              </button>
            </div>

            <div className="my-5 flex flex-col gap-4">
              <div className="rounded-[14px] border border-amber-200 bg-amber-50 p-3 text-xs font-bold text-amber-800">
                ⚠️ <strong>Perhatian:</strong> Mahasiswa yang diluluskan melalui opsi ini akan langsung menjadi <strong>Alumni</strong> dengan <strong>Sertifikat Ditangguhkan</strong> (karena belum mengisi dan memverifikasi berkas kelulusan).
              </div>

              <div>
                <label className="mb-1 block text-xs font-black text-foreground uppercase tracking-wide">
                  Pilih Mahasiswa Aktif:
                </label>
                {loadingActiveStudents ? (
                  <div className="flex items-center justify-center py-4 text-xs font-bold text-slate-500 gap-2">
                    <Loader2 size={15} className="animate-spin" /> Memuat data mahasiswa...
                  </div>
                ) : (
                  <select
                    value={selectedStudentToGraduate}
                    onChange={(e) => setSelectedStudentToGraduate(e.target.value)}
                    className="h-11 w-full rounded-[12px] border border-border bg-slate-50 px-3 text-sm font-semibold outline-none focus:border-sky-300 focus:bg-white focus:ring-2 focus:ring-sky-100"
                  >
                    <option value="">-- Pilih Mahasiswa --</option>
                    {activeStudents.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.name || s.student_name || "Mahasiswa"} ({s.nim || "-"}) - {s.tipe || "Riset"}
                      </option>
                    ))}
                  </select>
                )}
              </div>
            </div>

            <div className="flex items-center justify-end gap-3 border-t border-border pt-4">
              <button
                type="button"
                onClick={() => setDirectGraduateModalOpen(false)}
                className="h-10 rounded-[12px] bg-slate-100 px-4 text-xs font-bold text-slate-600 hover:bg-slate-200"
              >
                Batal
              </button>
              <button
                type="button"
                onClick={() => void handleDirectGraduateSubmit()}
                disabled={!selectedStudentToGraduate || directGraduateSubmitting}
                className="inline-flex h-10 items-center justify-center gap-2 rounded-[12px] bg-sky-600 px-5 text-xs font-black text-white hover:bg-sky-700 disabled:cursor-not-allowed disabled:bg-slate-300"
              >
                {directGraduateSubmitting ? <Loader2 size={15} className="animate-spin" /> : <CheckCircle2 size={15} />}
                Luluskan Sekarang (Dispensasi)
              </button>
            </div>
          </div>
        </div>
      )}
    </OperatorLayout>
  );
}

