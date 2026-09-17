import React, { useState, useEffect } from "react";
import { OperatorLayout } from "../../templates/OperatorLayout";
import { apiGet, apiPost } from "../../../lib/api";
import { CheckCircle, XCircle, Search, FileText } from "lucide-react";

export default function ReaktivasiAlumni() {
  const [requests, setRequests] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");
  const [isProcessing, setIsProcessing] = useState(false);

  useEffect(() => {
    fetchRequests();
  }, []);

  const fetchRequests = async () => {
    setLoading(true);
    try {
      const data = await apiGet<any[]>("/reactivations");
      setRequests(data);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const handleApprove = async (id: string) => {
    if (!window.confirm("Setujui pengajuan ini? Mahasiswa akan kembali berstatus Aktif.")) return;
    setIsProcessing(true);
    try {
      await apiPost(`/reactivations/${id}/approve`, {});
      alert("Pengajuan disetujui");
      fetchRequests();
    } catch (err: any) {
      alert(err.message || "Gagal menyetujui");
    } finally {
      setIsProcessing(false);
    }
  };

  const handleReject = async (id: string) => {
    const note = window.prompt("Alasan penolakan:");
    if (note === null) return;
    setIsProcessing(true);
    try {
      await apiPost(`/reactivations/${id}/reject`, { note });
      alert("Pengajuan ditolak");
      fetchRequests();
    } catch (err: any) {
      alert(err.message || "Gagal menolak");
    } finally {
      setIsProcessing(false);
    }
  };

  const filtered = requests.filter(r => 
    r.studentName?.toLowerCase().includes(searchTerm.toLowerCase()) || 
    r.nim?.toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <OperatorLayout title="Reaktivasi Alumni">
      <div className="flex flex-col gap-4">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <h1 className="text-xl md:text-2xl font-black text-foreground">Pengajuan Reaktivasi Alumni</h1>
            <p className="text-sm text-muted-foreground mt-1">Daftar alumni yang mengajukan untuk kembali aktif riset.</p>
          </div>
        </div>

        <div className="bg-white border border-border rounded-[14px] shadow-sm overflow-hidden">
          <div className="p-4 border-b border-border flex flex-col md:flex-row gap-4 items-center justify-between bg-slate-50/50">
            <div className="relative w-full md:w-80">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground w-4 h-4" />
              <input 
                type="text" 
                placeholder="Cari nama atau NIM..." 
                className="w-full pl-9 pr-4 py-2 text-sm border border-border rounded-[10px] focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none transition-all"
                value={searchTerm}
                onChange={e => setSearchTerm(e.target.value)}
              />
            </div>
            <button onClick={fetchRequests} className="text-sm font-bold text-primary px-4 py-2 border border-primary/20 bg-primary/5 rounded-[10px] hover:bg-primary/10 transition-colors">
              Refresh
            </button>
          </div>

          <div className="overflow-x-auto">
            {loading ? (
              <div className="p-8 text-center text-sm text-muted-foreground">Memuat data...</div>
            ) : filtered.length === 0 ? (
              <div className="p-12 text-center text-muted-foreground flex flex-col items-center gap-3">
                <FileText size={48} className="text-slate-200" />
                <p className="text-sm">Tidak ada pengajuan ditemukan.</p>
              </div>
            ) : (
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-slate-50 border-b border-border text-left text-xs font-black text-muted-foreground uppercase tracking-wider">
                    <th className="px-5 py-3 whitespace-nowrap">Tanggal</th>
                    <th className="px-5 py-3 whitespace-nowrap">Mahasiswa</th>
                    <th className="px-5 py-3 whitespace-nowrap">Status</th>
                    <th className="px-5 py-3 text-right whitespace-nowrap">Aksi</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {filtered.map(r => (
                    <tr key={r.id} className="hover:bg-slate-50/50 transition-colors">
                      <td className="px-5 py-3 whitespace-nowrap font-medium">{new Date(r.createdAt).toLocaleDateString('id-ID')}</td>
                      <td className="px-5 py-3">
                        <div className="font-bold text-foreground">{r.studentName}</div>
                        <div className="text-xs text-muted-foreground">{r.nim}</div>
                      </td>
                      <td className="px-5 py-3 whitespace-nowrap">
                        <span className={`px-2.5 py-1 text-[10px] font-black rounded-md ${
                          r.status === "Menunggu" ? "bg-amber-100 text-amber-700" :
                          r.status === "Disetujui" ? "bg-emerald-100 text-emerald-700" :
                          "bg-red-100 text-red-700"
                        }`}>
                          {r.status}
                        </span>
                        {r.note && <p className="text-[10px] text-muted-foreground mt-1 max-w-[150px] truncate" title={r.note}>{r.note}</p>}
                      </td>
                      <td className="px-5 py-3 text-right whitespace-nowrap">
                        {r.status === "Menunggu" && (
                          <div className="flex items-center justify-end gap-2">
                            <button 
                              onClick={() => handleApprove(r.id)} 
                              disabled={isProcessing}
                              className="w-8 h-8 rounded-lg bg-emerald-50 text-emerald-600 border border-emerald-200 flex items-center justify-center hover:bg-emerald-600 hover:text-white transition-all disabled:opacity-50"
                              title="Setujui"
                            >
                              <CheckCircle size={16} />
                            </button>
                            <button 
                              onClick={() => handleReject(r.id)} 
                              disabled={isProcessing}
                              className="w-8 h-8 rounded-lg bg-red-50 text-red-600 border border-red-200 flex items-center justify-center hover:bg-red-600 hover:text-white transition-all disabled:opacity-50"
                              title="Tolak"
                            >
                              <XCircle size={16} />
                            </button>
                          </div>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>
      </div>
    </OperatorLayout>
  );
}
