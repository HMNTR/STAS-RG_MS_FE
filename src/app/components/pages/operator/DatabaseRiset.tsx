import React, { useState, useEffect } from "react";
import { useNavigate } from "react-router";
import { useConfirmDialog } from "../../molecules/ConfirmDialog";
import { OperatorLayout } from "../../templates/OperatorLayout";
import { apiDelete, apiGet, apiPatch, apiPost, apiPut } from "../../../lib/api";
import { Search, Plus, X, Pencil, LayoutGrid, List, Shield, Trash2, Users, BookOpen, Kanban, ExternalLink, Filter, Download, GraduationCap, Network, FlaskConical } from "lucide-react";
import { getResearchRoleOptions, MAHASISWA_LEADER_ROLE, MAHASISWA_RESEARCH_ROLES, normalizeResearchRoleForMemberType } from "../../../lib/researchRoles";
import { StudentModal } from "../../organisms/StudentModal";

const STEP_LABELS = ["Info Dasar", "Tim", "Periode & Mitra", "Milestone"];
const PERAN_OPTIONS = MAHASISWA_RESEARCH_ROLES;
const PERAN_DOSEN = ["Ketua Riset", "Pembimbing", "Co-Investigator", "Anggota Dosen"];
const RESEARCH_TYPE_OPTIONS = ["Internal", "Eksternal"];
const AGREEMENT_TYPE_OPTIONS = ["PKS", "MoU", "MoA"];

interface ResearchProject {
  id: string;
  title: string;
  short_title?: string;
  supervisor_id?: string;
  supervisor_name?: string;
  period_text?: string;
  mitra?: string;
  status: string;
  progress?: number;
  category?: string;
  description?: string;
  funding?: string;
  researchType?: string;
  research_type?: string;
  agreementType?: string;
  agreement_type?: string;
  agreementStartDate?: string;
  agreement_start_date?: string;
  agreementEndDate?: string;
  agreement_end_date?: string;
  agreementFileUrl?: string;
  agreement_file_url?: string;
  proposalFileUrl?: string;
  proposal_file_url?: string;
  rabFileUrl?: string;
  rab_file_url?: string;
}

interface Lecturer {
  id: string;
  user_id?: string;
  name: string;
  nip: string;
  departemen: string;
  initials?: string;
  color?: string;
  jabatan?: string;
  keahlian?: string[];
  status?: string;
  email?: string;
}

function statusColor(s: string) {
  return s === "Aktif" ? "bg-emerald-100 text-emerald-700 border-emerald-200" : s === "Selesai" ? "bg-slate-100 text-slate-600 border-slate-200" : "bg-red-100 text-red-600 border-red-200";
}

function getResearchField(project: ResearchProject | null | undefined, camelKey: keyof ResearchProject, snakeKey: keyof ResearchProject) {
  return String(project?.[camelKey] || project?.[snakeKey] || "");
}

function isValidUrl(value: string) {
  if (!value.trim()) return true;
  try {
    const url = new URL(value.trim());
    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
}

function formatDisplayDate(value?: string) {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString("id-ID", { day: "2-digit", month: "short", year: "numeric" });
}

function formatDateRange(start?: string, end?: string) {
  if (!start && !end) return "-";
  return `${formatDisplayDate(start)} - ${formatDisplayDate(end)}`;
}

function ResearchFileLink({ label, url }: { label: string; url: string }) {
  return (
    <div className="flex gap-2 text-xs">
      <span className="font-black text-muted-foreground w-24 shrink-0">{label}</span>
      {url ? (
        <a href={url} target="_blank" rel="noreferrer" className="min-w-0 inline-flex items-center gap-1 font-bold text-[#0AB600] hover:underline">
          <span className="truncate">Buka file</span>
          <ExternalLink size={11} className="shrink-0" />
        </a>
      ) : (
        <span className="font-bold text-foreground">-</span>
      )}
    </div>
  );
}

export default function DatabaseRiset() {
  const { confirm, confirmDialog } = useConfirmDialog();
  const navigate = useNavigate();
  const [search, setSearch] = useState("");
  const [filterStatus, setFilterStatus] = useState("Semua");
  const [view, setView] = useState<"grid" | "table" | "ringkasan">("ringkasan");
  const [research, setResearch] = useState<ResearchProject[]>([]);
  const [lecturers, setLecturers] = useState<Lecturer[]>([]);
  const [selected, setSelected] = useState<ResearchProject | null>(null);
  const [editingResearch, setEditingResearch] = useState<ResearchProject | null>(null);
  const [detailTab, setDetailTab] = useState<"info" | "anggota" | "akses">("info");
  const [modalOpen, setModalOpen] = useState(false);
  const [step, setStep] = useState(0);
  const [boardAccess, setBoardAccess] = useState<Record<string, string[]>>({});
  const [addMemberModal, setAddMemberModal] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [members, setMembers] = useState<Record<string, any[]>>({});
  const [students, setStudents] = useState<Array<{ id: string; studentId?: string; name: string; initials?: string; nim?: string; prodi?: string }>>([]);
  const [studentMemberSearch, setStudentMemberSearch] = useState("");
  const [selectedNewMembers, setSelectedNewMembers] = useState<string[]>([]);
  const [selectedPeran, setSelectedPeran] = useState(PERAN_OPTIONS[0]);
  const [savingMembers, setSavingMembers] = useState(false);
  const [savingRiset, setSavingRiset] = useState(false);
  const [savingEdit, setSavingEdit] = useState(false);
  const [filterRingkasanRiset, setFilterRingkasanRiset] = useState("Semua Riset");
  const [filterRingkasanTipe, setFilterRingkasanTipe] = useState("Semua Tipe Mahasiswa");
  const [filterRingkasanPeran, setFilterRingkasanPeran] = useState("Semua Peran");
  const [selectedStudentId, setSelectedStudentId] = useState<string | null>(null);
  const [isStudentModalOpen, setIsStudentModalOpen] = useState(false);
  const [formData, setFormData] = useState({
    title: "",
    description: "",
    category: "",
    status: "Aktif",
    supervisorId: "",
    studentIds: [] as string[],
    startDate: "",
    endDate: "",
    mitra: "",
    funding: "",
    researchType: "Internal",
    agreementType: "MoU",
    agreementStartDate: "",
    agreementEndDate: "",
    agreementFileUrl: "",
    proposalFileUrl: "",
    rabFileUrl: "",
    milestones: [] as string[]
  });
  const [editForm, setEditForm] = useState({
    title: "",
    shortTitle: "",
    description: "",
    category: "",
    status: "Aktif",
    supervisorId: "",
    periodText: "",
    mitra: "",
    funding: "",
    researchType: "Internal",
    agreementType: "MoU",
    agreementStartDate: "",
    agreementEndDate: "",
    agreementFileUrl: "",
    proposalFileUrl: "",
    rabFileUrl: "",
    progress: 0
  });

  const loadData = async () => {
    try {
      const [rData, lData, sData] = await Promise.all([
        apiGet<ResearchProject[]>("/research"),
        apiGet<Lecturer[]>("/lecturers"),
        apiGet<Array<any>>("/students")
      ]);
      setResearch(rData || []);
      setStudents((sData || []).map((item: any) => ({
        id: String(item.user_id || item.userId || item.id || ""),
        studentId: String(item.id || ""),
        name: item.name || "Mahasiswa",
        initials: item.initials,
        nim: item.nim || item.student_nim || "",
        prodi: item.prodi || item.program_studi || item.programStudi || "",
        tipe: item.tipe || "Riset",
        status: item.status || "Aktif",
        research_projects: Array.isArray(item.research_projects) ? item.research_projects : [],
        research_project_ids: Array.isArray(item.research_project_ids) ? item.research_project_ids : [],
        research_memberships: item.research_memberships || item.researchMemberships || []
      })).filter((item) => item.id));
      setLecturers(
        (lData || []).map((item: any) => ({
          ...item,
          initials: item.initials || item.name?.split(" ").map((part: string) => part[0]).join("").slice(0, 2).toUpperCase() || "DS",
          color: item.color || "bg-indigo-600 text-white",
          jabatan: item.jabatan || "Dosen",
          keahlian: Array.isArray(item.keahlian) ? item.keahlian : [],
          status: item.status || "Aktif",
          email: item.email || "-"
        }))
      );
    } catch (err: any) {
      setError(err?.message || "Gagal memuat data");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  useEffect(() => {
    if (selected?.id) {
      const loadMembersAndAccess = async () => {
        try {
          const [memberData, accessData] = await Promise.all([
            apiGet<Array<any>>(`/research/${selected.id}/members`),
            apiGet<Array<any>>(`/research/${selected.id}/board-access`)
          ]);
          setMembers(prev => ({ ...prev, [selected.id]: memberData || [] }));
          setBoardAccess(prev => ({ ...prev, [selected.id]: (accessData || []).map((item: any) => item.user_id) }));
        } catch (err) {
          console.error("Gagal memuat members/board access");
        }
      };
      loadMembersAndAccess();
    }
  }, [selected?.id]);

  const filteredRiset = research.filter(r => {
    const q = search.toLowerCase();
    return (!q || r.title.toLowerCase().includes(q) || r.supervisor_name?.toLowerCase().includes(q)) && (filterStatus === "Semua" || r.status === filterStatus);
  });

  const filteredStudentMembers = students.filter((student) => {
    const q = studentMemberSearch.trim().toLowerCase();
    if (!q) return true;
    return (
      student.name.toLowerCase().includes(q) ||
      String(student.nim || "").toLowerCase().includes(q) ||
      String(student.prodi || "").toLowerCase().includes(q)
    );
  });

  const mahasiswaInRiset = selected ? (members[selected.id] || []).filter((m: any) => m.member_type === "Mahasiswa") : [];
  const dosenInRiset = selected ? (members[selected.id] || []).filter((m: any) => m.member_type === "Dosen") : [];
  const currentAccess = selected ? (boardAccess[selected.id] || []) : [];
  const boardManagerMembers = mahasiswaInRiset.filter((m: any) => currentAccess.includes(m.user_id) || m.peran === MAHASISWA_LEADER_ROLE);
  const nonAccessMembers = mahasiswaInRiset.filter((m: any) => !currentAccess.includes(m.user_id) && m.peran !== MAHASISWA_LEADER_ROLE);

  // --- RINGKASAN DATA COMPUTATION ---
  const ringkasanStudents = React.useMemo(() => {
    return students.flatMap(student => {
      const memberships = Array.isArray(student.research_memberships) && student.research_memberships.length > 0
        ? student.research_memberships
        : (student.research_project_ids || []).map(id => ({ project_id: id }));
        
      if (memberships.length === 0) return [];
  
      return memberships.map((membership: any, index: number) => {
        const projectId = membership.project_id || membership.projectId || membership.id;
        const project = research.find(r => r.id === projectId);
        
        return {
          ...student,
          projectId,
          projectName: project?.title || project?.short_title || projectId,
          picName: project?.supervisor_name || "-",
          peranDalamRiset: index === 0 ? "Proyek Utama" : "Proyek Tambahan",
          bergabung: membership.bergabung || "-",
          selesai: membership.selesai || "-",
          projectStatus: project?.status || "-"
        };
      });
    });
  }, [students, research]);

  const totalRiset = research.length;
  const totalMahasiswa = new Set(ringkasanStudents.map(s => s.id)).size;
  const mahasiswaMagang = new Set(ringkasanStudents.filter(s => s.tipe === "Magang").map(s => s.id)).size;
  const mahasiswaRisetCount = new Set(ringkasanStudents.filter(s => s.tipe === "Riset").map(s => s.id)).size;
  const totalKeterlibatan = ringkasanStudents.length;

  const filteredRingkasan = ringkasanStudents.filter(item => {
    const matchRiset = filterRingkasanRiset === "Semua Riset" || item.projectId === filterRingkasanRiset;
    const matchTipe = filterRingkasanTipe === "Semua Tipe Mahasiswa" || item.tipe === filterRingkasanTipe;
    const matchPeran = filterRingkasanPeran === "Semua Peran" || item.peranDalamRiset === filterRingkasanPeran;
    const q = search.toLowerCase();
    const matchSearch = !q || item.name.toLowerCase().includes(q) || item.projectName.toLowerCase().includes(q);
    return matchRiset && matchTipe && matchPeran && matchSearch;
  });

  const ringkasanGrouped = React.useMemo(() => {
    return filteredRingkasan.reduce((acc, curr) => {
      if (!acc[curr.projectId]) {
        acc[curr.projectId] = {
          projectId: curr.projectId,
          projectName: curr.projectName,
          picName: curr.picName,
          projectStatus: curr.projectStatus,
          members: []
        };
      }
      acc[curr.projectId].members.push(curr);
      return acc;
    }, {} as Record<string, any>);
  }, [filteredRingkasan]);
  // --- END RINGKASAN DATA COMPUTATION ---

  const openProgressBoard = (projectId: string) => {
    navigate(`/operator/progress-board?projectId=${encodeURIComponent(projectId)}`, {
      state: { projectIds: [projectId] }
    });
  };

  const revokeAccess = async (risetId: string, mid: string) => {
    await apiDelete(`/research/${risetId}/board-access/${mid}`);
    setBoardAccess(prev => ({ ...prev, [risetId]: (prev[risetId] || []).filter(x => x !== mid) }));
  };

  const grantAccess = async (risetId: string, mid: string) => {
    await apiPost(`/research/${risetId}/board-access`, { userId: mid });
    setBoardAccess(prev => ({ ...prev, [risetId]: [...(prev[risetId] || []), mid] }));
  };

  const selectedMemberIdsSet = new Set((members[selected?.id || ""] || []).map((member: any) => member.user_id));
  const allAddable = [
    ...lecturers.map((item) => ({ user_id: item.user_id, name: item.name, initials: item.initials || item.name?.charAt(0), member_type: "Dosen" })),
    ...students.map((item) => ({ user_id: item.id, name: item.name, initials: item.initials || item.name?.charAt(0), member_type: "Mahasiswa" }))
  ].filter((item) => !selectedMemberIdsSet.has(item.user_id));
  const selectedNewMemberTypes = Array.from(new Set(
    selectedNewMembers
      .map((userId) => allAddable.find((item) => item.user_id === userId)?.member_type)
      .filter(Boolean)
  ));
  const addMemberRoleOptions = selectedNewMemberTypes.includes("Dosen") && selectedNewMemberTypes.includes("Mahasiswa")
    ? ["Anggota"]
    : selectedNewMemberTypes.includes("Dosen")
      ? PERAN_DOSEN
      : PERAN_OPTIONS;

  useEffect(() => {
    if (!addMemberRoleOptions.includes(selectedPeran)) {
      setSelectedPeran(addMemberRoleOptions[0] || "Anggota");
    }
  }, [addMemberRoleOptions.join("|"), selectedPeran]);

  const toggleNewMember = (userId: string) => {
    setSelectedNewMembers((prev) => prev.includes(userId) ? prev.filter((id) => id !== userId) : [...prev, userId]);
  };

  const handleAddMembers = async () => {
    if (!selected?.id || selectedNewMembers.length === 0) return;
    try {
      setSavingMembers(true);
      for (const userId of selectedNewMembers) {
        const candidate = allAddable.find((item) => item.user_id === userId);
        const memberType = candidate?.member_type || "Mahasiswa";
        await apiPost(`/research/${selected.id}/members`, {
          userId,
          memberType,
          peran: normalizeResearchRoleForMemberType(selectedPeran, memberType),
          status: "Aktif"
        });
      }
      const memberData = await apiGet<Array<any>>(`/research/${selected.id}/members`);
      setMembers((prev) => ({ ...prev, [selected.id]: memberData || [] }));
      setSelectedNewMembers([]);
      setAddMemberModal(false);
    } catch (err: any) {
      setError(err?.message || "Gagal menambah anggota.");
    } finally {
      setSavingMembers(false);
    }
  };

  const handleUpdateMemberPeran = async (projectId: string, userId: string, peran: string, memberType?: string) => {
    try {
      await apiPatch(`/research/${projectId}/members/${userId}`, {
        memberType,
        peran: normalizeResearchRoleForMemberType(peran, memberType)
      });
      const memberData = await apiGet<Array<any>>(`/research/${projectId}/members`);
      setMembers((prev) => ({ ...prev, [projectId]: memberData || [] }));
    } catch (err: any) {
      setError(err?.message || "Gagal memperbarui peran anggota.");
    }
  };

  const handleRemoveMember = async (projectId: string, userId: string) => {
    try {
      await apiDelete(`/research/${projectId}/members/${userId}`);
      const memberData = await apiGet<Array<any>>(`/research/${projectId}/members`);
      setMembers((prev) => ({ ...prev, [projectId]: memberData || [] }));
      setBoardAccess((prev) => ({ ...prev, [projectId]: (prev[projectId] || []).filter((id) => id !== userId) }));
    } catch (err: any) {
      setError(err?.message || "Gagal menghapus anggota.");
    }
  };

  const handleDeleteResearch = async (risetId: string, risetTitle: string) => {
    const confirmed = await confirm({
      title: "Hapus riset?",
      description: `Riset "${risetTitle}" akan dihapus bersama data terkait seperti anggota, milestone, dan logbook.`,
      confirmLabel: "Hapus",
      cancelLabel: "Batal",
      variant: "danger"
    });
    if (!confirmed) return;

    try {
      await apiDelete(`/research/${risetId}`);
      const updatedResearch = await apiGet<ResearchProject[]>("/research");
      setResearch(updatedResearch || []);
      setSelected(null);
    } catch (err: any) {
      setError(err?.message || "Gagal menghapus riset.");
    }
  };

  const validateResearchDocumentFields = (data: {
    researchType: string;
    agreementType: string;
    agreementStartDate: string;
    agreementEndDate: string;
    agreementFileUrl: string;
    proposalFileUrl: string;
    rabFileUrl: string;
  }) => {
    if (!RESEARCH_TYPE_OPTIONS.includes(data.researchType)) {
      return "Jenis riset hanya boleh Internal atau Eksternal.";
    }
    if (!AGREEMENT_TYPE_OPTIONS.includes(data.agreementType)) {
      return "Jenis dokumen hanya boleh PKS, MoU, atau MoA.";
    }
    if (data.agreementStartDate && data.agreementEndDate && data.agreementEndDate < data.agreementStartDate) {
      return "Tanggal selesai dokumen tidak boleh lebih awal dari tanggal mulai.";
    }
    if (![data.agreementFileUrl, data.proposalFileUrl, data.rabFileUrl].every(isValidUrl)) {
      return "Link file harus berupa URL http atau https.";
    }
    return "";
  };

  const handleCreateResearch = async () => {
    if (!formData.title.trim() || !formData.supervisorId) {
      setError("Judul riset dan supervisor wajib diisi.");
      return;
    }
    const validationError = validateResearchDocumentFields(formData);
    if (validationError) {
      setError(validationError);
      return;
    }

    setSavingRiset(true);
    setError("");
    try {
      const risetId = `R${Date.now()}`;
      const periodText = formData.startDate && formData.endDate
        ? `${new Date(formData.startDate).toLocaleDateString("id-ID")} - ${new Date(formData.endDate).toLocaleDateString("id-ID")}`
        : null;

      // Find supervisor's user_id for membership
      const supervisorLecturer = lecturers.find(l => l.id === formData.supervisorId);
      const supervisorUserId = supervisorLecturer?.user_id;

      const payload = {
        id: risetId,
        title: formData.title.trim(),
        shortTitle: formData.title.trim(),
        description: formData.description.trim(),
        category: formData.category.trim() || "Umum",
        status: formData.status,
        supervisorLecturerId: formData.supervisorId,
        periodText,
        mitra: formData.mitra.trim() || "-",
        funding: formData.funding.trim() || "-",
        researchType: formData.researchType,
        agreementType: formData.agreementType,
        agreementStartDate: formData.agreementStartDate || null,
        agreementEndDate: formData.agreementEndDate || null,
        agreementFileUrl: formData.agreementFileUrl.trim() || null,
        proposalFileUrl: formData.proposalFileUrl.trim() || null,
        rabFileUrl: formData.rabFileUrl.trim() || null,
        progress: 0
      };

      await apiPost("/research", payload);

      // Add supervisor and students as members
      const memberPromises = [];

      // Add supervisor as member (use user_id, not lecturer id)
      if (supervisorUserId) {
        memberPromises.push(
          apiPost(`/research/${risetId}/members`, {
            userId: supervisorUserId,
            memberType: "Dosen",
            peran: "Pembimbing",
            status: "Aktif"
          })
        );
      }

      // Add students as members
      for (const studentId of formData.studentIds) {
        memberPromises.push(
          apiPost(`/research/${risetId}/members`, {
            userId: studentId,
            memberType: "Mahasiswa",
            peran: "Anggota",
            status: "Aktif"
          })
        );
      }
      await Promise.all(memberPromises);

      const milestonePromises = formData.milestones
        .map((label, index) => label.trim())
        .filter(Boolean)
        .map((label, index) => apiPost(`/research/${risetId}/milestones`, {
          label,
          done: false,
          sortOrder: index
        }));

      if (milestonePromises.length > 0) {
        await Promise.all(milestonePromises);
      }

      // Reload data
      const updatedResearch = await apiGet<ResearchProject[]>("/research");
      setResearch(updatedResearch || []);

      // Reset form
      setFormData({
        title: "",
        description: "",
        category: "",
        status: "Aktif",
        supervisorId: "",
        studentIds: [],
        startDate: "",
        endDate: "",
        mitra: "",
        funding: "",
        researchType: "Internal",
        agreementType: "MoU",
        agreementStartDate: "",
        agreementEndDate: "",
        agreementFileUrl: "",
        proposalFileUrl: "",
        rabFileUrl: "",
        milestones: []
      });
      setModalOpen(false);
      setStep(0);
    } catch (err: any) {
      setError(err?.message || "Gagal membuat riset baru.");
    } finally {
      setSavingRiset(false);
    }
  };

  const openEditResearch = (project: ResearchProject) => {
    setEditingResearch(project);
    setEditForm({
      title: project.title || "",
      shortTitle: project.short_title || project.title || "",
      description: project.description || "",
      category: project.category || "",
      status: project.status || "Aktif",
      supervisorId: project.supervisor_id || "",
      periodText: project.period_text || "",
      mitra: project.mitra || "",
      funding: project.funding || "",
      researchType: getResearchField(project, "researchType", "research_type") || "Internal",
      agreementType: getResearchField(project, "agreementType", "agreement_type") || "MoU",
      agreementStartDate: getResearchField(project, "agreementStartDate", "agreement_start_date"),
      agreementEndDate: getResearchField(project, "agreementEndDate", "agreement_end_date"),
      agreementFileUrl: getResearchField(project, "agreementFileUrl", "agreement_file_url"),
      proposalFileUrl: getResearchField(project, "proposalFileUrl", "proposal_file_url"),
      rabFileUrl: getResearchField(project, "rabFileUrl", "rab_file_url"),
      progress: Number(project.progress) || 0
    });
  };

  const handleSaveEditedResearch = async () => {
    if (!editingResearch?.id) return;
    if (!editForm.title.trim()) {
      setError("Judul riset wajib diisi.");
      return;
    }
    const validationError = validateResearchDocumentFields(editForm);
    if (validationError) {
      setError(validationError);
      return;
    }

    setSavingEdit(true);
    setError("");
    try {
      await apiPut(`/research/${editingResearch.id}`, {
        title: editForm.title.trim(),
        shortTitle: editForm.shortTitle.trim() || editForm.title.trim(),
        description: editForm.description.trim(),
        category: editForm.category.trim(),
        status: editForm.status,
        supervisorLecturerId: editForm.supervisorId || null,
        periodText: editForm.periodText.trim() || null,
        mitra: editForm.mitra.trim() || null,
        funding: editForm.funding.trim() || null,
        researchType: editForm.researchType,
        agreementType: editForm.agreementType,
        agreementStartDate: editForm.agreementStartDate || null,
        agreementEndDate: editForm.agreementEndDate || null,
        agreementFileUrl: editForm.agreementFileUrl.trim() || null,
        proposalFileUrl: editForm.proposalFileUrl.trim() || null,
        rabFileUrl: editForm.rabFileUrl.trim() || null,
        progress: Number(editForm.progress) || 0
      });

      const updatedResearch = await apiGet<ResearchProject[]>("/research");
      setResearch(updatedResearch || []);
      const refreshedSelected = (updatedResearch || []).find((item) => item.id === editingResearch.id) || null;
      setSelected(refreshedSelected);
      setEditingResearch(null);
    } catch (err: any) {
      setError(err?.message || "Gagal memperbarui data riset.");
    } finally {
      setSavingEdit(false);
    }
  };


  if (loading) return <OperatorLayout title="Database Riset"><div className="p-8 text-center text-muted-foreground">Memuat data...</div></OperatorLayout>;
  if (error) return <OperatorLayout title="Database Riset"><div className="p-8 text-red-600">Error: {error}</div></OperatorLayout>;

  return (
    <OperatorLayout title="Database Riset">
      <div className="flex flex-col gap-5 pb-4">
        {error && (
          <div className="px-4 py-3 rounded-xl border border-red-200 bg-red-50 text-sm font-semibold text-red-600">
            {error}
          </div>
        )}

        {/* Toolbar */}
        <div className="flex items-center justify-between gap-4 flex-wrap">
          <div className="flex items-center gap-3 flex-1 flex-wrap">
            <div className="flex items-center gap-2 px-3 py-2 bg-white border border-border rounded-[12px] w-56 focus-within:ring-2 focus-within:ring-[#0AB600]/30 transition-all">
              <Search size={15} className="text-muted-foreground shrink-0" />
              <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Cari judul, supervisor..." className="bg-transparent outline-none text-sm w-full placeholder:text-muted-foreground" />
            </div>
            <select value={filterStatus} onChange={e => setFilterStatus(e.target.value)} className="h-9 px-3 bg-white border border-border rounded-[10px] text-sm font-bold focus:outline-none cursor-pointer">
              {["Semua", "Aktif", "Selesai", "Ditangguhkan"].map(o => <option key={o}>{o}</option>)}
            </select>
            <div className="flex bg-white border border-border rounded-[10px] overflow-hidden">
              {([["grid", <LayoutGrid size={14} />], ["table", <List size={14} />], ["ringkasan", <Users size={14} />]] as [string, React.ReactNode][]).map(([v, icon]) => (
                <button key={v} onClick={() => setView(v as "grid" | "table" | "ringkasan")} className={`h-9 w-9 flex items-center justify-center transition-colors ${view === v ? "bg-[#0AB600] text-white" : "text-muted-foreground hover:bg-slate-50"}`}>{icon}</button>
              ))}
            </div>
          </div>

          {view !== "ringkasan" && (
            <button
              onClick={() => { setModalOpen(true); setStep(0); setStudentMemberSearch(""); }}
              className="flex items-center gap-2 h-9 px-4 bg-[#0AB600] hover:bg-[#099800] text-white text-sm font-black rounded-[10px] shadow-sm transition-colors"
            >
              <Plus size={15} strokeWidth={3} /> Tambah Riset
            </button>
          )}
          {view === "ringkasan" && (
            <div className="flex gap-2">
              <button className="flex items-center gap-2 h-9 px-4 bg-white border border-border text-foreground text-sm font-black rounded-[10px] shadow-sm transition-colors hover:bg-slate-50">
                <Download size={14} /> Export
              </button>
            </div>
          )}
        </div>

        {/* ─── MAIN CONTENT ─── */}
        <div className="flex gap-5 items-start">
          <div className="flex-1 min-w-0">
            {view === "ringkasan" ? (
              <div className="space-y-5">
                <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
                  <div className="bg-white border border-border rounded-[14px] p-4 flex items-center gap-4 shadow-sm">
                    <div className="w-12 h-12 shrink-0 rounded-full bg-emerald-50 text-emerald-500 flex items-center justify-center"><FlaskConical size={24} /></div>
                    <div>
                      <p className="text-xs font-black text-muted-foreground">Total Riset</p>
                      <p className="text-2xl font-black text-foreground">{totalRiset}</p>
                      <p className="text-[10px] font-bold text-muted-foreground mt-0.5">Proyek aktif</p>
                    </div>
                  </div>
                  <div className="bg-white border border-border rounded-[14px] p-4 flex items-center gap-4 shadow-sm">
                    <div className="w-12 h-12 shrink-0 rounded-full bg-blue-50 text-blue-500 flex items-center justify-center"><Users size={24} /></div>
                    <div>
                      <p className="text-xs font-black text-muted-foreground">Total Mahasiswa</p>
                      <p className="text-2xl font-black text-foreground">{totalMahasiswa}</p>
                      <p className="text-[10px] font-bold text-muted-foreground mt-0.5">Mahasiswa terlibat</p>
                    </div>
                  </div>
                  <div className="bg-white border border-border rounded-[14px] p-4 flex items-center gap-4 shadow-sm">
                    <div className="w-12 h-12 shrink-0 rounded-full bg-amber-50 text-amber-500 flex items-center justify-center"><GraduationCap size={24} /></div>
                    <div>
                      <p className="text-xs font-black text-muted-foreground">Mahasiswa Magang</p>
                      <p className="text-2xl font-black text-foreground">{mahasiswaMagang}</p>
                      <p className="text-[10px] font-bold text-muted-foreground mt-0.5">{totalMahasiswa ? Math.round(mahasiswaMagang/totalMahasiswa*100) : 0}% dari total</p>
                    </div>
                  </div>
                  <div className="bg-white border border-border rounded-[14px] p-4 flex items-center gap-4 shadow-sm">
                    <div className="w-12 h-12 shrink-0 rounded-full bg-purple-50 text-purple-500 flex items-center justify-center"><GraduationCap size={24} /></div>
                    <div>
                      <p className="text-xs font-black text-muted-foreground">Mahasiswa Riset</p>
                      <p className="text-2xl font-black text-foreground">{mahasiswaRisetCount}</p>
                      <p className="text-[10px] font-bold text-muted-foreground mt-0.5">{totalMahasiswa ? Math.round(mahasiswaRisetCount/totalMahasiswa*100) : 0}% dari total</p>
                    </div>
                  </div>
                  <div className="bg-white border border-border rounded-[14px] p-4 flex items-center gap-4 shadow-sm">
                    <div className="w-12 h-12 shrink-0 rounded-full bg-cyan-50 text-cyan-500 flex items-center justify-center"><Network size={24} /></div>
                    <div>
                      <p className="text-xs font-black text-muted-foreground">Total Keterlibatan</p>
                      <p className="text-2xl font-black text-foreground">{totalKeterlibatan}</p>
                      <p className="text-[10px] font-bold text-muted-foreground mt-0.5">Semua peran riset</p>
                    </div>
                  </div>
                </div>

                <div className="flex flex-wrap items-center gap-3">
                  <select value={filterRingkasanRiset} onChange={e => setFilterRingkasanRiset(e.target.value)} className="h-10 px-3 bg-white border border-border rounded-[10px] text-sm font-bold focus:outline-none cursor-pointer text-muted-foreground">
                    <option value="Semua Riset">Semua Riset</option>
                    {research.map(r => <option key={r.id} value={r.id}>{r.short_title || r.title}</option>)}
                  </select>
                  <select value={filterRingkasanTipe} onChange={e => setFilterRingkasanTipe(e.target.value)} className="h-10 px-3 bg-white border border-border rounded-[10px] text-sm font-bold focus:outline-none cursor-pointer text-muted-foreground">
                    {["Semua Tipe Mahasiswa", "Magang", "Riset"].map(o => <option key={o}>{o}</option>)}
                  </select>
                  <select value={filterRingkasanPeran} onChange={e => setFilterRingkasanPeran(e.target.value)} className="h-10 px-3 bg-white border border-border rounded-[10px] text-sm font-bold focus:outline-none cursor-pointer text-muted-foreground">
                    {["Semua Peran", "Proyek Utama", "Proyek Tambahan"].map(o => <option key={o}>{o}</option>)}
                  </select>
                  
                  <button onClick={() => {
                    setFilterRingkasanRiset("Semua Riset");
                    setFilterRingkasanTipe("Semua Tipe Mahasiswa");
                    setFilterRingkasanPeran("Semua Peran");
                    setSearch("");
                  }} className="h-10 px-4 ml-auto bg-white border border-emerald-200 text-emerald-600 hover:bg-emerald-50 text-sm font-black rounded-[10px] shadow-sm transition-colors">
                    Reset Filter
                  </button>
                </div>

                <div className="flex gap-5">
                  <div className="w-[200px] shrink-0 space-y-4">
                    <div className="bg-white border border-border rounded-[14px] p-4 shadow-sm">
                      <p className="text-xs font-black text-foreground mb-4 flex items-center gap-2"><BookOpen size={14} className="text-blue-500" /> Keterangan Peran</p>
                      
                      <div className="space-y-4">
                        <div className="flex gap-2">
                          <div className="w-2 h-2 rounded-full bg-emerald-500 mt-1 shrink-0" />
                          <div>
                            <p className="text-[11px] font-black text-foreground">Magang - Utama</p>
                            <p className="text-[10px] font-medium text-muted-foreground leading-tight mt-0.5">Mahasiswa magang pada proyek utamanya</p>
                          </div>
                        </div>
                        <div className="flex gap-2">
                          <div className="w-2 h-2 rounded-full bg-amber-500 mt-1 shrink-0" />
                          <div>
                            <p className="text-[11px] font-black text-foreground">Magang - Tambahan</p>
                            <p className="text-[10px] font-medium text-muted-foreground leading-tight mt-0.5">Mahasiswa magang pada proyek riset (tambahan)</p>
                          </div>
                        </div>
                        <div className="flex gap-2">
                          <div className="w-2 h-2 rounded-full bg-blue-500 mt-1 shrink-0" />
                          <div>
                            <p className="text-[11px] font-black text-foreground">Riset - Utama</p>
                            <p className="text-[10px] font-medium text-muted-foreground leading-tight mt-0.5">Mahasiswa riset pada proyek utamanya</p>
                          </div>
                        </div>
                        <div className="flex gap-2">
                          <div className="w-2 h-2 rounded-full bg-purple-500 mt-1 shrink-0" />
                          <div>
                            <p className="text-[11px] font-black text-foreground">Riset - Tambahan</p>
                            <p className="text-[10px] font-medium text-muted-foreground leading-tight mt-0.5">Mahasiswa riset pada proyek riset (tambahan)</p>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>

                  <div className="flex-1 bg-white border border-border rounded-[14px] shadow-sm overflow-hidden">
                    <div className="p-5 border-b border-border flex items-center gap-2">
                      <Users size={16} className="text-muted-foreground" />
                      <h3 className="font-black text-foreground text-sm">Daftar Mahasiswa per Riset</h3>
                    </div>
                    <div className="overflow-x-auto">
                      <div className="min-w-[1080px]">
                        {/* Table Header */}
                        <div className="px-4 py-3 bg-slate-50/80 border-b border-border">
                          <div className="flex border border-transparent">
                            <div className="w-[220px] shrink-0 px-4 border-r border-transparent text-[11px] font-black text-muted-foreground uppercase tracking-wide">Riset / Proyek</div>
                            <div className="w-[180px] shrink-0 px-4 border-r border-transparent text-[11px] font-black text-muted-foreground uppercase tracking-wide">Ketua / PIC</div>
                            <div className="flex-1 flex px-4 items-center min-w-0">
                              <div className="flex-1 min-w-[180px] text-[11px] font-black text-muted-foreground uppercase tracking-wide">Mahasiswa</div>
                              <div className="w-[130px] shrink-0 text-[11px] font-black text-muted-foreground uppercase tracking-wide">Tipe Mahasiswa</div>
                              <div className="w-[110px] shrink-0 text-[11px] font-black text-muted-foreground uppercase tracking-wide">Status</div>
                              <div className="w-[160px] shrink-0 text-[11px] font-black text-muted-foreground uppercase tracking-wide">Peran dalam Riset</div>
                              <div className="w-[120px] shrink-0 text-[11px] font-black text-muted-foreground uppercase tracking-wide">Tgl Bergabung</div>
                            </div>
                          </div>
                        </div>

                        {/* Table Body / Groups */}
                        <div className="flex flex-col gap-4 p-4 bg-slate-50/30">
                          {Object.values(ringkasanGrouped).map((group: any) => (
                            <div key={group.projectId} className="flex bg-white border border-border rounded-[14px] shadow-sm overflow-hidden transition-all hover:shadow-md hover:border-emerald-200">
                              <div className="w-[220px] shrink-0 p-4 border-r border-border/40 bg-slate-50/30 flex flex-col justify-start">
                                <p className="font-black text-emerald-700 text-[13px] leading-snug mb-2">{group.projectName}</p>
                                <div className="mt-auto pt-2 flex flex-col gap-2">
                                  <span className={`text-[9px] font-black px-2 py-0.5 rounded-full border self-start ${statusColor(group.projectStatus)}`}>{group.projectStatus}</span>
                                  
                                  <button
                                    onClick={(e) => { e.stopPropagation(); openProgressBoard(group.projectId); }}
                                    className="w-full py-1.5 px-2 flex items-center justify-center gap-1.5 text-[10px] font-black text-emerald-600 bg-emerald-100 hover:bg-emerald-200 hover:text-emerald-700 rounded-[8px] transition-colors border border-emerald-200 mt-1 whitespace-nowrap"
                                  >
                                    <Kanban size={12} className="shrink-0" />
                                    <span>Lihat Board</span>
                                  </button>
                                </div>
                              </div>
                              <div className="w-[180px] shrink-0 p-4 border-r border-border/40 bg-slate-50/30 flex flex-col justify-start">
                                <p className="font-medium text-foreground text-[11px] leading-tight">{group.picName}</p>
                              </div>
                              <div className="flex-1 flex flex-col min-w-0">
                                {group.members.map((member: any, i: number) => {
                                  const isMagangUtama = member.tipe === "Magang" && member.peranDalamRiset === "Proyek Utama";
                                  const isMagangTambahan = member.tipe === "Magang" && member.peranDalamRiset === "Proyek Tambahan";
                                  const isRisetTambahan = member.tipe === "Riset" && member.peranDalamRiset === "Proyek Tambahan";
                                  const roleColor = isMagangUtama ? "bg-emerald-50 text-emerald-700 border-emerald-200" :
                                                    isMagangTambahan ? "bg-amber-50 text-amber-700 border-amber-200" :
                                                    isRisetTambahan ? "bg-purple-50 text-purple-700 border-purple-200" :
                                                    "bg-blue-50 text-blue-700 border-blue-200";
                                  const dotColor = isMagangUtama ? "bg-emerald-500" :
                                                   isMagangTambahan ? "bg-amber-500" :
                                                   isRisetTambahan ? "bg-purple-500" :
                                                   "bg-blue-500";
                                  const tipeColor = member.tipe === "Magang" ? "text-emerald-600" : "text-blue-600";
                                  const isLastInGroup = i === group.members.length - 1;

                                  return (
                                    <div key={member.id} className={`flex items-center px-4 py-3 hover:bg-slate-50/70 transition-colors ${!isLastInGroup ? 'border-b border-border/40' : ''}`}>
                                      <div className="flex-1 min-w-[180px]">
                                        <div className="flex items-center gap-2">
                                          <div className="w-6 h-6 rounded-full flex items-center justify-center text-[9px] font-black bg-slate-100 text-slate-600 shrink-0">
                                            {member.initials || member.name?.charAt(0)}
                                          </div>
                                          <button
                                            onClick={(e) => {
                                              e.stopPropagation();
                                              setSelectedStudentId(member.studentId || member.id);
                                              setIsStudentModalOpen(true);
                                            }}
                                            className="font-bold text-emerald-700 hover:text-emerald-800 hover:underline text-xs truncate max-w-[220px] text-left cursor-pointer focus:outline-none focus:ring-1 focus:ring-emerald-500 rounded px-1 -ml-1 transition-colors"
                                          >
                                            {member.name}
                                          </button>
                                        </div>
                                      </div>
                                      <div className="w-[130px] shrink-0">
                                        <span className={`text-[10px] font-black ${tipeColor}`}>{member.tipe === "Riset" ? "Mahasiswa Riset" : "Magang"}</span>
                                      </div>
                                      <div className="w-[110px] shrink-0">
                                        <span className={`text-[9px] font-black px-2 py-0.5 rounded-full border ${
                                          !member.status || member.status === 'Aktif' ? 'bg-emerald-100 text-emerald-700 border-emerald-200' : 
                                          member.status === 'Cuti' ? 'bg-amber-100 text-amber-700 border-amber-200' :
                                          member.status === 'Alumni' || member.status === 'Lulus' ? 'bg-slate-100 text-slate-600 border-slate-200' : 
                                          'bg-red-100 text-red-600 border-red-200'
                                        }`}>
                                          {member.status || "Aktif"}
                                        </span>
                                      </div>
                                      <div className="w-[160px] shrink-0">
                                        <div className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-[8px] border ${roleColor}`}>
                                          <div className={`w-1.5 h-1.5 rounded-full ${dotColor}`} />
                                          <span className="text-[9px] font-black leading-none">{member.peranDalamRiset}</span>
                                        </div>
                                      </div>
                                      <div className="w-[120px] shrink-0">
                                        <span className="text-xs text-muted-foreground font-medium">
                                          {formatDisplayDate(member.bergabung)}
                                        </span>
                                      </div>
                                    </div>
                                  );
                                })}
                              </div>
                            </div>
                          ))}
                          
                          {Object.keys(ringkasanGrouped).length === 0 && (
                            <div className="py-12 text-center bg-white border border-border rounded-[14px] shadow-sm">
                              <p className="text-muted-foreground text-sm font-medium">Tidak ada data ditemukan</p>
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            ) : view === "grid" ? (
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                {filteredRiset.map(r => {
                  const projectMembers = members[r.id] || [];
                  const dosen = projectMembers.filter((m: any) => m.member_type === "Dosen");
                  return (
                    <div key={r.id} onClick={() => { setSelected(selected?.id === r.id ? null : r); setDetailTab("info"); }}
                      className={`bg-white border rounded-[14px] shadow-sm overflow-hidden hover:shadow-md transition-all cursor-pointer ${selected?.id === r.id ? "border-[#0AB600]" : "border-border"}`}>
                      <div className="h-20 bg-gradient-to-br from-[#0AB600] to-[#065e00] relative overflow-hidden p-4 flex items-end">
                        <div className="absolute inset-0 opacity-10" style={{ backgroundImage: "radial-gradient(circle at 80% 20%, white 1px, transparent 1px)", backgroundSize: "14px 14px" }} />
                        <div className="relative z-10 flex items-center gap-2">
                          <span className={`text-[10px] font-black px-2 py-0.5 rounded-full border ${statusColor(r.status)} bg-white`}>{r.status}</span>
                        </div>
                      </div>
                      <div className="p-4">
                        <h3 className="font-black text-foreground text-sm leading-snug mb-1 line-clamp-2">{r.title}</h3>
                        {/* Dosen list */}
                        <div className="flex flex-wrap gap-1 mb-2">
                          {dosen.map((d: any) => (
                            <span key={d.user_id} className={`text-[10px] font-black px-2 py-0.5 rounded ${d.peran === "Ketua Riset" || d.peran === "Pembimbing" ? "bg-[#E6FFE6] text-[#0AB600]" : "bg-slate-100 text-slate-600"}`}>
                              {d.initials || d.name?.charAt(0)?.toUpperCase()} {d.peran === "Ketua Riset" || d.peran === "Pembimbing" ? "(Ketua)" : "(Anggota)"}
                            </span>
                          ))}
                        </div>
                        <p className="text-xs text-muted-foreground mb-1.5">{r.category} · {r.period_text}</p>
                        <div className="mb-3 flex flex-wrap gap-1">
                          <span className="rounded bg-slate-100 px-2 py-0.5 text-[10px] font-black text-slate-600">{getResearchField(r, "researchType", "research_type") || "Jenis riset -"}</span>
                          <span className="rounded bg-green-50 px-2 py-0.5 text-[10px] font-black text-[#0AB600]">{getResearchField(r, "agreementType", "agreement_type") || "Dokumen -"}</span>
                        </div>
                        <div className="flex items-center justify-between mb-3">
                          <div className="flex -space-x-2">
                            {projectMembers.slice(0, 4).map((m: any) => <div key={m.user_id} className="w-7 h-7 rounded-full border-2 border-white flex items-center justify-center text-[10px] font-black bg-indigo-600 text-white">{m.initials || m.name?.charAt(0)?.toUpperCase()}</div>)}
                            {projectMembers.length > 4 && <div className="w-7 h-7 rounded-full border-2 border-white bg-slate-100 flex items-center justify-center text-[10px] font-black text-slate-500">+{projectMembers.length - 4}</div>}
                          </div>
                          <div className="flex items-center gap-2">
                            <div className="w-16 h-1.5 bg-slate-100 rounded-full"><div className="bg-[#0AB600] h-1.5 rounded-full" style={{ width: `${r.progress}%` }} /></div>
                            <span className="text-[10px] font-black text-[#0AB600]">{r.progress}%</span>
                          </div>
                        </div>
                        {/* Progress Board Button */}
                        <button
                          onClick={(e) => { e.stopPropagation(); openProgressBoard(r.id); }}
                          className="w-full h-8 flex items-center justify-center gap-2 text-[11px] font-black text-white bg-[#0AB600] hover:bg-[#099800] rounded-[8px] transition-colors"
                        >
                          <Kanban size={13} /> Lihat Progress Board
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="bg-white border border-border rounded-[14px] shadow-sm overflow-hidden">
                <table className="w-full text-sm text-left">
                  <thead><tr className="bg-slate-50 border-b border-border">
                    {["Judul Riset", "Jenis", "Dokumen", "Dosen", "Anggota", "Progress", "Status", ""].map(h => <th key={h} className="px-5 py-3 text-xs font-black text-muted-foreground uppercase tracking-wide">{h}</th>)}
                  </tr></thead>
                  <tbody className="divide-y divide-border">
                    {filteredRiset.map(r => {
                      const mems = members[r.id] || [];
                      const dosen = mems.filter((m: any) => m.member_type === "Dosen");
                      return (
                        <tr key={r.id} onClick={() => { setSelected(selected?.id === r.id ? null : r); setDetailTab("info"); }} className={`cursor-pointer hover:bg-slate-50 transition-colors ${selected?.id === r.id ? "bg-green-50/30" : ""}`}>
                          <td className="px-5 py-3.5 max-w-[220px]">
                            <p className="line-clamp-1 font-black text-foreground">{r.title}</p>
                          </td>
                          <td className="px-5 py-3.5 text-xs font-bold text-muted-foreground">{getResearchField(r, "researchType", "research_type") || "-"}</td>
                          <td className="px-5 py-3.5 text-xs">
                            <p className="font-black text-foreground">{getResearchField(r, "agreementType", "agreement_type") || "-"}</p>
                            <p className="text-[10px] font-semibold text-muted-foreground">{formatDateRange(getResearchField(r, "agreementStartDate", "agreement_start_date"), getResearchField(r, "agreementEndDate", "agreement_end_date"))}</p>
                          </td>
                          <td className="px-5 py-3.5 text-xs">
                            <div className="flex flex-col gap-0.5">
                              {dosen.map((d: any) => <span key={d.user_id} className={`text-[10px] font-black ${d.peran === "Ketua Riset" || d.peran === "Pembimbing" ? "text-[#0AB600]" : "text-muted-foreground"}`}>{d.name} {d.peran === "Ketua Riset" || d.peran === "Pembimbing" ? "☆" : ""}</span>)}
                            </div>
                          </td>
                          <td className="px-5 py-3.5 text-muted-foreground text-xs">{mems.length} org</td>
                          <td className="px-5 py-3.5"><div className="flex items-center gap-2"><div className="w-20 h-1.5 bg-slate-100 rounded-full"><div className="bg-[#0AB600] h-1.5 rounded-full" style={{ width: `${r.progress}%` }} /></div><span className="text-[10px] font-black text-[#0AB600]">{r.progress}%</span></div></td>
                          <td className="px-5 py-3.5"><span className={`text-[10px] font-black px-2 py-0.5 rounded-full border ${statusColor(r.status)}`}>{r.status}</span></td>
                          <td className="px-5 py-3.5"><button onClick={(e) => { e.stopPropagation(); openProgressBoard(r.id); }} className="w-7 h-7 rounded-[8px] flex items-center justify-center text-muted-foreground hover:bg-green-50 hover:text-[#0AB600] transition-colors"><Kanban size={13} /></button></td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {/* Detail Panel – Riset */}
          {selected && (
            <div className="w-[330px] shrink-0 bg-white border border-border rounded-[14px] shadow-sm overflow-hidden max-h-[75vh] overflow-y-auto">
              <div className="h-16 bg-gradient-to-br from-[#0AB600] to-[#065e00] relative">
                <div className="absolute inset-0 opacity-10" style={{ backgroundImage: "radial-gradient(circle at 80% 20%, white 1px, transparent 1px)", backgroundSize: "12px 12px" }} />
                <div className="absolute bottom-0 left-0 right-0 px-4 pb-0 flex gap-1">
                  {(["info", "anggota", "akses"] as const).map(t => (
                    <button key={t} onClick={() => setDetailTab(t)} className={`px-3 py-2 text-[11px] font-black transition-colors rounded-t-[8px] ${detailTab === t ? "bg-white text-foreground" : "text-white/70 hover:text-white"}`}>
                      {t === "info" ? "Info" : t === "anggota" ? "Tim" : "Board Access"}
                    </button>
                  ))}
                </div>
                <button onClick={() => setSelected(null)} className="absolute top-3 right-3 w-7 h-7 rounded-full bg-white/20 flex items-center justify-center text-white hover:bg-white/30 transition-colors"><X size={14} /></button>
              </div>
              <div className="p-5">
                {detailTab === "info" && (
                  <div className="flex flex-col gap-3">
                    <div className="flex items-center justify-between">
                      <span className={`text-[10px] font-black px-2 py-0.5 rounded-full border ${statusColor(selected.status)}`}>{selected.status}</span>
                      <div className="flex gap-1">
                        <button onClick={() => openEditResearch(selected)} className="flex items-center gap-1 text-[10px] font-black text-[#0AB600] hover:bg-green-50 px-2 py-1 rounded-[8px] transition-colors"><Pencil size={11} /> Edit</button>
                        <button
                          onClick={() => handleDeleteResearch(selected.id, selected.title)}
                          className="flex items-center gap-1 text-[10px] font-black text-red-500 hover:bg-red-50 px-2 py-1 rounded-[8px] transition-colors"
                        >
                          <Trash2 size={11} /> Hapus
                        </button>
                      </div>
                    </div>
                    <h3 className="font-black text-foreground leading-snug">{selected.title}</h3>
                    <p className="text-xs text-foreground">{selected.description}</p>
                    {[["Supervisor Ketua", selected.supervisor_name], ["Periode", selected.period_text], ["Mitra", selected.mitra], ["Pendanaan", selected.funding], ["Kategori", selected.category]].map(([l, v]) => (
                      <div key={l} className="flex gap-2 text-xs"><span className="font-black text-muted-foreground w-24 shrink-0">{l}</span><span className="font-bold text-foreground">{v}</span></div>
                    ))}
                    <div className="border-t border-border pt-3 mt-1 flex flex-col gap-2">
                      {[
                        ["Jenis Riset", getResearchField(selected, "researchType", "research_type") || "-"],
                        ["Jenis Dokumen", getResearchField(selected, "agreementType", "agreement_type") || "-"],
                        [
                          "Periode Dok.",
                          formatDateRange(
                            getResearchField(selected, "agreementStartDate", "agreement_start_date"),
                            getResearchField(selected, "agreementEndDate", "agreement_end_date")
                          )
                        ]
                      ].map(([l, v]) => (
                        <div key={l} className="flex gap-2 text-xs"><span className="font-black text-muted-foreground w-24 shrink-0">{l}</span><span className="font-bold text-foreground">{v}</span></div>
                      ))}
                      <ResearchFileLink label="File PKS" url={getResearchField(selected, "agreementFileUrl", "agreement_file_url")} />
                      <ResearchFileLink label="Proposal" url={getResearchField(selected, "proposalFileUrl", "proposal_file_url")} />
                      <ResearchFileLink label="RAB" url={getResearchField(selected, "rabFileUrl", "rab_file_url")} />
                    </div>
                    <button
                      onClick={() => openProgressBoard(selected.id)}
                      className="w-full h-8 flex items-center justify-center gap-2 text-[11px] font-black text-white bg-[#0AB600] hover:bg-[#099800] rounded-[8px] transition-colors mt-2"
                    >
                      <Kanban size={13} /> Akses Progress Board
                    </button>
                  </div>
                )}

                {detailTab === "anggota" && (
                  <div>
                    {/* Dosen Section */}
                    <div className="mb-4">
                      <div className="flex items-center justify-between mb-2">
                        <p className="text-[10px] font-black text-muted-foreground uppercase tracking-wide flex items-center gap-1"><BookOpen size={10} /> Dosen Tim ({dosenInRiset.length})</p>
                        <button onClick={() => setAddMemberModal(true)} className="text-[10px] font-black text-[#0AB600] hover:bg-green-50 px-2 py-0.5 rounded-[8px] transition-colors flex items-center gap-0.5"><Plus size={9} strokeWidth={3} /> Tambah</button>
                      </div>
                      {dosenInRiset.map((m: any) => (
                        <div key={m.user_id} className="flex items-center gap-2 py-2 border-b border-border">
                          <div className="w-8 h-8 rounded-full flex items-center justify-center text-[10px] font-black shrink-0 bg-indigo-600 text-white">{m.initials || m.name?.charAt(0)?.toUpperCase()}</div>
                          <div className="flex-1 min-w-0">
                            <p className="text-xs font-black text-foreground truncate">{m.name}</p>
                            <select value={m.peran || "Anggota Dosen"} onChange={(e) => handleUpdateMemberPeran(selected.id, m.user_id, e.target.value, m.member_type)} className="text-[9px] font-black text-muted-foreground bg-transparent border-none outline-none cursor-pointer">
                              {PERAN_DOSEN.map(p => <option key={p}>{p}</option>)}
                            </select>
                          </div>
                          <button onClick={() => handleRemoveMember(selected.id, m.user_id)} className="w-6 h-6 rounded-full flex items-center justify-center text-muted-foreground hover:bg-red-50 hover:text-red-500 transition-colors"><Trash2 size={11} /></button>
                        </div>
                      ))}
                    </div>
                    {/* Mahasiswa Section */}
                    <div>
                      <p className="text-[10px] font-black text-muted-foreground uppercase tracking-wide mb-2 flex items-center gap-1"><Users size={10} /> Mahasiswa ({mahasiswaInRiset.length})</p>
                      {mahasiswaInRiset.map((m: any) => (
                        <div key={m.user_id} className="flex items-center gap-2 py-2 border-b border-border last:border-0">
                          <div className="w-8 h-8 rounded-full flex items-center justify-center text-[10px] font-black shrink-0 bg-blue-600 text-white">{m.initials || m.name?.charAt(0)?.toUpperCase()}</div>
                          <div className="flex-1 min-w-0">
                            <p className="text-xs font-black text-foreground truncate">
                              {m.name}
                              {m.status && m.status !== "Aktif" && (
                                <span className="ml-1.5 text-[9px] font-bold text-red-500 bg-red-50 px-1.5 py-0.5 rounded-full">{m.status}</span>
                              )}
                            </p>
                            <select value={m.peran || "Anggota Inti"} onChange={(e) => handleUpdateMemberPeran(selected.id, m.user_id, e.target.value, m.member_type)} className="text-[9px] font-black text-muted-foreground bg-transparent border-none outline-none cursor-pointer">
                              {[m.peran, ...getResearchRoleOptions("Mahasiswa")].filter((p, i, arr) => p && arr.indexOf(p) === i).map(p => <option key={p}>{p}</option>)}
                            </select>
                          </div>
                          <button onClick={() => handleRemoveMember(selected.id, m.user_id)} className="w-6 h-6 rounded-full flex items-center justify-center text-muted-foreground hover:bg-red-50 hover:text-red-500 transition-colors"><Trash2 size={11} /></button>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {detailTab === "akses" && (
                  <div>
                    <div className="mb-4 p-3 bg-green-50 border border-green-200 rounded-[10px] text-xs text-green-700">
                      <p className="font-black mb-0.5">Board Access Control</p>
                      <p>Admin & Dosen Ketua selalu punya akses edit. Pilih mahasiswa yang juga mendapat akses edit board.</p>
                    </div>
                    <p className="text-[10px] font-black text-muted-foreground uppercase tracking-wide mb-2">Akses Permanen</p>
                    {[{ label: "Semua Admin", sub: "Full access", initials: "OP", color: "bg-amber-500 text-white" }, { label: selected.supervisor_name, sub: "Ketua Riset", initials: selected.supervisor_name?.split(" ").map((part: string) => part[0]).join("").slice(0, 2).toUpperCase() || "DS", color: "bg-[#0AB600] text-white" }].map(item => (
                      <div key={item.label} className="flex items-center gap-2 py-2">
                        <div className={`w-7 h-7 rounded-full flex items-center justify-center text-[9px] font-black shrink-0 ${item.color}`}>{item.initials}</div>
                        <div className="flex-1"><p className="text-xs font-black text-foreground">{item.label}</p><p className="text-[10px] text-muted-foreground">{item.sub}</p></div>
                        <Shield size={12} className="text-emerald-500" />
                      </div>
                    ))}
                    <div className="flex items-center justify-between mt-4 mb-2">
                      <p className="text-[10px] font-black text-muted-foreground uppercase tracking-wide">Mahasiswa Edit Access</p>
                      {nonAccessMembers.length > 0 && <button onClick={() => setAddMemberModal(true)} className="text-[10px] font-black text-[#0AB600] hover:bg-green-50 px-2 py-0.5 rounded-[8px] transition-colors flex items-center gap-0.5"><Plus size={9} strokeWidth={3} /> Beri</button>}
                    </div>
                    {boardManagerMembers.length === 0 ? <p className="text-xs text-muted-foreground italic py-2">Belum ada mahasiswa dengan akses edit.</p>
                      : boardManagerMembers.map((m: any) => {
                        return (
                          <div key={m.user_id} className="flex items-center gap-2 py-2 bg-green-50 border border-green-100 rounded-[10px] px-3 mb-1.5">
                            <div className="w-7 h-7 rounded-full flex items-center justify-center text-[9px] font-black shrink-0 bg-blue-600 text-white">{m.initials || m.name?.charAt(0)?.toUpperCase()}</div>
                            <div className="flex-1"><p className="text-xs font-black text-foreground">{m.name}</p></div>
                            {m.peran === MAHASISWA_LEADER_ROLE
                              ? <span className="text-[9px] font-black text-emerald-700">Leader</span>
                              : <button onClick={() => revokeAccess(selected.id, m.user_id)} className="w-6 h-6 rounded-full flex items-center justify-center hover:bg-red-100 hover:text-red-500 text-muted-foreground transition-colors"><X size={10} /></button>}
                          </div>
                        );
                      })}
                    {nonAccessMembers.map((m: any) => (
                      <div key={m.user_id} className="flex items-center gap-2 py-2">
                        <div className="w-7 h-7 rounded-full flex items-center justify-center text-[9px] font-black shrink-0 bg-slate-400 text-white">{m.initials || m.name?.charAt(0)?.toUpperCase()}</div>
                        <div className="flex-1"><p className="text-xs font-black text-foreground">{m.name}</p><p className="text-[9px] text-muted-foreground">Tambah Kartu & Kerjakan Tugas</p></div>
                        <button onClick={() => grantAccess(selected.id, m.user_id)} className="w-6 h-6 rounded-full bg-green-100 hover:bg-[#0AB600] text-[#0AB600] hover:text-white flex items-center justify-center transition-all"><Plus size={10} strokeWidth={3} /></button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </div>

      {editingResearch && (
        <div className="fixed inset-0 z-[210] flex items-center justify-center bg-black/40 backdrop-blur-sm p-4" onClick={() => setEditingResearch(null)}>
          <div className="bg-white rounded-[20px] shadow-2xl w-full max-w-[560px] max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
            <div className="px-6 py-5 border-b border-border flex items-center justify-between">
              <div>
                <h3 className="font-black text-foreground">Edit Riset</h3>
                <p className="text-xs text-muted-foreground mt-0.5">Memperbarui informasi dasar proyek riset.</p>
              </div>
              <button onClick={() => setEditingResearch(null)} className="w-8 h-8 rounded-full flex items-center justify-center hover:bg-slate-100 text-muted-foreground"><X size={16} /></button>
            </div>
            <div className="p-6 grid grid-cols-2 gap-4">
              <div className="col-span-2">
                <label className="text-xs font-black text-foreground block mb-1.5">Judul Riset</label>
                <input value={editForm.title} onChange={(e) => setEditForm(prev => ({ ...prev, title: e.target.value }))} className="w-full h-10 px-3 rounded-[10px] border border-border text-sm focus:outline-none focus:ring-2 focus:ring-green-300 transition-all" />
              </div>
              <div>
                <label className="text-xs font-black text-foreground block mb-1.5">Short Title</label>
                <input value={editForm.shortTitle} onChange={(e) => setEditForm(prev => ({ ...prev, shortTitle: e.target.value }))} className="w-full h-10 px-3 rounded-[10px] border border-border text-sm focus:outline-none focus:ring-2 focus:ring-green-300 transition-all" />
              </div>
              <div>
                <label className="text-xs font-black text-foreground block mb-1.5">Status</label>
                <select value={editForm.status} onChange={(e) => setEditForm(prev => ({ ...prev, status: e.target.value }))} className="w-full h-10 px-3 rounded-[10px] border border-border text-sm focus:outline-none cursor-pointer">
                  {["Aktif", "Selesai", "Ditangguhkan"].map((status) => <option key={status}>{status}</option>)}
                </select>
              </div>
              <div>
                <label className="text-xs font-black text-foreground block mb-1.5">Jenis Riset</label>
                <select value={editForm.researchType} onChange={(e) => setEditForm(prev => ({ ...prev, researchType: e.target.value }))} className="w-full h-10 px-3 rounded-[10px] border border-border text-sm focus:outline-none cursor-pointer">
                  {RESEARCH_TYPE_OPTIONS.map((type) => <option key={type}>{type}</option>)}
                </select>
              </div>
              <div className="col-span-2">
                <label className="text-xs font-black text-foreground block mb-1.5">Deskripsi</label>
                <textarea value={editForm.description} onChange={(e) => setEditForm(prev => ({ ...prev, description: e.target.value }))} rows={3} className="w-full px-3 py-2 rounded-[10px] border border-border text-sm focus:outline-none focus:ring-2 focus:ring-green-300 transition-all resize-none" />
              </div>
              <div>
                <label className="text-xs font-black text-foreground block mb-1.5">Kategori</label>
                <input value={editForm.category} onChange={(e) => setEditForm(prev => ({ ...prev, category: e.target.value }))} className="w-full h-10 px-3 rounded-[10px] border border-border text-sm focus:outline-none focus:ring-2 focus:ring-green-300 transition-all" />
              </div>
              <div>
                <label className="text-xs font-black text-foreground block mb-1.5">Supervisor</label>
                <select value={editForm.supervisorId} onChange={(e) => setEditForm(prev => ({ ...prev, supervisorId: e.target.value }))} className="w-full h-10 px-3 rounded-[10px] border border-border text-sm focus:outline-none cursor-pointer">
                  <option value="">-- Pilih Dosen --</option>
                  {lecturers.map((lecturer) => <option key={lecturer.id} value={lecturer.id}>{lecturer.name}</option>)}
                </select>
              </div>
              <div>
                <label className="text-xs font-black text-foreground block mb-1.5">Periode</label>
                <input value={editForm.periodText} onChange={(e) => setEditForm(prev => ({ ...prev, periodText: e.target.value }))} placeholder="01 Jan 2026 - 31 Des 2026" className="w-full h-10 px-3 rounded-[10px] border border-border text-sm focus:outline-none focus:ring-2 focus:ring-green-300 transition-all" />
              </div>
              <div>
                <label className="text-xs font-black text-foreground block mb-1.5">Mitra</label>
                <input value={editForm.mitra} onChange={(e) => setEditForm(prev => ({ ...prev, mitra: e.target.value }))} className="w-full h-10 px-3 rounded-[10px] border border-border text-sm focus:outline-none focus:ring-2 focus:ring-green-300 transition-all" />
              </div>
              <div>
                <label className="text-xs font-black text-foreground block mb-1.5">Pendanaan</label>
                <input value={editForm.funding} onChange={(e) => setEditForm(prev => ({ ...prev, funding: e.target.value }))} className="w-full h-10 px-3 rounded-[10px] border border-border text-sm focus:outline-none focus:ring-2 focus:ring-green-300 transition-all" />
              </div>
              <div className="col-span-2 border-t border-border pt-4">
                <p className="text-[10px] font-black text-muted-foreground uppercase tracking-wide">Dokumen PKS/MoU/MoA</p>
              </div>
              <div>
                <label className="text-xs font-black text-foreground block mb-1.5">Jenis Dokumen</label>
                <select value={editForm.agreementType} onChange={(e) => setEditForm(prev => ({ ...prev, agreementType: e.target.value }))} className="w-full h-10 px-3 rounded-[10px] border border-border text-sm focus:outline-none cursor-pointer">
                  {AGREEMENT_TYPE_OPTIONS.map((type) => <option key={type}>{type}</option>)}
                </select>
              </div>
              <div>
                <label className="text-xs font-black text-foreground block mb-1.5">Link File PKS/MoU/MoA</label>
                <input type="url" value={editForm.agreementFileUrl} onChange={(e) => setEditForm(prev => ({ ...prev, agreementFileUrl: e.target.value }))} placeholder="https://link-file-pks-mou-moa" className="w-full h-10 px-3 rounded-[10px] border border-border text-sm focus:outline-none focus:ring-2 focus:ring-green-300 transition-all" />
              </div>
              <div>
                <label className="text-xs font-black text-foreground block mb-1.5">Tanggal Mulai Dokumen</label>
                <input type="date" value={editForm.agreementStartDate} onChange={(e) => setEditForm(prev => ({ ...prev, agreementStartDate: e.target.value }))} className="w-full h-10 px-3 rounded-[10px] border border-border text-sm focus:outline-none focus:ring-2 focus:ring-green-300 transition-all" />
              </div>
              <div>
                <label className="text-xs font-black text-foreground block mb-1.5">Tanggal Selesai Dokumen</label>
                <input type="date" value={editForm.agreementEndDate} onChange={(e) => setEditForm(prev => ({ ...prev, agreementEndDate: e.target.value }))} className="w-full h-10 px-3 rounded-[10px] border border-border text-sm focus:outline-none focus:ring-2 focus:ring-green-300 transition-all" />
              </div>
              <div>
                <label className="text-xs font-black text-foreground block mb-1.5">Link Proposal</label>
                <input type="url" value={editForm.proposalFileUrl} onChange={(e) => setEditForm(prev => ({ ...prev, proposalFileUrl: e.target.value }))} placeholder="https://link-file-proposal" className="w-full h-10 px-3 rounded-[10px] border border-border text-sm focus:outline-none focus:ring-2 focus:ring-green-300 transition-all" />
              </div>
              <div>
                <label className="text-xs font-black text-foreground block mb-1.5">Link RAB</label>
                <input type="url" value={editForm.rabFileUrl} onChange={(e) => setEditForm(prev => ({ ...prev, rabFileUrl: e.target.value }))} placeholder="https://link-file-rab" className="w-full h-10 px-3 rounded-[10px] border border-border text-sm focus:outline-none focus:ring-2 focus:ring-green-300 transition-all" />
              </div>
              <div className="col-span-2">
                <div className="flex items-center justify-between mb-2">
                  <label className="text-xs font-black text-foreground">Progress</label>
                  <span className="text-sm font-black text-[#0AB600]">{editForm.progress}%</span>
                </div>
                <input type="range" min={0} max={100} step={5} value={editForm.progress} onChange={(e) => setEditForm(prev => ({ ...prev, progress: Number(e.target.value) || 0 }))} className="w-full accent-[#0AB600] cursor-pointer" />
              </div>
            </div>
            <div className="px-6 pb-6 flex gap-3">
              <button onClick={() => setEditingResearch(null)} className="flex-1 h-10 border border-border rounded-[10px] text-sm font-bold text-muted-foreground hover:bg-slate-50 transition-colors">Batal</button>
              <button onClick={handleSaveEditedResearch} disabled={savingEdit} className="flex-1 h-10 bg-[#0AB600] hover:bg-[#099800] text-white text-sm font-black rounded-[10px] transition-colors disabled:bg-green-400">
                {savingEdit ? "Menyimpan..." : "Simpan Perubahan"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Add Member Modal */}
      {addMemberModal && selected && (
        <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/40 backdrop-blur-sm p-4" onClick={() => setAddMemberModal(false)}>
          <div className="bg-white rounded-[20px] shadow-2xl w-full max-w-[480px]" onClick={e => e.stopPropagation()}>
            <div className="px-6 py-5 border-b border-border flex items-center justify-between">
              <h3 className="font-black text-foreground">Tambah Anggota</h3>
              <button onClick={() => setAddMemberModal(false)} className="w-8 h-8 rounded-full flex items-center justify-center hover:bg-slate-100 text-muted-foreground"><X size={16} /></button>
            </div>
            <div className="p-6">
              <div className="flex flex-col gap-2 max-h-[250px] overflow-y-auto">
                {allAddable.slice(0, 12).map((p: any) => (
                  <label key={p.user_id} className="flex items-center gap-3 p-3 rounded-[10px] border border-border hover:bg-slate-50 cursor-pointer transition-colors">
                    <input type="checkbox" checked={selectedNewMembers.includes(p.user_id)} onChange={() => toggleNewMember(p.user_id)} className="accent-[#0AB600] shrink-0" />
                    <div className="w-8 h-8 rounded-full flex items-center justify-center text-xs font-black shrink-0 bg-indigo-600 text-white">{p.initials || p.name?.charAt(0)?.toUpperCase()}</div>
                    <div className="flex-1"><p className="text-sm font-black text-foreground">{p.name}</p><span className={`text-[10px] font-black px-1.5 py-0.5 rounded ${p.member_type === "Dosen" ? "bg-amber-50 text-amber-700" : "bg-blue-50 text-blue-700"}`}>{p.member_type}</span></div>
                  </label>
                ))}
              </div>
              <div className="mt-4">
                <label className="text-xs font-black text-foreground block mb-1.5">Peran</label>
                <select value={selectedPeran} onChange={e => setSelectedPeran(e.target.value)} className="w-full h-10 px-3 rounded-[10px] border border-border text-sm focus:outline-none cursor-pointer">{addMemberRoleOptions.map(p => <option key={p}>{p}</option>)}</select>
                {selectedNewMemberTypes.includes("Dosen") && selectedNewMemberTypes.includes("Mahasiswa") && (
                  <p className="mt-1 text-[10px] font-semibold text-amber-600">Pilih mahasiswa saja untuk memakai peran Mahasiswa Ketua Riset.</p>
                )}
              </div>
            </div>
            <div className="px-6 pb-6 flex gap-3">
              <button onClick={() => setAddMemberModal(false)} className="flex-1 h-10 border border-border rounded-[10px] text-sm font-bold text-muted-foreground hover:bg-slate-50">Batal</button>
              <button disabled={savingMembers || selectedNewMembers.length === 0} onClick={handleAddMembers} className="flex-1 h-10 bg-[#0AB600] hover:bg-[#099800] disabled:bg-[#8ad98a] text-white text-sm font-black rounded-[10px]">{savingMembers ? "Menyimpan..." : "Tambahkan"}</button>
            </div>
          </div>
        </div>
      )}

      {/* Add Riset Modal */}
      {modalOpen && (
        <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/40 backdrop-blur-sm p-4" onClick={() => setModalOpen(false)}>
          <div className="bg-white rounded-[20px] shadow-2xl w-full max-w-[560px] max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
            <div className="px-6 py-5 border-b border-border flex items-center justify-between">
              <div>
                <h3 className="font-black text-foreground">Tambah Riset Baru</h3>
                <p className="text-xs text-muted-foreground mt-0.5">Langkah {step + 1} dari {STEP_LABELS.length}: {STEP_LABELS[step]}</p>
              </div>
              <button onClick={() => setModalOpen(false)} className="w-8 h-8 rounded-full flex items-center justify-center hover:bg-slate-100 text-muted-foreground"><X size={16} /></button>
            </div>
            <div className="px-6 pt-4 flex items-center gap-2">
              {STEP_LABELS.map((l, i) => (
                <div key={i} className="contents">
                  <div onClick={() => i < step && setStep(i)} className={`flex items-center justify-center w-7 h-7 rounded-full text-xs font-black transition-all cursor-pointer ${i === step ? "bg-amber-500 text-white" : i < step ? "bg-emerald-100 text-emerald-700" : "bg-slate-100 text-slate-400"}`}>{i + 1}</div>
                  {i < STEP_LABELS.length - 1 && <div className={`flex-1 h-0.5 ${i < step ? "bg-emerald-300" : "bg-slate-100"}`} />}
                </div>
              ))}
            </div>
            <div className="p-6 grid grid-cols-2 gap-4">
              {step === 0 && <>
                <div className="col-span-2"><label className="text-xs font-black text-foreground block mb-1.5">Judul Riset</label><input value={formData.title} onChange={(e) => setFormData(prev => ({ ...prev, title: e.target.value }))} placeholder="Judul lengkap penelitian" className="w-full h-10 px-3 rounded-[10px] border border-border text-sm focus:outline-none focus:ring-2 focus:ring-green-300 transition-all" /></div>
                <div className="col-span-2"><label className="text-xs font-black text-foreground block mb-1.5">Deskripsi</label><textarea value={formData.description} onChange={(e) => setFormData(prev => ({ ...prev, description: e.target.value }))} rows={3} placeholder="Ringkasan penelitian..." className="w-full px-3 py-2 rounded-[10px] border border-border text-sm focus:outline-none focus:ring-2 focus:ring-green-300 transition-all resize-none" /></div>
                <div><label className="text-xs font-black text-foreground block mb-1.5">Kategori</label><input value={formData.category} onChange={(e) => setFormData(prev => ({ ...prev, category: e.target.value }))} placeholder="IoT, AI, Blockchain..." className="w-full h-10 px-3 rounded-[10px] border border-border text-sm focus:outline-none focus:ring-2 focus:ring-green-300 transition-all" /></div>
                <div><label className="text-xs font-black text-foreground block mb-1.5">Status</label><select value={formData.status} onChange={(e) => setFormData(prev => ({ ...prev, status: e.target.value }))} className="w-full h-10 px-3 rounded-[10px] border border-border text-sm focus:outline-none cursor-pointer"><option>Aktif</option><option>Ditangguhkan</option></select></div>
                <div><label className="text-xs font-black text-foreground block mb-1.5">Jenis Riset</label><select value={formData.researchType} onChange={(e) => setFormData(prev => ({ ...prev, researchType: e.target.value }))} className="w-full h-10 px-3 rounded-[10px] border border-border text-sm focus:outline-none cursor-pointer">{RESEARCH_TYPE_OPTIONS.map((type) => <option key={type}>{type}</option>)}</select></div>
              </>}
              {step === 1 && <>
                <div className="col-span-2"><label className="text-xs font-black text-foreground block mb-1.5">Ketua Dosen</label><select value={formData.supervisorId} onChange={(e) => setFormData(prev => ({ ...prev, supervisorId: e.target.value }))} className="w-full h-10 px-3 rounded-[10px] border border-border text-sm focus:outline-none cursor-pointer"><option value="">-- Pilih Dosen --</option>{lecturers.map(l => <option key={l.id} value={l.id}>{l.name}</option>)}</select></div>
                <div className="col-span-2">
                  <div className="mb-1.5 flex items-center justify-between gap-3">
                    <label className="text-xs font-black text-foreground">Anggota Mahasiswa</label>
                    <span className="text-[11px] font-bold text-muted-foreground">{formData.studentIds.length} dipilih</span>
                  </div>
                  <div className="mb-2 flex h-10 items-center gap-2 rounded-[10px] border border-border bg-white px-3 focus-within:ring-2 focus-within:ring-green-300">
                    <Search size={15} className="shrink-0 text-muted-foreground" />
                    <input
                      value={studentMemberSearch}
                      onChange={(e) => setStudentMemberSearch(e.target.value)}
                      placeholder="Cari nama, NIM, atau prodi mahasiswa..."
                      className="w-full bg-transparent text-sm outline-none placeholder:text-muted-foreground"
                    />
                  </div>
                  <div className="max-h-[220px] overflow-y-auto rounded-[12px] border border-border bg-slate-50/40 p-2">
                    <div className="flex flex-col gap-1.5">
                      {filteredStudentMembers.map(s => (
                        <label key={s.id} className="flex cursor-pointer items-center gap-2 rounded-[10px] bg-white px-3 py-2 text-sm font-medium text-foreground transition-colors hover:bg-green-50">
                          <input
                            type="checkbox"
                            checked={formData.studentIds.includes(s.id)}
                            onChange={(e) => {
                              if (e.target.checked) {
                                setFormData(prev => ({ ...prev, studentIds: [...prev.studentIds, s.id] }));
                              } else {
                                setFormData(prev => ({ ...prev, studentIds: prev.studentIds.filter(id => id !== s.id) }));
                              }
                            }}
                            className="accent-[#0AB600]"
                          />
                          <span className="min-w-0 flex-1 truncate">{s.name}</span>
                          {(s.nim || s.prodi) && (
                            <span className="shrink-0 max-w-[180px] truncate text-[10px] font-bold text-muted-foreground">
                              {[s.nim, s.prodi].filter(Boolean).join(" · ")}
                            </span>
                          )}
                        </label>
                      ))}
                      {filteredStudentMembers.length === 0 && (
                        <div className="px-3 py-6 text-center text-xs font-semibold text-muted-foreground">
                          Mahasiswa tidak ditemukan.
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              </>}
              {step === 2 && <>
                <div><label className="text-xs font-black text-foreground block mb-1.5">Tanggal Mulai</label><input type="date" value={formData.startDate} onChange={(e) => setFormData(prev => ({ ...prev, startDate: e.target.value }))} className="w-full h-10 px-3 rounded-[10px] border border-border text-sm focus:outline-none focus:ring-2 focus:ring-green-300 transition-all" /></div>
                <div><label className="text-xs font-black text-foreground block mb-1.5">Tanggal Selesai</label><input type="date" value={formData.endDate} onChange={(e) => setFormData(prev => ({ ...prev, endDate: e.target.value }))} className="w-full h-10 px-3 rounded-[10px] border border-border text-sm focus:outline-none focus:ring-2 focus:ring-green-300 transition-all" /></div>
                <div className="col-span-2"><label className="text-xs font-black text-foreground block mb-1.5">Mitra</label><input value={formData.mitra} onChange={(e) => setFormData(prev => ({ ...prev, mitra: e.target.value }))} placeholder="Nama institusi mitra" className="w-full h-10 px-3 rounded-[10px] border border-border text-sm focus:outline-none focus:ring-2 focus:ring-green-300 transition-all" /></div>
                <div className="col-span-2"><label className="text-xs font-black text-foreground block mb-1.5">Sumber Pendanaan</label><input value={formData.funding} onChange={(e) => setFormData(prev => ({ ...prev, funding: e.target.value }))} placeholder="DIKTI, Industri, dll." className="w-full h-10 px-3 rounded-[10px] border border-border text-sm focus:outline-none focus:ring-2 focus:ring-green-300 transition-all" /></div>
                <div className="col-span-2 border-t border-border pt-4">
                  <p className="text-[10px] font-black text-muted-foreground uppercase tracking-wide">Dokumen PKS/MoU/MoA</p>
                </div>
                <div><label className="text-xs font-black text-foreground block mb-1.5">Jenis Dokumen</label><select value={formData.agreementType} onChange={(e) => setFormData(prev => ({ ...prev, agreementType: e.target.value }))} className="w-full h-10 px-3 rounded-[10px] border border-border text-sm focus:outline-none cursor-pointer">{AGREEMENT_TYPE_OPTIONS.map((type) => <option key={type}>{type}</option>)}</select></div>
                <div><label className="text-xs font-black text-foreground block mb-1.5">Link File PKS/MoU/MoA</label><input type="url" value={formData.agreementFileUrl} onChange={(e) => setFormData(prev => ({ ...prev, agreementFileUrl: e.target.value }))} placeholder="https://link-file-pks-mou-moa" className="w-full h-10 px-3 rounded-[10px] border border-border text-sm focus:outline-none focus:ring-2 focus:ring-green-300 transition-all" /></div>
                <div><label className="text-xs font-black text-foreground block mb-1.5">Tanggal Mulai Dokumen</label><input type="date" value={formData.agreementStartDate} onChange={(e) => setFormData(prev => ({ ...prev, agreementStartDate: e.target.value }))} className="w-full h-10 px-3 rounded-[10px] border border-border text-sm focus:outline-none focus:ring-2 focus:ring-green-300 transition-all" /></div>
                <div><label className="text-xs font-black text-foreground block mb-1.5">Tanggal Selesai Dokumen</label><input type="date" value={formData.agreementEndDate} onChange={(e) => setFormData(prev => ({ ...prev, agreementEndDate: e.target.value }))} className="w-full h-10 px-3 rounded-[10px] border border-border text-sm focus:outline-none focus:ring-2 focus:ring-green-300 transition-all" /></div>
                <div><label className="text-xs font-black text-foreground block mb-1.5">Link Proposal</label><input type="url" value={formData.proposalFileUrl} onChange={(e) => setFormData(prev => ({ ...prev, proposalFileUrl: e.target.value }))} placeholder="https://link-file-proposal" className="w-full h-10 px-3 rounded-[10px] border border-border text-sm focus:outline-none focus:ring-2 focus:ring-green-300 transition-all" /></div>
                <div><label className="text-xs font-black text-foreground block mb-1.5">Link RAB</label><input type="url" value={formData.rabFileUrl} onChange={(e) => setFormData(prev => ({ ...prev, rabFileUrl: e.target.value }))} placeholder="https://link-file-rab" className="w-full h-10 px-3 rounded-[10px] border border-border text-sm focus:outline-none focus:ring-2 focus:ring-green-300 transition-all" /></div>
              </>}
              {step === 3 && <>
                <div className="col-span-2"><label className="text-xs font-black text-foreground block mb-1.5">Milestone</label>
                  <div className="flex flex-col gap-2">
                    {formData.milestones.map((m, i) => (
                      <div key={i} className="flex items-center gap-2"><div className="flex-1 h-9 px-3 rounded-[10px] border border-border text-sm flex items-center text-foreground">{m}</div><button onClick={() => setFormData(prev => ({ ...prev, milestones: prev.milestones.filter((_, idx) => idx !== i) }))} className="w-8 h-8 rounded-[8px] flex items-center justify-center text-red-400 hover:bg-red-50 transition-colors"><X size={13} /></button></div>
                    ))}
                    <button onClick={() => setFormData(prev => ({ ...prev, milestones: [...prev.milestones, `Milestone ${prev.milestones.length + 1}`] }))} className="h-9 border-2 border-dashed border-green-200 rounded-[10px] text-xs font-bold text-green-600 hover:bg-green-50 transition-colors">+ Tambah Milestone</button>
                  </div>
                </div>
              </>}
            </div>
            <div className="px-6 pb-6 flex gap-3">
              <button onClick={() => step > 0 ? setStep(s => s - 1) : setModalOpen(false)} className="flex-1 h-10 border border-border rounded-[10px] text-sm font-bold text-muted-foreground hover:bg-slate-50 transition-colors">{step > 0 ? "← Kembali" : "Batal"}</button>
              <button onClick={() => step < STEP_LABELS.length - 1 ? setStep(s => s + 1) : handleCreateResearch()} disabled={savingRiset} className="flex-1 h-10 bg-[#0AB600] hover:bg-[#099800] text-white text-sm font-black rounded-[10px] transition-colors disabled:bg-green-400">
                {savingRiset ? "Menyimpan..." : step < STEP_LABELS.length - 1 ? "Lanjut →" : "Simpan Riset"}
              </button>
            </div>
          </div>
        </div>
      )}
      {confirmDialog}
      <StudentModal
        isOpen={isStudentModalOpen}
        mode="edit"
        studentId={selectedStudentId || undefined}
        onClose={() => setIsStudentModalOpen(false)}
        onSaveSuccess={() => {
          setIsStudentModalOpen(false);
          loadData();
        }}
        risetOptions={research.map(r => ({ id: r.id, short: r.short_title || r.title, full: r.title }))}
      />
    </OperatorLayout>
  );
}
