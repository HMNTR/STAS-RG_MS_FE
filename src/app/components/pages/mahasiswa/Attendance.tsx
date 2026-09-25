import React, { useState, useEffect } from "react";
import { useNavigate } from "react-router";
import { Layout } from "../../templates/Layout";
import { AlertTriangle, MapPin, Clock, LogIn, LogOut, Search } from "lucide-react";
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip } from "recharts";
import { ApiError, apiGet, apiPost } from "../../../lib/api";
import { useAuth } from "../../../context/AuthContext";
import { HolidayItem, findHolidayForDate, normalizeHolidays } from "../../../lib/holidays";
import {
  PicketAssignment,
  ensurePicketPhotoPreviewable,
  fileToDataUrl,
  hasPicketPhotoSubmission,
  isAlumniStudent,
  mapPicketAssignment,
  mapPicketTodayAssignment,
  mapPicketSubmissionResult,
  shouldRequirePicketPhoto,
  validatePicketPhoto,
} from "../../../lib/picket";

type GpsInfo = {
  latitude: number;
  longitude: number;
  radius: number;
};

type GpsPolicy = {
  targetLatitude: number;
  targetLongitude: number;
  radiusMeters: number;
  maxAccuracyMeters: number;
  sampleCount: number;
  timeoutMs: number;
};

type GpsResult = {
  reason?: string | null;
  accuracyMeters?: number | null;
  maxAccuracyMeters?: number | null;
  distanceMeters?: number | null;
  allowedRadiusMeters?: number | null;
};

type AttendanceHistoryItem = {
  date: string;
  in: string;
  out: string;
  duration: string;
  status: string;
  statusColor: string;
  autoCheckout?: boolean;
  checkoutSource?: string | null;
  autoCheckoutReason?: string | null;
};

type AttendanceToday = {
  checkIn: string;
  checkOut: string;
  status: string;
  autoCheckout?: boolean;
  checkoutSource?: string | null;
  autoCheckoutReason?: string | null;
};

type WeeklyAttendanceSummary = {
  currentHours: number;
  targetHours: number;
  minHours: number;
  remainingHours: number;
  pct: number;
  meetsTarget: boolean;
  meetsMin: boolean;
};

const DEFAULT_GPS_POLICY: GpsPolicy = {
  targetLatitude: 0,
  targetLongitude: 0,
  radiusMeters: 15,
  maxAccuracyMeters: 100,
  sampleCount: 2,
  timeoutMs: 6000
};

const EXTREME_GPS_ACCURACY_THRESHOLD = 1000;
const CHECK_IN_CUTOFF_HOUR = 22; // 22:00 WIB

const isAfterCheckInCutoff = () => {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "Asia/Jakarta",
    hour: "2-digit",
    hour12: false,
  }).formatToParts(new Date());
  return parseInt(parts.find((p) => p.type === "hour")?.value ?? "0", 10) >= CHECK_IN_CUTOFF_HOUR;
};

const normalizeNumber = (value: unknown, fallback: number) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};

const normalizePositiveNumber = (value: unknown, fallback: number) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
};

const formatHourValue = (value: unknown) => {
  const number = normalizeNumber(value, 0);
  const formatted = number.toFixed(1);
  return formatted.endsWith(".0") ? formatted.slice(0, -2) : formatted;
};

const getJakartaDateKey = (date = new Date()) =>
  new Intl.DateTimeFormat("sv-SE", { timeZone: "Asia/Jakarta" }).format(date);

const normalizeDateKey = (value?: string | null) => {
  if (!value) return "";
  const text = String(value).trim();
  const directDate = text.match(/^\d{4}-\d{2}-\d{2}/)?.[0];
  if (directDate) return directDate;

  const parsed = new Date(text);
  if (Number.isNaN(parsed.getTime())) return "";
  return getJakartaDateKey(parsed);
};

const parseTimeParts = (value?: string | null) => {
  const [hours, minutes] = String(value || "").split(/[:.]/).map(Number);
  if (!Number.isFinite(hours) || !Number.isFinite(minutes)) return null;
  return { hours, minutes };
};

const isFilledTime = (value?: string | null) => {
  const text = String(value || "").trim();
  return Boolean(text && text !== "-" && text !== "--:--" && text !== "--.--");
};

const getTodayHistoryRow = (history: AttendanceHistoryItem[]) => {
  const today = new Date();
  const day = new Intl.DateTimeFormat("id-ID", { day: "numeric", timeZone: "Asia/Jakarta" }).format(today);
  const month = new Intl.DateTimeFormat("id-ID", { month: "short", timeZone: "Asia/Jakarta" }).format(today).toLowerCase();
  const year = new Intl.DateTimeFormat("id-ID", { year: "numeric", timeZone: "Asia/Jakarta" }).format(today);
  const dayPattern = new RegExp(`(^|\\D)0?${day}(\\D|$)`);

  return history.find((row) => {
    const label = String(row.date || "").toLowerCase();
    return dayPattern.test(label) && label.includes(month) && label.includes(year);
  });
};

const normalizeTodayData = (today: AttendanceToday | undefined, history: AttendanceHistoryItem[]): AttendanceToday => {
  const nextToday = today || { checkIn: "--:--", checkOut: "--:--", status: "Belum Check-in" };
  const todayHistory = getTodayHistoryRow(history);
  if (!todayHistory) return nextToday;

  return {
    ...nextToday,
    checkIn: isFilledTime(todayHistory.in) ? todayHistory.in : nextToday.checkIn,
    checkOut: isFilledTime(todayHistory.out) ? todayHistory.out : nextToday.checkOut,
    // jangan override status dengan todayHistory.status
    autoCheckout: todayHistory.autoCheckout ?? nextToday.autoCheckout,
    checkoutSource: todayHistory.checkoutSource ?? nextToday.checkoutSource,
    autoCheckoutReason: todayHistory.autoCheckoutReason ?? nextToday.autoCheckoutReason
  };
};

const normalizeGpsPolicy = (policy: any, gps?: GpsInfo | null): GpsPolicy | null => {
  if (!policy && !gps) return null;

  return {
    targetLatitude: normalizeNumber(policy?.targetLatitude, normalizeNumber(gps?.latitude, DEFAULT_GPS_POLICY.targetLatitude)),
    targetLongitude: normalizeNumber(policy?.targetLongitude, normalizeNumber(gps?.longitude, DEFAULT_GPS_POLICY.targetLongitude)),
    radiusMeters: normalizeNumber(policy?.radiusMeters, normalizeNumber(gps?.radius, DEFAULT_GPS_POLICY.radiusMeters)),
    maxAccuracyMeters: normalizeNumber(policy?.maxAccuracyMeters, DEFAULT_GPS_POLICY.maxAccuracyMeters),
    sampleCount: Math.min(5, Math.max(1, normalizeNumber(policy?.sampleCount, DEFAULT_GPS_POLICY.sampleCount))),
    timeoutMs: Math.max(3000, normalizeNumber(policy?.timeoutMs, DEFAULT_GPS_POLICY.timeoutMs))
  };
};

const isMobileAttendanceDevice = () => {
  if (typeof navigator === "undefined") return false;

  const nav = navigator as Navigator & {
    userAgentData?: { mobile?: boolean };
  };
  if (typeof nav.userAgentData?.mobile === "boolean") {
    return nav.userAgentData.mobile;
  }

  const userAgent = navigator.userAgent || "";
  const platform = navigator.platform || "";
  const maxTouchPoints = navigator.maxTouchPoints || 0;
  const mobileUserAgent = /Android|webOS|iPhone|iPod|BlackBerry|IEMobile|Opera Mini|Mobile/i.test(userAgent);
  const iPadOS = platform === "MacIntel" && maxTouchPoints > 1 && /Safari/i.test(userAgent);

  return mobileUserAgent || iPadOS;
};

export default function Attendance() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [activeFilter, setActiveFilter] = useState("Semua");
  const [monthLabel, setMonthLabel] = useState("");
  const [chartData, setChartData] = useState<Array<{ name: string; value: number; color: string }>>([]);
  const [historyData, setHistoryData] = useState<AttendanceHistoryItem[]>([]);
  const [todayData, setTodayData] = useState<AttendanceToday>({ checkIn: "--:--", checkOut: "--:--", status: "Belum Check-in" });
  const [gpsInfo, setGpsInfo] = useState<GpsInfo | null>(null);
  const [gpsPolicy, setGpsPolicy] = useState<GpsPolicy | null>(null);
  const [attendanceRules, setAttendanceRules] = useState({
    risetMinWeeklyHours: 4,
    risetTargetWeeklyHours: 6,
    magangMinCheckoutHours: 8,
    earlyCheckoutWarning: true,
    autoCheckoutEnabled: true,
    autoCheckoutTime: "22:00",
    excludeHolidaysFromWorkdays: true,
    holidays: [] as HolidayItem[]
  });
  const [weeklyAttendance, setWeeklyAttendance] = useState<WeeklyAttendanceSummary>({
    currentHours: 0,
    targetHours: 6,
    minHours: 4,
    remainingHours: 6,
    pct: 0,
    meetsTarget: false,
    meetsMin: false
  });
  const [todayHoliday, setTodayHoliday] = useState<HolidayItem | null>(null);
  const [studentType, setStudentType] = useState<string>(String(user?.tipe || ""));
  const isAlumni = isAlumniStudent(user);
  const [lastGpsAccuracy, setLastGpsAccuracy] = useState<number | null>(null);
  const [lastGpsResult, setLastGpsResult] = useState<GpsResult | null>(null);
  const [gpsWarning, setGpsWarning] = useState("");
  const [earlyCheckoutWarning, setEarlyCheckoutWarning] = useState<{
    elapsedHours: number;
    requiredHours: number;
  } | null>(null);
  const [todayPicket, setTodayPicket] = useState<PicketAssignment | null>(null);
  const [picketPhotoFile, setPicketPhotoFile] = useState<File | null>(null);
  const [picketPhotoPreview, setPicketPhotoPreview] = useState("");
  const [picketModalOpen, setPicketModalOpen] = useState(false);
  const [logbookRequiredOpen, setLogbookRequiredOpen] = useState(false);
  const [logbookRequiredMessage, setLogbookRequiredMessage] = useState("Isi logbook hari ini terlebih dahulu sebelum check-out.");
  const [checkingLogbook, setCheckingLogbook] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [isDesktopAttendanceBlocked, setIsDesktopAttendanceBlocked] = useState(false);

  const loadAttendance = async () => {
    if (!user?.id) return null;
    try {
      const data = await apiGet<any>(`/attendance?studentId=${encodeURIComponent(user.id)}&_=${Date.now()}`);
      const nextGpsInfo = data.gps || null;
      const nextGpsPolicy = normalizeGpsPolicy(data?.gpsPolicy, nextGpsInfo);
      setMonthLabel(
        data?.month
          ? new Date(`${data.month}-01`).toLocaleDateString("id-ID", { month: "long", year: "numeric" })
          : ""
      );
      setChartData(data.chartData || []);
      const nextHistory = data.history || [];
      setHistoryData(nextHistory);
      setTodayData(normalizeTodayData(data.today, nextHistory));
      setGpsInfo(nextGpsInfo);
      setGpsPolicy(nextGpsPolicy);
      if (data?.student?.tipe || data?.studentType) {
        setStudentType(String(data?.student?.tipe || data?.studentType));
      }
      const weekly = data?.weeklyAttendance || {};
      const weeklyTarget = normalizePositiveNumber(weekly.targetHours, normalizePositiveNumber(data?.attendanceRules?.risetTargetWeeklyHours, 6));
      const weeklyMin = normalizePositiveNumber(weekly.minHours, normalizePositiveNumber(data?.attendanceRules?.risetMinWeeklyHours, 4));
      const weeklyCurrent = normalizeNumber(weekly.currentHours, 0);
      setWeeklyAttendance({
        currentHours: weeklyCurrent,
        targetHours: weeklyTarget,
        minHours: weeklyMin,
        remainingHours: Math.max(0, normalizeNumber(weekly.remainingHours, weeklyTarget - weeklyCurrent)),
        pct: Math.min(100, Math.max(0, normalizeNumber(weekly.pct, weeklyTarget > 0 ? Math.round((weeklyCurrent / weeklyTarget) * 100) : 0))),
        meetsTarget: Boolean(weekly.meetsTarget ?? (weeklyTarget > 0 && weeklyCurrent >= weeklyTarget)),
        meetsMin: Boolean(weekly.meetsMin ?? (weeklyMin > 0 && weeklyCurrent >= weeklyMin))
      });
      const rawPicket = data?.picketToday ?? data?.todayPicket ?? data?.picketAssignment ?? data?.picket;
      if (rawPicket !== undefined) {
        setTodayPicket(mapPicketTodayAssignment(rawPicket));
      }
      if (data?.attendanceRules) {
        const holidays = normalizeHolidays(data.attendanceRules.holidays || data.holidays);
        const holidayFromResponse =
          typeof data.todayHoliday === "string"
            ? { date: getJakartaDateKey(), name: data.todayHoliday, type: "system", active: true }
            : normalizeHolidays(data.todayHoliday ? [data.todayHoliday] : [])
              .find((holiday) => holiday.active !== false) || null;
        setAttendanceRules({
          risetMinWeeklyHours: Number(data.attendanceRules.risetMinWeeklyHours) || 4,
          risetTargetWeeklyHours: Number(data.attendanceRules.risetTargetWeeklyHours) || 6,
          magangMinCheckoutHours: Number(data.attendanceRules.magangMinCheckoutHours) || 8,
          earlyCheckoutWarning: Boolean(data.attendanceRules.earlyCheckoutWarning ?? true),
          autoCheckoutEnabled: Boolean(data.attendanceRules.autoCheckoutEnabled ?? true),
          autoCheckoutTime: String(data.attendanceRules.autoCheckoutTime || "22:00"),
          excludeHolidaysFromWorkdays: Boolean(data.attendanceRules.excludeHolidaysFromWorkdays ?? true),
          holidays
        });
        setTodayHoliday(holidayFromResponse || findHolidayForDate(holidays));
      }
      setError("");
      return nextGpsPolicy;
    } catch (err: any) {
      setError(err?.message || "Gagal memuat data kehadiran");
      return null;
    }
  };

  useEffect(() => {
    loadAttendance();
  }, [user?.id]);

  useEffect(() => {
    if (!user?.id) return;

    const refreshOnFocus = () => {
      loadAttendance();
    };

    const refreshOnVisible = () => {
      if (document.visibilityState === "visible") {
        loadAttendance();
      }
    };

    window.addEventListener("focus", refreshOnFocus);
    document.addEventListener("visibilitychange", refreshOnVisible);
    return () => {
      window.removeEventListener("focus", refreshOnFocus);
      document.removeEventListener("visibilitychange", refreshOnVisible);
    };
  }, [user?.id]);

  useEffect(() => {
    if (typeof window === "undefined") return;

    const detectDesktopLikeDevice = () => {
      setIsDesktopAttendanceBlocked(!isMobileAttendanceDevice());
    };

    detectDesktopLikeDevice();
    window.addEventListener("orientationchange", detectDesktopLikeDevice);
    return () => {
      window.removeEventListener("orientationchange", detectDesktopLikeDevice);
    };
  }, []);

  useEffect(() => {
    if (!user?.id) return;
    let active = true;

    const loadSupportingData = async () => {
      try {
        const [settings, profile] = await Promise.all([
          apiGet<any>("/system-settings"),
          apiGet<any>(`/profile/${encodeURIComponent(user.id)}`)
        ]);

        if (!active) return;
        const holidays = normalizeHolidays(settings?.attendanceRules?.holidays || settings?.holidays);
        setAttendanceRules({
          risetMinWeeklyHours: Number(settings?.attendanceRules?.risetMinWeeklyHours) || 4,
          risetTargetWeeklyHours: Number(settings?.attendanceRules?.risetTargetWeeklyHours) || 6,
          magangMinCheckoutHours: Number(settings?.attendanceRules?.magangMinCheckoutHours) || 8,
          earlyCheckoutWarning: Boolean(settings?.attendanceRules?.earlyCheckoutWarning ?? true),
          autoCheckoutEnabled: Boolean(settings?.attendanceRules?.autoCheckoutEnabled ?? true),
          autoCheckoutTime: String(settings?.attendanceRules?.autoCheckoutTime || "22:00"),
          excludeHolidaysFromWorkdays: Boolean(settings?.attendanceRules?.excludeHolidaysFromWorkdays ?? true),
          holidays
        });
        setTodayHoliday((current) => current || findHolidayForDate(holidays));
        if (profile?.tipe) {
          setStudentType(String(profile.tipe));
        }
      } catch {
        // Attendance can still work with defaults if supporting endpoints lag behind.
      }
    };

    loadSupportingData();
    return () => {
      active = false;
    };
  }, [user?.id]);

  useEffect(() => {
    if (!user?.id) return;
    let active = true;

    const loadPicketToday = async () => {
      if (isAlumni) {
        if (active) setTodayPicket(null);
        return;
      }
      try {
        const response = await apiGet<any>(`/picket/today?studentId=${encodeURIComponent(user.id)}&_=${Date.now()}`);
        if (!active) return;
        setTodayPicket(mapPicketTodayAssignment(response));
      } catch {
        if (active) setTodayPicket(null);
      }
    };

    void loadPicketToday();
    return () => {
      active = false;
    };
  }, [user?.id]);

  useEffect(() => {
    return () => {
      if (picketPhotoPreview) URL.revokeObjectURL(picketPhotoPreview);
    };
  }, [picketPhotoPreview]);

  const getCurrentPosition = (policy = gpsPolicy) =>
    new Promise<GeolocationPosition>((resolve, reject) => {
      if (!navigator.geolocation) {
        reject(new Error("Browser tidak mendukung geolocation."));
        return;
      }

      if (!window.isSecureContext) {
        reject(new Error("Geolocation hanya berjalan di HTTPS atau localhost. Buka aplikasi via http://localhost:5173 atau gunakan HTTPS."));
        return;
      }

      navigator.geolocation.getCurrentPosition(resolve, reject, {
        enableHighAccuracy: true,
        timeout: policy?.timeoutMs || DEFAULT_GPS_POLICY.timeoutMs,
        maximumAge: 0
      });
    });

  const getBestCurrentPosition = async (policy = gpsPolicy) => {
    const sampleCount = Math.max(3, policy?.sampleCount || DEFAULT_GPS_POLICY.sampleCount);
    const targetAccuracy = Math.max(20, policy?.maxAccuracyMeters || DEFAULT_GPS_POLICY.maxAccuracyMeters);
    const watchDuration = Math.min(15000, Math.max(10000, (policy?.timeoutMs || DEFAULT_GPS_POLICY.timeoutMs) * 2));
    const samples: GeolocationPosition[] = [];

    if (!navigator.geolocation) {
      throw new Error("Browser tidak mendukung geolocation.");
    }

    if (!window.isSecureContext) {
      throw new Error("Geolocation hanya berjalan di HTTPS atau localhost. Buka aplikasi via http://localhost:5173 atau gunakan HTTPS.");
    }

    return new Promise<GeolocationPosition>((resolve, reject) => {
      let settled = false;
      let watchId: number | null = null;
      let fallbackTimer: number | null = null;
      let finishTimer: number | null = null;

      const cleanup = () => {
        if (watchId != null) navigator.geolocation.clearWatch(watchId);
        if (fallbackTimer != null) window.clearTimeout(fallbackTimer);
        if (finishTimer != null) window.clearTimeout(finishTimer);
      };

      const finish = () => {
        if (settled || samples.length === 0) return;
        settled = true;
        cleanup();
        resolve(samples.reduce((best, current) =>
          current.coords.accuracy < best.coords.accuracy ? current : best
        ));
      };

      finishTimer = window.setTimeout(() => {
        finish();
        if (!settled) {
          settled = true;
          cleanup();
          reject(new Error("Gagal mengambil sample lokasi."));
        }
      }, watchDuration);

      fallbackTimer = window.setTimeout(async () => {
        if (samples.length > 0 || settled) return;
        try {
          const position = await getCurrentPosition(policy);
          samples.push(position);
          if (position.coords.accuracy <= targetAccuracy) {
            finish();
            return;
          }

          if (!settled) {
            settled = true;
            cleanup();
            resolve(position);
          }
        } catch (err) {
          if (!settled) {
            settled = true;
            cleanup();
            reject(err);
          }
        }
      }, Math.max(4000, watchDuration - 1500));

      watchId = navigator.geolocation.watchPosition(
        (position) => {
          if (!Number.isFinite(position.coords.accuracy) || position.coords.accuracy <= 0) {
            return;
          }
          samples.push(position);
          if (samples.length >= sampleCount && position.coords.accuracy <= targetAccuracy) {
            finish();
          }
        },
        (err) => {
          if (samples.length > 0) {
            finish();
            return;
          }
          if (!settled) {
            settled = true;
            cleanup();
            reject(err);
          }
        },
        {
          enableHighAccuracy: true,
          timeout: policy?.timeoutMs || DEFAULT_GPS_POLICY.timeoutMs,
          maximumAge: 0
        }
      );
    });
  };

  const getLocationPermissionState = async (): Promise<"granted" | "denied" | "prompt" | "unknown"> => {
    try {
      if (!navigator.permissions?.query) return "unknown";
      const status = await navigator.permissions.query({ name: "geolocation" as PermissionName });
      return status.state;
    } catch {
      return "unknown";
    }
  };

  const getElapsedCheckoutHours = () => {
    if (!todayData.checkIn || todayData.checkIn === "--:--") return null;
    const parsedTime = parseTimeParts(todayData.checkIn);
    if (!parsedTime) return null;

    const checkInTime = new Date();
    checkInTime.setHours(parsedTime.hours, parsedTime.minutes, 0, 0);
    const diffMs = Date.now() - checkInTime.getTime();
    if (diffMs < 0) return null;
    return diffMs / (1000 * 60 * 60);
  };

  const shouldWarnEarlyCheckout = () => {
    if (todayData.status !== "Berlangsung") return null;
    if (!attendanceRules.earlyCheckoutWarning) return null;
    if (String(studentType).toLowerCase() !== "magang") return null;

    const elapsedHours = getElapsedCheckoutHours();
    const requiredHours = Number(attendanceRules.magangMinCheckoutHours) || 8;
    if (elapsedHours == null || elapsedHours >= requiredHours) return null;

    return { elapsedHours, requiredHours };
  };

  const hasLogbookToday = async () => {
    if (!user?.id) return false;
    const todayKey = getJakartaDateKey();
    const entries = await apiGet<Array<any>>(`/logbooks?_=${Date.now()}`);
    return (entries || []).some((entry) => {
      // date is returned as 'YYYY-MM-DD' string from backend (TO_CHAR)
      const entryDate = String(entry?.date || "").slice(0, 10);
      return entryDate === todayKey;
    });
  };

  const redirectToTodayLogbook = () => {
    const todayKey = getJakartaDateKey();
    navigate(`/logbook/new?date=${encodeURIComponent(todayKey)}&fromCheckout=1`);
  };

  const pickPicketPhoto = async (file?: File | null) => {
    if (!file) return;
    const validation = validatePicketPhoto(file);
    if (validation) {
      setError(validation);
      return;
    }
    try {
      await ensurePicketPhotoPreviewable(file);
    } catch (err: any) {
      setError(err?.message || "Foto tidak dapat dibuka. Pastikan file benar-benar JPG, PNG, atau WEBP.");
      return;
    }
    if (picketPhotoPreview) URL.revokeObjectURL(picketPhotoPreview);
    setPicketPhotoFile(file);
    setPicketPhotoPreview(URL.createObjectURL(file));
    setError("");
  };

  const shouldRequirePicketPhotoBeforeCheckout = () => {
    if (isAlumni) return false;
    if (todayData.status !== "Berlangsung") return false;
    return shouldRequirePicketPhoto(todayPicket);
  };

  const submitPicketPhotoIfNeeded = async () => {
    if (!shouldRequirePicketPhotoBeforeCheckout()) return;
    if (!todayPicket || !picketPhotoFile) {
      setPicketModalOpen(true);
      throw new Error("Foto piket wajib diunggah sebelum check-out.");
    }

    const result = await apiPost<any>("/picket/submissions", {
      scheduleId: todayPicket.scheduleId || todayPicket.id,
      assignmentId: todayPicket.assignmentId || todayPicket.id,
      studentId: user?.id,
      date: todayPicket.date,
      taskId: todayPicket.taskId,
      photoFileName: picketPhotoFile.name,
      photoDataUrl: await fileToDataUrl(picketPhotoFile),
      source: "upload",
    });
    const submission = mapPicketSubmissionResult(result);

    setTodayPicket((prev) => prev ? {
      ...prev,
      submitted: true,
      submissionId: submission.id || prev.submissionId,
      submissionStatus: submission.status || prev.submissionStatus || "Terkirim",
      status: submission.assignmentStatus || "Selesai",
      photoUrl: submission.photoUrl || prev.photoUrl,
      submittedAt: submission.submittedAt || prev.submittedAt || new Date().toISOString(),
    } : prev);
    setPicketModalOpen(false);
    window.dispatchEvent(new Event("stas:access-lock-refresh"));
    window.dispatchEvent(new Event("stas:picket-refresh"));
  };

  const handleAttendanceAction = async (forceEarlyCheckout = false) => {
    if (!user?.id || submitting || checkingLogbook) return;
    if (isAlumni) {
      setError("Mahasiswa berstatus Alumni tidak memiliki kewajiban absensi.");
      return;
    }
    const holidayToday = attendanceRules.excludeHolidaysFromWorkdays
      ? todayHoliday || findHolidayForDate(attendanceRules.holidays, getJakartaDateKey())
      : null;
    if (holidayToday && todayData.status !== "Berlangsung") {
      setGpsWarning("");
      setError(`Hari ini libur (${holidayToday.name}). Absensi tidak wajib dan tidak dihitung tidak hadir.`);
      return;
    }
    if (isDesktopAttendanceBlocked) {
      setGpsWarning("");
      setError("Absensi GPS mahasiswa harus dilakukan dari HP/perangkat mobile dengan Precise Location atau High Accuracy aktif.");
      return;
    }
    if (todayData.status !== "Berlangsung" && isAfterCheckInCutoff()) {
      setGpsWarning("");
      setError("Check-in tidak diizinkan setelah pukul 22.00 WIB. Silakan coba besok.");
      return;
    }
    if (todayData.status === "Berlangsung") {
      try {
        setCheckingLogbook(true);
        const logbookReady = await hasLogbookToday();
        if (!logbookReady) {
          setEarlyCheckoutWarning(null);
          redirectToTodayLogbook();
          return;
        }
      } catch (err: any) {
        setError(err?.message || "Gagal mengecek logbook hari ini. Coba lagi sebelum check-out.");
        return;
      } finally {
        setCheckingLogbook(false);
      }
    }
    if (shouldRequirePicketPhotoBeforeCheckout() && !picketPhotoFile) {
      setPicketModalOpen(true);
      setError("");
      return;
    }
    const earlyWarning = shouldWarnEarlyCheckout();
    if (earlyWarning && !forceEarlyCheckout) {
      setEarlyCheckoutWarning(earlyWarning);
      return;
    }

    // Capture intent before async calls that may update todayData state
    const isCheckout = todayData.status === "Berlangsung";

    setSubmitting(true);
    setError("");
    setGpsWarning("");
    setLastGpsResult(null);
    setEarlyCheckoutWarning(null);

    try {
      const latestGpsPolicy = await loadAttendance();
      const effectiveGpsPolicy = latestGpsPolicy || gpsPolicy;
      const permissionState = await getLocationPermissionState();
      if (permissionState === "denied") {
        throw new Error("Izin lokasi sedang diblokir browser. Buka ikon gembok di address bar > Site settings > Location > Allow, lalu refresh halaman.");
      }

      const position = await getBestCurrentPosition(effectiveGpsPolicy);
      const accuracy = Number(position.coords.accuracy);
      setLastGpsAccuracy(Number.isFinite(accuracy) ? accuracy : null);

      if (Number.isFinite(accuracy) && accuracy >= EXTREME_GPS_ACCURACY_THRESHOLD) {
        setGpsWarning("");
        throw new Error(`Lokasi perangkat masih terlalu kasar (${Math.round(accuracy)}m). Aktifkan precise location / high accuracy, matikan mode hemat baterai, lalu coba lagi di area terbuka.`);
      }

      if (
        Number.isFinite(accuracy) &&
        effectiveGpsPolicy?.maxAccuracyMeters &&
        accuracy > effectiveGpsPolicy.maxAccuracyMeters
      ) {
        setGpsWarning(`Akurasi GPS perangkat ${Math.round(accuracy)}m. Koordinat tetap dikirim dan keputusan valid/tidak valid mengikuti hasil validasi server.`);
      }

      const payload = {
        studentId: user.id,
        latitude: position.coords.latitude,
        longitude: position.coords.longitude,
        accuracy,
        forceEarlyCheckout,
        earlyCheckoutAcknowledged: forceEarlyCheckout
      };

      if (isCheckout) {
        await submitPicketPhotoIfNeeded();
        const result = await apiPost<any>("/attendance/check-out", payload);
        setLastGpsResult({
          accuracyMeters: normalizeNumber(result?.accuracyMeters, accuracy),
          maxAccuracyMeters: result?.maxAccuracyMeters ?? effectiveGpsPolicy?.maxAccuracyMeters ?? null,
          distanceMeters: result?.distanceMeters ?? null,
          allowedRadiusMeters: result?.allowedRadiusMeters ?? effectiveGpsPolicy?.radiusMeters ?? null
        });
      } else {
        const result = await apiPost<any>("/attendance/check-in", payload);
        setLastGpsResult({
          accuracyMeters: normalizeNumber(result?.accuracyMeters, accuracy),
          maxAccuracyMeters: result?.maxAccuracyMeters ?? effectiveGpsPolicy?.maxAccuracyMeters ?? null,
          distanceMeters: result?.distanceMeters ?? null,
          allowedRadiusMeters: result?.allowedRadiusMeters ?? effectiveGpsPolicy?.radiusMeters ?? null
        });
      }

      await loadAttendance();
    } catch (err: any) {
      const errorBody = err instanceof ApiError ? err.body : null;
      if (errorBody?.logbookRequired) {
        setEarlyCheckoutWarning(null);
        redirectToTodayLogbook();
        setError("");
        return;
      }

      if (errorBody?.earlyCheckoutWarning) {
        setEarlyCheckoutWarning({
          elapsedHours: Number(errorBody.durationHours) || 0,
          requiredHours: Number(errorBody.requiredHours) || attendanceRules.magangMinCheckoutHours
        });
        setError("");
        return;
      }

      if (errorBody?.picketRequired) {
        const rawPicket = errorBody.assignment || errorBody.picketAssignment || null;
        if (rawPicket) {
          const nextPicket = mapPicketAssignment(rawPicket);
          setTodayPicket(nextPicket);
          if (!shouldRequirePicketPhoto(nextPicket)) {
            setPicketModalOpen(false);
            setError(nextPicket.autoCompletedByWfh
              ? "Piket otomatis selesai karena WFH yang disetujui. Silakan coba check-out kembali."
              : "Kewajiban foto piket sudah terpenuhi. Silakan coba check-out kembali.");
            return;
          }
        }
        setPicketModalOpen(true);
        setError("");
        return;
      }

      if (errorBody?.reason) {
        setLastGpsResult({
          reason: errorBody.reason,
          accuracyMeters: errorBody.accuracyMeters ?? null,
          maxAccuracyMeters: errorBody.maxAccuracyMeters ?? gpsPolicy?.maxAccuracyMeters ?? null,
          distanceMeters: errorBody.distanceMeters ?? null,
          allowedRadiusMeters: errorBody.allowedRadiusMeters ?? gpsPolicy?.radiusMeters ?? null
        });
        setError(errorBody.message || err?.message || "Validasi GPS ditolak server.");
        return;
      }

      if (err?.code === 1) {
        setError("Izin lokasi ditolak. Klik ikon gembok di address bar, ubah Location menjadi Allow, lalu refresh halaman.");
      } else if (err?.code === 2) {
        setError("Lokasi tidak tersedia. Pastikan GPS/lokasi device aktif, lalu coba lagi.");
      } else if (err?.code === 3) {
        setError("Permintaan lokasi timeout. Coba lagi di area dengan sinyal GPS lebih stabil.");
      } else {
        setError(err?.message || "Gagal memproses absensi GPS");
      }
    } finally {
      setSubmitting(false);
    }
  };

  const totalDays = chartData.reduce((acc, curr) => acc + curr.value, 0);
  const hadirPercentage = totalDays > 0
    ? Math.round(((chartData.find(d => d.name === "Hadir")?.value || 0) / totalDays) * 100)
    : 0;

  const filters = ["Semua", "Hadir", "Tidak Hadir", "Cuti", "Libur"];

  const filteredData = historyData.filter((row) => {
    if (activeFilter === "Semua") return true;
    if (activeFilter === "Hadir") return row.status === "Hadir";
    if (activeFilter === "Tidak Hadir") return row.status === "Tidak Hadir";
    if (activeFilter === "Cuti") return row.status === "Cuti";
    if (activeFilter === "Libur") return row.status === "Libur";
    return true;
  });

  const getBadgeStyle = (colorName: string) => {
    switch (colorName) {
      case "green":
        return "text-success bg-success/10 border-success/20";
      case "red":
        return "text-destructive bg-destructive/10 border-destructive/20";
      case "amber":
        return "text-accent bg-accent/10 border-accent/20";
      case "rose":
        return "text-rose-700 bg-rose-50 border-rose-200";
      case "sky":
        return "text-sky-700 bg-sky-50 border-sky-200";
      case "gray":
        return "text-muted-foreground bg-muted border-border";
      default:
        return "text-muted-foreground bg-muted border-border";
    }
  };

  const isSystemAutoCheckout = (item?: { autoCheckout?: boolean; checkoutSource?: string | null }) =>
    Boolean(item?.autoCheckout || item?.checkoutSource === "SYSTEM_AUTO");

  const openGpsCoordinates = () => {
    const latitude = gpsPolicy?.targetLatitude ?? gpsInfo?.latitude;
    const longitude = gpsPolicy?.targetLongitude ?? gpsInfo?.longitude;
    if (latitude == null || longitude == null) return;
    const url = `https://www.google.com/maps?q=${latitude},${longitude}`;
    window.open(url, "_blank", "noopener,noreferrer");
  };

  const targetGps = gpsPolicy
    ? {
      latitude: gpsPolicy.targetLatitude,
      longitude: gpsPolicy.targetLongitude,
      radius: gpsPolicy.radiusMeters
    }
    : gpsInfo;
  const currentHoliday = attendanceRules.excludeHolidaysFromWorkdays
    ? todayHoliday || findHolidayForDate(attendanceRules.holidays)
    : null;
  const holidayCheckInBlocked = Boolean(currentHoliday && todayData.status !== "Berlangsung");
  const isRisetStudent = String(studentType || "").trim().toLowerCase() === "riset";
  const weeklyRemainingTarget = Math.max(0, weeklyAttendance.targetHours - weeklyAttendance.currentHours);
  const weeklyRemainingMin = Math.max(0, weeklyAttendance.minHours - weeklyAttendance.currentHours);
  const weeklyStatusText = weeklyAttendance.targetHours <= 0
    ? "Target mingguan belum diatur"
    : weeklyRemainingTarget <= 0
      ? `Target ${formatHourValue(weeklyAttendance.targetHours)} jam sudah terpenuhi`
      : weeklyAttendance.minHours > 0 && weeklyRemainingMin <= 0
        ? `Sudah aman minimal, kurang ${formatHourValue(weeklyRemainingTarget)} jam ke target`
        : weeklyAttendance.minHours > 0
          ? `Kurang ${formatHourValue(weeklyRemainingMin)} jam dari minimal`
          : `Kurang ${formatHourValue(weeklyRemainingTarget)} jam ke target`;
  const weeklyStatusClass = weeklyRemainingTarget <= 0
    ? "border-emerald-200 bg-emerald-50 text-emerald-700"
    : weeklyRemainingMin <= 0
      ? "border-sky-200 bg-sky-50 text-sky-700"
      : "border-amber-200 bg-amber-50 text-amber-700";
  const weeklyProgressClass = weeklyRemainingTarget <= 0
    ? "bg-emerald-500"
    : weeklyRemainingMin <= 0
      ? "bg-sky-500"
      : "bg-amber-500";

  return (
    <Layout title="Kehadiran (GPS)">
      <div className="flex flex-col gap-6 w-full mx-auto pb-4">
        {earlyCheckoutWarning && (
          <div className="fixed inset-0 z-[500] flex items-center justify-center bg-black/50 px-4">
            <div className="w-full max-w-[420px] rounded-[16px] border border-amber-200 bg-white p-5 shadow-2xl">
              <div className="mb-4 flex items-start gap-3">
                <div className="mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-[12px] bg-amber-100 text-amber-600">
                  <AlertTriangle size={20} />
                </div>
                <div>
                  <h3 className="text-base font-black text-foreground">Check-out kurang dari batas jam</h3>
                  <p className="mt-1 text-sm leading-relaxed text-muted-foreground">
                    Durasi hadir Anda baru {earlyCheckoutWarning.elapsedHours.toFixed(1)} jam. Batas mahasiswa magang adalah {earlyCheckoutWarning.requiredHours} jam.
                  </p>
                </div>
              </div>
              <p className="mb-5 rounded-[12px] border border-amber-200 bg-amber-50 px-3 py-2 text-xs font-semibold text-amber-700">
                Jika tetap check-out, admin akan menerima notifikasi untuk ditinjau.
              </p>
              <div className="flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setEarlyCheckoutWarning(null)}
                  className="h-10 rounded-[10px] border border-border px-4 text-sm font-bold text-muted-foreground hover:bg-slate-50"
                >
                  Batal
                </button>
                <button
                  type="button"
                  onClick={() => handleAttendanceAction(true)}
                  className="h-10 rounded-[10px] bg-amber-500 px-4 text-sm font-black text-white hover:bg-amber-600"
                >
                  Tetap Check-out
                </button>
              </div>
            </div>
          </div>
        )}
        {picketModalOpen && todayPicket && !isAlumni && shouldRequirePicketPhoto(todayPicket) && (
          <div className="fixed inset-0 z-[510] flex items-center justify-center bg-black/50 px-4">
            <div className="w-full max-w-[460px] rounded-[16px] border border-emerald-200 bg-white p-5 shadow-2xl">
              <div className="mb-4">
                <h3 className="text-base font-black text-foreground">Foto Piket Diperlukan</h3>
                <p className="mt-1 text-sm leading-relaxed text-muted-foreground">
                  Anda dijadwalkan piket hari ini: <span className="font-black text-foreground">{todayPicket.taskName}</span>. Unggah foto bukti piket sebelum check-out.
                </p>
              </div>
              <label className="block cursor-pointer rounded-[14px] border border-dashed border-emerald-300 bg-emerald-50 p-4 text-center hover:bg-emerald-100">
                {picketPhotoPreview ? (
                  <img src={picketPhotoPreview} alt="Preview foto piket" className="mx-auto h-48 w-full rounded-[12px] object-cover" />
                ) : (
                  <div className="py-8">
                    <p className="text-sm font-black text-emerald-700">Pilih foto piket</p>
                    <p className="mt-1 text-xs text-emerald-700/80">JPG, PNG, atau WEBP maksimal 5 MB.</p>
                  </div>
                )}
                <input
                  type="file"
                  accept="image/jpeg,image/png,image/webp"
                  className="hidden"
                  onChange={(event) => {
                    void pickPicketPhoto(event.target.files?.[0] || null);
                    event.currentTarget.value = "";
                  }}
                />
              </label>
              {picketPhotoFile && (
                <p className="mt-2 text-xs font-semibold text-emerald-700">Foto dipilih: {picketPhotoFile.name}</p>
              )}
              <div className="mt-5 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
                <button
                  type="button"
                  onClick={() => setPicketModalOpen(false)}
                  className="h-10 rounded-[10px] border border-border px-4 text-sm font-bold text-muted-foreground hover:bg-slate-50"
                >
                  Batal
                </button>
                <button
                  type="button"
                  disabled={!picketPhotoFile}
                  onClick={() => handleAttendanceAction()}
                  className="h-10 rounded-[10px] bg-[#0AB600] px-4 text-sm font-black text-white hover:bg-[#099800] disabled:cursor-not-allowed disabled:opacity-60"
                >
                  Lanjut Check-out
                </button>
              </div>
            </div>
          </div>
        )}
        {logbookRequiredOpen && (
          <div className="fixed inset-0 z-[520] flex items-center justify-center bg-black/50 px-4">
            <div className="w-full max-w-[430px] rounded-[16px] border border-indigo-200 bg-white p-5 shadow-2xl">
              <div className="mb-4 flex items-start gap-3">
                <div className="mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-[12px] bg-indigo-100 text-indigo-600">
                  <AlertTriangle size={20} />
                </div>
                <div>
                  <h3 className="text-base font-black text-foreground">Logbook Diperlukan</h3>
                  <p className="mt-1 text-sm leading-relaxed text-muted-foreground">
                    {logbookRequiredMessage}
                  </p>
                </div>
              </div>
              <p className="mb-5 rounded-[12px] border border-indigo-200 bg-indigo-50 px-3 py-2 text-xs font-semibold text-indigo-700">
                Setelah logbook tersimpan, kembali ke halaman Kehadiran lalu tekan check-out lagi.
              </p>
              <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
                <button
                  type="button"
                  onClick={() => setLogbookRequiredOpen(false)}
                  className="h-10 rounded-[10px] border border-border px-4 text-sm font-bold text-muted-foreground hover:bg-slate-50"
                >
                  Nanti
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setLogbookRequiredOpen(false);
                    redirectToTodayLogbook();
                  }}
                  className="h-10 rounded-[10px] bg-indigo-600 px-4 text-sm font-black text-white hover:bg-indigo-700"
                >
                  Isi Logbook
                </button>
              </div>
            </div>
          </div>
        )}
        {error && (
          <div className="px-4 py-3 rounded-xl border border-red-200 bg-red-50 text-sm font-semibold text-red-600">
            {error}
          </div>
        )}
        {currentHoliday && (
          <div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-semibold text-rose-700">
            Hari ini tanggal merah: {currentHoliday.name}. Hari ini tidak dihitung sebagai kewajiban hadir.
            {todayData.status === "Berlangsung" ? " Anda tetap bisa check-out untuk menutup sesi yang sudah berjalan." : ""}
          </div>
        )}
        {todayPicket && !isAlumni && (
          <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-semibold text-emerald-700">
            <span>Jadwal piket hari ini: {todayPicket.taskName}. </span>
            {todayPicket.autoCompletedByWfh ? (
              <>
                <span className="mr-1 inline-flex rounded-full border border-indigo-200 bg-indigo-50 px-2 py-0.5 text-[10px] font-black text-indigo-700">Selesai Otomatis — WFH</span>
                <span>Piket otomatis selesai karena WFH yang disetujui.</span>
              </>
            ) : String(todayPicket.leaveStatus || "").toLowerCase() === "disetujui" ? (
              <span>Izin piket sudah disetujui; foto piket tidak diperlukan sebelum check-out.</span>
            ) : hasPicketPhotoSubmission(todayPicket) ? (
              <span>Foto piket sudah dikirim.</span>
            ) : (
              <span>Foto bukti piket akan diminta sebelum check-out.</span>
            )}
          </div>
        )}

        {isRisetStudent && !isAlumni && (
          <div className={`rounded-[14px] border px-4 py-4 shadow-sm md:px-5 ${weeklyStatusClass}`}>
            <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
              <div className="flex items-start gap-3">
                <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-[12px] bg-white/70">
                  <Clock size={22} />
                </div>
                <div>
                  <p className="text-xs font-black uppercase tracking-[0.16em]">Jam Riset Minggu Ini</p>
                  <h2 className="mt-1 text-2xl font-black text-foreground">
                    {formatHourValue(weeklyAttendance.currentHours)}
                    <span className="text-base font-black text-muted-foreground">/{formatHourValue(weeklyAttendance.targetHours)} jam</span>
                  </h2>
                  <p className="mt-1 text-sm font-bold">{weeklyStatusText}</p>
                </div>
              </div>
              <div className="min-w-[180px]">
                <div className="mb-1 flex items-center justify-between text-xs font-black">
                  <span>Progress</span>
                  <span>{weeklyAttendance.pct}%</span>
                </div>
                <div className="h-2 rounded-full bg-white/70">
                  <div className={`h-2 rounded-full ${weeklyProgressClass}`} style={{ width: `${weeklyAttendance.pct}%` }} />
                </div>
                <p className="mt-2 text-[11px] font-semibold opacity-80">Minimal {formatHourValue(weeklyAttendance.minHours)} jam, target {formatHourValue(weeklyAttendance.targetHours)} jam per minggu.</p>
              </div>
            </div>
          </div>
        )}

        {/* Top Section: 2 Columns */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">

          {/* Left Column: Dark GPS Card */}
          <div className="bg-gradient-to-br from-slate-900 to-slate-950 rounded-[14px] p-6 text-white shadow-md relative overflow-hidden flex flex-col justify-between h-full border border-slate-800 min-h-[300px]">
            <div className="absolute inset-0 opacity-10" style={{ backgroundImage: 'radial-gradient(circle at 80% 20%, white 1px, transparent 1px)', backgroundSize: '12px 12px' }}></div>

            <div className="relative z-10 flex flex-col gap-5 h-full">
              {/* Header */}
              <div className="flex items-start justify-between">
                <div>
                  <p className="text-sm text-white/70 mb-1">Hari ini</p>
                  <h2 className="text-xl font-bold">Kehadiran Hari Ini</h2>
                </div>
              </div>

              {/* Time Boxes */}
              <div className="grid grid-cols-2 gap-4 mt-auto">
                <div className="bg-white/10 border border-white/10 rounded-[12px] p-4 backdrop-blur-sm">
                  <div className="flex items-center gap-2 text-white/70 mb-2">
                    <LogIn size={16} />
                    <span className="text-sm font-medium">Waktu Check-In</span>
                  </div>
                  <p className="text-3xl font-bold font-mono tracking-tight">{todayData.checkIn}</p>
                </div>
                <div className="bg-white/5 border border-white/10 rounded-[12px] p-4 backdrop-blur-sm">
                  <div className="flex items-center gap-2 text-white/50 mb-2">
                    <LogOut size={16} />
                    <span className="text-sm font-medium">Waktu Check-Out</span>
                  </div>
                  <p className="text-3xl font-bold font-mono tracking-tight text-white/50">{todayData.checkOut}</p>
                </div>
              </div>

              {/* Action */}
              <div className="flex items-center justify-between gap-6 pt-2">
                {isAlumni ? (
                  <div className="w-full bg-emerald-500/15 border border-emerald-500/30 rounded-[12px] p-4 text-emerald-100 flex items-start gap-3">
                    <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-emerald-500/20 text-emerald-300">
                      <Clock size={18} />
                    </div>
                    <div>
                      <p className="font-bold text-sm text-emerald-300">Status Alumni — Bebas Presensi</p>
                      <p className="text-xs text-white/80 mt-1 leading-relaxed">
                        Anda telah menyelesaikan masa riset/magang. Presensi GPS harian dan target jam tidak lagi berlaku untuk Anda. Riwayat di bawah ini adalah arsip kehadiran Anda.
                      </p>
                    </div>
                  </div>
                ) : (
                  <>
                    <div className="flex-1">
                      <div className="flex items-center justify-between text-xs text-white/70 mb-2">
                        <span>Status: {currentHoliday && todayData.status !== "Berlangsung" ? "Libur" : todayData.status}</span>
                        {targetGps && <span>Radius: {targetGps.radius} m</span>}
                      </div>
                      {attendanceRules.autoCheckoutEnabled && (
                        <p className="text-[11px] text-white/60 mb-2">
                          Sistem akan otomatis checkout mahasiswa yang masih aktif pada pukul {attendanceRules.autoCheckoutTime} WIB.
                        </p>
                      )}
                      {isSystemAutoCheckout(todayData) && todayData.status === "Selesai" && (
                        <div
                          title="Checkout dilakukan otomatis oleh sistem karena belum checkout manual sampai batas waktu."
                          className="mb-2 inline-flex rounded-full border border-sky-300/30 bg-sky-400/10 px-2.5 py-1 text-[10px] font-black uppercase tracking-[0.14em] text-sky-200"
                        >
                          Auto checkout sistem
                        </div>
                      )}
                      {targetGps && (
                        <button
                          onClick={openGpsCoordinates}
                          type="button"
                          className="text-[11px] text-white/80 hover:text-white underline underline-offset-2 mb-2"
                        >
                          Lihat titik absensi ({targetGps.latitude.toFixed(5)}, {targetGps.longitude.toFixed(5)})
                        </button>
                      )}
                      {lastGpsAccuracy != null && (
                        <p className="text-[11px] text-white/70 mb-2">
                          Akurasi GPS perangkat: {Math.round(lastGpsAccuracy)} m
                        </p>
                      )}
                      {lastGpsResult?.distanceMeters != null && (
                        <p className="text-[11px] text-white/70 mb-2">
                          Jarak terakhir: {Math.round(lastGpsResult.distanceMeters)} m
                          {lastGpsResult.allowedRadiusMeters != null ? ` dari radius ${Math.round(lastGpsResult.allowedRadiusMeters)} m` : ""}
                        </p>
                      )}
                      {gpsWarning && (
                        <p className="text-[11px] text-amber-200 mb-2">
                          {gpsWarning}
                        </p>
                      )}
                      {isDesktopAttendanceBlocked && (
                        <p className="text-[11px] text-amber-200 mb-2">
                          Perangkat ini terdeteksi sebagai desktop/laptop. Absensi GPS mahasiswa harus dilakukan dari HP agar lokasi presisi bisa terbaca.
                        </p>
                      )}
                      <div className="w-full bg-white/10 rounded-full h-1.5">
                        <div
                          className="bg-success h-1.5 rounded-full"
                          style={{ width: todayData.status === "Selesai" ? "100%" : todayData.status === "Berlangsung" ? "50%" : "0%" }}
                        ></div>
                      </div>
                    </div>
                    <button
                      onClick={() => handleAttendanceAction()}
                      disabled={submitting || checkingLogbook || todayData.status === "Selesai" || isDesktopAttendanceBlocked || holidayCheckInBlocked}
                      className="bg-primary hover:bg-primary-light disabled:bg-slate-500 disabled:cursor-not-allowed text-white px-6 py-3 rounded-[12px] font-bold shadow-lg shadow-primary/20 transition-all flex items-center justify-center gap-2 whitespace-nowrap"
                    >
                      {todayData.status === "Berlangsung" ? <LogOut size={18} /> : <MapPin size={18} />}
                      {todayData.status === "Selesai"
                        ? "Absensi Selesai"
                        : holidayCheckInBlocked
                          ? "Hari Ini Libur"
                        : isDesktopAttendanceBlocked
                          ? "Gunakan HP untuk Absensi"
                          : checkingLogbook
                            ? "Mengecek Logbook..."
                            : submitting
                            ? "Memproses..."
                            : todayData.status === "Berlangsung"
                              ? "Check-Out Sekarang"
                              : "Check-In Sekarang"}
                    </button>
                  </>
                )}
              </div>
            </div>
          </div>

          {/* Right Column: Attendance Donut Chart */}
          <div className="bg-card border border-border rounded-[14px] p-6 shadow-sm flex flex-col h-full min-h-[300px]">
            <h2 className="text-lg font-bold text-foreground mb-4">Rekap Kehadiran {monthLabel ? monthLabel.charAt(0).toUpperCase() + monthLabel.slice(1) : "Bulan Ini"}</h2>

            <div className="flex-1 flex flex-col sm:flex-row items-center gap-8">
              {/* Chart */}
              <div className="relative w-48 h-48 shrink-0">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={chartData}
                      cx="50%"
                      cy="50%"
                      innerRadius={65}
                      outerRadius={85}
                      paddingAngle={2}
                      dataKey="value"
                      stroke="none"
                    >
                      {chartData.map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={entry.color} />
                      ))}
                    </Pie>
                    <Tooltip
                      formatter={(value: number) => [`${value} Hari`, "Total"]}
                      contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }}
                    />
                  </PieChart>
                </ResponsiveContainer>

                {/* Center Text */}
                <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
                  <span className="text-3xl font-bold text-foreground">{hadirPercentage}%</span>
                  <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Hadir</span>
                </div>
              </div>

              {/* Legend */}
              <div className="flex-1 flex flex-col gap-3 w-full">
                {chartData.map((item, idx) => (
                  <div key={idx} className="flex items-center justify-between p-2 rounded-lg hover:bg-muted/30 transition-colors">
                    <div className="flex items-center gap-3">
                      <div className="w-3 h-3 rounded-full" style={{ backgroundColor: item.color }}></div>
                      <span className="text-sm font-medium text-foreground">{item.name}</span>
                    </div>
                    <span className="text-sm font-bold text-foreground">{item.value} <span className="text-xs font-medium text-muted-foreground ml-1">Hari</span></span>
                  </div>
                ))}
              </div>
            </div>
          </div>

        </div>

        {/* Bottom Section: History Table */}
        <div className="bg-card border border-border rounded-[14px] shadow-sm flex flex-col overflow-hidden">
          {/* Table Header & Filters */}
          <div className="p-5 border-b border-border flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <h2 className="text-lg font-bold text-foreground flex items-center gap-2">
              <Clock size={20} className="text-primary" /> Riwayat Kehadiran
            </h2>

            <div className="flex items-center gap-2 overflow-x-auto pb-1 sm:pb-0 hide-scrollbar">
              {filters.map((filter) => (
                <button
                  key={filter}
                  onClick={() => setActiveFilter(filter)}
                  className={`px-4 py-1.5 rounded-full text-sm font-medium transition-colors whitespace-nowrap border ${activeFilter === filter
                      ? "bg-primary text-white border-primary"
                      : "bg-background text-muted-foreground border-border hover:bg-muted"
                    }`}
                >
                  {filter}
                </button>
              ))}
            </div>
          </div>

          {/* Table */}
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm border-collapse min-w-[800px]">
              <thead>
                <tr className="bg-muted/30 border-b border-border">
                  <th className="px-6 py-4 font-semibold text-muted-foreground whitespace-nowrap">Tanggal</th>
                  <th className="px-6 py-4 font-semibold text-muted-foreground whitespace-nowrap">Check-In</th>
                  <th className="px-6 py-4 font-semibold text-muted-foreground whitespace-nowrap">Check-Out</th>
                  <th className="px-6 py-4 font-semibold text-muted-foreground whitespace-nowrap">Durasi</th>
                  <th className="px-6 py-4 font-semibold text-muted-foreground whitespace-nowrap text-right">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {filteredData.map((row, idx) => (
                  <tr key={idx} className="hover:bg-muted/30 transition-colors group">
                    <td className="px-6 py-4 font-medium text-foreground whitespace-nowrap">{row.date}</td>
                    <td className="px-6 py-4 text-muted-foreground whitespace-nowrap">
                      {row.in === "-" ? "-" : <span className="font-mono text-sm bg-background border border-border px-2 py-1 rounded-md">{row.in}</span>}
                    </td>
                    <td className="px-6 py-4 text-muted-foreground whitespace-nowrap">
                      {row.out === "-" ? "-" : (
                        <div className="flex flex-col items-start gap-1">
                          <span className="font-mono text-sm bg-background border border-border px-2 py-1 rounded-md">{row.out}</span>
                          {isSystemAutoCheckout(row) && (
                            <span
                              title="Checkout dilakukan otomatis oleh sistem karena belum checkout manual sampai batas waktu."
                              className="rounded-full border border-sky-200 bg-sky-50 px-2 py-0.5 text-[10px] font-black text-sky-700"
                            >
                              Auto checkout sistem
                            </span>
                          )}
                        </div>
                      )}
                    </td>
                    <td className="px-6 py-4 text-muted-foreground whitespace-nowrap">{row.duration}</td>
                    <td className="px-6 py-4 whitespace-nowrap text-right">
                      <div className="flex flex-col items-end gap-1">
                        <span className={`px-3 py-1 text-xs font-bold rounded-full border ${getBadgeStyle(row.statusColor)}`}>
                          {row.status}
                        </span>
                        {isSystemAutoCheckout(row) && (
                          <span
                            title="Checkout dilakukan otomatis oleh sistem karena belum checkout manual sampai batas waktu."
                            className="rounded-full border border-sky-200 bg-sky-50 px-2 py-0.5 text-[10px] font-black text-sky-700"
                          >
                            Checkout otomatis {attendanceRules.autoCheckoutTime}
                          </span>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>

            {filteredData.length === 0 && (
              <div className="p-8 text-center flex flex-col items-center justify-center gap-3">
                <div className="w-12 h-12 rounded-full bg-muted flex items-center justify-center text-muted-foreground">
                  <Search size={24} />
                </div>
                <div>
                  <h3 className="text-foreground font-semibold">Tidak ada data</h3>
                  <p className="text-sm text-muted-foreground">Tidak ada riwayat kehadiran untuk filter "{activeFilter}".</p>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </Layout>
  );
}
