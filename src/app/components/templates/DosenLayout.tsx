import React, { useState, useRef, useEffect, useMemo } from "react";
import { Link, useLocation, useNavigate } from "react-router";
import {
  LayoutDashboard,
  FlaskConical,
  BookOpen,
  Kanban,
  Layers,
  Award,
  FileText,
  UserX,
  Bell,
  Search,
  BookMarked,
  X,
  CheckCheck,
  LogOut,
  Menu,
  GitBranch,
} from "lucide-react";
import { useAuth } from "../../context/AuthContext";
import { AppNotification, useNotifications } from "../../hooks/useNotifications";

const navItems = [
  { name: "Dashboard", path: "/dosen/dashboard", icon: LayoutDashboard },
  { name: "Riset Saya", path: "/dosen/riset", icon: FlaskConical },
  { name: "Sprint Summary", path: "/dosen/scrum", icon: Layers },
  { name: "GitHub Development", path: "/dosen/github", icon: GitBranch },
  { name: "Review Logbook", path: "/dosen/logbook", icon: BookOpen },
  { name: "Review Laporan", path: "/dosen/draft", icon: FileText },
  { name: "Progress Tim", path: "/dosen/progress", icon: Kanban },
  { name: "Pengunduran Diri", path: "/dosen/pengunduran", icon: UserX },
  { name: "Pengajuan Surat", path: "/dosen/surat", icon: FileText },
  { name: "Sertifikat Mahasiswa", path: "/dosen/sertifikat", icon: Award },
  { name: "Berkas Kelulusan", path: "/dosen/kelulusan", icon: FileText },
];

const INIT_NOTIFS: AppNotification[] = [
  {
    id: "dn1",
    type: "logbook",
    title: "5 Logbook Belum Direview",
    body: "Terdapat 5 entri logbook dari mahasiswa riset Anda yang belum direview.",
    time: "10 mnt lalu",
    timeMs: Date.now() - 10 * 60 * 1000,
    read: false,
    link: "/dosen/logbook",
  },
  {
    id: "dn2",
    type: "cuti",
    title: "Pengajuan Cuti - Ilham",
    body: "Ilham Ramadhan mengajukan cuti 2 hari pada 25-26 Mar 2026.",
    time: "1 jam lalu",
    timeMs: Date.now() - 60 * 60 * 1000,
    read: false,
    link: "/dosen/dashboard",
  },
  {
    id: "dn3",
    type: "pengumuman",
    title: "Konfirmasi Pengunduran Diri",
    body: "Admin telah meneruskan pengajuan pengunduran diri Dimas Aryanto untuk keputusan akhir Anda.",
    time: "3 jam lalu",
    timeMs: Date.now() - 3 * 60 * 60 * 1000,
    read: false,
    link: "/dosen/dashboard",
  },
  {
    id: "dn4",
    type: "riset",
    title: "Milestone Diperbarui",
    body: 'Milestone "Implementasi Model" pada Riset A telah diperbarui oleh mahasiswa.',
    time: "Kemarin",
    timeMs: Date.now() - 24 * 60 * 60 * 1000,
    read: true,
    link: "/dosen/progress",
  },
];

interface LayoutProps {
  children: React.ReactNode;
  title?: string;
}

function SidebarContent({
  location,
  user,
  unread,
  onLogout,
  onClose,
}: {
  location: ReturnType<typeof useLocation>;
  user: any;
  unread: number;
  onLogout: () => void;
  onClose?: () => void;
}) {
  return (
    <>
      <div className="h-[60px] flex items-center justify-between px-6 border-b border-border shrink-0">
        <div className="font-black text-xl text-primary flex items-center gap-2">
          <div className="w-8 h-8 rounded-[10px] bg-primary flex items-center justify-center text-white">
            <BookMarked size={16} />
          </div>
          STAS-RG
        </div>
        {onClose && (
          <button onClick={onClose} className="p-2 hover:bg-muted/50 rounded-lg transition-colors lg:hidden">
            <X size={20} />
          </button>
        )}
      </div>

      <div className="px-4 pt-4 pb-2 shrink-0">
        <div className="flex items-center gap-2 px-3 py-2 bg-green-50 border border-green-200 rounded-[10px]">
          <div className="w-6 h-6 rounded-[6px] bg-primary flex items-center justify-center text-white shrink-0">
            <BookOpen size={13} />
          </div>
          <div>
            <p className="text-[11px] font-black text-green-800 uppercase tracking-wide">Dosen Ketua Riset</p>
            <p className="text-[10px] font-medium text-green-600">{user?.name || "Dr. Andi Kurniawan"}</p>
          </div>
        </div>
      </div>

      <nav className="flex-1 px-4 py-3 flex flex-col gap-0.5 overflow-y-auto">
        {navItems.map((item) => {
          const isActive = location.pathname === item.path;
          return (
            <Link
              key={item.path}
              to={item.path}
              className={`flex items-center gap-3 px-3 py-2.5 rounded-[10px] font-medium transition-colors text-sm ${
                isActive
                  ? "bg-primary text-white shadow-sm shadow-green-200"
                  : "text-muted-foreground hover:bg-green-50 hover:text-green-700"
              }`}
            >
              <item.icon size={17} />
              {item.name}
              {item.path === "/dosen/logbook" && unread > 0 && (
                <span className="ml-auto w-5 h-5 bg-red-500 text-white rounded-full text-[10px] font-black flex items-center justify-center">
                  {unread > 99 ? "99+" : unread}
                </span>
              )}
            </Link>
          );
        })}
      </nav>

      <div className="px-4 pb-4 border-t border-border pt-3 shrink-0">
        <button
          onClick={onLogout}
          className="w-full flex items-center gap-3 px-3 py-2.5 rounded-[10px] text-sm font-bold text-muted-foreground hover:bg-red-50 hover:text-red-600 transition-colors"
        >
          <LogOut size={17} /> Keluar
        </button>
      </div>
    </>
  );
}

export function DosenLayout({ children, title = "Dashboard Dosen" }: LayoutProps) {
  const location = useLocation();
  const navigate = useNavigate();
  const { user, logout } = useAuth();
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [panelOpen, setPanelOpen] = useState(false);
  const bellRef = useRef<HTMLDivElement>(null);
  const fallbackNotifs = useMemo<AppNotification[]>(() => [], []);
  const { notifs, unreadCount: unread, markRead, markAllRead, dismiss } = useNotifications({
    role: user?.role,
    fallback: fallbackNotifs,
  });

  const handleNotificationClick = (n: AppNotification) => {
    markRead(n.id);
    setPanelOpen(false);
    
    if (n.link) {
      navigate(n.link);
      return;
    }
    
    switch (n.type) {
      case "logbook": navigate("/dosen/logbook"); break;
      case "riset": navigate("/dosen/riset"); break;
      case "cuti":
      case "wfh": navigate("/dosen/cuti"); break;
      case "surat": navigate("/dosen/surat"); break;
      case "kelulusan": navigate("/dosen/kelulusan"); break;
      case "pengunduran": navigate("/dosen/resign"); break;
    }
  };

  useEffect(() => {
    const h = (e: MouseEvent) => {
      if (bellRef.current && !bellRef.current.contains(e.target as Node)) setPanelOpen(false);
    };
    if (panelOpen) document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, [panelOpen]);

  useEffect(() => {
    setPanelOpen(false);
    setIsMobileMenuOpen(false);
  }, [location.pathname]);

  const handleLogout = () => {
    logout();
    navigate("/login");
  };

  return (
    <div className="h-screen w-screen bg-slate-50 overflow-hidden flex">
      <div className="w-full flex h-screen overflow-hidden bg-slate-50 relative">
        <aside className="hidden lg:flex w-[248px] bg-white border-r border-border flex-col shrink-0 z-20">
          <SidebarContent location={location} user={user} unread={unread} onLogout={handleLogout} />
        </aside>

        {isMobileMenuOpen && (
          <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-40 lg:hidden" onClick={() => setIsMobileMenuOpen(false)} />
        )}

        <aside className={`fixed inset-y-0 left-0 w-[280px] bg-white border-r border-border flex flex-col z-50 lg:hidden transition-transform duration-300 ${isMobileMenuOpen ? "translate-x-0" : "-translate-x-full"}`}>
          <SidebarContent location={location} user={user} unread={unread} onLogout={handleLogout} onClose={() => setIsMobileMenuOpen(false)} />
        </aside>

        <div className="flex-1 flex flex-col min-w-0 z-10">
          <header className="h-[60px] bg-white border-b border-border flex items-center justify-between px-4 md:px-8 shrink-0">
            <div className="flex items-center gap-3">
              <button onClick={() => setIsMobileMenuOpen(true)} className="lg:hidden p-2 hover:bg-muted/50 rounded-lg transition-colors">
                <Menu size={22} />
              </button>
              <h1 className="font-black text-base md:text-lg text-foreground truncate">{title}</h1>
            </div>

            <div className="flex items-center gap-3 md:gap-6">
              <div className="hidden md:flex items-center gap-3 px-4 py-2 bg-slate-50 border border-border rounded-[12px] w-48 lg:w-60 focus-within:ring-2 focus-within:ring-green-300 transition-all">
                <Search size={16} className="text-muted-foreground" />
                <input type="text" placeholder="Cari mahasiswa, logbook..." className="bg-transparent border-none outline-none text-sm placeholder:text-muted-foreground w-full" />
              </div>

              <div className="flex items-center gap-3 md:gap-4">
                <div ref={bellRef} className="relative">
                  <button
                    onClick={() => setPanelOpen((v) => !v)}
                    className={`relative p-1.5 rounded-[10px] transition-colors ${panelOpen ? "bg-green-100 text-primary" : "text-muted-foreground hover:bg-slate-100"}`}
                  >
                    <Bell size={21} />
                    {unread > 0 && (
                      <span className="absolute -top-0.5 -right-0.5 min-w-[18px] h-[18px] px-1 bg-red-500 rounded-full border-2 border-white flex items-center justify-center text-[10px] font-black text-white">
                        {unread > 99 ? "99+" : unread}
                      </span>
                    )}
                  </button>

                  {panelOpen && (
                    <div className="fixed inset-x-4 top-20 md:absolute md:inset-x-auto md:top-[calc(100%+10px)] md:right-0 w-auto md:w-[360px] bg-white rounded-[16px] shadow-2xl border border-border z-[300]">
                      <div className="px-5 pt-4 pb-3 border-b border-border flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <h3 className="font-black text-sm text-foreground">Notifikasi</h3>
                          {unread > 0 && <span className="px-2 py-0.5 bg-primary text-white rounded-full text-[10px] font-black">{unread > 99 ? "99+" : unread}</span>}
                        </div>
                        <div className="flex items-center gap-1">
                          {unread > 0 && (
                            <button onClick={markAllRead} className="text-xs font-bold text-primary hover:bg-green-50 px-2 py-1 rounded-[8px] flex items-center gap-1">
                              <CheckCheck size={13} /> <span className="hidden sm:inline">Baca Semua</span>
                            </button>
                          )}
                          <button onClick={() => setPanelOpen(false)} className="w-7 h-7 rounded-full flex items-center justify-center hover:bg-slate-100 text-muted-foreground">
                            <X size={14} />
                          </button>
                        </div>
                      </div>
                      <div className="max-h-[60vh] md:max-h-[320px] overflow-y-auto divide-y divide-border/50 [&::-webkit-scrollbar]:hidden [-ms-overflow-style:none] [scrollbar-width:none]">
                        {notifs.map((n) => (
                          <div
                            key={n.id}
                            onClick={() => handleNotificationClick(n)}
                            className={`group flex gap-3 px-5 py-3.5 cursor-pointer transition-colors relative ${n.read ? "hover:bg-slate-50" : "bg-green-50/40 hover:bg-green-50"}`}
                          >
                            {!n.read && <div className="absolute left-2 top-1/2 -translate-y-1/2 w-1.5 h-1.5 rounded-full bg-primary" />}
                            
                            <div className="shrink-0 mt-0.5">
                              {n.senderPhotoUrl ? (
                                <img src={n.senderPhotoUrl} alt={n.senderName} className="w-8 h-8 rounded-full object-cover shadow-sm border border-border" />
                              ) : (
                                <div className="w-8 h-8 rounded-full flex items-center justify-center text-xs font-black bg-green-100 text-green-700 border border-green-200">
                                  {n.senderInitials}
                                </div>
                              )}
                            </div>

                            <div className="flex-1 min-w-0">
                              <p className={`text-xs leading-snug mb-0.5 ${n.read ? "font-medium text-foreground/70" : "font-black text-foreground"}`}>{n.title}</p>
                              <p className="text-[11px] text-muted-foreground line-clamp-2">
                                <span className="font-semibold text-foreground/80">{n.senderName}</span>: {n.body}
                              </p>
                              <p className={`text-[10px] font-bold mt-1 ${n.read ? "text-muted-foreground/60" : "text-primary"}`}>{n.time}</p>
                            </div>
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                dismiss(n.id);
                              }}
                              className="shrink-0 w-8 h-8 md:w-5 md:h-5 rounded-full flex items-center justify-center hover:bg-red-100 hover:text-red-500 md:opacity-0 md:group-hover:opacity-100 transition-all text-muted-foreground"
                            >
                              <X size={11} strokeWidth={3} />
                            </button>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>

                <div className="w-9 h-9 rounded-full bg-primary flex items-center justify-center text-white font-black text-sm shadow-sm ring-2 ring-white cursor-pointer">
                  {user?.initials || "AK"}
                </div>
              </div>
            </div>
          </header>

          <main className="flex-1 overflow-auto p-4 md:p-6 lg:p-8">{children}</main>
        </div>
      </div>
    </div>
  );
}
