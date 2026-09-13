import React, { useState, useRef, useEffect, useMemo } from "react";
import { Link, useLocation, useNavigate } from "react-router";
import {
  LayoutDashboard,
  Users,
  FlaskConical,
  GraduationCap,
  BookOpen,
  MapPin,
  CalendarCheck,
  ClipboardCheck,
  FileText,
  FolderOpen,
  FileCheck,
  Download,
  Settings,
  History,
  UserX,
  Bell,
  Search,
  Settings2,
  X,
  CheckCheck,
  LogOut,
  Menu,
  Kanban,
  GitBranch,
} from "lucide-react";
import { useAuth } from "../../context/AuthContext";
import { AppNotification, useNotifications } from "../../hooks/useNotifications";
import { apiGet } from "../../lib/api";
import { ProfileAvatar } from "../molecules/ProfileAvatar";
import { useSyncedStoredUser } from "../../lib/userProfileSync";

const NAV_ITEMS = [
  { name: "Dashboard", path: "/operator/dashboard", icon: LayoutDashboard },
  { name: "Database Mahasiswa", path: "/operator/mahasiswa", icon: Users },
  { name: "Pengaturan WFH Mahasiswa", path: "/operator/wfh-mahasiswa", icon: Settings2 },
  { name: "Database Kegiatan", path: "/operator/kegiatan", icon: CalendarCheck },
  { name: "Database Riset", path: "/operator/riset", icon: FlaskConical },
  { name: "Keanggotaan Riset", path: "/operator/keanggotaan", icon: Users },
  { name: "Sprint Summary", path: "/operator/scrum", icon: Kanban },
  { name: "GitHub Development", path: "/operator/github", icon: GitBranch },
  { name: "Database Dosen", path: "/operator/dosen", icon: Users },
  { name: "Database Admin", path: "/operator/operator", icon: Settings2 },
  { name: "Logbook Mahasiswa", path: "/operator/logbook", icon: BookOpen },
  { name: "Kehadiran Mahasiswa", path: "/operator/kehadiran", icon: MapPin },
  { name: "Manajemen Piket", path: "/operator/piket", icon: ClipboardCheck },
  { name: "Persetujuan Pengajuan", path: "/operator/cuti", icon: CalendarCheck },
  { name: "Pengunduran Diri", path: "/operator/pengunduran", icon: UserX },
  { name: "Layanan Surat", path: "/operator/surat", icon: FileText },
  { name: "Pusat Dokumen", path: "/operator/document-center", icon: FolderOpen },
  { name: "Review Laporan", path: "/operator/draft", icon: BookOpen },
  { name: "Berkas Kelulusan", path: "/operator/kelulusan", icon: FileCheck },
  { name: "Reaktivasi Alumni", path: "/operator/reaktivasi", icon: History },
  { name: "Sertifikat", path: "/operator/sertifikat", icon: GraduationCap },
  { name: "Ekspor Laporan", path: "/operator/ekspor", icon: Download },
  { name: "Pengaturan Sistem", path: "/operator/pengaturan", icon: Settings },
  { name: "Audit Log", path: "/operator/audit", icon: History },
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
  sidebarPhotoUrl,
}: {
  location: ReturnType<typeof useLocation>;
  user: any;
  unread: number;
  onLogout: () => void;
  onClose?: () => void;
  sidebarPhotoUrl?: string;
}) {
  return (
    <>
      <div className="h-[60px] flex items-center justify-between px-6 border-b border-border shrink-0">
        <div className="font-black text-xl text-primary flex items-center gap-2">
          <div className="w-8 h-8 rounded-[10px] bg-primary flex items-center justify-center text-white">
            <GraduationCap size={18} />
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
        <div className="flex items-center gap-2 px-3 py-2 bg-amber-50 border border-amber-200 rounded-[10px]">
          <ProfileAvatar
            name={user?.name || "Admin"}
            photoUrl={sidebarPhotoUrl || user?.photoUrl || user?.photo_url}
            className="size-7"
            fallbackClassName="bg-amber-500 text-white text-[10px] font-black"
          />

          <div className="min-w-0">
            <p className="text-[11px] font-black text-amber-700 uppercase tracking-wide">Admin</p>
            <p className="text-[10px] font-medium text-amber-500 truncate">{user?.name || "Admin"}</p>
          </div>
        </div>
      </div>

      <nav className="flex-1 px-4 py-3 flex flex-col gap-0.5 overflow-y-auto">
        {NAV_ITEMS.map((item) => {
          const isActive = location.pathname === item.path;

          return (
            <Link
              key={item.path}
              to={item.path}
              className={`flex items-center gap-3 px-3 py-2.5 rounded-[10px] font-medium transition-colors text-sm ${
                isActive
                  ? "bg-[#0AB600] text-white shadow-sm shadow-green-200"
                  : "text-muted-foreground hover:bg-green-50 hover:text-[#0AB600]"
              }`}
            >
              <item.icon size={17} />
              {item.name}

              {item.path === "/operator/cuti" && unread > 0 && (
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
          <LogOut size={17} />
          Keluar
        </button>
      </div>
    </>
  );
}

export function OperatorLayout({ children, title = "Dashboard Admin" }: LayoutProps) {
  const location = useLocation();
  const navigate = useNavigate();
  const { user: authUser, logout } = useAuth();

  const syncedUser = useSyncedStoredUser();
  const user = syncedUser || authUser;

  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [panelOpen, setPanelOpen] = useState(false);
  const [headerPhotoUrl, setHeaderPhotoUrl] = useState(user?.photoUrl || user?.photo_url || "");

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
      case "logbook": navigate("/operator/logbook"); break;
      case "riset": navigate("/operator/riset"); break;
      case "cuti":
      case "wfh": navigate("/operator/cuti"); break;
      case "surat": navigate("/operator/surat"); break;
      case "kelulusan": navigate("/operator/kelulusan"); break;
      case "dokumen": navigate("/operator/document-center"); break;
      case "piket": navigate("/operator/picket"); break;
      case "absensi": navigate("/operator/kehadiran"); break;
      case "pengunduran": navigate("/operator/resign"); break;
    }
  };

  useEffect(() => {
    const loadHeaderProfile = async () => {
      if (!user?.id) {
        setHeaderPhotoUrl("");
        return;
      }

      try {
        const profile = await apiGet<any>(`/profile/${encodeURIComponent(user.id)}`);

        setHeaderPhotoUrl(profile?.photoUrl || profile?.photo_url || user?.photoUrl || user?.photo_url || "");
      } catch {
        setHeaderPhotoUrl(user?.photoUrl || user?.photo_url || "");
      }
    };

    void loadHeaderProfile();
  }, [user?.id, user?.photoUrl, user?.photo_url]);

  useEffect(() => {
    const handleClick = (event: MouseEvent) => {
      if (bellRef.current && !bellRef.current.contains(event.target as Node)) {
        setPanelOpen(false);
      }
    };

    if (panelOpen) {
      document.addEventListener("mousedown", handleClick);
    }

    return () => document.removeEventListener("mousedown", handleClick);
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
    <div className="cartoon-ui h-screen w-screen bg-slate-50 overflow-hidden flex">
      <div className="w-full flex h-screen overflow-hidden bg-slate-50 relative">
        <aside className="hidden lg:flex w-[248px] bg-white border-r border-border flex-col shrink-0 z-20">
          <SidebarContent
            location={location}
            user={user}
            unread={unread}
            onLogout={handleLogout}
            sidebarPhotoUrl={headerPhotoUrl}
          />
        </aside>

        {isMobileMenuOpen && (
          <div
            className="fixed inset-0 bg-black/50 backdrop-blur-sm z-40 lg:hidden"
            onClick={() => setIsMobileMenuOpen(false)}
          />
        )}

        <aside
          className={`fixed inset-y-0 left-0 w-[280px] bg-white border-r border-border flex flex-col z-50 lg:hidden transition-transform duration-300 ${
            isMobileMenuOpen ? "translate-x-0" : "-translate-x-full"
          }`}
        >
          <SidebarContent
            location={location}
            user={user}
            unread={unread}
            onLogout={handleLogout}
            onClose={() => setIsMobileMenuOpen(false)}
            sidebarPhotoUrl={headerPhotoUrl}
          />
        </aside>

        <div className="flex-1 flex flex-col min-w-0 z-10">
          <header className="h-[60px] bg-white border-b border-border flex items-center justify-between px-4 md:px-8 shrink-0">
            <div className="flex items-center gap-3 min-w-0">
              <button
                onClick={() => setIsMobileMenuOpen(true)}
                className="lg:hidden p-2 hover:bg-muted/50 rounded-lg transition-colors shrink-0"
              >
                <Menu size={22} />
              </button>

              <h1 className="font-black text-base md:text-lg text-foreground truncate">{title}</h1>
            </div>

            <div className="flex items-center gap-3 md:gap-6 shrink-0">


              <div className="flex items-center gap-3 md:gap-4">
                <div ref={bellRef} className="relative">
                  <button
                    onClick={() => setPanelOpen((value) => !value)}
                    className={`relative p-1.5 rounded-[10px] transition-colors ${
                      panelOpen ? "bg-amber-100 text-amber-600" : "text-muted-foreground hover:bg-slate-100"
                    }`}
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
                          <h3 className="font-black text-foreground text-sm">Notifikasi</h3>

                          {unread > 0 && (
                            <span className="px-2 py-0.5 bg-amber-500 text-white rounded-full text-[10px] font-black">
                              {unread > 99 ? "99+" : unread}
                            </span>
                          )}
                        </div>

                        <div className="flex items-center gap-1">
                          {unread > 0 && (
                            <button
                              onClick={markAllRead}
                              className="text-xs font-bold text-amber-600 hover:bg-amber-50 px-2 py-1 rounded-[8px] flex items-center gap-1"
                            >
                              <CheckCheck size={13} />
                              <span className="hidden sm:inline">Baca Semua</span>
                            </button>
                          )}

                          <button
                            onClick={() => setPanelOpen(false)}
                            className="w-7 h-7 rounded-full flex items-center justify-center hover:bg-slate-100 text-muted-foreground"
                          >
                            <X size={14} />
                          </button>
                        </div>
                      </div>

                      <div className="max-h-[60vh] md:max-h-[340px] overflow-y-auto divide-y divide-border/50 [&::-webkit-scrollbar]:hidden [-ms-overflow-style:none] [scrollbar-width:none]">
                        {notifs.length === 0 ? (
                          <div className="px-5 py-8 text-center text-sm font-medium text-muted-foreground">
                            Tidak ada notifikasi.
                          </div>
                        ) : (
                          notifs.map((notification) => (
                            <div
                              key={notification.id}
                              onClick={() => handleNotificationClick(notification)}
                              className={`group relative flex gap-3 px-5 py-3.5 cursor-pointer transition-colors ${
                                notification.read ? "hover:bg-slate-50" : "bg-amber-50/40 hover:bg-amber-50"
                              }`}
                            >
                              {!notification.read && (
                                <div className="absolute left-2 top-1/2 -translate-y-1/2 w-1.5 h-1.5 rounded-full bg-amber-500" />
                              )}

                              <div className="shrink-0 mt-0.5">
                                {notification.senderPhotoUrl ? (
                                  <img src={notification.senderPhotoUrl} alt={notification.senderName} className="w-8 h-8 rounded-full object-cover shadow-sm border border-border" />
                                ) : (
                                  <div className="w-8 h-8 rounded-full flex items-center justify-center text-xs font-black bg-blue-100 text-blue-700 border border-blue-200">
                                    {notification.senderInitials}
                                  </div>
                                )}
                              </div>

                              <div className="flex-1 min-w-0">
                                <p
                                  className={`text-xs leading-snug mb-0.5 ${
                                    notification.read
                                      ? "font-medium text-foreground/70"
                                      : "font-black text-foreground"
                                  }`}
                                >
                                  {notification.title}
                                </p>
                                <p className="text-[11px] text-muted-foreground line-clamp-2">
                                  <span className="font-semibold text-foreground/80">{notification.senderName}</span>: {notification.body}
                                </p>
                                <p
                                  className={`text-[10px] font-bold mt-1 ${
                                    notification.read ? "text-muted-foreground/60" : "text-amber-500"
                                  }`}
                                >
                                  {notification.time}
                                </p>
                              </div>

                              <button
                                onClick={(event) => {
                                  event.stopPropagation();
                                  dismiss(notification.id);
                                }}
                                className="shrink-0 w-8 h-8 md:w-5 md:h-5 rounded-full flex items-center justify-center hover:bg-red-100 hover:text-red-500 md:opacity-0 md:group-hover:opacity-100 transition-all text-muted-foreground"
                              >
                                <X size={11} strokeWidth={3} />
                              </button>
                            </div>
                          ))
                        )}
                      </div>
                    </div>
                  )}
                </div>

                <ProfileAvatar
                  name={user?.name}
                  photoUrl={headerPhotoUrl || user?.photoUrl || user?.photo_url}
                  className="size-9 shadow-sm ring-2 ring-white cursor-pointer"
                  fallbackClassName="bg-amber-500 text-white text-sm font-black"
                />
              </div>
            </div>
          </header>

          <main className="flex-1 min-w-0 overflow-auto p-4 md:p-6 lg:p-8">{children}</main>
        </div>
      </div>
    </div>
  );
}
