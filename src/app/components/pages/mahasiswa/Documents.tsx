import React, { useEffect, useState } from "react";
import { Layout } from "../../templates/Layout";
import { apiGet, apiGetBlob, apiPost, apiPut, buildQueryPath, downloadBlob, encodePathSegment, getStoredUser, resolveApiAssetUrl } from "../../../lib/api";
import { formatDateYmd } from "../../../lib/date";
import {
  Plus,
  X,
  Check,
  Download,
  FileText,
  Award,
  Info,
  ChevronDown,
  Clock,
  CheckCircle2,
  Hourglass,
  AlertTriangle,
  Sparkles,
  BookOpen,
  CalendarClock,
  SendHorizonal,
  Lock,
  Upload,
} from "lucide-react";

type SuratStatus = "Menunggu" | "Diproses" | "Siap Unduh";

interface SuratRecord {
  id: string;
  jenis: string;
  tanggal: string;
  tujuan: string;
  status: SuratStatus;
  estimasi?: string;
  fileUrl?: string | null;
}

interface CertificateRecord {
  id: string;
  projectId: string;
  projectName: string;
  status: "Belum Diminta" | "Diproses" | "Terbit";
  issueDate?: string | null;
  certificateNumber?: string | null;
  fileUrl?: string | null;
}

interface StudentDocumentRecord {
  type: string;
  label: string;
  requiresAlumni: boolean;
  locked: boolean;
  lockReason: string | null;
  fileUrl: string | null;
  fileName: string | null;
  fileSize: number | null;
}

interface OfficialDocumentRecord {
  id: string;
  title: string;
  documentNumber: string | null;
  status: string;
  statusLabel?: string | null;
  typeName: string;
  documentPurpose: string;
  issuedAt?: string | null;
  canDownload: boolean;
  participantContexts?: Array<{ projectName?: string | null; period?: string | null }>;
}

interface OfficialDocumentListResponse {
  items: OfficialDocumentRecord[];
  pagination: { limit: number; offset: number; total: number };
}

const studentDocumentDefinitions = [
  { type: "surat_pengantar", label: "Surat pengantar mahasiswa riset dan magang CoE STAS-RG", requiresAlumni: false },
  { type: "surat_penerimaan", label: "Surat Penerimaan mahasiswa riset dan magang CoE STAS-RG", requiresAlumni: false },
  { type: "surat_keterangan_selesai", label: "Surat Keterangan Selesai mahasiswa riset dan magang CoE STAS-RG", requiresAlumni: true },
  { type: "sertifikat", label: "Sertifikat", requiresAlumni: true },
];

const officialPurposeByLegacyType: Record<string, string> = {
  surat_pengantar: "introductory_letter",
  surat_penerimaan: "acceptance_letter",
  surat_keterangan_selesai: "completion_letter",
  sertifikat: "certificate",
};

function normalizeStudentDocuments(source: any, fallbackStatus?: string | null): StudentDocumentRecord[] {
  const rawDocuments = source?.student_documents ?? source?.studentDocuments ?? source?.documents;
  const documents = Array.isArray(rawDocuments) ? rawDocuments : [];
  const status = String(source?.status || source?.studentStatus || fallbackStatus || "").toLowerCase();
  const isAlumni = status === "alumni";
  const byType = new Map(documents.map((doc: any) => [String(doc?.type || doc?.documentType || doc?.document_type || ""), doc]));

  return studentDocumentDefinitions.map((definition) => {
    const doc: any = byType.get(definition.type) || {};
    const locked = Boolean(definition.requiresAlumni && !isAlumni);

    return {
      type: definition.type,
      label: doc.label || definition.label,
      requiresAlumni: Boolean(doc.requiresAlumni ?? doc.requires_alumni ?? definition.requiresAlumni),
      locked: Boolean(doc.locked ?? locked),
      lockReason: doc.lockReason || doc.lock_reason || (locked ? "Dokumen ini tersedia setelah status Anda Alumni." : null),
      fileUrl: doc.fileUrl || doc.file_url || null,
      fileName: doc.fileName || doc.file_name || null,
      fileSize: Number.isFinite(Number(doc.fileSize ?? doc.file_size)) ? Number(doc.fileSize ?? doc.file_size) : null,
    };
  });
}

function formatFileSize(value?: number | null) {
  const size = Number(value || 0);
  if (!Number.isFinite(size) || size <= 0) return "";
  if (size >= 1024 * 1024) return `${(size / (1024 * 1024)).toFixed(1)} MB`;
  return `${Math.max(1, Math.round(size / 1024))} KB`;
}

const SuratStatusBadge = ({ status }: { status: SuratStatus }) => {
  const config: Record<SuratStatus, { cls: string; icon: React.ReactNode }> = {
    Menunggu: {
      cls: "bg-amber-100 text-amber-700 border border-amber-200",
      icon: <Hourglass size={11} strokeWidth={2.5} />,
    },
    Diproses: {
      cls: "bg-blue-100 text-blue-700 border border-blue-200",
      icon: <Clock size={11} strokeWidth={2.5} />,
    },
    "Siap Unduh": {
      cls: "bg-emerald-100 text-emerald-700 border border-emerald-200",
      icon: <CheckCircle2 size={11} strokeWidth={2.5} />,
    },
  };
  const c = config[status];
  return (
    <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[11px] font-bold ${c.cls}`}>
      {c.icon}
      {status}
    </span>
  );
};

const suratJenisOptions = [
  "Surat Keterangan Aktif Magang",
  "Surat Pengantar Penelitian",
  "Surat Rekomendasi Dosen Pembimbing",
  "Surat Keterangan Penelitian",
  "Surat Izin Penggunaan Laboratorium",
  "Surat Keterangan Selesai Magang",
];

export default function Documents() {
  const user = getStoredUser();
  const [studentRecordId, setStudentRecordId] = useState("");
  const [activeTab, setActiveTab] = useState<"surat" | "sertifikat">("surat");
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [selectedJenis, setSelectedJenis] = useState("");
  const [tujuanPenggunaan, setTujuanPenggunaan] = useState("");
  const [suratData, setSuratData] = useState<SuratRecord[]>([]);
  const [certificateData, setCertificateData] = useState<CertificateRecord[]>([]);
  const [studentDocuments, setStudentDocuments] = useState<StudentDocumentRecord[]>(normalizeStudentDocuments(null));
  const [officialDocuments, setOfficialDocuments] = useState<OfficialDocumentRecord[]>([]);
  const [downloadingOfficialId, setDownloadingOfficialId] = useState<string | null>(null);
  const [assignedProjects, setAssignedProjects] = useState<Array<{ id: string; title: string }>>([]);
  const [selectedProjectId, setSelectedProjectId] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [certModalOpen, setCertModalOpen] = useState(false);
  const [certProjectId, setCertProjectId] = useState("");
  const [certRequestNote, setCertRequestNote] = useState("");
  const [certFinishDate, setCertFinishDate] = useState("");
  const [uploadModal, setUploadModal] = useState<{ type: string; label: string } | null>(null);
  const [uploadingType, setUploadingType] = useState<string | null>(null);
  const [uploadError, setUploadError] = useState("");
  const [isAlumni, setIsAlumni] = useState(false);
  const [certificateEligible, setCertificateEligible] = useState<boolean | null>(null);
  const effectiveStudentId = String(studentRecordId || user?.id || "").trim();

  useEffect(() => {
    const resolveStudentId = async () => {
      if (!user?.id) return;

      try {
        const profile = await apiGet<any>(`/profile/${encodePathSegment(user.id)}`);
        setStudentDocuments(normalizeStudentDocuments(profile, profile?.status || profile?.studentStatus));
        const status = String(profile?.status || profile?.studentStatus || "").toLowerCase();
        if (status === "alumni") {
          setIsAlumni(true);
        }
        const resolvedId = String(profile?.id || profile?.student_id || "").trim();
        if (resolvedId) {
          setStudentRecordId(resolvedId);
        }
      } catch {
        // Fallback to user.id if profile lookup fails.
        setStudentRecordId(String(user.id || ""));
      }
    };

    resolveStudentId();
  }, [user?.id]);

  useEffect(() => {
    const loadData = async () => {
      try {
        const studentId = effectiveStudentId;
        const [rows, certRows, projectRows, officialRows, gradRes] = await Promise.all([
          apiGet<Array<any>>(buildQueryPath("/letter-requests", { studentId })),
          apiGet<Array<any>>(buildQueryPath("/certificates", { studentId })),
          user?.id ? apiGet<Array<any>>(buildQueryPath("/research/assigned", { userId: user.id })) : Promise.resolve([]),
          apiGet<OfficialDocumentListResponse>(buildQueryPath("/document-center/my/documents", { limit: 100, offset: 0 }))
            .catch(() => ({ items: [], pagination: { limit: 100, offset: 0, total: 0 } })),
          apiGet<any>("/graduation-submissions/me").catch(() => null),
        ]);
        const mapped: SuratRecord[] = rows
          .map((item) => ({
            id: item.id,
            jenis: item.jenis,
            tanggal: formatDateYmd(item.tanggal),
            tujuan: item.tujuan,
            status: item.status,
            estimasi: item.estimasi ? formatDateYmd(item.estimasi) : undefined,
            fileUrl: item.file_url || null
          }));

        const mappedCerts: CertificateRecord[] = certRows
          .map((item) => ({
            id: item.id,
            projectId: item.project_id,
            projectName: item.project_name || "Riset",
            status: item.status,
            issueDate: item.issue_date ? formatDateYmd(item.issue_date) : null,
            certificateNumber: item.certificate_number || null,
            fileUrl: item.file_url || null
          }));

        setSuratData(mapped);
        setCertificateData(mappedCerts);
        setOfficialDocuments(Array.isArray(officialRows.items) ? officialRows.items : []);

        if (gradRes) {
          const status = String(gradRes.student?.status || gradRes.student?.studentStatus || "").toLowerCase();
          if (status === "alumni") {
            setIsAlumni(true);
          }
          if (gradRes.submission) {
            setCertificateEligible(gradRes.submission.certificateEligible ?? gradRes.submission.certificate_eligible ?? true);
          } else if (certRows.length > 0 && certRows[0].certificate_eligible !== undefined) {
            setCertificateEligible(certRows[0].certificate_eligible);
          }
        } else if (certRows.length > 0 && certRows[0].certificate_eligible !== undefined) {
          setCertificateEligible(certRows[0].certificate_eligible);
        }

        const projectOptions = (projectRows || []).map((item) => ({
          id: item.id,
          title: item.short_title || item.title || item.id
        }));
        setAssignedProjects(projectOptions);
        if (!selectedProjectId && projectOptions.length > 0) {
          setSelectedProjectId(projectOptions[0].id);
        }
        if (!certProjectId && projectOptions.length > 0) {
          setCertProjectId(projectOptions[0].id);
        }
      } catch (err: any) {
        setError(err?.message || "Gagal memuat data dokumen.");
      }
    };

    if (effectiveStudentId) {
      loadData();
    }
  }, [effectiveStudentId, studentRecordId, user?.id]);

  const officialDocumentsForType = (type: string) => {
    const purpose = officialPurposeByLegacyType[type];
    return officialDocuments.filter((document) => document.documentPurpose === purpose);
  };

  const downloadOfficialDocument = async (document: OfficialDocumentRecord) => {
    if (!document.canDownload || downloadingOfficialId) return;
    setDownloadingOfficialId(document.id);
    setError("");
    try {
      const file = await apiGetBlob(`/document-center/documents/${encodePathSegment(document.id)}/download`);
      downloadBlob(file.blob, file.fileName || `dokumen-${document.id}.pdf`);
    } catch (err: any) {
      setError(err?.message || "Gagal mengunduh dokumen resmi.");
    } finally {
      setDownloadingOfficialId(null);
    }
  };

  const submitLetterRequest = async () => {
    if (!studentRecordId) {
      setError("User tidak ditemukan. Silakan login ulang.");
      return;
    }

    if (!selectedJenis || !tujuanPenggunaan.trim()) {
      setError("Jenis surat dan tujuan penggunaan wajib diisi.");
      return;
    }

    setSubmitting(true);
    setError("");
    try {
      const id = `S${Date.now()}`;
      const tanggal = new Date().toISOString().slice(0, 10);

      await apiPost<{ message: string }>("/letter-requests", {
        id,
        studentId: studentRecordId,
        jenis: selectedJenis,
        tanggal,
        tujuan: tujuanPenggunaan,
        projectId: selectedProjectId || null
      });

      setSuratData((prev) => [
        { id, jenis: selectedJenis, tanggal, tujuan: tujuanPenggunaan, status: "Menunggu" },
        ...prev
      ]);
      setSelectedJenis("");
      setTujuanPenggunaan("");
      setIsModalOpen(false);
    } catch (err: any) {
      setError(err?.message || "Gagal mengirim pengajuan surat.");
    } finally {
      setSubmitting(false);
    }
  };

  const submitCertificateRequest = async () => {
    if (!studentRecordId || !user?.id) {
      setError("User tidak ditemukan. Silakan login ulang.");
      return;
    }
    if (isAlumni && certificateEligible === false) {
      setError("Sertifikat tidak dapat diajukan karena berkas kelulusan belum lengkap. Silakan lengkapi berkas di menu Kelulusan.");
      return;
    }
    if (!certProjectId) {
      setError("Pilih riset untuk sertifikat.");
      return;
    }
    const existing = certificateData.find((item) => item.projectId === certProjectId);
    if (existing && existing.status !== "Belum Diminta") {
      setError("Permintaan sertifikat untuk riset ini sudah ada.");
      return;
    }

    setSubmitting(true);
    setError("");
    try {
      const requestId = `CR${Date.now()}`;
      await apiPost<{ message: string }>("/certificates", {
        id: requestId,
        studentId: studentRecordId,
        projectId: certProjectId,
        requestedBy: user.id,
        kontribusiSelesaiDate: certFinishDate || null,
        requestNote: certRequestNote || null
      });

      const projectTitle = assignedProjects.find((project) => project.id === certProjectId)?.title || "Riset";
      setCertificateData((prev) => {
        const next = prev.filter((item) => item.projectId !== certProjectId);
        return [
          {
            id: requestId,
            projectId: certProjectId,
            projectName: projectTitle,
            status: "Diproses",
            issueDate: null,
            certificateNumber: null,
            fileUrl: null
          },
          ...next
        ];
      });
      setCertModalOpen(false);
      setCertRequestNote("");
      setCertFinishDate("");
    } catch (err: any) {
      setError(err?.message || "Gagal mengajukan sertifikat.");
    } finally {
      setSubmitting(false);
    }
  };

  const handleUploadFile = async (docType: string, file: File) => {
    if (!user?.id) return;
    setUploadingType(docType);
    setUploadError("");
    try {
      const reader = new FileReader();
      const dataUrl = await new Promise<string>((resolve, reject) => {
        reader.onload = () => resolve(reader.result as string);
        reader.onerror = reject;
        reader.readAsDataURL(file);
      });
      const res = await apiPut<{ message: string; documents: any[] }>(
        `/students/${encodePathSegment(user.id)}/documents/${encodePathSegment(docType)}`,
        { fileDataUrl: dataUrl, fileName: file.name }
      );
      if (res.documents) {
        const profile = await apiGet<any>(`/profile/${encodePathSegment(user.id)}`).catch(() => null);
        const status = profile?.status || profile?.studentStatus || null;
        setStudentDocuments(normalizeStudentDocuments({ student_documents: res.documents }, status));
      }
      setUploadModal(null);
    } catch (err: any) {
      setUploadError(err?.message || "Gagal mengupload dokumen.");
    } finally {
      setUploadingType(null);
    }
  };

  return (
    <Layout title="Dokumen & Sertifikat">
      <div className="flex flex-col gap-6 max-w-[1060px] mx-auto">
        {!isModalOpen && !certModalOpen && error && (
          <div className="px-4 py-3 rounded-xl border border-red-200 bg-red-50 text-sm font-semibold text-red-600">
            {error}
          </div>
        )}

        {/* Page Header */}
        <div className="flex items-center justify-between">
          <div>
            <p className="text-[10px] font-black text-muted-foreground uppercase tracking-widest mb-1">Mahasiswa</p>
            <h1 className="text-2xl font-black text-foreground">Dokumen & Sertifikat</h1>
          </div>
          {activeTab === "surat" && (
            <button
              onClick={() => setIsModalOpen(true)}
              className="bg-[#6C47FF] hover:bg-[#5835e5] text-white px-5 py-2.5 rounded-xl text-sm font-bold shadow-sm shadow-[#6C47FF]/20 transition-all flex items-center gap-2"
            >
              <Plus size={16} strokeWidth={3} />
              Ajukan Surat
            </button>
          )}
          {activeTab === "sertifikat" && (
            <button
              onClick={() => {
                if (isAlumni && certificateEligible === false) {
                  setError("Sertifikat tidak dapat diajukan karena kelulusan dilakukan dengan dispensasi tanpa kelengkapan berkas. Silakan lengkapi berkas di menu Kelulusan.");
                  return;
                }
                setCertModalOpen(true);
              }}
              className={`px-5 py-2.5 rounded-xl text-sm font-bold shadow-sm transition-all flex items-center gap-2 ${
                isAlumni && certificateEligible === false
                  ? "bg-slate-200 text-slate-400 cursor-not-allowed shadow-none"
                  : "bg-[#6C47FF] hover:bg-[#5835e5] text-white shadow-[#6C47FF]/20"
              }`}
              title={isAlumni && certificateEligible === false ? "Hak sertifikat ditangguhkan karena berkas kelulusan belum lengkap" : undefined}
            >
              <Plus size={16} strokeWidth={3} />
              Ajukan Sertifikat
            </button>
          )}
        </div>

        <div className="bg-white border border-border rounded-[18px] shadow-sm overflow-hidden">
          <div className="px-5 py-4 border-b border-border flex items-center justify-between gap-3 bg-gradient-to-r from-emerald-50 to-white">
            <div>
              <p className="text-[10px] font-black text-emerald-700 uppercase tracking-widest">Berkas Resmi</p>
              <h2 className="text-sm font-black text-foreground mt-0.5">Dokumen dari Admin STAS-RG</h2>
            </div>
            <span className="rounded-full bg-emerald-100 px-3 py-1 text-[11px] font-black text-emerald-700">
              {studentDocuments.filter((doc) => doc.fileUrl || officialDocumentsForType(doc.type).length > 0).length}/4 tersedia
            </span>
          </div>
          <div className="grid grid-cols-1 gap-3 p-4 md:grid-cols-2">
            {studentDocuments.map((doc) => {
              const resolvedUrl = resolveApiAssetUrl(doc.fileUrl);
              const publishedDocuments = officialDocumentsForType(doc.type);
              const primaryOfficialDocument = publishedDocuments[0] || null;
              const isAvailable = Boolean(resolvedUrl || primaryOfficialDocument);
              return (
                <div key={doc.type} className={`rounded-[14px] border p-4 ${isAvailable ? "border-emerald-200 bg-emerald-50/50" : "border-slate-200 bg-slate-50"}`}>
                  <div className="flex items-start gap-3">
                    <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${isAvailable ? "bg-emerald-500 text-white" : "bg-white text-slate-400 border border-slate-200"}`}>
                      {doc.locked && !isAvailable ? <Lock size={17} /> : <FileText size={17} />}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-black text-foreground leading-snug">{doc.label}</p>
                      <p className="mt-1 text-xs font-medium text-muted-foreground">
                        {publishedDocuments.length > 0
                          ? `${publishedDocuments.length} dokumen terbit${primaryOfficialDocument?.documentNumber ? ` • ${primaryOfficialDocument.documentNumber}` : ""}`
                          : doc.fileName
                          ? `${doc.fileName}${doc.fileSize ? ` • ${formatFileSize(doc.fileSize)}` : ""}`
                          : doc.type === "sertifikat" && isAlumni && certificateEligible === false
                            ? "Ditangguhkan: Lengkapi berkas kelulusan untuk membuka hak sertifikat."
                            : doc.locked
                              ? doc.lockReason || "Tersedia setelah status Alumni."
                              : "Belum diunggah admin."}
                      </p>
                      {doc.type === "sertifikat" && publishedDocuments.length > 0 ? (
                        <button
                          type="button"
                          onClick={() => setActiveTab("sertifikat")}
                          className="mt-3 inline-flex items-center gap-2 rounded-xl bg-emerald-500 px-4 py-2 text-xs font-black text-white hover:bg-emerald-600"
                        >
                          <Award size={13} /> Lihat {publishedDocuments.length} Sertifikat
                        </button>
                      ) : primaryOfficialDocument?.canDownload ? (
                        <button
                          type="button"
                          disabled={downloadingOfficialId === primaryOfficialDocument.id}
                          onClick={() => void downloadOfficialDocument(primaryOfficialDocument)}
                          className="mt-3 inline-flex items-center gap-2 rounded-xl bg-emerald-500 px-4 py-2 text-xs font-black text-white hover:bg-emerald-600 disabled:opacity-60"
                        >
                          <Download size={13} /> {downloadingOfficialId === primaryOfficialDocument.id ? "Mengunduh..." : "Unduh"}
                        </button>
                      ) : resolvedUrl ? (
                        <div className="mt-3 flex items-center gap-2 flex-wrap">
                          <a
                            href={resolvedUrl}
                            target="_blank"
                            rel="noreferrer"
                            className="inline-flex items-center gap-2 rounded-xl bg-emerald-500 px-4 py-2 text-xs font-black text-white hover:bg-emerald-600"
                          >
                            <Download size={13} /> Unduh
                          </a>
                          {!doc.locked && (
                            <button
                              type="button"
                              onClick={() => setUploadModal({ type: doc.type, label: doc.label })}
                              className="inline-flex items-center gap-2 rounded-xl border border-[#6C47FF]/30 bg-[#F8F5FF] px-4 py-2 text-xs font-black text-[#6C47FF] hover:bg-[#ede9ff] transition-colors"
                            >
                              <Upload size={13} /> Ganti File
                            </button>
                          )}
                        </div>
                      ) : doc.locked ? (
                        <span className="mt-3 inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2 text-xs font-black text-slate-400">
                          <Lock size={13} /> Belum tersedia
                        </span>
                      ) : (
                        <button
                          type="button"
                          onClick={() => setUploadModal({ type: doc.type, label: doc.label })}
                          className="mt-3 inline-flex items-center gap-2 rounded-xl bg-[#6C47FF] px-4 py-2 text-xs font-black text-white hover:bg-[#5835e5] transition-colors"
                        >
                          <Upload size={13} /> Upload Dokumen
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
        {/* Tabs */}
        <div className="flex gap-1 bg-slate-100 p-1 rounded-[14px] w-fit">
          <button
            onClick={() => setActiveTab("surat")}
            className={`flex items-center gap-2 px-5 py-2.5 rounded-[10px] text-sm font-bold transition-all ${
              activeTab === "surat"
                ? "bg-white text-[#6C47FF] shadow-sm"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            <FileText size={15} />
            Layanan Surat
          </button>
          <button
            onClick={() => setActiveTab("sertifikat")}
            className={`flex items-center gap-2 px-5 py-2.5 rounded-[10px] text-sm font-bold transition-all ${
              activeTab === "sertifikat"
                ? "bg-white text-[#6C47FF] shadow-sm"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            <Award size={15} />
            Sertifikat
          </button>
        </div>

        {/* ─── TAB: LAYANAN SURAT ─── */}
        {activeTab === "surat" && (
          <div className="flex flex-col gap-5">

            {/* Info Banner */}
            <div className="bg-blue-50 border border-blue-200 rounded-[14px] px-5 py-4 flex items-center gap-3.5">
              <div className="w-9 h-9 rounded-xl bg-blue-100 text-blue-500 flex items-center justify-center shrink-0">
                <Info size={18} />
              </div>
              <div>
                <p className="text-sm font-bold text-blue-800">Informasi Layanan Surat</p>
                <p className="text-xs text-blue-700 mt-0.5">
                  Layanan surat diproses dalam <span className="font-bold">3–5 hari kerja</span> setelah pengajuan diterima. Pastikan data yang Anda isi lengkap dan benar untuk mempercepat proses.
                </p>
              </div>
            </div>

            {/* Surat Cards List */}
            <div className="flex flex-col gap-3.5">
              {suratData.map((surat) => (
                <div
                  key={surat.id}
                  className={`bg-white border rounded-[16px] p-5 shadow-sm flex items-start gap-4 transition-all hover:shadow-md ${
                    surat.status === "Siap Unduh"
                      ? "border-emerald-200/70"
                      : surat.status === "Diproses"
                      ? "border-blue-200/70"
                      : "border-border/60"
                  }`}
                >
                  {/* Icon */}
                  <div className={`w-11 h-11 rounded-xl flex items-center justify-center shrink-0 ${
                    surat.status === "Siap Unduh"
                      ? "bg-emerald-50 text-emerald-600"
                      : surat.status === "Diproses"
                      ? "bg-blue-50 text-blue-600"
                      : "bg-slate-100 text-slate-400"
                  }`}>
                    <FileText size={20} />
                  </div>

                  {/* Content */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-start justify-between gap-3 flex-wrap">
                      <div className="flex flex-col gap-1">
                        <p className="text-sm font-black text-foreground">{surat.jenis}</p>
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="text-[11px] font-medium text-muted-foreground">
                            Diajukan {surat.tanggal}
                          </span>
                          <span className="text-muted-foreground/40">•</span>
                          <span className="text-[11px] font-medium text-slate-500 truncate max-w-[320px]">
                            {surat.tujuan}
                          </span>
                        </div>
                      </div>
                      <div className="flex items-center gap-3 shrink-0">
                        <SuratStatusBadge status={surat.status} />
                        {surat.status === "Siap Unduh" && (
                          <a
                            href={resolveApiAssetUrl(surat.fileUrl) || "#"}
                            target="_blank"
                            rel="noreferrer"
                            className={`flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-bold transition-all shadow-sm ${
                              resolveApiAssetUrl(surat.fileUrl)
                                ? "bg-emerald-500 hover:bg-emerald-600 text-white shadow-emerald-500/20"
                                : "bg-slate-100 text-slate-400 pointer-events-none shadow-none"
                            }`}
                          >
                            <Download size={13} strokeWidth={2.5} />
                            Unduh
                          </a>
                        )}
                        {surat.status === "Diproses" && surat.estimasi && (
                          <div className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-blue-50 border border-blue-200 text-blue-600 text-xs font-bold">
                            <CalendarClock size={13} strokeWidth={2.5} />
                            Estimasi {surat.estimasi}
                          </div>
                        )}
                        {surat.status === "Menunggu" && (
                          <div className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-slate-50 border border-slate-200 text-slate-400 text-xs font-bold">
                            <Clock size={13} />
                            Antrian
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>

            {/* Empty state hint */}
            <p className="text-center text-xs text-muted-foreground py-2">
              Menampilkan {suratData.length} pengajuan surat · Belum ada surat baru hari ini
            </p>
          </div>
        )}

        {/* ─── TAB: SERTIFIKAT ─── */}
        {activeTab === "sertifikat" && (
          <div className="flex flex-col gap-4">
            {isAlumni && certificateEligible === false && (
              <div className="bg-amber-50 border border-amber-200 rounded-[16px] p-5 flex items-start gap-4 text-amber-900 shadow-sm">
                <div className="w-10 h-10 rounded-xl bg-amber-100 text-amber-600 flex items-center justify-center shrink-0">
                  <AlertTriangle size={20} />
                </div>
                <div className="flex-1 min-w-0">
                  <h4 className="text-sm font-bold text-amber-900">Hak Penerbitan Sertifikat Ditangguhkan</h4>
                  <p className="text-xs text-amber-800 mt-1 leading-relaxed">
                    Anda telah dinyatakan lulus sebagai Alumni melalui dispensasi khusus operator/admin, namun berkas kelulusan Anda belum lengkap atau belum divalidasi.
                    Pengajuan dan penerbitan sertifikat ditangguhkan sampai Anda melengkapi berkas kelulusan Anda.
                  </p>
                  <div className="mt-3">
                    <a
                      href="/mahasiswa/graduation"
                      className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-amber-600 hover:bg-amber-700 text-white text-xs font-bold transition-all shadow-sm shadow-amber-600/20"
                    >
                      Lengkapi Berkas Kelulusan Sekarang
                    </a>
                  </div>
                </div>
              </div>
            )}
            {officialDocumentsForType("sertifikat").length === 0 && certificateData.length === 0 ? (
              <div className="border-2 border-dashed border-slate-200 rounded-[18px] p-10 flex flex-col items-center justify-center text-center gap-3 bg-slate-50/50">
                <div className="w-14 h-14 rounded-2xl bg-white border border-slate-200 flex items-center justify-center text-slate-300 shadow-sm">
                  <Sparkles size={24} />
                </div>
                <div>
                  <p className="text-sm font-black text-slate-500">Belum ada data sertifikat</p>
                  <p className="text-xs text-muted-foreground mt-1">
                    Data akan muncul setelah dosen/admin memproses permintaan sertifikat.
                  </p>
                </div>
              </div>
            ) : officialDocumentsForType("sertifikat").length > 0 ? (
              officialDocumentsForType("sertifikat").map((cert) => (
                <div key={cert.id} className="bg-white border rounded-[16px] p-5 shadow-sm border-emerald-200/70">
                  <div className="flex items-start justify-between gap-3 flex-wrap">
                    <div>
                      <p className="text-sm font-black text-foreground">{cert.title || "Sertifikat"}</p>
                      <p className="text-xs text-muted-foreground mt-0.5">
                        {cert.participantContexts?.map((context) => context.projectName).filter(Boolean).join(", ") || cert.typeName || "Sertifikat resmi STAS-RG"}
                      </p>
                    </div>
                    <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[11px] font-bold border bg-emerald-100 text-emerald-700 border-emerald-200">
                      {cert.statusLabel || "Terbit"}
                    </span>
                  </div>
                  <div className="mt-4 grid grid-cols-2 gap-x-6 gap-y-2.5">
                    <div>
                      <p className="text-[10px] font-black text-muted-foreground uppercase tracking-widest">Tanggal Terbit</p>
                      <p className="text-sm font-bold text-foreground mt-0.5">{cert.issuedAt ? formatDateYmd(cert.issuedAt) : "-"}</p>
                    </div>
                    <div>
                      <p className="text-[10px] font-black text-muted-foreground uppercase tracking-widest">No. Sertifikat</p>
                      <p className="text-sm font-bold text-foreground mt-0.5">{cert.documentNumber || "-"}</p>
                    </div>
                  </div>
                  {cert.canDownload && (
                    <div className="mt-4 pt-3 border-t border-slate-100">
                      <button
                        type="button"
                        disabled={downloadingOfficialId === cert.id}
                        onClick={() => void downloadOfficialDocument(cert)}
                        className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-emerald-500 hover:bg-emerald-600 text-white text-sm font-bold transition-all disabled:opacity-60"
                      >
                        <Download size={14} strokeWidth={2.5} />
                        {downloadingOfficialId === cert.id ? "Mengunduh..." : "Unduh Sertifikat"}
                      </button>
                    </div>
                  )}
                </div>
              ))
            ) : (
              certificateData.map((cert) => (
                <div key={cert.id} className="bg-white border rounded-[16px] p-5 shadow-sm border-border/60">
                  <div className="flex items-start justify-between gap-3 flex-wrap">
                    <div>
                      <p className="text-sm font-black text-foreground">Sertifikat Peserta Program Riset</p>
                      <p className="text-xs text-muted-foreground mt-0.5">{cert.projectName}</p>
                    </div>
                    <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[11px] font-bold border ${
                      cert.status === "Terbit"
                        ? "bg-emerald-100 text-emerald-700 border-emerald-200"
                        : cert.status === "Diproses"
                          ? "bg-amber-100 text-amber-700 border-amber-200"
                          : "bg-slate-100 text-slate-600 border-slate-200"
                    }`}>
                      {cert.status}
                    </span>
                  </div>
                  <div className="mt-4 grid grid-cols-2 gap-x-6 gap-y-2.5">
                    <div>
                      <p className="text-[10px] font-black text-muted-foreground uppercase tracking-widest">Tanggal Terbit</p>
                      <p className="text-sm font-bold text-foreground mt-0.5">{cert.issueDate || "-"}</p>
                    </div>
                    <div>
                      <p className="text-[10px] font-black text-muted-foreground uppercase tracking-widest">No. Sertifikat</p>
                      <p className="text-sm font-bold text-foreground mt-0.5">{cert.certificateNumber || "-"}</p>
                    </div>
                  </div>
                  {cert.status === "Terbit" && cert.fileUrl && (
                    <div className="mt-4 pt-3 border-t border-slate-100">
                      <a
                        href={resolveApiAssetUrl(cert.fileUrl) || "#"}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-emerald-500 hover:bg-emerald-600 text-white text-sm font-bold transition-all"
                      >
                        <Download size={14} strokeWidth={2.5} />
                        Unduh Sertifikat
                      </a>
                    </div>
                  )}
                </div>
              ))
            )}
          </div>
        )}
      </div>

      {/* ─── Modal: Ajukan Surat ─── */}
      {isModalOpen && (
        <div className="fixed inset-0 z-[100] bg-slate-900/40 backdrop-blur-sm flex items-start justify-center pt-[6vh] p-4 sm:p-6">
          <div className="bg-white w-full max-w-[500px] rounded-[20px] shadow-2xl flex flex-col overflow-hidden">

            {/* Modal Header */}
            <div className="p-5 border-b border-border flex items-center justify-between shrink-0">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-[#F8F5FF] text-[#6C47FF] flex items-center justify-center">
                  <FileText size={20} strokeWidth={2.5} />
                </div>
                <div>
                  <h2 className="text-lg font-black text-foreground">Ajukan Surat</h2>
                  <p className="text-[11px] font-medium text-muted-foreground">Isi form pengajuan dengan lengkap</p>
                </div>
              </div>
              <button
                onClick={() => setIsModalOpen(false)}
                className="w-8 h-8 rounded-full bg-slate-50 hover:bg-slate-100 flex items-center justify-center text-slate-500 transition-colors"
              >
                <X size={18} />
              </button>
            </div>

            {/* Modal Body */}
            <div className="p-5 flex flex-col gap-5">

              {error && (
                <div className="px-4 py-3 rounded-xl border border-red-200 bg-red-50 text-sm font-semibold text-red-600">
                  {error}
                </div>
              )}

              {/* Info note */}
              <div className="bg-blue-50 border border-blue-200 rounded-xl px-4 py-3 flex items-center gap-3">
                <Info size={15} className="text-blue-500 shrink-0" />
                <p className="text-xs font-medium text-blue-700">
                  Surat akan diproses dalam <span className="font-bold">3–5 hari kerja</span>. Harap pastikan jenis surat sudah sesuai kebutuhan.
                </p>
              </div>

              {/* Jenis Surat Dropdown */}
              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-bold text-slate-700">
                  Jenis Surat <span className="text-red-500">*</span>
                </label>
                <div className="relative">
                  <select
                    value={selectedJenis}
                    onChange={(e) => setSelectedJenis(e.target.value)}
                    className="w-full px-4 py-3 bg-white border border-slate-300 rounded-xl text-sm font-medium focus:ring-2 focus:ring-[#6C47FF]/20 focus:border-[#6C47FF] outline-none transition-all appearance-none cursor-pointer text-slate-700"
                  >
                    <option value="" disabled>Pilih jenis surat...</option>
                    {suratJenisOptions.map((opt) => (
                      <option key={opt} value={opt}>{opt}</option>
                    ))}
                  </select>
                  <ChevronDown size={16} className="absolute right-3.5 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
                </div>
              </div>

              {/* Riset Terkait */}
              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-bold text-slate-700">Riset Terkait</label>
                <div className="relative">
                  <select
                    value={selectedProjectId}
                    onChange={(e) => setSelectedProjectId(e.target.value)}
                    className="w-full px-4 py-3 bg-white border border-slate-300 rounded-xl text-sm font-medium focus:ring-2 focus:ring-[#6C47FF]/20 focus:border-[#6C47FF] outline-none transition-all appearance-none cursor-pointer text-slate-700"
                  >
                    <option value="">Pilih riset terkait (opsional)</option>
                    {assignedProjects.map((project) => (
                      <option key={project.id} value={project.id}>{project.title}</option>
                    ))}
                  </select>
                  <ChevronDown size={16} className="absolute right-3.5 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
                </div>
              </div>

              {/* Keperluan / Tujuan */}
              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-bold text-slate-700">
                  Keperluan / Tujuan Penggunaan <span className="text-red-500">*</span>
                </label>
                <textarea
                  rows={4}
                  value={tujuanPenggunaan}
                  onChange={(event) => setTujuanPenggunaan(event.target.value)}
                  placeholder="Jelaskan keperluan surat ini secara singkat dan jelas, termasuk tujuan penggunaan dan instansi yang dituju..."
                  className="w-full px-4 py-3 bg-white border border-slate-300 rounded-xl text-sm placeholder:text-slate-400 focus:ring-2 focus:ring-[#6C47FF]/20 focus:border-[#6C47FF] outline-none resize-none transition-all"
                />
              </div>

            </div>

            {/* Modal Footer */}
            <div className="p-5 border-t border-border bg-slate-50/50 flex items-center justify-end gap-3 shrink-0">
              <button
                onClick={() => setIsModalOpen(false)}
                className="px-5 py-2.5 rounded-xl text-sm font-bold text-slate-600 bg-white border border-slate-200 hover:bg-slate-50 transition-colors"
              >
                Batal
              </button>
              <button
                onClick={submitLetterRequest}
                disabled={submitting}
                className="px-5 py-2.5 rounded-xl text-sm font-bold text-white bg-[#6C47FF] hover:bg-[#5835e5] shadow-sm shadow-[#6C47FF]/20 transition-all flex items-center gap-2 disabled:opacity-60"
              >
                <SendHorizonal size={15} strokeWidth={2.5} />
                {submitting ? "Mengirim..." : "Kirim Pengajuan"}
              </button>
            </div>

          </div>
        </div>
      )}

      {certModalOpen && (
        <div className="fixed inset-0 z-[100] bg-slate-900/40 backdrop-blur-sm flex items-start justify-center pt-[6vh] p-4 sm:p-6">
          <div className="bg-white w-full max-w-[500px] rounded-[20px] shadow-2xl flex flex-col overflow-hidden">
            <div className="p-5 border-b border-border flex items-center justify-between shrink-0">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-[#F8F5FF] text-[#6C47FF] flex items-center justify-center">
                  <Award size={20} strokeWidth={2.5} />
                </div>
                <div>
                  <h2 className="text-lg font-black text-foreground">Ajukan Sertifikat</h2>
                  <p className="text-[11px] font-medium text-muted-foreground">Diajukan ke dosen/admin untuk diproses</p>
                </div>
              </div>
              <button onClick={() => setCertModalOpen(false)} className="w-8 h-8 rounded-full bg-slate-50 hover:bg-slate-100 flex items-center justify-center text-slate-500 transition-colors">
                <X size={18} />
              </button>
            </div>
            <div className="p-5 flex flex-col gap-5">
              {error && (
                <div className="px-4 py-3 rounded-xl border border-red-200 bg-red-50 text-sm font-semibold text-red-600">
                  {error}
                </div>
              )}

              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-bold text-slate-700">Riset <span className="text-red-500">*</span></label>
                <select value={certProjectId} onChange={(e) => setCertProjectId(e.target.value)} className="w-full px-4 py-3 bg-white border border-slate-300 rounded-xl text-sm font-medium focus:ring-2 focus:ring-[#6C47FF]/20 focus:border-[#6C47FF] outline-none transition-all">
                  <option value="">Pilih riset...</option>
                  {assignedProjects.map((project) => (
                    <option key={project.id} value={project.id}>{project.title}</option>
                  ))}
                </select>
              </div>
              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-bold text-slate-700">Tanggal Selesai Kontribusi</label>
                <input type="date" value={certFinishDate} onChange={(e) => setCertFinishDate(e.target.value)} className="w-full px-4 py-3 bg-white border border-slate-300 rounded-xl text-sm font-medium focus:ring-2 focus:ring-[#6C47FF]/20 focus:border-[#6C47FF] outline-none transition-all" />
              </div>
              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-bold text-slate-700">Catatan (Opsional)</label>
                <textarea rows={3} value={certRequestNote} onChange={(event) => setCertRequestNote(event.target.value)} placeholder="Tambahkan catatan untuk dosen/admin..." className="w-full px-4 py-3 bg-white border border-slate-300 rounded-xl text-sm placeholder:text-slate-400 focus:ring-2 focus:ring-[#6C47FF]/20 focus:border-[#6C47FF] outline-none resize-none transition-all" />
              </div>
            </div>
            <div className="p-5 border-t border-border bg-slate-50/50 flex items-center justify-end gap-3 shrink-0">
              <button onClick={() => setCertModalOpen(false)} className="px-5 py-2.5 rounded-xl text-sm font-bold text-slate-600 bg-white border border-slate-200 hover:bg-slate-50 transition-colors">Batal</button>
              <button onClick={submitCertificateRequest} disabled={submitting} className="px-5 py-2.5 rounded-xl text-sm font-bold text-white bg-[#6C47FF] hover:bg-[#5835e5] shadow-sm shadow-[#6C47FF]/20 transition-all flex items-center gap-2 disabled:opacity-60">
                <SendHorizonal size={15} strokeWidth={2.5} />
                {submitting ? "Mengirim..." : "Kirim Pengajuan"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ─── Modal: Upload Dokumen Mahasiswa ─── */}
      {uploadModal && (
        <div className="fixed inset-0 z-[100] bg-slate-900/40 backdrop-blur-sm flex items-start justify-center pt-[6vh] p-4 sm:p-6">
          <div className="bg-white w-full max-w-[480px] rounded-[20px] shadow-2xl flex flex-col overflow-hidden">
            <div className="p-5 border-b border-border flex items-center justify-between shrink-0">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-[#F8F5FF] text-[#6C47FF] flex items-center justify-center">
                  <Upload size={20} strokeWidth={2.5} />
                </div>
                <div>
                  <h2 className="text-base font-black text-foreground">Upload Dokumen</h2>
                  <p className="text-[11px] font-medium text-muted-foreground line-clamp-1">{uploadModal.label}</p>
                </div>
              </div>
              <button
                onClick={() => { setUploadModal(null); setUploadError(""); }}
                className="w-8 h-8 rounded-full bg-slate-50 hover:bg-slate-100 flex items-center justify-center text-slate-500 transition-colors"
              >
                <X size={18} />
              </button>
            </div>

            <div className="p-5 flex flex-col gap-4">
              {uploadError && (
                <div className="px-4 py-3 rounded-xl border border-red-200 bg-red-50 text-sm font-semibold text-red-600">
                  {uploadError}
                </div>
              )}

              <div className="bg-blue-50 border border-blue-200 rounded-xl px-4 py-3 flex items-start gap-3">
                <Info size={15} className="text-blue-500 shrink-0 mt-0.5" />
                <p className="text-xs font-medium text-blue-700">
                  Format yang diterima: <span className="font-bold">PDF, DOC, DOCX, JPG, PNG</span>. Ukuran maksimal <span className="font-bold">10 MB</span>.
                </p>
              </div>

              <label
                htmlFor="doc-upload-input"
                className={`flex flex-col items-center justify-center gap-3 border-2 border-dashed rounded-[14px] p-8 cursor-pointer transition-all ${
                  uploadingType === uploadModal.type
                    ? "border-[#6C47FF]/40 bg-[#F8F5FF]"
                    : "border-slate-200 bg-slate-50 hover:border-[#6C47FF]/50 hover:bg-[#F8F5FF]/60"
                }`}
              >
                <div className="w-12 h-12 rounded-2xl bg-white border border-slate-200 flex items-center justify-center text-[#6C47FF] shadow-sm">
                  {uploadingType === uploadModal.type ? (
                    <Hourglass size={22} className="animate-pulse" />
                  ) : (
                    <Upload size={22} />
                  )}
                </div>
                <div className="text-center">
                  <p className="text-sm font-black text-slate-700">
                    {uploadingType === uploadModal.type ? "Mengupload..." : "Klik untuk pilih file"}
                  </p>
                  <p className="text-xs text-muted-foreground mt-0.5">atau drag & drop file ke sini</p>
                </div>
                <input
                  id="doc-upload-input"
                  type="file"
                  accept=".pdf,.doc,.docx,.jpg,.jpeg,.png"
                  className="hidden"
                  disabled={uploadingType !== null}
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file) void handleUploadFile(uploadModal.type, file);
                    e.target.value = "";
                  }}
                />
              </label>
            </div>

            <div className="p-5 border-t border-border bg-slate-50/50 flex items-center justify-end shrink-0">
              <button
                onClick={() => { setUploadModal(null); setUploadError(""); }}
                disabled={uploadingType !== null}
                className="px-5 py-2.5 rounded-xl text-sm font-bold text-slate-600 bg-white border border-slate-200 hover:bg-slate-50 transition-colors disabled:opacity-60"
              >
                Tutup
              </button>
            </div>
          </div>
        </div>
      )}
    </Layout>
  );
}
