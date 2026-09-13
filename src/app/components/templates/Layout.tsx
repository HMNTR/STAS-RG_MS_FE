import React, { useState, useRef, useEffect } from "react";
import { Link, useLocation, useNavigate } from "react-router";
import {
  LayoutDashboard,
  BookOpen,
  FileText,
  Settings,
  Bell,
  Search,
  GraduationCap,
  MapPin,
  Award,
  ScrollText,
  FlaskConical,
  ClipboardCheck,
  X,
  CheckCheck,
  BookMarked,
  MessageSquare,
  CalendarClock,
  FileCheck,
  Megaphone,
  AlertTriangle,
  ChevronRight,
  LogOut,
  Menu,
  Lock,
  Kanban,
} from "lucide-react";
import { useAuth } from "../../context/AuthContext";
import { AppNotification, NotificationType, useNotifications } from "../../hooks/useNotifications";
import { apiGet } from "../../lib/api";
import { ProfileAvatar } from "../molecules/ProfileAvatar";
import { useSyncedStoredUser } from "../../lib/userProfileSync";
import { normalizeHolidays } from "../../lib/holidays";
import { shouldClearAccessLockFromError, shouldSuppressHolidayAttendanceLock } from "../../lib/accessLocks";

type StudentAccessLock = {
  id?: string;
  locked?: boolean;
  active?: boolean;
  status?: string;
  studentId?: string;
  studentName?: string;
  date?: string;
  reason?: string;
  attendanceStatus?: string;
  message?: string;
  lockedAt?: string;
};

function isActiveAccessLock(lock: StudentAccessLock | null) {
  if (!lock) return false;
  return Boolean(lock.locked || lock.active || String(lock.status || "").toUpperCase() === "LOCKED");
}

function getAccessLockReasonLabel(reason?: string | null) {
  if (reason === "ATTENDANCE_ABSENT") return "Tidak Hadir";
  if (reason === "CHECKOUT_MISSING_22") return "Belum Checkout Sampai 22.00 WIB";
  if (reason === "WORK_HOURS_UNDER_8") return "Jam Kerja Magang Kurang dari 8 Jam";
  if (reason === "RISET_WEEKLY_HOURS_UNDER_TARGET") return "Jam Kerja Riset Mingguan Tidak Terpenuhi";
  if (reason === "PICKET_SUBMISSION_INVALID") return "Piket Tidak Sesuai";
  if (reason === "PICKET_SUBMISSION_MISSING") return "Belum Melakukan Piket";
  return reason || "-";
}

function getAccessLockDefaultMessage(reason?: string | null, date?: string | null) {
  if (reason === "CHECKOUT_MISSING_22") {
    return "Akses dikunci karena Anda belum melakukan check-out absensi sampai pukul 22.00 WIB. Hubungi admin untuk membuka kembali akses website.";
  }
  if (reason === "WORK_HOURS_UNDER_8") {
    return "Akses dikunci karena durasi kerja Magang hari ini kurang dari 8 jam. Hubungi admin untuk membuka kembali akses website.";
  }
  if (reason === "RISET_WEEKLY_HOURS_UNDER_TARGET") {
    return "Akses dikunci karena jam kerja Riset mingguan belum memenuhi target.";
  }
  if (reason === "PICKET_SUBMISSION_INVALID") {
    return "Anda telah melakukan kegiatan piket yang tidak sesuai dengan tugas anda, mohon hubungi ke admin untuk melepas block.";
  }
  if (reason === "PICKET_SUBMISSION_MISSING") {
    return "Akses dikunci karena Anda belum melakukan piket atau belum mengirim bukti piket dari jadwal sebelumnya.";
  }

  return `Akun Anda dikunci karena terdeteksi tidak hadir pada ${
    date || "hari ini"
  }. Hubungi admin untuk membuka kembali akses website.`;
}

function isRisetStudentType(tipe?: string | null) {
  return String(tipe || "").trim().toLowerCase() === "riset";
}

function NotifIcon({ type }: { type: NotificationType }) {
  const map: Record<NotificationType, { icon: React.ReactNode; bg: string; text: string }> = {
    logbook: { icon: <BookMarked size={15} />, bg: "bg-green-100", text: "text-green-700" },
    riset: { icon: <FlaskConical size={15} />, bg: "bg-green-100", text: "text-green-700" },
    komentar: { icon: <MessageSquare size={15} />, bg: "bg-blue-100", text: "text-blue-600" },
    cuti: { icon: <FileCheck size={15} />, bg: "bg-emerald-100", text: "text-emerald-600" },
    deadline: { icon: <AlertTriangle size={15} />, bg: "bg-red-100", text: "text-red-500" },
    pengumuman: { icon: <Megaphone size={15} />, bg: "bg-amber-100", text: "text-amber-600" },
    dokumen: { icon: <FileCheck size={15} />, bg: "bg-slate-100", text: "text-slate-500" },
  };

  const c = map[type];

  return (
    <div className={`w-9 h-9 rounded-[10px] flex items-center justify-center shrink-0 ${c.bg} ${c.text}`}>
      {c.icon}
    </div>
  );
}

function NotificationPanel({
  notifs,
  onRead,
  onReadAll,
  onDismiss,
  onClose,
}: {
  notifs: AppNotification[];
  onRead: (id: string) => void;
  onReadAll: () => void;
  onDismiss: (id: string) => void;
  onClose: () => void;
}) {
  const navigate = useNavigate();
  const [filter, setFilter] = useState<"all" | "unread">("all");
  const unreadCount = notifs.filter((n) => !n.read).length;
  const visible = filter === "unread" ? notifs.filter((n) => !n.read) : notifs;

  return (
    <div className="fixed inset-x-4 top-20 md:absolute md:inset-x-auto md:top-[calc(100%+10px)] md:right-0 w-auto md:w-[400px] bg-white rounded-[18px] shadow-2xl border border-border z-[300] overflow-hidden animate-in fade-in slide-in-from-top-2 duration-200">
      <div className="px-4 md:px-5 pt-4 md:pt-5 pb-3 border-b border-border">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <h3 className="text-sm md:text-base font-black text-foreground">Notifikasi</h3>
            {unreadCount > 0 && (
              <span className="px-2 py-0.5 bg-primary text-white rounded-full text-[11px] font-black">
                {unreadCount}
              </span>
            )}
          </div>

          <div className="flex items-center gap-1">
            {unreadCount > 0 && (
              <button
                onClick={onReadAll}
                className="flex items-center gap-1.5 px-2 md:px-3 py-1.5 rounded-[9px] text-xs font-bold text-primary hover:bg-green-50 transition-colors"
                title="Tandai semua sebagai dibaca"
              >
                <CheckCheck size={14} />
                <span className="hidden sm:inline">Semua dibaca</span>
              </button>
            )}

            <button
              onClick={onClose}
              className="w-7 h-7 rounded-full flex items-center justify-center text-muted-foreground hover:bg-muted/50 hover:text-foreground transition-colors"
            >
              <X size={15} />
            </button>
          </div>
        </div>

        <div className="flex gap-1 bg-muted/40 p-0.5 rounded-[10px]">
          {([
            ["all", "Semua"],
            ["unread", "Belum Dibaca"],
          ] as const).map(([f, label]) => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={`flex-1 py-1.5 rounded-[8px] text-xs font-bold transition-all ${
                filter === f ? "bg-white text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"
              }`}
            >
              <span className="hidden sm:inline">{label} ({f === "all" ? notifs.length : unreadCount})</span>
              <span className="sm:hidden">{label.split(" ")[0]} ({f === "all" ? notifs.length : unreadCount})</span>
            </button>
          ))}
        </div>
      </div>

      <div className="max-h-[60vh] md:max-h-[380px] overflow-y-auto [&::-webkit-scrollbar]:hidden [-ms-overflow-style:none] [scrollbar-width:none]">
        {visible.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 gap-3">
            <div className="w-14 h-14 rounded-full bg-muted/50 flex items-center justify-center text-muted-foreground">
              <Bell size={24} />
            </div>
            <div className="text-center px-4">
              <p className="text-sm font-bold text-foreground">Tidak ada notifikasi</p>
              <p className="text-xs font-medium text-muted-foreground mt-0.5">
                {filter === "unread" ? "Semua notifikasi sudah dibaca." : "Belum ada notifikasi masuk."}
              </p>
            </div>
          </div>
        ) : (
          <div className="divide-y divide-border/50">
            {visible.map((n) => (
              <div
                key={n.id}
                className={`group relative flex items-start gap-3 px-4 md:px-5 py-3 md:py-4 cursor-pointer transition-colors ${
                  n.read ? "hover:bg-slate-50/60" : "bg-green-50/40 hover:bg-green-50"
                }`}
                onClick={() => {
                  onRead(n.id);
                  onClose();
                  
                  if (n.link) {
                    navigate(n.link);
                    return;
                  }
                  
                  switch (n.type) {
                    case "logbook": navigate("/logbook"); break;
                    case "riset": navigate("/riset"); break;
                    case "cuti":
                    case "wfh": navigate("/cuti-izin"); break;
                    case "surat": navigate("/persuratan"); break;
                    case "kelulusan": navigate("/berkas-kelulusan"); break;
                    case "piket": navigate("/piket"); break;
                    case "absensi": navigate("/kehadiran"); break;
                    case "pengunduran": navigate("/resign"); break;
                  }
                }}
              >
                {!n.read && (
                  <div className="absolute left-2 top-1/2 -translate-y-1/2 w-1.5 h-1.5 rounded-full bg-[#0AB600]" />
                )}

                <div className="shrink-0 mt-0.5">
                  {n.senderPhotoUrl ? (
                    <img src={n.senderPhotoUrl} alt={n.senderName} className="w-8 h-8 rounded-full object-cover shadow-sm border border-border" />
                  ) : (
                    <div className="w-8 h-8 rounded-full flex items-center justify-center text-xs font-black bg-[#0AB600]/10 text-[#0AB600] border border-[#0AB600]/20">
                      {n.senderInitials}
                    </div>
                  )}
                </div>

                <div className="flex-1 min-w-0">
                  <p
                    className={`text-xs md:text-sm leading-snug mb-0.5 ${
                      n.read ? "font-medium text-foreground/80" : "font-bold text-foreground"
                    }`}
                  >
                    {n.title}
                  </p>
                  <p className="text-[11px] md:text-[12px] font-medium text-muted-foreground leading-relaxed line-clamp-2">
                    <span className="font-semibold text-foreground/80">{n.senderName}</span>: {n.body}
                  </p>
                  <p
                    className={`text-[10px] md:text-[11px] font-bold mt-1.5 ${
                      n.read ? "text-muted-foreground/70" : "text-[#0AB600]"
                    }`}
                  >
                    {n.time}
                  </p>
                </div>

                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    onDismiss(n.id);
                  }}
                  className="shrink-0 w-8 h-8 md:w-6 md:h-6 rounded-full flex items-center justify-center text-muted-foreground hover:text-red-500 hover:bg-red-50 md:opacity-0 md:group-hover:opacity-100 transition-all mt-0.5"
                  title="Hapus notifikasi"
                >
                  <X size={13} strokeWidth={3} />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="border-t border-border px-4 md:px-5 py-3 bg-slate-50/60 flex items-center justify-between">
        <p className="text-[10px] md:text-[11px] font-medium text-muted-foreground">
          {unreadCount === 0 ? "Semua sudah dibaca" : `${unreadCount} belum dibaca`}
        </p>
        <Link
          to="/settings"
          onClick={onClose}
          className="flex items-center gap-1 text-xs font-bold text-[#0AB600] hover:gap-1.5 transition-all"
        >
          <span className="hidden sm:inline">Atur Notifikasi</span>
          <span className="sm:hidden">Atur</span>
          <ChevronRight size={13} strokeWidth={3} />
        </Link>
      </div>
    </div>
  );
}

interface LayoutProps {
  children: React.ReactNode;
  title?: string;
}

export function Layout({ children, title = "Dashboard" }: LayoutProps) {
  const location = useLocation();
  const navigate = useNavigate();
  const { user: authUser, logout } = useAuth();
  const syncedUser = useSyncedStoredUser();
  const user = syncedUser || authUser;

  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [isPanelOpen, setIsPanelOpen] = useState(false);
  const [accessLock, setAccessLock] = useState<StudentAccessLock | null>(null);
  const [checkingAccessLock, setCheckingAccessLock] = useState(false);
  const [headerPhotoUrl, setHeaderPhotoUrl] = useState(user?.photoUrl || user?.photo_url || "");
  const bellRef = useRef<HTMLDivElement>(null);
  const holidayLockRulesRef = useRef({
    excludeHolidaysFromWorkdays: true,
    holidays: [] as unknown,
  });

  const fallbackNotifs = React.useMemo<AppNotification[]>(() => [], []);

  const { notifs, unreadCount, markRead, markAllRead, dismiss } = useNotifications({
    role: user?.role,
    fallback: fallbackNotifs,
  });

  const [warningPopup, setWarningPopup] = useState<{ title: string; body: string } | null>(null);

  const applyHolidayLockSettings = React.useCallback((settings: any) => {
    holidayLockRulesRef.current = {
      excludeHolidaysFromWorkdays: Boolean(settings?.attendanceRules?.excludeHolidaysFromWorkdays ?? true),
      holidays: normalizeHolidays(settings?.attendanceRules?.holidays || settings?.holidays),
    };
  }, []);

  const shouldHideHolidayAttendanceLock = React.useCallback((lock: StudentAccessLock | null) => {
    const rules = holidayLockRulesRef.current;
    return shouldSuppressHolidayAttendanceLock(lock, rules.holidays, {
      excludeHolidaysFromWorkdays: rules.excludeHolidaysFromWorkdays,
    });
  }, []);

  const refreshAccessLock = React.useCallback(async () => {
    if (user?.role !== "mahasiswa") {
      setAccessLock(null);
      return;
    }

    try {
      setCheckingAccessLock(true);
      const [lockResult, settingsResult] = await Promise.allSettled([
        apiGet<StudentAccessLock>("/student-access-locks/me"),
        apiGet<any>("/system-settings"),
      ]);

      if (settingsResult.status === "fulfilled") {
        applyHolidayLockSettings(settingsResult.value);
      }

      if (lockResult.status === "fulfilled") {
        const data = lockResult.value;
        setAccessLock(isActiveAccessLock(data) && !shouldHideHolidayAttendanceLock(data) ? data : null);
      } else if (shouldClearAccessLockFromError(lockResult.reason)) {
        setAccessLock(null);
      }
    } catch {
      // Keep previous lock state.
    } finally {
      setCheckingAccessLock(false);
    }
  }, [applyHolidayLockSettings, shouldHideHolidayAttendanceLock, user?.role]);

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
    function handleClick(e: MouseEvent) {
      if (bellRef.current && !bellRef.current.contains(e.target as Node)) {
        setIsPanelOpen(false);
      }
    }

    if (isPanelOpen) document.addEventListener("mousedown", handleClick);

    return () => document.removeEventListener("mousedown", handleClick);
  }, [isPanelOpen]);

  useEffect(() => {
    setIsPanelOpen(false);
    setIsMobileMenuOpen(false);
  }, [location.pathname]);

  useEffect(() => {
    refreshAccessLock();
  }, [location.pathname, refreshAccessLock]);

  useEffect(() => {
    if (user?.role !== "mahasiswa") return;

    const onFocus = () => refreshAccessLock();
    const onVisible = () => {
      if (document.visibilityState === "visible") refreshAccessLock();
    };

    window.addEventListener("focus", onFocus);
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("stas:access-lock-refresh", refreshAccessLock);

    const interval = window.setInterval(refreshAccessLock, 60000);

    return () => {
      window.removeEventListener("focus", onFocus);
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("stas:access-lock-refresh", refreshAccessLock);
      window.clearInterval(interval);
    };
  }, [refreshAccessLock, user?.role]);

  useEffect(() => {
    const onAccessLocked = (event: Event) => {
      if (user?.role !== "mahasiswa") return;

      const detail = (event as CustomEvent).detail || {};

      const nextLock: StudentAccessLock = {
        id: detail.id || undefined,
        locked: true,
        active: true,
        status: "LOCKED",
        reason: detail.reason || "ATTENDANCE_ABSENT",
        date: detail.date || null,
        message: detail.message || getAccessLockDefaultMessage(detail.reason || "ATTENDANCE_ABSENT", detail.date || null),
      };

      setAccessLock(shouldHideHolidayAttendanceLock(nextLock) ? null : nextLock);
    };

    window.addEventListener("stas:access-locked", onAccessLocked);

    return () => window.removeEventListener("stas:access-locked", onAccessLocked);
  }, [shouldHideHolidayAttendanceLock, user?.role]);

  // Alumni tidak perlu auto-logout jam 22
  useEffect(() => {
    if (user?.role !== "mahasiswa" || isAlumni) return;

    const CUTOFF_HOUR = 22;

    const getJakartaHour = () => {
      const parts = new Intl.DateTimeFormat("en-US", {
        timeZone: "Asia/Jakarta",
        hour: "2-digit",
        hour12: false,
      }).formatToParts(new Date());
      return parseInt(parts.find((p) => p.type === "hour")?.value ?? "0", 10);
    };

    const msUntilCutoff = () => {
      const parts = new Intl.DateTimeFormat("en-US", {
        timeZone: "Asia/Jakarta",
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
        hour12: false,
      }).formatToParts(new Date());
      const h = parseInt(parts.find((p) => p.type === "hour")?.value ?? "0", 10);
      const m = parseInt(parts.find((p) => p.type === "minute")?.value ?? "0", 10);
      const s = parseInt(parts.find((p) => p.type === "second")?.value ?? "0", 10);
      const currentSec = h * 3600 + m * 60 + s;
      const cutoffSec = CUTOFF_HOUR * 3600;
      return currentSec >= cutoffSec ? 0 : (cutoffSec - currentSec) * 1000;
    };

    const doAutoLogout = () => {
      logout();
      navigate("/login");
    };

    if (getJakartaHour() >= CUTOFF_HOUR) {
      doAutoLogout();
      return;
    }

    const timer = window.setTimeout(doAutoLogout, msUntilCutoff());

    const checkExpiry = () => {
      if (getJakartaHour() >= CUTOFF_HOUR) doAutoLogout();
    };

    window.addEventListener("focus", checkExpiry);
    document.addEventListener("visibilitychange", checkExpiry);

    return () => {
      window.clearTimeout(timer);
      window.removeEventListener("focus", checkExpiry);
      document.removeEventListener("visibilitychange", checkExpiry);
    };
  }, [user?.role, logout, navigate]);

  const studentStatus = String((user as any)?.status || (user as any)?.studentStatus || "").trim();
  const isAlumni = user?.role === "mahasiswa" && studentStatus === "Alumni";

  const [activeScrumInfo, setActiveScrumInfo] = useState<{
    hasActiveScrum: boolean;
    primaryProjectId: string | null;
    activeSprint: any;
  } | null>(null);

  useEffect(() => {
    if (user?.role === "mahasiswa" && !isAlumni) {
      apiGet<any>("/research/my-scrum")
        .then((res) => {
          if (res?.hasActiveScrum && res?.primaryProjectId) {
            setActiveScrumInfo(res);
          } else {
            setActiveScrumInfo(null);
          }
        })
        .catch(() => setActiveScrumInfo(null));
    }
  }, [user?.id, isAlumni]);

  // Halaman yang bisa diakses Alumni (read-only history)
  const ALUMNI_ALLOWED_PATHS = new Set(["/dashboard", "/logbook", "/research", "/documents", "/graduation", "/draft", "/settings"]);

  const allNavItems = [
    { name: "Dashboard", path: "/dashboard", icon: LayoutDashboard },
    { name: "Kehadiran (GPS)", path: "/attendance", icon: MapPin, alumniHidden: true },
    { name: "Logbook", path: "/logbook", icon: BookOpen },
    { name: "Piket", path: "/picket", icon: ClipboardCheck, alumniHidden: true },
    { name: "Riset Saya", path: "/research", icon: FlaskConical },
    ...(activeScrumInfo?.hasActiveScrum && activeScrumInfo.primaryProjectId
      ? [
          {
            name: "Scrum Board",
            path: "/scrum",
            icon: Kanban,
            alumniHidden: true
          }
        ]
      : []),
    { name: "Pengajuan", path: "/leave", icon: FileText, alumniHidden: true },
    { name: "Dokumen & Sertifikat", path: "/documents", icon: Award },
    { name: "Pusat Dokumen Saya", path: "/document-center", icon: FileText, alumniHidden: true },
    { name: "Berkas Kelulusan", path: "/graduation", icon: FileCheck },
    { name: "Draft TA / Jurnal", path: "/draft", icon: ScrollText },
  ];

  const navItems = allNavItems.filter((item) => !isAlumni || !(item as any).alumniHidden);

  const handleLogout = () => {
    logout();
    navigate("/login");
  };

  return (
    <div className="cartoon-ui h-screen w-screen bg-background text-foreground overflow-hidden flex">
      <div className="w-full flex h-screen overflow-hidden bg-background relative">
        <aside className="hidden lg:flex w-[248px] bg-white border-r border-border flex-col shrink-0 z-20">
          <div className="h-[60px] flex items-center px-6 border-b border-border">
            <div className="font-bold text-xl text-primary flex items-center gap-2">
              <div className="w-8 h-8 rounded-[14px] bg-primary flex items-center justify-center text-white">
                <GraduationCap size={20} />
              </div>
              STAS-RG
            </div>
          </div>

          <nav className="flex-1 px-4 py-6 flex flex-col gap-2 overflow-y-auto">
            {isAlumni && (
              <div className="mb-2 mx-1 px-3 py-2 rounded-[10px] bg-emerald-50 border border-emerald-200 flex items-center gap-2">
                <GraduationCap size={14} className="text-emerald-600 shrink-0" />
                <span className="text-[11px] font-black text-emerald-700">Alumni</span>
              </div>
            )}
            {navItems.map((item) => {
              const isActive =
                location.pathname === item.path ||
                (location.pathname.startsWith(item.path) && item.path !== "/dashboard");

              return (
                <Link
                  key={item.path}
                  to={item.path}
                  className={`flex items-center gap-3 px-4 py-3 rounded-[14px] font-medium transition-colors ${
                    isActive ? "bg-primary text-white" : "text-muted-foreground hover:bg-muted/50 hover:text-foreground"
                  }`}
                >
                  <item.icon size={20} />
                  {item.name}
                </Link>
              );
            })}

            <div className="mt-auto flex flex-col gap-1">
              <Link
                to="/settings"
                className={`flex items-center gap-3 px-4 py-3 rounded-[14px] font-medium transition-colors ${
                  location.pathname === "/settings"
                    ? "bg-primary text-white"
                    : "text-muted-foreground hover:bg-muted/50 hover:text-foreground"
                }`}
              >
                <Settings size={20} />
                Pengaturan
              </Link>

              <button
                onClick={handleLogout}
                className="flex items-center gap-3 px-4 py-3 rounded-[14px] font-medium transition-colors text-muted-foreground hover:bg-red-50 hover:text-red-600 w-full text-left"
              >
                <LogOut size={20} />
                Keluar
              </button>
            </div>
          </nav>
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
          <div className="h-[60px] flex items-center justify-between px-6 border-b border-border">
            <div className="font-bold text-xl text-primary flex items-center gap-2">
              <div className="w-8 h-8 rounded-[14px] bg-primary flex items-center justify-center text-white">
                <GraduationCap size={20} />
              </div>
              STAS-RG
            </div>

            <button
              onClick={() => setIsMobileMenuOpen(false)}
              className="p-2 hover:bg-muted/50 rounded-lg transition-colors"
            >
              <X size={20} />
            </button>
          </div>

          <nav className="flex-1 px-4 py-6 flex flex-col gap-2 overflow-y-auto">
            {isAlumni && (
              <div className="mb-2 mx-1 px-3 py-2 rounded-[10px] bg-emerald-50 border border-emerald-200 flex items-center gap-2">
                <GraduationCap size={14} className="text-emerald-600 shrink-0" />
                <span className="text-[11px] font-black text-emerald-700">Alumni</span>
              </div>
            )}
            {navItems.map((item) => {
              const isActive =
                location.pathname === item.path ||
                (location.pathname.startsWith(item.path) && item.path !== "/dashboard");

              return (
                <Link
                  key={item.path}
                  to={item.path}
                  className={`flex items-center gap-3 px-4 py-3 rounded-[14px] font-medium transition-colors ${
                    isActive ? "bg-primary text-white" : "text-muted-foreground hover:bg-muted/50 hover:text-foreground"
                  }`}
                >
                  <item.icon size={20} />
                  {item.name}
                </Link>
              );
            })}

            <div className="mt-auto flex flex-col gap-1">
              <Link
                to="/settings"
                className={`flex items-center gap-3 px-4 py-3 rounded-[14px] font-medium transition-colors ${
                  location.pathname === "/settings"
                    ? "bg-primary text-white"
                    : "text-muted-foreground hover:bg-muted/50 hover:text-foreground"
                }`}
              >
                <Settings size={20} />
                Pengaturan
              </Link>

              <button
                onClick={handleLogout}
                className="flex items-center gap-3 px-4 py-3 rounded-[14px] font-medium transition-colors text-muted-foreground hover:bg-red-50 hover:text-red-600 w-full text-left"
              >
                <LogOut size={20} />
                Keluar
              </button>
            </div>
          </nav>
        </aside>

        <div className="flex-1 flex flex-col min-w-0 z-10">
          <header className="h-[60px] bg-white border-b border-border flex items-center justify-between px-4 md:px-8 shrink-0">
            <button
              onClick={() => setIsMobileMenuOpen(true)}
              className="lg:hidden p-2 hover:bg-muted/50 rounded-lg transition-colors"
            >
              <Menu size={24} />
            </button>

            <h1 className="text-base md:text-lg font-bold text-foreground truncate">{title}</h1>

            <div className="flex items-center gap-3 md:gap-6">
              <div className="hidden md:flex items-center gap-3 px-4 py-2 bg-background border border-border rounded-[14px] w-48 lg:w-64 focus-within:ring-2 focus-within:ring-primary/20 focus-within:border-primary transition-all">
                <Search size={18} className="text-muted-foreground" />
                <input
                  type="text"
                  placeholder="Cari kelas, tugas..."
                  className="bg-transparent border-none outline-none text-sm text-foreground placeholder:text-muted-foreground w-full"
                />
              </div>

              <div className="flex items-center gap-3 md:gap-5">
                <div ref={bellRef} className="relative">
                  <button
                    onClick={() => setIsPanelOpen((value) => !value)}
                    className={`relative p-1.5 rounded-[10px] transition-colors ${
                      isPanelOpen
                        ? "bg-[#F0FFF0] text-[#0AB600]"
                        : "text-muted-foreground hover:text-foreground hover:bg-muted/30"
                    }`}
                  >
                    <Bell size={20} className="md:w-[22px] md:h-[22px]" />
                    {unreadCount > 0 && (
                      <span className="absolute -top-0.5 -right-0.5 min-w-[18px] h-[18px] px-1 bg-destructive rounded-full border-2 border-white flex items-center justify-center text-[10px] font-black text-white shadow-sm">
                        {unreadCount > 99 ? "99+" : unreadCount}
                      </span>
                    )}
                  </button>

                  {isPanelOpen && (
                    <NotificationPanel
                      notifs={notifs}
                      onRead={markRead}
                      onReadAll={markAllRead}
                      onDismiss={dismiss}
                      onClose={() => setIsPanelOpen(false)}
                    />
                  )}
                </div>

                <ProfileAvatar
                  name={user?.name}
                  photoUrl={headerPhotoUrl || user?.photoUrl || user?.photo_url}
                  className="size-9 md:size-10 shadow-sm ring-2 ring-white cursor-pointer"
                  fallbackClassName="bg-[#0AB600] text-white text-sm font-black"
                />
              </div>
            </div>
          </header>

          <main className="flex-1 overflow-auto p-4 md:p-6 lg:p-8">{children}</main>
        </div>
      </div>

      {warningPopup && (
        <div className="fixed inset-0 z-[500] flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
          <div className="bg-white rounded-[20px] shadow-2xl w-full max-w-[440px] overflow-hidden">
            <div className="bg-amber-500 px-6 py-4 flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-white/20 flex items-center justify-center shrink-0">
                <AlertTriangle size={20} className="text-white" />
              </div>
              <div>
                <p className="font-black text-white">Peringatan dari Admin</p>
                <p className="text-xs text-white/80">STAS-RG Management System</p>
              </div>
            </div>

            <div className="p-6">
              <h3 className="font-black text-foreground mb-2">{warningPopup.title}</h3>
              <p className="text-sm text-muted-foreground leading-relaxed">{warningPopup.body}</p>
            </div>

            <div className="px-6 pb-6">
              <button
                onClick={() => {
                  setWarningPopup(null);
                }}
                className="w-full h-10 bg-amber-500 hover:bg-amber-600 text-white font-black rounded-[12px] transition-colors"
              >
                Saya Mengerti
              </button>
            </div>
          </div>
        </div>
      )}

      {isActiveAccessLock(accessLock) && !isAlumni && (
        <div className="fixed inset-0 z-[900] flex items-center justify-center bg-slate-950/80 backdrop-blur-md p-4">
          <div className="w-full max-w-[460px] overflow-hidden rounded-[22px] border border-red-200 bg-white shadow-2xl">
            <div className="bg-red-600 px-6 py-5 flex items-center gap-4">
              <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-white/20 text-white">
                <Lock size={24} />
              </div>
              <div>
                <p className="text-lg font-black text-white">Akses Website Dikunci</p>
                <p className="text-xs font-bold text-white/80">Status akses membutuhkan verifikasi admin</p>
              </div>
            </div>

            <div className="p-6">
              <h3 className="mb-2 text-base font-black text-foreground">Akses Dikunci</h3>
              <p className="text-sm font-medium leading-relaxed text-muted-foreground">
                {accessLock?.message || getAccessLockDefaultMessage(accessLock?.reason, accessLock?.date)}
              </p>

              <div className="mt-4 grid grid-cols-1 gap-2 rounded-[14px] border border-slate-200 bg-slate-50 p-3 text-xs font-bold text-slate-700">
                <div className="flex items-center justify-between gap-3">
                  <span className="text-muted-foreground">Tanggal</span>
                  <span>{accessLock?.date || "-"}</span>
                </div>
                <div className="flex items-center justify-between gap-3">
                  <span className="text-muted-foreground">Alasan</span>
                  <span>{getAccessLockReasonLabel(accessLock?.reason)}</span>
                </div>
              </div>

              <div className="mt-5 rounded-[14px] border border-red-100 bg-red-50 px-4 py-3 text-xs font-bold text-red-700">
                Selama akses terkunci, Anda tidak dapat menggunakan fitur website sampai admin membuka akses.
              </div>

              <div className="mt-5 grid grid-cols-1 gap-3 sm:grid-cols-2">
                <button
                  onClick={refreshAccessLock}
                  disabled={checkingAccessLock}
                  className="h-10 rounded-[12px] bg-red-600 text-sm font-black text-white transition-colors hover:bg-red-700 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {checkingAccessLock ? "Mengecek..." : "Cek Ulang Status"}
                </button>

                <button
                  onClick={handleLogout}
                  className="h-10 rounded-[12px] border border-border bg-white text-sm font-black text-muted-foreground transition-colors hover:bg-slate-50 hover:text-foreground"
                >
                  Keluar
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}


