import React, { useEffect, useMemo, useState } from "react";
import { Layout } from "../../templates/Layout";
import { apiGet, apiPost, getStoredUser, setStoredUser } from "../../../lib/api";
import {
  AlertTriangle,
  CheckCircle2,
  ClipboardCheck,
  ExternalLink,
  FileCheck,
  FolderOpen,
  Link as LinkIcon,
  Loader2,
  Save,
  Send,
  History,
  Sparkles,
} from "lucide-react";
import { useAuth } from "../../../context/AuthContext";

type FieldReview = {
  status?: "accepted" | "rejected" | "pending";
  note?: string | null;
  reviewedAt?: string | null;
  reviewedBy?: string | null;
};

type SpecialField = {
  key: GraduationFieldKey;
  label: string;
  required?: boolean;
};

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

const allGraduationFieldKeys: GraduationFieldKey[] = [
  "reportUrl",
  "productPhotoFolderUrl",
  "manualBookUrl",
  "demoVideoUrl",
  "githubUrl",
  "repositoryUrl",
  "deployedUrl",
  "datasetModelUrl",
  "designDocumentationUrl",
];
type GraduationProject = {
  projectId: string;
  projectTitle: string;
  positionLabel: string;
  reportUrl: string;
  productPhotoFolderUrl: string;
  manualBookUrl: string;
  demoVideoUrl: string;
  githubUrl: string;
  repositoryUrl: string;
  deployedUrl: string;
  datasetModelUrl: string;
  designDocumentationUrl: string;
  fieldReviews: Record<string, FieldReview>;
  requiredSpecialFields: SpecialField[];
};

const commonFields: Array<{
  key: GraduationFieldKey;
  label: string;
  helper: string;
  placeholder: string;
  icon: React.ReactNode;
  required: boolean;
}> = [
  {
    key: "reportUrl",
    label: "Link Laporan PA/Magang",
    helper: "Masukkan link laporan akhir PA/magang untuk riset ini.",
    placeholder: "https://drive.google.com/file/d/...",
    icon: <FileCheck size={16} />,
    required: true,
  },
  {
    key: "productPhotoFolderUrl",
    label: "Link Folder kumpulan Foto Hasil Produk (Kualitas bagus)",
    helper: "Gunakan folder berisi foto produk dengan kualitas baik.",
    placeholder: "https://drive.google.com/drive/folders/...",
    icon: <FolderOpen size={16} />,
    required: true,
  },
  {
    key: "manualBookUrl",
    label: "Link Manual Book (wajib diupload di Folder stas-rg)",
    helper: "Pastikan manual book sudah berada di folder STAS-RG sebelum link ditempel.",
    placeholder: "https://drive.google.com/file/d/...",
    icon: <ClipboardCheck size={16} />,
    required: true,
  },
  {
    key: "demoVideoUrl",
    label: "Link Video Demo Project",
    helper: "Masukkan link video demo project untuk arsip dan validasi admin.",
    placeholder: "https://drive.google.com/file/d/... atau https://youtu.be/...",
    icon: <ExternalLink size={16} />,
    required: true,
  },
  {
    key: "githubUrl",
    label: "Link GitHub",
    helper: "Tambahkan link GitHub yang berkaitan dengan project/akun kontribusi kamu jika tersedia.",
    placeholder: "https://github.com/username/repository-proyek",
    icon: <LinkIcon size={16} />,
    required: false,
  },
];

const specialFieldCopy: Record<GraduationFieldKey, {
  label: string;
  helper: string;
  placeholder: string;
  required: boolean;
}> = {
  reportUrl: {
    label: "Link Laporan PA/Magang",
    helper: "",
    placeholder: "",
    required: true,
  },
  productPhotoFolderUrl: {
    label: "Link Folder kumpulan Foto Hasil Produk",
    helper: "",
    placeholder: "",
    required: true,
  },
  manualBookUrl: {
    label: "Link Manual Book",
    helper: "",
    placeholder: "",
    required: true,
  },
  demoVideoUrl: {
    label: "Link Video Demo Project",
    helper: "",
    placeholder: "",
    required: true,
  },
  githubUrl: {
    label: "Link GitHub",
    helper: "",
    placeholder: "",
    required: false,
  },
  repositoryUrl: {
    label: "Link Repository GitHub / GitLab Proyek",
    helper:
      "Masukkan link repository kode program (source code) proyek yang kamu kerjakan. Pastikan kodingan sudah rapi, memiliki file README.md (berisi cara instalasi & penjelasan proyek), dan kepemilikan repository sudah ditransfer/di-invite ke akun resmi GitHub Lab COE STAS.",
    placeholder: "https://github.com/username/repository-proyek",
    required: true,
  },
  deployedUrl: {
    label: "Link Website Ter-deploy / Live",
    helper:
      "Jika sistem/website yang kamu kembangkan sudah di-hosting atau dideploy secara online, masukkan link aplikasinya di sini untuk keperluan pengujian dan arsip.",
    placeholder: "https://nama-proyek-lab.com atau https://vercel.app/...",
    required: false,
  },
  datasetModelUrl: {
    label: "Link Dataset & Model Weights (.h5 / .pkl / dll)",
    helper:
      "Jika ukuran file dataset atau model terlatih (weights) terlalu besar untuk di-push ke GitHub, silakan upload ke Google Drive lab atau Drive pribadi kamu, lalu cantumkan link foldernya di sini. Pastikan akses link terbuka.",
    placeholder: "https://drive.google.com/drive/folders/...",
    required: true,
  },
  designDocumentationUrl: {
    label: "Link Master Desain & Dokumentasi Konten",
    helper:
      "Masukkan link folder (Google Drive/Canva/Figma) yang berisi seluruh file master desain (PSD, AI, Canva Share Link) beserta arsip video mentah dan video final yang telah kamu produksi selama di lab.",
    placeholder: "https://www.canva.com/design/... atau link Drive",
    required: true,
  },
};

function normalizeProject(item: any): GraduationProject {
  return {
    projectId: String(item?.projectId || item?.project_id || ""),
    projectTitle: String(item?.projectTitle || item?.project_title || item?.title || "Riset"),
    positionLabel: String(item?.positionLabel || item?.position_label || item?.peran || "Anggota"),
    reportUrl: String(item?.reportUrl || item?.report_url || ""),
    productPhotoFolderUrl: String(item?.productPhotoFolderUrl || item?.product_photo_folder_url || ""),
    manualBookUrl: String(item?.manualBookUrl || item?.manual_book_url || ""),
    demoVideoUrl: String(item?.demoVideoUrl || item?.demo_video_url || ""),
    githubUrl: String(item?.githubUrl || item?.github_url || ""),
    repositoryUrl: String(item?.repositoryUrl || item?.repository_url || ""),
    deployedUrl: String(item?.deployedUrl || item?.deployed_url || ""),
    datasetModelUrl: String(item?.datasetModelUrl || item?.dataset_model_url || ""),
    designDocumentationUrl: String(item?.designDocumentationUrl || item?.design_documentation_url || ""),
    fieldReviews: item?.fieldReviews || item?.field_reviews || {},
    requiredSpecialFields: Array.isArray(item?.requiredSpecialFields)
      ? item.requiredSpecialFields
      : Array.isArray(item?.required_special_fields)
        ? item.required_special_fields
        : [],
  };
}

function isValidUrl(value: string, required: boolean) {
  const normalized = value.trim();
  if (!normalized) return !required;

  try {
    const parsed = new URL(normalized);
    return parsed.protocol === "http:" || parsed.protocol === "https:";
  } catch {
    return false;
  }
}

function getRequiredKeys(project: GraduationProject) {
  return [
    ...commonFields.filter((field) => field.required).map((field) => field.key),
    ...project.requiredSpecialFields
      .filter((field) => field.required !== false)
      .map((field) => field.key),
  ];
}

function getFieldReview(project: GraduationProject, key: GraduationFieldKey): FieldReview | undefined {
  return project.fieldReviews?.[key];
}

function FieldInput({
  project,
  field,
  onChange,
  onSaveDraft,
  savingDraft = false,
  canSaveDraft = false,
  review,
  disabled = false,
}: {
  project: GraduationProject;
  field: {
    key: GraduationFieldKey;
    label: string;
    helper: string;
    placeholder: string;
    required: boolean;
    icon?: React.ReactNode;
  };
  onChange: (projectId: string, key: GraduationFieldKey, value: string) => void;
  onSaveDraft?: () => void;
  savingDraft?: boolean;
  canSaveDraft?: boolean;
  review?: FieldReview;
  disabled?: boolean;
}) {
  const value = project[field.key] || "";
  const invalid = value.trim() ? !isValidUrl(value, field.required) : false;
  const accepted = review?.status === "accepted";
  const rejected = review?.status === "rejected";
  const pendingReview = Boolean(value.trim()) && !accepted && !rejected;
  const cardTone = rejected
    ? "border-red-200 bg-red-50/40"
    : accepted
      ? "border-emerald-200 bg-emerald-50/30"
      : "border-slate-200 bg-white";
  const inputTone = invalid
    ? "border-red-200 bg-red-50/50 text-red-700 focus:ring-red-100"
    : rejected
      ? "border-red-200 bg-white focus:border-red-300 focus:ring-red-100"
      : accepted
        ? "border-emerald-200 bg-white focus:border-emerald-400 focus:ring-emerald-100"
        : "border-slate-200 bg-slate-50 focus:border-emerald-400 focus:bg-white focus:ring-emerald-100";

  return (
    <div className={`rounded-[16px] border p-4 shadow-sm ${cardTone}`}>
      <div className="mb-2 flex items-start justify-between gap-3">
        <div className="flex items-start gap-2">
          <div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-[10px] bg-emerald-50 text-emerald-600">
            {field.icon || <LinkIcon size={16} />}
          </div>
          <div>
            <label className="text-sm font-black text-slate-900">
              {field.label}
              {field.required ? <span className="text-red-500"> *</span> : <span className="text-slate-400"> (Opsional)</span>}
            </label>
            {field.helper && (
              <p className="mt-1 text-xs font-medium leading-relaxed text-slate-500">
                {field.helper}
              </p>
            )}
          </div>
        </div>
        <div className="flex shrink-0 flex-col items-end gap-1">
          {accepted && (
            <span className="rounded-full bg-emerald-100 px-2 py-1 text-[10px] font-black uppercase text-emerald-700">
              ACC
            </span>
          )}
          {rejected && (
            <span className="rounded-full bg-red-100 px-2 py-1 text-[10px] font-black uppercase text-red-700">
              Ditolak
            </span>
          )}
          {pendingReview && (
            <span className="rounded-full bg-slate-100 px-2 py-1 text-[10px] font-black uppercase text-slate-500">
              Menunggu
            </span>
          )}
          {isValidUrl(value, field.required) && value.trim() && (
            <CheckCircle2 size={17} className="shrink-0 text-emerald-500" />
          )}
        </div>
      </div>
      <input
        type="url"
        value={value}
        disabled={disabled}
        onChange={(event) => onChange(project.projectId, field.key, event.target.value)}
        placeholder={field.placeholder}
        className={`h-11 w-full rounded-[12px] border px-3 text-sm font-semibold outline-none transition-all focus:ring-2 disabled:cursor-not-allowed disabled:opacity-70 ${inputTone}`}
      />
      {canSaveDraft && !disabled && (
        <div className="mt-3 flex justify-end">
          <button
            type="button"
            onClick={onSaveDraft}
            disabled={savingDraft || invalid}
            className="inline-flex h-8 items-center justify-center gap-1.5 rounded-[9px] bg-slate-900 px-3 text-[11px] font-black text-white transition-colors hover:bg-slate-800 disabled:cursor-not-allowed disabled:bg-slate-300"
          >
            {savingDraft ? <Loader2 size={12} className="animate-spin" /> : <Save size={12} />}
            Simpan kolom
          </button>
        </div>
      )}
      {invalid && (
        <p className="mt-2 text-xs font-bold text-red-500">
          Link harus diawali http:// atau https://.
        </p>
      )}
      {rejected && review?.note && (
        <p className="mt-2 rounded-[10px] bg-white px-3 py-2 text-xs font-bold text-red-600">
          Catatan admin: {review.note}
        </p>
      )}
      {accepted && (
        <p className="mt-2 text-xs font-bold text-emerald-700">
          Link ini sudah ACC admin.
        </p>
      )}
    </div>
  );
}

export default function GraduationSubmission() {
  const [projects, setProjects] = useState<GraduationProject[]>([]);
  const [studentStatus, setStudentStatus] = useState("");
  const [submissionStatus, setSubmissionStatus] = useState("");
  const [submittedAt, setSubmittedAt] = useState("");
  const [graduationAllowedAt, setGraduationAllowedAt] = useState("");
  const [lastSavedAt, setLastSavedAt] = useState("");
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [savingDraft, setSavingDraft] = useState(false);
  const [becomingAlumni, setBecomingAlumni] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [history, setHistory] = useState<any[]>([]);
  const { login } = useAuth();

  const completion = useMemo(() => {
    const requiredPairs = projects.flatMap((project) =>
      getRequiredKeys(project).map((key) => ({
        projectId: project.projectId,
        key,
        value: project[key],
      }))
    );
    const validCount = requiredPairs.filter((item) => isValidUrl(item.value, true)).length;
    const total = requiredPairs.length;

    return {
      validCount,
      total,
      percent: total > 0 ? Math.round((validCount / total) * 100) : 0,
      complete: total > 0 && validCount === total,
    };
  }, [projects]);

  const hasInvalidFilledUrl = useMemo(() =>
    projects.some((project) =>
      allGraduationFieldKeys.some((key) => {
        const value = String(project[key] || "").trim();
        return Boolean(value) && !isValidUrl(value, false);
      })
    ), [projects]);

  const graduationAllowed = Boolean(graduationAllowedAt) && submissionStatus === "Valid" && studentStatus !== "Alumni";
  const reviewLocked = submissionStatus === "Valid" || studentStatus === "Alumni";
  const canSaveDraft = projects.length > 0 && !reviewLocked && !savingDraft && !hasInvalidFilledUrl;
  const canSubmit = completion.complete && !submitting && projects.length > 0 && !reviewLocked;
  const canBecomeAlumni = graduationAllowed && !becomingAlumni;
  const submitLabel = submissionStatus === "Revisi"
    ? "Kirim Ulang Berkas Kelulusan"
    : submissionStatus === "Dikirim"
      ? "Perbarui Berkas Kelulusan"
      : "Kirim Berkas Kelulusan";

  useEffect(() => {
    const load = async () => {
      try {
        setLoading(true);
        setError("");
        const data = await apiGet<any>("/graduation-submissions/me");
        setProjects((data?.projects || []).map(normalizeProject));
        setStudentStatus(data?.student?.status || data?.student?.studentStatus || "");
        setSubmissionStatus(data?.submission?.status || "");
        setSubmittedAt(data?.submission?.submittedAt || data?.submission?.submitted_at || "");
        setGraduationAllowedAt(data?.submission?.graduationAllowedAt || data?.submission?.graduation_allowed_at || "");
        setLastSavedAt(data?.submission?.updatedAt || data?.submission?.updated_at || data?.submission?.createdAt || data?.submission?.created_at || "");

        // Load History
        const histData = await apiGet<any[]>("/graduation-submissions/me/history");
        setHistory(histData || []);
      } catch (err: any) {
        setError(err?.message || "Gagal memuat form berkas kelulusan.");
      } finally {
        setLoading(false);
      }
    };

    load();
  }, []);

  const handleChange = (projectId: string, key: GraduationFieldKey, value: string) => {
    setProjects((prev) =>
      prev.map((project) =>
        project.projectId === projectId ? { ...project, [key]: value } : project
      )
    );
  };

  const buildDraftPayload = () => ({
    projects: projects.map((project) => ({
      projectId: project.projectId,
      reportUrl: project.reportUrl.trim(),
      productPhotoFolderUrl: project.productPhotoFolderUrl.trim(),
      manualBookUrl: project.manualBookUrl.trim(),
      demoVideoUrl: project.demoVideoUrl.trim(),
      githubUrl: project.githubUrl.trim(),
      repositoryUrl: project.repositoryUrl.trim(),
      deployedUrl: project.deployedUrl.trim(),
      datasetModelUrl: project.datasetModelUrl.trim(),
      designDocumentationUrl: project.designDocumentationUrl.trim(),
    })),
  });

  const handleSaveDraft = async () => {
    if (!canSaveDraft) return;

    try {
      setSavingDraft(true);
      setError("");
      setMessage("");

      const result = await apiPost<any>("/graduation-submissions/me/draft", buildDraftPayload());
      setProjects((result?.projects || projects).map(normalizeProject));
      setStudentStatus(result?.student?.status || result?.student?.studentStatus || studentStatus);
      setSubmissionStatus(result?.submission?.status || submissionStatus || "Draft");
      setSubmittedAt(result?.submission?.submittedAt || result?.submission?.submitted_at || submittedAt);
      setGraduationAllowedAt(result?.submission?.graduationAllowedAt || result?.submission?.graduation_allowed_at || "");
      setLastSavedAt(result?.submission?.updatedAt || result?.submission?.updated_at || new Date().toISOString());
      setMessage(result?.message || "Draft berkas berhasil disimpan.");
    } catch (err: any) {
      setError(err?.message || "Gagal menyimpan draft berkas kelulusan.");
    } finally {
      setSavingDraft(false);
    }
  };

  const handleSubmit = async () => {
    if (!canSubmit) return;

    try {
      setSubmitting(true);
      setError("");
      setMessage("");

      const result = await apiPost<any>("/graduation-submissions/me", buildDraftPayload());

      const nextStudentStatus = result?.student?.status || result?.student?.studentStatus || studentStatus;

      setProjects((result?.projects || projects).map(normalizeProject));
      setStudentStatus(nextStudentStatus);
      setSubmissionStatus(result?.submission?.status || "Dikirim");
      setSubmittedAt(result?.submission?.submittedAt || result?.submission?.submitted_at || new Date().toISOString());
      setGraduationAllowedAt(result?.submission?.graduationAllowedAt || result?.submission?.graduation_allowed_at || "");
      setLastSavedAt(result?.submission?.updatedAt || result?.submission?.updated_at || new Date().toISOString());
      setMessage(result?.message || "Berkas kelulusan berhasil dikirim.");

      const currentUser = getStoredUser();
      if (currentUser && nextStudentStatus && nextStudentStatus !== currentUser.status) {
        login({
          ...currentUser,
          status: nextStudentStatus,
          studentStatus: nextStudentStatus,
        });
      }
    } catch (err: any) {
      setError(err?.message || "Gagal mengirim berkas kelulusan.");
    } finally {
      setSubmitting(false);
    }
  };


  const handleBecomeAlumni = async () => {
    if (!canBecomeAlumni) return;

    try {
      setBecomingAlumni(true);
      setError("");
      setMessage("");

      const result = await apiPost<any>("/graduation-submissions/me/finalize-alumni");
      const nextStudentStatus = result?.student?.status || result?.student?.studentStatus || "Alumni";

      setProjects((result?.projects || projects).map(normalizeProject));
      setStudentStatus(nextStudentStatus);
      setSubmissionStatus(result?.submission?.status || "Valid");
      setSubmittedAt(result?.submission?.submittedAt || result?.submission?.submitted_at || submittedAt);
      setGraduationAllowedAt(result?.submission?.graduationAllowedAt || result?.submission?.graduation_allowed_at || graduationAllowedAt);
      setMessage(result?.message || "Status kamu berhasil menjadi Alumni STAS-RG.");

      const currentUser = getStoredUser();
      if (currentUser) {
        login({
          ...currentUser,
          status: nextStudentStatus,
          studentStatus: nextStudentStatus,
        });
      }
    } catch (err: any) {
      setError(err?.message || "Gagal memproses status Alumni STAS-RG.");
    } finally {
      setBecomingAlumni(false);
    }
  };
  const savedLabel = lastSavedAt
    ? new Date(lastSavedAt).toLocaleString("id-ID", {
        day: "2-digit",
        month: "short",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      })
    : "";

  const submittedLabel = submittedAt
    ? new Date(submittedAt).toLocaleDateString("id-ID", {
        day: "2-digit",
        month: "long",
        year: "numeric",
      })
    : "";

  if (loading) {
    return (
      <Layout title="Berkas Kelulusan">
        <div className="flex min-h-[360px] items-center justify-center rounded-[24px] border border-slate-200 bg-white">
          <div className="flex items-center gap-3 text-sm font-bold text-slate-500">
            <Loader2 size={18} className="animate-spin" /> Memuat form kelulusan...
          </div>
        </div>
      </Layout>
    );
  }

  return (
    <Layout title="Berkas Kelulusan">
      <div className="mx-auto flex max-w-[1040px] flex-col gap-5 pb-6">
        <div className="overflow-hidden rounded-[26px] border border-emerald-100 bg-gradient-to-br from-emerald-600 via-teal-600 to-sky-700 text-white shadow-xl shadow-emerald-100">
          <div className="relative p-6 md:p-8">
            <div className="absolute -right-12 -top-12 h-44 w-44 rounded-full bg-white/10" />
            <div className="absolute bottom-4 right-8 hidden h-20 w-20 rounded-[28px] border border-white/20 bg-white/10 md:block" />
            <div className="relative max-w-3xl">
              <div className="mb-4 inline-flex items-center gap-2 rounded-full border border-white/20 bg-white/15 px-3 py-1 text-xs font-black uppercase tracking-widest">
                <Sparkles size={14} /> Form Submit Berkas Kelulusan CoE STAS-RG
              </div>
              <h1 className="text-2xl font-black leading-tight md:text-4xl">
                Kirim semua link final sebelum status kelulusan diproses.
              </h1>
              <p className="mt-3 text-sm font-semibold leading-relaxed text-emerald-50 md:text-base">
                Pastikan akses folder sudah diubah menjadi "Anyone with the link can view"
                atau "Siapa saja yang memiliki link dapat melihat" sebelum ditempel di sini.
              </p>
              <div className="mt-5 flex flex-wrap gap-2">
                <span className="rounded-full bg-white/15 px-3 py-1.5 text-xs font-black">
                  {projects.length} riset/magang
                </span>
                <span className="rounded-full bg-white/15 px-3 py-1.5 text-xs font-black">
                  Status mahasiswa: {studentStatus || "-"}
                </span>
                {submissionStatus && (
                  <span className="rounded-full bg-white/15 px-3 py-1.5 text-xs font-black">
                    Pengajuan: {submissionStatus}{submittedLabel ? `, ${submittedLabel}` : ""}
                  </span>
                )}
                {savedLabel && (
                  <span className="rounded-full bg-white/15 px-3 py-1.5 text-xs font-black">
                    Draft tersimpan: {savedLabel}
                  </span>
                )}
              </div>
            </div>
          </div>
        </div>

        {error && (
          <div className="rounded-[16px] border border-red-200 bg-red-50 px-4 py-3 text-sm font-bold text-red-600">
            {error}
          </div>
        )}

        {message && (
          <div className="rounded-[16px] border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-bold text-emerald-700">
            {message}
          </div>
        )}

        {submissionStatus === "Revisi" && (
          <div className="rounded-[16px] border border-amber-200 bg-amber-50 px-4 py-3 text-sm font-bold text-amber-800">
            Ada link yang ditolak admin. Perbaiki bagian yang bertanda Ditolak, lalu kirim ulang berkas kelulusan.
          </div>
        )}

        {submissionStatus === "Dikirim" && (
          <div className="rounded-[16px] border border-blue-200 bg-blue-50 px-4 py-3 text-sm font-bold text-blue-800 flex items-center justify-between">
            <span>Berkas kelulusan sudah berhasil dikirim dan sedang menunggu peninjauan/ACC dari admin lab.</span>
            <span className="rounded-full bg-blue-100 px-2.5 py-0.5 text-xs font-black uppercase text-blue-700">
              Menunggu Review
            </span>
          </div>
        )}

        {submissionStatus === "Valid" && studentStatus !== "Alumni" && !graduationAllowed && (
          <div className="rounded-[16px] border border-sky-200 bg-sky-50 px-4 py-3 text-sm font-bold text-sky-800">
            Semua link sudah ACC. Tunggu admin memberi izin lulus agar tombol Jadi Alumni STAS-RG aktif.
          </div>
        )}

        {submissionStatus === "Valid" && graduationAllowed && (
          <div className="rounded-[16px] border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-bold text-emerald-800">
            Semua link sudah ACC dan admin sudah memberi izin lulus. Kamu bisa klik tombol Jadi Alumni STAS-RG di bawah.
          </div>
        )}

        {studentStatus === "Alumni" && (
          <div className="rounded-[16px] border border-sky-200 bg-sky-50 px-4 py-3 text-sm font-bold text-sky-800">
            Status kamu sudah Alumni STAS-RG. Form berkas kelulusan dikunci sebagai arsip.
          </div>
        )}

        <div className="rounded-[20px] border border-slate-200 bg-white p-4 shadow-sm">
          <div className="mb-2 flex items-center justify-between gap-3">
            <div>
              <p className="text-xs font-black uppercase tracking-widest text-slate-400">
                Kelengkapan Form
              </p>
              <p className="text-sm font-bold text-slate-700">
                {completion.validCount} dari {completion.total} field wajib sudah valid.
              </p>
            </div>
            <span className="text-lg font-black text-emerald-600">{completion.percent}%</span>
          </div>
          <div className="h-2 rounded-full bg-slate-100">
            <div
              className="h-2 rounded-full bg-emerald-500 transition-all duration-500"
              style={{ width: `${completion.percent}%` }}
            />
          </div>
        </div>

        {projects.length === 0 ? (
          <div className="rounded-[22px] border border-slate-200 bg-white p-8 text-center shadow-sm">
            <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-slate-100 text-slate-400">
              <FileCheck size={24} />
            </div>
            <h2 className="text-lg font-black text-slate-900">Belum ada riset/magang aktif</h2>
            <p className="mt-2 text-sm font-medium text-slate-500">
              Form akan muncul setelah data keanggotaan riset/magang kamu tersedia di database.
            </p>
          </div>
        ) : (
          projects.map((project, index) => {
            const specialFields = project.requiredSpecialFields.map((field) => ({
              key: field.key,
              label: specialFieldCopy[field.key]?.label || field.label,
              helper: specialFieldCopy[field.key]?.helper || "",
              placeholder: specialFieldCopy[field.key]?.placeholder || "https://...",
              required: field.required !== false && specialFieldCopy[field.key]?.required !== false,
            }));

            return (
              <section key={project.projectId} className="overflow-hidden rounded-[24px] border border-slate-200 bg-slate-50 shadow-sm">
                <div className="border-b border-slate-200 bg-white p-5">
                  <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                    <div>
                      <p className="text-[11px] font-black uppercase tracking-widest text-emerald-600">
                        Riset {index + 1}
                      </p>
                      <h2 className="mt-1 text-lg font-black text-slate-950">
                        {project.projectTitle}
                      </h2>
                      <p className="mt-1 text-sm font-semibold text-slate-500">
                        Posisi kamu: <span className="text-slate-800">{project.positionLabel}</span>
                      </p>
                    </div>
                    <span className="inline-flex w-fit items-center gap-2 rounded-full bg-emerald-50 px-3 py-1.5 text-xs font-black text-emerald-700">
                      <CheckCircle2 size={14} /> {getRequiredKeys(project).filter((key) => isValidUrl(project[key], true)).length}/{getRequiredKeys(project).length} wajib
                    </span>
                  </div>
                </div>

                <div className="grid gap-4 p-4 md:grid-cols-2 md:p-5">
                  <div className="md:col-span-2">
                    <p className="mb-3 text-xs font-black uppercase tracking-widest text-slate-400">
                      Bagian 1: Berkas Umum
                    </p>
                  </div>
                  {commonFields.map((field) => (
                    <FieldInput
                      key={field.key}
                      project={project}
                      field={field}
                      onChange={handleChange}
                      onSaveDraft={handleSaveDraft}
                      savingDraft={savingDraft}
                      canSaveDraft={canSaveDraft}
                      review={getFieldReview(project, field.key)}
                      disabled={reviewLocked}
                    />
                  ))}

                  <div className="md:col-span-2">
                    <p className="mt-2 text-xs font-black uppercase tracking-widest text-slate-400">
                      Bagian 2: Berkas Khusus Sesuai Posisi
                    </p>
                  </div>

                  {specialFields.length === 0 ? (
                    <div className="md:col-span-2 rounded-[16px] border border-dashed border-slate-200 bg-white p-4 text-sm font-bold text-slate-500">
                      Tidak ada berkas khusus tambahan untuk posisi ini.
                    </div>
                  ) : (
                    specialFields.map((field) => (
                      <FieldInput
                        key={field.key}
                        project={project}
                        field={field}
                        onChange={handleChange}
                        review={getFieldReview(project, field.key)}
                        disabled={reviewLocked}
                      />
                    ))
                  )}
                </div>
              </section>
            );
          })
        )}

        <div className="rounded-[22px] border border-amber-200 bg-amber-50 p-5">
          <div className="flex items-start gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-[14px] bg-amber-500 text-white">
              <AlertTriangle size={20} />
            </div>
            <div>
              <h3 className="text-sm font-black text-amber-900">PERHATIAN:</h3>
              <p className="mt-1 text-sm font-semibold leading-relaxed text-amber-800">
                Harap periksa kembali semua link dan dokumen yang kamu masukkan. Pastikan link tidak dikunci
                (tidak berstatus Private). Tim Admin Lab akan memeriksa berkasmu dalam 2-3 hari kerja.
                Surat Keterangan Selesai Magang/Riset hanya akan diterbitkan jika seluruh berkas dinyatakan
                Lengkap & Valid.
              </p>
            </div>
          </div>
        </div>

        {!reviewLocked && projects.length > 0 && (
          <button
            type="button"
            onClick={handleSaveDraft}
            disabled={!canSaveDraft}
            className="flex h-[48px] items-center justify-center gap-2 rounded-[16px] border border-slate-200 bg-white px-5 text-sm font-black text-slate-700 shadow-sm transition-all hover:bg-slate-50 disabled:cursor-not-allowed disabled:bg-slate-100 disabled:text-slate-400"
          >
            {savingDraft ? <Loader2 size={18} className="animate-spin" /> : <Save size={18} />}
            {savingDraft ? "Menyimpan Draft..." : "Simpan Draft Semua"}
          </button>
        )}

        {!reviewLocked && projects.length > 0 && (
          <button
            type="button"
            onClick={handleSubmit}
            disabled={!canSubmit}
            className="flex h-[52px] items-center justify-center gap-2 rounded-[16px] bg-emerald-600 px-5 text-sm font-black text-white shadow-lg shadow-emerald-100 transition-all hover:bg-emerald-700 disabled:cursor-not-allowed disabled:bg-slate-300 disabled:shadow-none"
          >
            {submitting ? <Loader2 size={18} className="animate-spin" /> : <Send size={18} />}
            {submitting ? "Mengirim Berkas..." : submitLabel}
          </button>
        )}

        {submissionStatus === "Valid" && studentStatus !== "Alumni" && (
          <button
            type="button"
            onClick={handleBecomeAlumni}
            disabled={!canBecomeAlumni}
            className="flex h-[52px] items-center justify-center gap-2 rounded-[16px] bg-sky-600 px-5 text-sm font-black text-white shadow-lg shadow-sky-100 transition-all hover:bg-sky-700 disabled:cursor-not-allowed disabled:bg-slate-300 disabled:shadow-none"
          >
            {becomingAlumni ? <Loader2 size={18} className="animate-spin" /> : <CheckCircle2 size={18} />}
            {graduationAllowed ? "Jadi Alumni STAS-RG" : "Menunggu Izin Lulus Admin"}
          </button>
        )}

        {!completion.complete && projects.length > 0 && (
          <p className="text-center text-xs font-bold text-slate-500">
            Tombol submit akan aktif setelah semua field wajib berisi URL valid.
          </p>
        )}

        {reviewLocked && projects.length > 0 && (
          <p className="text-center text-xs font-bold text-slate-500">
            Form terkunci karena berkas sudah ACC semua atau status kamu sudah Alumni.
          </p>
        )}
      </div>

      {history.length > 0 && (
        <div className="mt-8">
          <h2 className="mb-4 text-xl font-black text-slate-900 flex items-center gap-2">
            <History size={24} className="text-emerald-600" /> Riwayat Berkas Kelulusan
          </h2>
          <div className="flex flex-col gap-4">
            {history.map((histItem, idx) => (
              <div key={idx} className="rounded-[16px] border border-slate-200 bg-white p-5 shadow-sm">
                <div className="flex justify-between items-start mb-3">
                  <div>
                    <span className="inline-flex rounded-full bg-slate-100 px-3 py-1 text-[11px] font-black uppercase text-slate-600 mb-2">
                      {new Date(histItem.submission.submittedAt || histItem.submission.submitted_at || histItem.submission.created_at).toLocaleDateString('id-ID')}
                    </span>
                    <h3 className="text-sm font-bold text-slate-900">
                      Disetujui menjadi Alumni: {histItem.submission.graduationAllowedAt || histItem.submission.graduation_allowed_at ? "Ya" : "Belum"}
                    </h3>
                  </div>
                  <span className="inline-flex rounded-full bg-emerald-100 px-3 py-1 text-xs font-black text-emerald-700">
                    Selesai
                  </span>
                </div>
                <div className="grid gap-2 text-xs text-slate-600 font-medium">
                  {histItem.savedProjects?.map((p: any) => (
                    <div key={p.id} className="bg-slate-50 border border-slate-100 rounded-lg p-3">
                      <span className="font-bold text-slate-800">{p.projectTitle || p.project_title}</span>
                      <br />
                      Posisi: {p.positionLabel || p.position_label}
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </Layout>
  );
}








