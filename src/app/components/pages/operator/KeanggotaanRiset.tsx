import React, { useState } from "react";
import { OperatorLayout } from "../../templates/OperatorLayout";
import { Search, Plus, X, Trash2, Pencil, Users, CheckCheck } from "lucide-react";
import { apiDelete, apiGet, apiPatch, apiPost } from "../../../lib/api";
import { getResearchRoleOptions, MAHASISWA_LEADER_ROLE, normalizeResearchRoleForMemberType } from "../../../lib/researchRoles";

const PERAN_COLOR: Record<string, string> = {
  "Ketua": "bg-[#F8F5FF] text-[#6C47FF] border border-[#D6CAFF]",
  [MAHASISWA_LEADER_ROLE]: "bg-emerald-50 text-emerald-700 border border-emerald-200",
  "Anggota Inti": "bg-[#F8F5FF] text-[#6C47FF] border border-[#D6CAFF]",
  "Backend Dev": "bg-blue-50 text-blue-700 border border-blue-200",
  "Frontend Dev": "bg-emerald-50 text-emerald-700 border border-emerald-200",
  "Hardware Dev": "bg-amber-50 text-amber-700 border border-amber-200",
  "Data Analyst": "bg-teal-50 text-teal-700 border border-teal-200",
  "Fullstack Dev": "bg-blue-50 text-blue-700 border border-blue-200",
  "Pembimbing": "bg-slate-100 text-slate-600 border border-slate-200",
  "Asisten Peneliti": "bg-indigo-50 text-indigo-700 border border-indigo-200",
};

export default function KeanggotaanRiset() {
  const [researchList, setResearchList] = useState<Array<any>>([]);
  const [membersMap, setMembersMap] = useState<Record<string, any[]>>({});
  const [joinRequestsMap, setJoinRequestsMap] = useState<Record<string, any[]>>({});
  const [selectedRiset, setSelectedRiset] = useState("");
  const [allStudents, setAllStudents] = useState<Array<any>>([]);
  const [allLecturers, setAllLecturers] = useState<Array<any>>([]);
  const [search, setSearch] = useState("");
  const [addModal, setAddModal] = useState(false);
  const [selectedPersonIds, setSelectedPersonIds] = useState<string[]>([]);
  const [newMemberRole, setNewMemberRole] = useState("Anggota");
  const [addPersonSearch, setAddPersonSearch] = useState("");
  const [isSubmittingAdd, setIsSubmittingAdd] = useState(false);
  const [editMember, setEditMember] = useState<string | null>(null);
  const [editRole, setEditRole] = useState("");
  const [error, setError] = useState("");

  React.useEffect(() => {
    const loadAll = async () => {
      try {
        const [research, students, lecturers] = await Promise.all([
          apiGet<Array<any>>("/research"),
          apiGet<Array<any>>("/students"),
          apiGet<Array<any>>("/lecturers")
        ]);

        setResearchList(research || []);
        setAllStudents(students || []);
        setAllLecturers(lecturers || []);
        if ((research || []).length > 0) {
          setSelectedRiset(research[0].id);
        }
      } catch (err: any) {
        setError(err?.message || "Gagal memuat data keanggotaan");
      }
    };

    loadAll();
  }, []);

  React.useEffect(() => {
    const loadMembers = async () => {
      if (!selectedRiset) return;
      try {
        const [members, requests] = await Promise.all([
          apiGet<Array<any>>(`/research/${selectedRiset}/members`),
          apiGet<Array<any>>(`/research/${selectedRiset}/join-requests`).catch(() => [])
        ]);

        setMembersMap((prev) => ({
          ...prev,
          [selectedRiset]: (members || []).map((member) => ({
            memberId: member.user_id,
            nama: member.name,
            initials: member.initials,
            photoUrl: member.photo_url || member.photoUrl || null,
            color: member.member_type === "Dosen" ? "bg-blue-500 text-white" : "bg-[#8B6FFF] text-white",
            tipe: member.member_type,
            peran: member.peran || "Anggota",
            bergabung: member.bergabung || "-",
            status: member.status || "Aktif"
          }))
        }));

        setJoinRequestsMap((prev) => ({
          ...prev,
          [selectedRiset]: requests || []
        }));
      } catch (err: any) {
        setError(err?.message || "Gagal memuat anggota riset");
      }
    };

    loadMembers();
  }, [selectedRiset]);

  const riset = researchList.find(r => r.id === selectedRiset);
  const requests = joinRequestsMap[selectedRiset] || [];
  const members = (membersMap[selectedRiset] || []).filter(m => {
    const q = search.toLowerCase();
    return !q || m.nama.toLowerCase().includes(q);
  });

  const allPeople = [
    ...allStudents.map((m, index) => ({ id: m.user_id || m.id, nama: m.name, initials: m.initials || m.name?.slice(0, 2)?.toUpperCase(), photoUrl: m.photo_url || m.photoUrl || null, color: ["bg-[#8B6FFF] text-white", "bg-emerald-500 text-white", "bg-pink-500 text-white"][index % 3], tipe: "Mahasiswa" as const })),
    ...allLecturers.map((d, index) => ({ id: d.user_id || d.id, nama: d.name, initials: d.initials || d.name?.slice(0, 2)?.toUpperCase(), photoUrl: d.photo_url || d.photoUrl || null, color: ["bg-blue-500 text-white", "bg-teal-500 text-white"][index % 2], tipe: "Dosen" as const })),
  ].filter(p => !members.some(m => m.memberId === p.id));

  const selectedEditMember = membersMap[selectedRiset]?.find((member) => member.memberId === editMember);

  const openEditMemberRole = (member: any) => {
    setEditMember(member.memberId);
    setEditRole(member.peran || getResearchRoleOptions(member.tipe)[0] || "Anggota");
  };

  const handleSaveMemberRole = async () => {
    if (!selectedRiset || !selectedEditMember) return;

    try {
      const nextRole = normalizeResearchRoleForMemberType(editRole, selectedEditMember.tipe);
      await apiPatch(`/research/${selectedRiset}/members/${selectedEditMember.memberId}`, {
        memberType: selectedEditMember.tipe,
        peran: nextRole
      });
      const members = await apiGet<Array<any>>(`/research/${selectedRiset}/members`);
      setMembersMap((prev) => ({
        ...prev,
        [selectedRiset]: (members || []).map((member) => ({
          memberId: member.user_id,
          nama: member.name,
          initials: member.initials,
          photoUrl: member.photo_url || member.photoUrl || null,
          color: member.member_type === "Dosen" ? "bg-blue-500 text-white" : "bg-[#8B6FFF] text-white",
          tipe: member.member_type,
          peran: member.peran || "Anggota",
          bergabung: member.bergabung || "-",
          status: member.status || "Aktif"
        }))
      }));
      setEditMember(null);
      setEditRole("");
    } catch (err: any) {
      setError(err?.message || "Gagal memperbarui peran anggota");
    }
  };

  const handleApproveJoinRequest = async (requestId: string) => {
    try {
      await apiPatch(`/research/${selectedRiset}/join-requests/${requestId}/approve`, {});
      // Refresh members and requests
      const [members, reqs] = await Promise.all([
        apiGet<Array<any>>(`/research/${selectedRiset}/members`),
        apiGet<Array<any>>(`/research/${selectedRiset}/join-requests`).catch(() => [])
      ]);
      setMembersMap((prev) => ({
        ...prev,
        [selectedRiset]: (members || []).map((member) => ({
          memberId: member.user_id,
          nama: member.name,
          initials: member.initials,
          photoUrl: member.photo_url || member.photoUrl || null,
          color: member.member_type === "Dosen" ? "bg-blue-500 text-white" : "bg-[#8B6FFF] text-white",
          tipe: member.member_type,
          peran: member.peran || "Anggota",
          bergabung: member.bergabung || "-",
          status: member.status || "Aktif"
        }))
      }));
      setJoinRequestsMap((prev) => ({ ...prev, [selectedRiset]: reqs || [] }));
    } catch (err: any) {
      setError(err?.message || "Gagal menyetujui permintaan");
    }
  };

  const handleRejectJoinRequest = async (requestId: string) => {
    try {
      await apiPatch(`/research/${selectedRiset}/join-requests/${requestId}/reject`, {});
      const reqs = await apiGet<Array<any>>(`/research/${selectedRiset}/join-requests`);
      setJoinRequestsMap((prev) => ({ ...prev, [selectedRiset]: reqs || [] }));
    } catch (err: any) {
      setError(err?.message || "Gagal menolak permintaan");
    }
  };

  const handleAddMembers = async () => {
    if (!selectedRiset || selectedPersonIds.length === 0) return;
    setIsSubmittingAdd(true);
    setError("");
    try {
      for (const personId of selectedPersonIds) {
        const person = allPeople.find(p => p.id === personId);
        if (!person) continue;
        await apiPost(`/research/${selectedRiset}/members`, {
          userId: person.id,
          memberType: person.tipe,
          peran: newMemberRole || "Anggota",
          status: "Aktif",
          bergabung: new Date().toISOString().slice(0, 10),
        });
      }
      const members = await apiGet<Array<any>>(`/research/${selectedRiset}/members`);
      setMembersMap((prev) => ({
        ...prev,
        [selectedRiset]: (members || []).map((member) => ({
          memberId: member.user_id,
          nama: member.name,
          initials: member.initials,
          photoUrl: member.photo_url || member.photoUrl || null,
          color: member.member_type === "Dosen" ? "bg-blue-500 text-white" : "bg-[#8B6FFF] text-white",
          tipe: member.member_type,
          peran: member.peran || "Anggota",
          bergabung: member.bergabung || "-",
          status: member.status || "Aktif"
        }))
      }));
      setAddModal(false);
      setSelectedPersonIds([]);
      setAddPersonSearch("");
    } catch (err: any) {
      setError(err?.message || "Gagal menambahkan anggota");
    } finally {
      setIsSubmittingAdd(false);
    }
  };

  const handleDeleteMember = async (memberId: string, memberName: string) => {
    if (!selectedRiset) return;
    if (!window.confirm(`Hapus ${memberName} dari keanggotaan riset ini?`)) return;
    try {
      await apiDelete(`/research/${selectedRiset}/members/${memberId}`);
      const members = await apiGet<Array<any>>(`/research/${selectedRiset}/members`);
      setMembersMap((prev) => ({
        ...prev,
        [selectedRiset]: (members || []).map((member) => ({
          memberId: member.user_id,
          nama: member.name,
          initials: member.initials,
          photoUrl: member.photo_url || member.photoUrl || null,
          color: member.member_type === "Dosen" ? "bg-blue-500 text-white" : "bg-[#8B6FFF] text-white",
          tipe: member.member_type,
          peran: member.peran || "Anggota",
          bergabung: member.bergabung || "-",
          status: member.status || "Aktif"
        }))
      }));
    } catch (err: any) {
      setError(err?.message || "Gagal menghapus anggota");
    }
  };

  return (
    <OperatorLayout title="Keanggotaan Riset">
      <div className="flex gap-5 h-full items-start pb-4">
        {error && (
          <div className="px-4 py-3 rounded-xl border border-red-200 bg-red-50 text-sm font-semibold text-red-600">
            {error}
          </div>
        )}

        {/* ── Left: Research List Panel ── */}
        <div className="w-[260px] shrink-0 bg-white border border-border rounded-[14px] shadow-sm overflow-hidden">
          <div className="px-4 py-4 border-b border-border">
            <h3 className="text-sm font-black text-foreground">Daftar Riset</h3>
            <p className="text-[11px] text-muted-foreground mt-0.5">{researchList.length} penelitian aktif</p>
          </div>
          <div className="divide-y divide-border">
            {researchList.map(r => {
              const count = (membersMap[r.id] || []).length;
              const isActive = selectedRiset === r.id;
              return (
                <button key={r.id} onClick={() => setSelectedRiset(r.id)} className={`w-full text-left px-4 py-4 transition-colors hover:bg-amber-50/40 ${isActive ? "bg-amber-50 border-l-[3px] border-amber-500" : "border-l-[3px] border-transparent"}`}>
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex-1 min-w-0">
                      <p className={`text-xs font-black leading-snug line-clamp-2 ${isActive ? "text-amber-700" : "text-foreground"}`}>{(r.short_title || r.title || "").split("–")[1]?.trim() || r.short_title || r.title}</p>
                      <p className="text-[10px] text-muted-foreground mt-0.5">{(r.supervisor_name || "-").split(" ").slice(0, 2).join(" ")}</p>
                    </div>
                    <span className={`shrink-0 text-[10px] font-black px-2 py-0.5 rounded-full flex items-center gap-1 ${isActive ? "bg-amber-500 text-white" : "bg-slate-100 text-slate-600"}`}>
                      <Users size={9} /> {count}
                    </span>
                  </div>
                  <div className="mt-2 h-1 bg-slate-100 rounded-full"><div className={`h-1 rounded-full ${isActive ? "bg-amber-400" : "bg-[#6C47FF]/30"}`} style={{ width: `${r.progress}%` }} /></div>
                </button>
              );
            })}
          </div>
        </div>

        {/* ── Right: Members Panel ── */}
        <div className="flex-1 flex flex-col gap-4 min-w-0">
          {/* Research header card */}
          <div className="bg-gradient-to-r from-[#6C47FF] to-[#3A1FA0] rounded-[14px] p-5 text-white relative overflow-hidden">
            <div className="absolute inset-0 opacity-[0.08]" style={{ backgroundImage: "radial-gradient(circle at 90% 50%, white 1px, transparent 1px)", backgroundSize: "16px 16px" }} />
            <div className="relative z-10 flex items-center justify-between gap-4">
              <div>
                <div className="flex items-center gap-2 mb-1">
                  <span className={`text-[10px] font-black px-2 py-0.5 rounded-full ${riset?.status === "Aktif" ? "bg-emerald-400/30 text-emerald-200" : "bg-white/20 text-white/70"}`}>{riset?.status || "-"}</span>
                  <span className="text-[10px] text-white/60">{riset?.period_text || "-"}</span>
                </div>
                <h2 className="font-black text-lg leading-snug mb-1 max-w-[500px]">{riset?.title || "-"}</h2>
                <p className="text-sm text-white/70">Supervisor: {riset?.supervisor_name || "-"}</p>
              </div>
              <div className="shrink-0 text-center">
                <div className="text-3xl font-black">{(membersMap[selectedRiset] || []).length}</div>
                <div className="text-[11px] text-white/60">anggota</div>
              </div>
            </div>
          </div>
          <div className="bg-white border border-amber-200 rounded-[14px] shadow-sm overflow-hidden mb-4 mt-4">
              <div className="px-5 py-3 border-b border-amber-200 bg-amber-50">
                <h3 className="text-sm font-black text-amber-800">Permintaan Join Kembali ({requests.length})</h3>
              </div>
              <div className="divide-y divide-amber-100">
                {requests.length === 0 ? (
                  <div className="p-5 text-center text-amber-600/70 text-xs font-semibold">
                    Tidak ada permintaan join kembali saat ini.
                  </div>
                ) : (
                  requests.map((req) => (
                    <div key={req.id} className="flex items-center justify-between p-4 bg-amber-50/30">
                      <div>
                        <p className="font-black text-sm text-foreground">{req.student_name}</p>
                        <p className="text-xs text-muted-foreground mt-0.5">NIM: {req.nim}</p>
                      </div>
                      <div className="flex gap-2">
                        <button onClick={() => handleApproveJoinRequest(req.id)} className="flex items-center gap-1.5 px-3 py-1.5 bg-emerald-500 hover:bg-emerald-600 text-white text-xs font-black rounded-lg transition-colors shadow-sm shadow-emerald-200">
                          <CheckCheck size={14} /> Terima
                        </button>
                        <button onClick={() => handleRejectJoinRequest(req.id)} className="flex items-center gap-1.5 px-3 py-1.5 bg-red-50 hover:bg-red-100 text-red-600 text-xs font-bold rounded-lg transition-colors">
                          <X size={14} /> Tolak
                        </button>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>

          {/* Members Table */}
          <div className="bg-white border border-border rounded-[14px] shadow-sm overflow-hidden">
            <div className="px-5 py-4 border-b border-border flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="flex items-center gap-2 px-3 py-2 bg-slate-50 border border-border rounded-[10px] w-52 focus-within:ring-2 focus-within:ring-amber-300 transition-all">
                  <Search size={14} className="text-muted-foreground shrink-0" />
                  <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Cari anggota..." className="bg-transparent outline-none text-sm w-full placeholder:text-muted-foreground" />
                </div>
              </div>
              <button onClick={() => setAddModal(true)} className="flex items-center gap-2 h-9 px-4 bg-amber-500 hover:bg-amber-600 text-white text-xs font-black rounded-[10px] transition-colors shadow-sm">
                <Plus size={14} strokeWidth={3} /> Tambah Anggota
              </button>
            </div>
            <table className="w-full text-sm text-left">
              <thead><tr className="bg-slate-50 border-b border-border">
                {["Anggota", "Tipe", "Peran / Role", "Tanggal Bergabung", "Status", "Aksi"].map(h => (
                  <th key={h} className="px-5 py-3 text-xs font-black text-muted-foreground uppercase tracking-wide">{h}</th>
                ))}
              </tr></thead>
              <tbody className="divide-y divide-border">
                {members.map(m => (
                  <tr key={m.memberId} className="hover:bg-slate-50 transition-colors">
                    <td className="px-5 py-3.5">
                      <div className="flex items-center gap-3">
                        {m.photoUrl ? (
                          <img src={m.photoUrl} alt={m.nama} className="w-8 h-8 rounded-full object-cover shrink-0 border border-gray-200" />
                        ) : (
                          <div className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-black shrink-0 ${m.color}`}>{m.initials}</div>
                        )}
                        <p className="font-black text-foreground text-sm">{m.nama}</p>
                      </div>
                    </td>
                    <td className="px-5 py-3.5">
                      <span className={`text-[10px] font-black px-2 py-0.5 rounded ${m.tipe === "Dosen" ? "bg-amber-50 text-amber-700" : "bg-blue-50 text-blue-700"}`}>{m.tipe}</span>
                    </td>
                    <td className="px-5 py-3.5">
                      <span className={`text-[10px] font-black px-2 py-0.5 rounded-md border ${PERAN_COLOR[m.peran] || "bg-slate-100 text-slate-600 border-slate-200"}`}>{m.peran}</span>
                    </td>
                    <td className="px-5 py-3.5 text-xs text-muted-foreground">{m.bergabung}</td>
                    <td className="px-5 py-3.5">
                      <span className={`text-[10px] font-black px-2 py-0.5 rounded-full ${m.status === "Aktif" ? "bg-emerald-100 text-emerald-700" : "bg-slate-100 text-slate-500"}`}>{m.status}</span>
                    </td>
                    <td className="px-5 py-3.5">
                      <div className="flex items-center gap-1">
                        <button onClick={() => openEditMemberRole(m)} className="w-7 h-7 rounded-[8px] flex items-center justify-center text-muted-foreground hover:bg-amber-50 hover:text-amber-600 transition-colors" title="Edit peran"><Pencil size={13} /></button>
                        <button onClick={() => handleDeleteMember(m.memberId, m.nama)} className="w-7 h-7 rounded-[8px] flex items-center justify-center text-muted-foreground hover:bg-red-50 hover:text-red-600 transition-colors" title="Hapus"><Trash2 size={13} /></button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            <div className="px-5 py-3 border-t border-border bg-slate-50/50">
              <p className="text-xs font-medium text-muted-foreground">{members.length} anggota dalam riset ini</p>
            </div>
          </div>
        </div>
      </div>

      {/* Add Member Modal */}
      {addModal && (
        <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/40 backdrop-blur-sm p-4" onClick={() => setAddModal(false)}>
          <div className="bg-white rounded-[20px] shadow-2xl w-full max-w-[480px]" onClick={e => e.stopPropagation()}>
            <div className="px-6 py-5 border-b border-border flex items-center justify-between">
              <h3 className="font-black text-foreground">Tambah Anggota Riset</h3>
              <button onClick={() => setAddModal(false)} className="w-8 h-8 rounded-full flex items-center justify-center hover:bg-slate-100 text-muted-foreground"><X size={16} /></button>
            </div>
            <div className="p-6">
              <div className="flex items-center gap-2 px-3 py-2 bg-slate-50 border border-border rounded-[10px] mb-4">
                <Search size={15} className="text-muted-foreground" />
                <input
                  value={addPersonSearch}
                  onChange={e => setAddPersonSearch(e.target.value)}
                  placeholder="Cari mahasiswa atau dosen..."
                  className="bg-transparent outline-none text-sm w-full placeholder:text-muted-foreground"
                />
              </div>
              <div className="flex flex-col gap-2 max-h-[250px] overflow-y-auto">
                {allPeople
                  .filter(p => !addPersonSearch || p.nama.toLowerCase().includes(addPersonSearch.toLowerCase()))
                  .map(p => {
                    const isChecked = selectedPersonIds.includes(p.id);
                    return (
                      <label key={p.id} className={`flex items-center gap-3 p-3 rounded-[10px] border cursor-pointer transition-colors ${isChecked ? 'bg-amber-50/60 border-amber-300' : 'border-border hover:bg-slate-50'}`}>
                        <input
                          type="checkbox"
                          checked={isChecked}
                          onChange={() => {
                            setSelectedPersonIds(prev =>
                              isChecked ? prev.filter(id => id !== p.id) : [...prev, p.id]
                            );
                          }}
                          className="accent-amber-500 shrink-0"
                        />
                        {p.photoUrl ? (
                          <img src={p.photoUrl} alt={p.nama} className="w-8 h-8 rounded-full object-cover shrink-0 border border-gray-200" />
                        ) : (
                          <div className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-black shrink-0 ${p.color}`}>{p.initials}</div>
                        )}
                        <div className="flex-1">
                          <p className="text-sm font-black text-foreground">{p.nama}</p>
                          <span className={`text-[10px] font-black px-1.5 py-0.5 rounded ${p.tipe === "Dosen" ? "bg-amber-50 text-amber-700" : "bg-blue-50 text-blue-700"}`}>{p.tipe}</span>
                        </div>
                      </label>
                    );
                  })}
                {allPeople.length === 0 && (
                  <p className="text-xs text-center text-muted-foreground py-4">Semua orang sudah tergabung dalam riset ini.</p>
                )}
              </div>
              <div className="mt-4">
                <label className="text-xs font-black text-foreground block mb-1.5">Peran</label>
                <select
                  value={newMemberRole}
                  onChange={e => setNewMemberRole(e.target.value)}
                  className="w-full h-10 px-3 rounded-[10px] border border-border text-sm focus:outline-none cursor-pointer"
                >
                  {Object.keys(PERAN_COLOR).map(p => <option key={p} value={p}>{p}</option>)}
                </select>
              </div>
            </div>
            <div className="px-6 pb-6 flex gap-3">
              <button onClick={() => { setAddModal(false); setSelectedPersonIds([]); }} className="flex-1 h-10 border border-border rounded-[10px] text-sm font-bold text-muted-foreground hover:bg-slate-50 transition-colors">Batal</button>
              <button
                onClick={handleAddMembers}
                disabled={selectedPersonIds.length === 0 || isSubmittingAdd}
                className="flex-1 h-10 bg-amber-500 hover:bg-amber-600 disabled:opacity-50 text-white text-sm font-black rounded-[10px] transition-colors shadow-sm"
              >
                {isSubmittingAdd ? "Menambahkan..." : `Tambahkan (${selectedPersonIds.length})`}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Edit Role Modal */}
      {editMember && (
        <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/40 backdrop-blur-sm p-4" onClick={() => setEditMember(null)}>
          <div className="bg-white rounded-[20px] shadow-2xl w-full max-w-[360px] p-6" onClick={e => e.stopPropagation()}>
            <h3 className="font-black text-foreground mb-4">Edit Peran Anggota</h3>
            <div>
              <label className="text-xs font-black text-foreground block mb-1.5">Peran Baru</label>
              <select value={editRole} onChange={(e) => setEditRole(e.target.value)} className="w-full h-10 px-3 rounded-[10px] border border-border text-sm focus:outline-none cursor-pointer mb-4">
                {[selectedEditMember?.peran, ...getResearchRoleOptions(selectedEditMember?.tipe)].filter((p, i, arr) => p && arr.indexOf(p) === i).map(p => <option key={p}>{p}</option>)}
              </select>
            </div>
            <div className="flex gap-3">
              <button onClick={() => setEditMember(null)} className="flex-1 h-10 border border-border rounded-[10px] text-sm font-bold text-muted-foreground hover:bg-slate-50 transition-colors">Batal</button>
              <button onClick={handleSaveMemberRole} className="flex-1 h-10 bg-amber-500 hover:bg-amber-600 text-white text-sm font-black rounded-[10px] transition-colors">Simpan</button>
            </div>
          </div>
        </div>
      )}
    </OperatorLayout>
  );
}
