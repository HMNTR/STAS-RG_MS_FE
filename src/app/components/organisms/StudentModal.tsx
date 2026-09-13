import { ProfileAvatar } from "../molecules/ProfileAvatar";
import React, { useEffect, useState, useMemo } from "react";
import { X, Plus, Trash2, FileText, Lock, UploadCloud, CheckCircle2, GraduationCap, Star, User, FlaskConical } from "lucide-react";
import { apiGet, apiPost, apiPut, apiDelete, resolveApiAssetUrl } from "../../lib/api";
import { getWfhSummary, getWfhSourceMeta } from "../../lib/wfh";
import { MAHASISWA_RESEARCH_ROLES } from "../../lib/researchRoles";

type MahasiswaRecord = any;

const STATUS_STYLE: Record<string, string> = {
  Aktif: "bg-emerald-100 text-emerald-700 border border-emerald-200",
  Cuti: "bg-amber-100 text-amber-700 border border-amber-200",
  Alumni: "bg-slate-100 text-slate-600 border border-slate-200",
  "Mengundurkan Diri": "bg-red-100 text-red-600 border border-red-200",
};

type ModalMode = "add" | "edit" | null;

type ResearchMembershipForm = {
  projectId: string;
  bergabung: string;
  selesai: string;
  peran: string;
};

type StudentDocumentForm = {
  type: string;
  label: string;
  requiresAlumni: boolean;
  locked: boolean;
  lockReason: string | null;
  fileUrl: string | null;
  fileName: string | null;
  fileSize: number | null;
};

const STUDENT_DOCUMENT_DEFINITIONS = [
  { type: "surat_pengantar", label: "Surat pengantar mahasiswa riset dan magang CoE STAS-RG", requiresAlumni: false },
  { type: "surat_penerimaan", label: "Surat Penerimaan mahasiswa riset dan magang CoE STAS-RG", requiresAlumni: false },
  { type: "surat_keterangan_selesai", label: "Surat Keterangan Selesai mahasiswa riset dan magang CoE STAS-RG", requiresAlumni: true },
  { type: "sertifikat", label: "Sertifikat", requiresAlumni: true },
];

const STUDENT_DOCUMENT_ACCEPT = ".pdf,.doc,.docx,.jpg,.jpeg,.png";
const MAX_STUDENT_DOCUMENT_BYTES = 10 * 1024 * 1024;

const AVATAR_COLORS = [
  "bg-[#8B6FFF] text-white",
  "bg-emerald-500 text-white",
  "bg-pink-500 text-white",
  "bg-teal-500 text-white",
  "bg-violet-500 text-white",
  "bg-blue-500 text-white",
  "bg-amber-500 text-white",
];

function toInitials(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "M";
  return (parts[0][0] + (parts[1]?.[0] || "")).toUpperCase();
}

function formatDateOnly(dateStr: string | null | undefined): string {
  if (!dateStr || dateStr === "-") return "-";

  try {
    const date = new Date(dateStr);
    if (isNaN(date.getTime())) return "-";
    return date.toISOString().split("T")[0];
  } catch {
    return "-";
  }
}

function getFacultyLabel(item: any): string {
  return item?.fakultas || item?.faculty || item?.facultyName || item?.fakultas_nama || item?.faculty_name || "-";
}

function getFallbackWfhQuota(...sources: any[]) {
  for (const source of sources) {
    const rawValue = source?.manualWfhQuota ?? source?.manual_wfh_quota;

    if (rawValue === null || rawValue === undefined || rawValue === "") continue;

    const parsed = Number(rawValue);
    if (Number.isFinite(parsed)) return parsed;
  }

  const summary = getWfhSummary(...sources);
  return summary.wfhQuotaSource === "mentor" ? 0 : summary.wfhQuota;
}

function getWfhSourceBadgeClasses(source: string) {
  if (source === "mentor") {
    return "bg-sky-100 text-sky-700 border border-sky-200";
  }

  if (source === "student") {
    return "bg-amber-100 text-amber-700 border border-amber-200";
  }

  return "bg-slate-100 text-slate-600 border border-slate-200";
}

function formatWfhDays(value: unknown) {
  const parsed = Number(value);
  return `${Number.isFinite(parsed) ? parsed : 0} hari`;
}

function resolveResearchIdsFromNames(
  researchNames: string[],
  options: Array<{ id: string; short: string; full: string }>
) {
  const lookup = new Map<string, string>();

  options.forEach((option) => {
    lookup.set(option.id, option.id);
    lookup.set(option.full, option.id);
    lookup.set(option.short, option.id);
  });

  const resolved: string[] = [];

  (researchNames || []).forEach((name) => {
    const projectId = lookup.get(name);
    if (projectId && !resolved.includes(projectId)) {
      resolved.push(projectId);
    }
  });

  return resolved;
}

function getResearchOptionLabel(option: { short: string; full: string }) {
  return option.short && option.short !== option.full ? `${option.short} - ${option.full}` : option.full;
}

function toDateInputValue(value: unknown) {
  if (!value || value === "-") return "";

  const normalized = String(value).slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(normalized) ? normalized : "";
}

function normalizeStudentDocuments(source: any, fallbackStatus?: string | null): StudentDocumentForm[] {
  const rawDocuments = source?.student_documents ?? source?.studentDocuments ?? source?.documents;
  const documents = Array.isArray(rawDocuments) ? rawDocuments : [];
  const status = String(source?.status || source?.studentStatus || fallbackStatus || "").toLowerCase();
  const isAlumni = status === "alumni";
  const byType = new Map(documents.map((doc: any) => [String(doc?.type || doc?.documentType || doc?.document_type || ""), doc]));

  return STUDENT_DOCUMENT_DEFINITIONS.map((definition) => {
    const doc: any = byType.get(definition.type) || {};
    const locked = Boolean(definition.requiresAlumni && !isAlumni);

    return {
      type: definition.type,
      label: doc.label || definition.label,
      requiresAlumni: Boolean(doc.requiresAlumni ?? doc.requires_alumni ?? definition.requiresAlumni),
      locked: Boolean(doc.locked ?? locked),
      lockReason: doc.lockReason || doc.lock_reason || (locked ? "Terbuka setelah mahasiswa berstatus Alumni." : null),
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

function validateStudentDocumentFile(file: File) {
  const allowedExtensions = ["pdf", "doc", "docx", "jpg", "jpeg", "png"];
  const extension = file.name.split(".").pop()?.toLowerCase() || "";

  if (!allowedExtensions.includes(extension)) {
    return "Format file harus PDF, DOC, DOCX, JPG, JPEG, atau PNG.";
  }

  if (file.size > MAX_STUDENT_DOCUMENT_BYTES) {
    return "Ukuran file maksimal 10 MB.";
  }

  return null;
}

function fileToDataUrl(file: File) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ""));
    reader.onerror = () => reject(new Error("Gagal membaca file dokumen."));
    reader.readAsDataURL(file);
  });
}
function normalizeResearchMembershipForms(source: any, fallbackIds: string[] = [], fallbackBergabung?: string | null): ResearchMembershipForm[] {
  const rawMemberships = source?.research_memberships ?? source?.researchMemberships;
  const memberships = Array.isArray(rawMemberships) ? rawMemberships : [];
  const forms = memberships
    .map((membership: any) => {
      const projectId = String(membership?.project_id || membership?.projectId || membership?.id || "").trim();
      if (!projectId) return null;

      return {
        projectId,
        bergabung: toDateInputValue(membership?.bergabung || fallbackBergabung),
        selesai: toDateInputValue(membership?.selesai),
      };
    })
    .filter(Boolean) as ResearchMembershipForm[];

  const existingIds = new Set(forms.map((membership) => membership.projectId));

  fallbackIds.forEach((projectId) => {
    const normalizedId = String(projectId || "").trim();
    if (!normalizedId || existingIds.has(normalizedId)) return;

    forms.push({
      projectId: normalizedId,
      bergabung: toDateInputValue(fallbackBergabung),
      selesai: "",
    });
    existingIds.add(normalizedId);
  });

  return forms;
}



export interface StudentModalProps {
  isOpen: boolean;
  mode: "add" | "edit";
  studentId?: string;
  onClose: () => void;
  onSaveSuccess: () => void;
  risetOptions: Array<{ id: string; short: string; full: string }>;
}

export function StudentModal({ isOpen, mode, studentId, onClose, onSaveSuccess, risetOptions }: StudentModalProps) {
  const [activeTab, setActiveTab] = useState("info");
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [uploadingDocumentKey, setUploadingDocumentKey] = useState<string | null>(null);
  const [selectedRisetId, setSelectedRisetId] = useState('');
  const [detail, setDetail] = useState<any>(null);
  const [studentLogs, setStudentLogs] = useState<any[]>([]);
  const [wfhMeta, setWfhMeta] = useState<any>(null);

  const [form, setForm] = useState({
    id: "",
    nim: "",
    name: "",
    password: "",
    angkatan: "",
    email: "",
    phone: "",
    prodi: "",
    fakultas: "",
    pembimbing: "",
    bergabung: "",
    wfhQuota: "",
    status: "Aktif",
    tipe: "Riset",
    risetMemberships: [] as ResearchMembershipForm[],
  });

  const fetchStudentDetail = async (id: string) => {
    setLoading(true);
    try {
      const d = await apiGet<any>(`/students/${id}?_=${Date.now()}`);
      
      let logs: any[] = [];
      try {
        const logsRes = await apiGet<any>(`/logbooks?student_id=${id}`);
        logs = Array.isArray(logsRes) ? logsRes : (logsRes?.data || []);
      } catch (err) {
        console.warn("Gagal mengambil logbooks untuk mahasiswa:", err);
      }
      
      setDetail(d);
      setStudentLogs(logs.slice(0,3).map((l: any) => ({ id: l.id, title: l.title, date: l.date, riset: l.project_name || "Logbook Umum", output: l.output || "-" })));
      
      const detailFakultas = getFacultyLabel(d);
      setForm({
        id: d.id,
        nim: d.nim || "",
        name: d.name || "",
        password: "",
        angkatan: String(d.angkatan || ""),
        email: d.email || "",
        phone: d.phone || "",
        prodi: d.prodi || "",
        fakultas: detailFakultas !== "-" ? detailFakultas : "",
        pembimbing: d.pembimbing || "",
        bergabung: formatDateOnly(d.bergabung),
        wfhQuota: String(d.wfhFallbackQuota ?? 0),
        status: d.status || "Aktif",
        tipe: d.tipe || "Riset",
        risetMemberships: normalizeResearchMembershipForms(
            d,
            Array.isArray(d.research_project_ids) ? d.research_project_ids : [],
            d.bergabung
        ),
      });
      setWfhMeta(getWfhSummary(d));
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (isOpen) {
      setActiveTab("info");
      setError("");
      if (mode === "edit" && studentId) {
        fetchStudentDetail(studentId);
      } else {
        setDetail(null);
        setForm({
            id: "", nim: "", name: "", password: "", angkatan: "", email: "", phone: "",
            prodi: "", fakultas: "", pembimbing: "", bergabung: "", wfhQuota: "", status: "Aktif", tipe: "Riset", risetMemberships: []
        });
      }
    }
  }, [isOpen, mode, studentId]);

  const availableRisetOptions = useMemo(
    () => risetOptions.filter((option) => !form.risetMemberships.some((membership) => membership.projectId === option.id)),
    [form.risetMemberships, risetOptions]
  );

  const selectedRisetOptions = useMemo(() => {
    return form.risetMemberships
      .map((membership) => {
        const option = risetOptions.find((o) => o.id === membership.projectId);
        if (!option) return null;
        return { membership, option };
      })
      .filter((item): item is { membership: ResearchMembershipForm; option: { id: string; short: string; full: string } } => item !== null);
  }, [form.risetMemberships, risetOptions]);


  const handleSave = async () => {
    if (!form.nim.trim() || !form.name.trim()) {
      setError("NIM dan Nama Lengkap wajib diisi.");
      return;
    }

    if (mode === "add" && !form.password.trim()) {
      setError("Password wajib diisi saat membuat akun mahasiswa baru.");
      return;
    }

    const invalidMembership = form.risetMemberships.find(
      (membership) => membership.bergabung && membership.selesai && membership.selesai < membership.bergabung
    );

    if (invalidMembership) {
      setError("Tanggal selesai riset tidak boleh sebelum tanggal bergabung.");
      return;
    }

    setSaving(true);
    setError("");

    try {
      const payload = {
        nim: form.nim.trim(),
        name: form.name.trim(),
        initials: toInitials(form.name),
        prodi: form.prodi.trim(),
        fakultas: form.fakultas.trim() || null,
        password: form.password.trim() || null,
        angkatan: form.angkatan.trim(),
        email: form.email.trim(),
        phone: form.phone.trim(),
        status: form.status,
        tipe: form.tipe,
        pembimbing: form.pembimbing.trim(),
        bergabung: form.bergabung || null,
        wfhQuota: form.wfhQuota === "" ? 0 : Number(form.wfhQuota) || 0,
        riset: form.risetMemberships.map((membership) => ({
          projectId: membership.projectId,
          bergabung: membership.bergabung || form.bergabung || null,
          selesai: membership.selesai || null,
        })),
      };

      if (mode === "add") {
        await apiPost("/students", payload);
      } else {
        await apiPut(`/students/${detail.id}`, payload);
      }

      onSaveSuccess();
    } catch (err: any) {
      setError(err.message || "Gagal menyimpan data mahasiswa");
    } finally {
      setSaving(false);
    }
  };

  const handleStudentDocumentUpload = async (documentType: string, file?: File | null) => {
    if (!detail?.id || !file) return;

    const validationMessage = validateStudentDocumentFile(file);
    if (validationMessage) {
      setError(validationMessage);
      return;
    }

    setUploadingDocumentKey(documentType);
    setError("");

    try {
      const formData = new FormData();
      formData.append("file", file);
      formData.append("type", documentType);

      await apiPost(`/students/${detail.id}/documents`, formData, {
        headers: { "Content-Type": "multipart/form-data" },
      });
      await fetchStudentDetail(detail.id);
    } catch (err: any) {
      setError(err.message || "Gagal mengunggah dokumen.");
    } finally {
      setUploadingDocumentKey(null);
    }
  };

  const handleStudentDocumentDelete = async (documentType: string) => {
    if (!detail?.id) return;

    if (!window.confirm("Apakah Anda yakin ingin menghapus dokumen ini?")) return;

    setUploadingDocumentKey(documentType);
    setError("");

    try {
      await apiDelete(`/students/${detail.id}/documents/${documentType}`);
      await fetchStudentDetail(detail.id);
    } catch (err: any) {
      setError(err.message || "Gagal menghapus dokumen.");
    } finally {
      setUploadingDocumentKey(null);
    }
  };


if (!isOpen) return null;

  return (
        <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/40 backdrop-blur-sm p-4" onClick={onClose}>
          <div className="bg-white rounded-[20px] shadow-2xl w-full max-w-[520px] max-h-[90vh] overflow-y-auto" onClick={(event) => event.stopPropagation()}>
            <div className="px-6 py-5 border-b border-border flex items-center justify-between">
              <h3 className="font-black text-foreground">{mode === "add" ? "Tambah Mahasiswa" : "Edit Mahasiswa"}</h3>
              <button onClick={onClose} className="w-8 h-8 rounded-full flex items-center justify-center hover:bg-slate-100 text-muted-foreground">
                <X size={16} />
              </button>
            </div>

            <div className="p-6 grid grid-cols-2 gap-4">
              <div className="col-span-2">
                <label className="text-xs font-black text-foreground block mb-1.5">Nama Lengkap</label>
                <input
                  value={form.name}
                  onChange={(event) => setForm((prev) => ({ ...prev, name: event.target.value }))}
                  placeholder="Nama mahasiswa"
                  className="w-full h-10 px-3 rounded-[10px] border border-border text-sm focus:outline-none focus:ring-2 focus:ring-amber-300 focus:border-amber-400 transition-all"
                />
              </div>

              <div>
                <label className="text-xs font-black text-foreground block mb-1.5">NIM</label>
                <input
                  value={form.nim}
                  onChange={(event) => setForm((prev) => ({ ...prev, nim: event.target.value }))}
                  placeholder="Nomor Induk Mahasiswa"
                  className="w-full h-10 px-3 rounded-[10px] border border-border text-sm focus:outline-none focus:ring-2 focus:ring-amber-300 focus:border-amber-400 transition-all"
                />
              </div>

              <div>
                <label className="text-xs font-black text-foreground block mb-1.5">
                  {mode === "add" ? "Password" : "Password Baru (Opsional)"}
                </label>
                <input
                  type="password"
                  value={form.password}
                  onChange={(event) => setForm((prev) => ({ ...prev, password: event.target.value }))}
                  placeholder={mode === "add" ? "Minimal 6 karakter" : "Kosongkan jika tidak diubah"}
                  className="w-full h-10 px-3 rounded-[10px] border border-border text-sm focus:outline-none focus:ring-2 focus:ring-amber-300 focus:border-amber-400 transition-all"
                />
              </div>

              <div>
                <label className="text-xs font-black text-foreground block mb-1.5">Angkatan</label>
                <input
                  value={form.angkatan}
                  onChange={(event) => setForm((prev) => ({ ...prev, angkatan: event.target.value }))}
                  placeholder="2021"
                  className="w-full h-10 px-3 rounded-[10px] border border-border text-sm focus:outline-none focus:ring-2 focus:ring-amber-300 focus:border-amber-400 transition-all"
                />
              </div>

              <div className="col-span-2">
                <label className="text-xs font-black text-foreground block mb-1.5">Email</label>
                <input
                  value={form.email}
                  onChange={(event) => setForm((prev) => ({ ...prev, email: event.target.value }))}
                  placeholder="email@student.ac.id"
                  className="w-full h-10 px-3 rounded-[10px] border border-border text-sm focus:outline-none focus:ring-2 focus:ring-amber-300 focus:border-amber-400 transition-all"
                />
              </div>

              <div>
                <label className="text-xs font-black text-foreground block mb-1.5">No. Telepon</label>
                <input
                  value={form.phone}
                  onChange={(event) => setForm((prev) => ({ ...prev, phone: event.target.value }))}
                  placeholder="08xx-xxxx-xxxx"
                  className="w-full h-10 px-3 rounded-[10px] border border-border text-sm focus:outline-none focus:ring-2 focus:ring-amber-300 focus:border-amber-400 transition-all"
                />
              </div>

              <div>
                <label className="text-xs font-black text-foreground block mb-1.5">Program Studi</label>
                <input
                  value={form.prodi}
                  onChange={(event) => setForm((prev) => ({ ...prev, prodi: event.target.value }))}
                  placeholder="S1 Teknik Informatika"
                  className="w-full h-10 px-3 rounded-[10px] border border-border text-sm focus:outline-none focus:ring-2 focus:ring-amber-300 focus:border-amber-400 transition-all"
                />
              </div>

              <div>
                <label className="text-xs font-black text-foreground block mb-1.5">Fakultas</label>
                <input
                  value={form.fakultas}
                  onChange={(event) => setForm((prev) => ({ ...prev, fakultas: event.target.value }))}
                  placeholder="Fakultas"
                  className="w-full h-10 px-3 rounded-[10px] border border-border text-sm focus:outline-none focus:ring-2 focus:ring-amber-300 focus:border-amber-400 transition-all"
                />
              </div>

              <div>
                <label className="text-xs font-black text-foreground block mb-1.5">Bergabung</label>
                <input
                  type="date"
                  value={form.bergabung}
                  onChange={(event) => setForm((prev) => ({ ...prev, bergabung: event.target.value }))}
                  className="w-full h-10 px-3 rounded-[10px] border border-border text-sm focus:outline-none focus:ring-2 focus:ring-amber-300 focus:border-amber-400 transition-all"
                />
              </div>

              <div>
                <label className="text-xs font-black text-foreground block mb-1.5">WFH fallback mahasiswa (dipakai jika mentor belum punya setting)</label>
                <input
                  type="number"
                  min={0}
                  value={form.wfhQuota}
                  onChange={(event) => setForm((prev) => ({ ...prev, wfhQuota: event.target.value }))}
                  placeholder="0"
                  className="w-full h-10 px-3 rounded-[10px] border border-border text-sm focus:outline-none focus:ring-2 focus:ring-amber-300 focus:border-amber-400 transition-all"
                />
                <p className="mt-1.5 text-[11px] font-medium text-muted-foreground">
                  Backend akan memakai ini hanya jika mentor/pembimbing belum memiliki pengaturan WFH.
                </p>
              </div>

              <div className="col-span-2">
                <label className="text-xs font-black text-foreground block mb-1.5">Pembimbing</label>
                <input
                  value={form.pembimbing}
                  onChange={(event) => setForm((prev) => ({ ...prev, pembimbing: event.target.value }))}
                  placeholder="Nama dosen pembimbing"
                  className="w-full h-10 px-3 rounded-[10px] border border-border text-sm focus:outline-none focus:ring-2 focus:ring-amber-300 focus:border-amber-400 transition-all"
                />
                <p className="mt-1.5 text-[11px] font-medium text-muted-foreground">
                  Field ini dipakai backend untuk memetakan jatah WFH mentor/pembimbing.
                </p>
              </div>

              <div className="col-span-2">
                <label className="text-xs font-black text-foreground block mb-1.5">Status</label>
                <select
                  value={form.status}
                  onChange={(event) => setForm((prev) => ({ ...prev, status: event.target.value as MahasiswaRecord["status"] }))}
                  className="w-full h-10 px-3 rounded-[10px] border border-border text-sm focus:outline-none focus:ring-2 focus:ring-amber-300 cursor-pointer"
                >
                  {["Aktif", "Cuti", "Alumni", "Mengundurkan Diri"].map((status) => (
                    <option key={status}>{status}</option>
                  ))}
                </select>
              </div>

              <div className="col-span-2">
                <label className="text-xs font-black text-foreground block mb-1.5">Tipe</label>
                <select
                  value={form.tipe}
                  onChange={(event) => setForm((prev) => ({ ...prev, tipe: event.target.value as MahasiswaRecord["tipe"] }))}
                  className="w-full h-10 px-3 rounded-[10px] border border-border text-sm focus:outline-none focus:ring-2 focus:ring-amber-300 cursor-pointer"
                >
                  {["Riset", "Magang"].map((tipe) => (
                    <option key={tipe}>{tipe}</option>
                  ))}
                </select>
              </div>

              <div className="col-span-2 mt-2 mb-2">
                <div className="flex gap-3 rounded-[12px] border border-emerald-200 bg-emerald-50/50 p-4">
                  <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-emerald-500 text-white">
                    <GraduationCap size={16} />
                  </div>
                  <div>
                    <p className="text-[13px] font-bold text-foreground mb-1.5">Tipe menentukan peran mahasiswa di lab.</p>
                    <ul className="list-disc pl-4 text-xs text-foreground space-y-1.5 marker:text-emerald-500">
                      <li><strong>Magang:</strong> Mahasiswa memiliki <strong>1 proyek utama (Magang)</strong> dan dapat mengambil proyek riset sebagai proyek tambahan.</li>
                      <li><strong>Riset:</strong> Mahasiswa memiliki <strong>1 proyek utama (Riset)</strong> dan dapat mengambil proyek riset lainnya sebagai proyek tambahan.</li>
                    </ul>
                  </div>
                </div>
              </div>

              <div className="col-span-2 space-y-6">
                <div>
                  <div className="flex items-center gap-2 mb-1">
                    <label className="text-[13px] font-black text-foreground">Proyek Utama</label>
                    <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-black text-emerald-700">Wajib (1)</span>
                  </div>
                  <p className="mb-3 text-xs font-medium text-muted-foreground">
                    Setiap mahasiswa harus memiliki 1 proyek utama sesuai tipenya.
                  </p>

                  {risetOptions.length > 0 ? (
                    <>
                      {selectedRisetOptions.length === 0 && (
                        <select
                          value={selectedRisetId}
                          onChange={(event) => {
                            const projectId = event.target.value;
                            if (!projectId) return;

                            setForm((prev) => ({
                              ...prev,
                              risetMemberships: [{ projectId, bergabung: prev.bergabung || "", selesai: "", peran: "Anggota Riset" }],
                            }));
                            setSelectedRisetId("");
                          }}
                          className="w-full h-10 px-3 rounded-[10px] border border-border text-sm focus:outline-none focus:ring-2 focus:ring-amber-300 cursor-pointer mb-3"
                        >
                          <option value="">Pilih proyek utama</option>
                          {availableRisetOptions.map((option) => (
                            <option key={option.id} value={option.id} title={option.full}>
                              {getResearchOptionLabel(option)}
                            </option>
                          ))}
                        </select>
                      )}

                      {selectedRisetOptions.length > 0 && (
                        <div className="space-y-3">
                          <div
                            key={selectedRisetOptions[0].option.id}
                            className="rounded-[12px] border border-amber-200 bg-amber-50 p-3"
                            title={selectedRisetOptions[0].option.full}
                          >
                            <div className="flex items-start justify-between gap-3">
                              <div className="min-w-0">
                                <p className="flex items-center gap-2 truncate text-[13px] font-black text-amber-900">
                                  <FlaskConical size={14} className="text-amber-700" /> {getResearchOptionLabel(selectedRisetOptions[0].option)}
                                </p>
                              </div>
                              <button
                                type="button"
                                onClick={() => {
                                  setForm((prev) => ({
                                    ...prev,
                                    risetMemberships: prev.risetMemberships.filter((_, i) => i !== 0),
                                  }));
                                }}
                                className="flex h-7 w-7 shrink-0 items-center justify-center rounded-[8px] border border-amber-200 bg-white text-amber-600 hover:text-amber-800"
                                aria-label={`Hapus ${selectedRisetOptions[0].option.full}`}
                              >
                                <X size={13} />
                              </button>
                            </div>

                            <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
                              <div>
                                <label className="mb-1 block text-[11px] font-black text-amber-900">Tanggal bergabung</label>
                                <input
                                  type="date"
                                  value={selectedRisetOptions[0].membership.bergabung}
                                  onChange={(event) => {
                                    const value = event.target.value;
                                    setForm((prev) => {
                                      const next = [...prev.risetMemberships];
                                      next[0].bergabung = value;
                                      return { ...prev, risetMemberships: next };
                                    });
                                  }}
                                  className="w-full h-9 px-3 rounded-[9px] border border-amber-200 bg-white text-xs focus:outline-none focus:ring-2 focus:ring-amber-300"
                                />
                              </div>
                              <div className="sm:col-span-2">
                                <label className="mb-1 block text-[11px] font-black text-amber-900">Peran</label>
                                <select
                                  value={selectedRisetOptions[0].membership.peran}
                                  onChange={(event) => {
                                    const value = event.target.value;
                                    setForm((prev) => {
                                      const next = [...prev.risetMemberships];
                                      next[0].peran = value;
                                      return { ...prev, risetMemberships: next };
                                    });
                                  }}
                                  className="w-full h-9 px-3 rounded-[9px] border border-amber-200 bg-white text-xs focus:outline-none focus:ring-2 focus:ring-amber-300"
                                >
                                  {MAHASISWA_RESEARCH_ROLES.map(role => (
                                    <option key={role} value={role}>{role}</option>
                                  ))}
                                </select>
                              </div>
                              <div>
                                <label className="mb-1 block text-[11px] font-black text-amber-900">Tanggal selesai (opsional)</label>
                                <input
                                  type="date"
                                  value={selectedRisetOptions[0].membership.selesai}
                                  min={selectedRisetOptions[0].membership.bergabung || undefined}
                                  onChange={(event) => {
                                    const value = event.target.value;
                                    setForm((prev) => {
                                      const next = [...prev.risetMemberships];
                                      next[0].selesai = value;
                                      return { ...prev, risetMemberships: next };
                                    });
                                  }}
                                  className="w-full h-9 px-3 rounded-[9px] border border-amber-200 bg-white text-xs focus:outline-none focus:ring-2 focus:ring-amber-300"
                                />
                              </div>
                            </div>
                          </div>
                          <div className="rounded-[8px] bg-emerald-50/80 px-4 py-2.5 flex items-center gap-2 text-emerald-700 text-xs font-medium border border-emerald-100">
                            <Star size={14} className="shrink-0" />
                            Proyek utama tidak dapat dihapus. Jika perlu mengubah proyek utama, silakan ganti.
                          </div>
                        </div>
                      )}
                    </>
                  ) : (
                    <p className="text-xs text-muted-foreground">Belum ada data riset</p>
                  )}
                </div>

                {selectedRisetOptions.length > 0 && (
                  <div className="pt-2 border-t border-dashed border-border mt-6">
                    <div className="flex items-center justify-between mb-1">
                      <label className="text-[13px] font-black text-foreground">Proyek Tambahan (Opsional)</label>
                      <button
                        type="button"
                        onClick={() => {
                          const select = document.getElementById("tambahan-select") as HTMLSelectElement;
                          if (select) select.focus();
                        }}
                        className="flex items-center gap-1.5 h-8 px-3 rounded-[8px] bg-emerald-50 text-emerald-600 text-xs font-bold border border-emerald-200 hover:bg-emerald-100 transition-colors"
                      >
                        <Plus size={13} /> Tambah Proyek Riset
                      </button>
                    </div>
                    <p className="mb-4 text-xs font-medium text-muted-foreground">
                      Proyek riset tambahan untuk mahasiswa tipe Riset maupun Magang.
                    </p>

                    <div className="space-y-3">
                      {selectedRisetOptions.slice(1).map(({ membership, option }, index) => (
                        <div
                          key={option.id}
                          className="rounded-[12px] border border-amber-200 bg-amber-50 p-3"
                          title={option.full}
                        >
                          <div className="flex items-start justify-between gap-3">
                            <div className="min-w-0">
                              <p className="flex items-center gap-2 truncate text-[13px] font-black text-amber-900">
                                <FlaskConical size={14} className="text-amber-700" /> {getResearchOptionLabel(option)}
                              </p>
                            </div>
                            <button
                              type="button"
                              onClick={() => {
                                setForm((prev) => ({
                                  ...prev,
                                  risetMemberships: prev.risetMemberships.filter((item) => item.projectId !== option.id),
                                }));
                              }}
                              className="flex h-7 w-7 shrink-0 items-center justify-center rounded-[8px] border border-amber-200 bg-white text-amber-600 hover:text-amber-800"
                              aria-label={`Hapus ${option.full}`}
                            >
                              <X size={13} />
                            </button>
                          </div>

                          <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
                            <div>
                              <label className="mb-1 block text-[11px] font-black text-amber-900">Tanggal bergabung</label>
                              <input
                                type="date"
                                value={membership.bergabung}
                                onChange={(event) => {
                                  const value = event.target.value;
                                  setForm((prev) => ({
                                    ...prev,
                                    risetMemberships: prev.risetMemberships.map((item) =>
                                      item.projectId === option.id ? { ...item, bergabung: value } : item
                                    ),
                                  }));
                                }}
                                className="w-full h-9 px-3 rounded-[9px] border border-amber-200 bg-white text-xs focus:outline-none focus:ring-2 focus:ring-amber-300"
                              />
                            </div>
                            <div className="sm:col-span-2">
                              <label className="mb-1 block text-[11px] font-black text-amber-900">Peran</label>
                              <select
                                value={membership.peran}
                                onChange={(event) => {
                                  const value = event.target.value;
                                  setForm((prev) => ({
                                    ...prev,
                                    risetMemberships: prev.risetMemberships.map((item) =>
                                      item.projectId === option.id ? { ...item, peran: value } : item
                                    ),
                                  }));
                                }}
                                className="w-full h-9 px-3 rounded-[9px] border border-amber-200 bg-white text-xs focus:outline-none focus:ring-2 focus:ring-amber-300"
                              >
                                {MAHASISWA_RESEARCH_ROLES.map(role => (
                                  <option key={role} value={role}>{role}</option>
                                ))}
                              </select>
                            </div>
                            <div>
                              <label className="mb-1 block text-[11px] font-black text-amber-900">Tanggal selesai (opsional)</label>
                              <input
                                type="date"
                                value={membership.selesai}
                                min={membership.bergabung || undefined}
                                onChange={(event) => {
                                  const value = event.target.value;
                                  setForm((prev) => ({
                                    ...prev,
                                    risetMemberships: prev.risetMemberships.map((item) =>
                                      item.projectId === option.id ? { ...item, selesai: value } : item
                                    ),
                                  }));
                                }}
                                className="w-full h-9 px-3 rounded-[9px] border border-amber-200 bg-white text-xs focus:outline-none focus:ring-2 focus:ring-amber-300"
                              />
                            </div>
                          </div>
                        </div>
                      ))}

                      {availableRisetOptions.length > 0 && (
                        <select
                          id="tambahan-select"
                          value={selectedRisetId}
                          onChange={(event) => {
                            const projectId = event.target.value;
                            if (!projectId) return;

                            setForm((prev) => ({
                              ...prev,
                              risetMemberships: [...prev.risetMemberships, { projectId, bergabung: prev.bergabung || "", selesai: "", peran: "Anggota Riset" }],
                            }));
                            setSelectedRisetId("");
                          }}
                          className="w-full h-10 px-3 rounded-[10px] border border-border text-sm focus:outline-none focus:ring-2 focus:ring-amber-300 cursor-pointer"
                        >
                          <option value="">Pilih proyek tambahan...</option>
                          {availableRisetOptions.map((option) => (
                            <option key={option.id} value={option.id} title={option.full}>
                              {getResearchOptionLabel(option)}
                            </option>
                          ))}
                        </select>
                      )}
                    </div>
                  </div>
                )}
                
                <div className="mt-6 rounded-[12px] border border-blue-200 bg-blue-50/50 p-4">
                  <div className="flex gap-4">
                    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-blue-100 text-blue-600">
                      <User size={18} />
                    </div>
                    <div className="flex-1 space-y-2">
                      <p className="text-xs font-bold text-blue-900 mb-2">Ringkasan Peran Mahasiswa</p>
                      <div className="grid grid-cols-[100px_1fr] gap-2 text-xs">
                        <span className="font-medium text-blue-800">Tipe</span>
                        <div>
                          <span className="rounded-full bg-blue-100 px-2 py-0.5 font-bold text-blue-700">{form.tipe}</span>
                        </div>
                        <span className="font-medium text-blue-800">Peran</span>
                        <span className="font-medium text-blue-900">
                          {form.tipe === "Magang" 
                            ? `1 Proyek Utama (Magang)${selectedRisetOptions.length > 1 ? ` + ${selectedRisetOptions.length - 1} Proyek Riset (Tambahan)` : ''}`
                            : `1 Proyek Utama (Riset)${selectedRisetOptions.length > 1 ? ` + ${selectedRisetOptions.length - 1} Proyek Riset (Tambahan)` : ''}`
                          }
                        </span>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            <div className="px-6 pb-6 flex gap-3">
              <button
                onClick={onClose}
                className="flex-1 h-10 border border-border rounded-[10px] text-sm font-bold text-muted-foreground hover:bg-slate-50 transition-colors"
              >
                Batal
              </button>

              <button
                onClick={handleSave}
                disabled={saving}
                className="flex-1 h-10 bg-amber-500 hover:bg-amber-600 text-white text-sm font-black rounded-[10px] transition-colors shadow-sm disabled:opacity-60"
              >
                {saving ? "Menyimpan..." : "Simpan"}
              </button>
            </div>
          </div>
        </div>
      );
}
