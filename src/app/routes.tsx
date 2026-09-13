import React from "react";
import { createBrowserRouter, Navigate, Outlet } from "react-router";
import { useAuth } from "./context/AuthContext";
import type { UserRole } from "./context/AuthContext";
import Login from "./components/pages/Login";
import Dashboard from "./components/pages/mahasiswa/Dashboard";
import Attendance from "./components/pages/mahasiswa/Attendance";
import Logbook from "./components/pages/mahasiswa/Logbook";
import LogbookForm from "./components/pages/mahasiswa/LogbookForm";
import LeaveRequest from "./components/pages/mahasiswa/LeaveRequest";
import Documents from "./components/pages/mahasiswa/Documents";
import DocumentCenterMahasiswa from "./components/pages/mahasiswa/DocumentCenter";
import DraftReport from "./components/pages/mahasiswa/DraftReport";
import MyResearch from "./components/pages/mahasiswa/MyResearch";
import ScrumBoard from "./components/pages/mahasiswa/ScrumBoard";
import Piket from "./components/pages/mahasiswa/Piket";
import PicketHistory from "./components/pages/mahasiswa/PicketHistory";
import GraduationSubmission from "./components/pages/mahasiswa/GraduationSubmission";
import Settings from "./components/pages/Settings";
import OperatorDashboard from "./components/pages/operator/OperatorDashboard";
import DatabaseMahasiswa from "./components/pages/operator/DatabaseMahasiswa";
import DatabaseRiset from "./components/pages/operator/DatabaseRiset";
import DatabaseDosen from "./components/pages/operator/DatabaseDosen";
import DatabaseOperator from "./components/pages/operator/DatabaseOperator";
import LogbookMonitor from "./components/pages/operator/LogbookMonitor";
import PersetujuanCuti from "./components/pages/operator/PersetujuanCuti";
import LayananSurat from "./components/pages/operator/LayananSurat";
import EksporLaporan from "./components/pages/operator/EksporLaporan";
import KehadiranMahasiswa from "./components/pages/operator/KehadiranMahasiswa";
import PengaturanWfhMahasiswa from "./components/pages/operator/PengaturanWfhMahasiswa";
import DatabaseKegiatan from "./components/pages/operator/DatabaseKegiatan";
import PengaturanSistem from "./components/pages/operator/PengaturanSistem";
import AuditLog from "./components/pages/operator/AuditLog";
import ProgressBoard from "./components/pages/operator/ProgressBoard";
import SertifikatOperator from "./components/pages/operator/SertifikatOperator";
import DocumentCenterOperator from "./components/pages/operator/DocumentCenter";
import ReviewDraftOperator from "./components/pages/operator/ReviewDraftOperator";
import PengunduranDiriOperator from "./components/pages/operator/PengunduranDiriOperator";
import PiketOperator from "./components/pages/operator/PiketOperator";
import BerkasKelulusanOperator from "./components/pages/operator/BerkasKelulusanOperator";
import ReaktivasiAlumni from "./components/pages/operator/ReaktivasiAlumni";
import KeanggotaanRiset from "./components/pages/operator/KeanggotaanRiset";
import ScrumPlanning from "./components/pages/operator/ScrumPlanning";
import SprintSummary from "./components/pages/operator/SprintSummary";
import GitHubIntegration from "./components/pages/operator/GitHubIntegration";
import DashboardDosen from "./components/pages/dosen/DashboardDosen";
import RisetDosen from "./components/pages/dosen/RisetDosen";
import ReviewLogbook from "./components/pages/dosen/ReviewLogbook";
import ProgressTim from "./components/pages/dosen/ProgressTim";
import SertifikatMahasiswa from "./components/pages/dosen/SertifikatMahasiswa";
import ReviewDraft from "./components/pages/dosen/ReviewDraft";
import PengajuanDokumenDosen from "./components/pages/dosen/PengajuanDokumenDosen";
import PengunduranDiriDosen from "./components/pages/dosen/PengunduranDiriDosen";
import BerkasKelulusanDosen from "./components/pages/dosen/BerkasKelulusanDosen";

const ROLE_HOME: Record<UserRole, string> = {
  mahasiswa: "/dashboard",
  operator: "/operator/dashboard",
  dosen: "/dosen/dashboard"
};

function RequireAuth() {
  const { user, hydrated } = useAuth();

  if (!hydrated) {
    return <div className="flex h-screen items-center justify-center text-muted-foreground">Memeriksa sesi...</div>;
  }

  if (!user) {
    return <Navigate to="/login" replace />;
  }

  return <Outlet />;
}

function RequireRole({ allowedRoles }: { allowedRoles: UserRole[] }) {
  const { user, hydrated } = useAuth();

  if (!hydrated) {
    return <div className="flex h-screen items-center justify-center text-muted-foreground">Memeriksa sesi...</div>;
  }

  if (!user) {
    return <Navigate to="/login" replace />;
  }

  if (!allowedRoles.includes(user.role)) {
    return <Navigate to={ROLE_HOME[user.role] || "/dashboard"} replace />;
  }

  return <Outlet />;
}

function RequireNonAlumni() {
  const { user, hydrated } = useAuth();
  const storedUser = user as any;
  const studentStatus = String(storedUser?.status || storedUser?.studentStatus || "").trim();

  if (!hydrated) return null;

  if (user?.role === "mahasiswa" && studentStatus === "Alumni") {
    return <Navigate to="/dashboard" replace />;
  }

  return <Outlet />;
}

export const router = createBrowserRouter([
  {
    path: "/",
    element: <Outlet />,
    errorElement: (
      <div className="flex items-center justify-center h-screen text-muted-foreground">
        Halaman tidak ditemukan.
      </div>
    ),
    children: [
      { index: true, element: <Navigate to="/login" replace /> },
      { path: "login", element: <Login /> },
      {
        element: <Outlet />,
        children: [
          {
            element: <RequireAuth />,
            children: [
              { path: "settings", element: <Settings /> },
              {
                element: <RequireRole allowedRoles={["mahasiswa"]} />,
                children: [
                  { path: "dashboard", element: <Dashboard /> },
                  { path: "logbook", element: <Logbook /> },
                  { path: "research", element: <MyResearch /> },
                  { path: "documents", element: <Documents /> },
                  { path: "graduation", element: <GraduationSubmission /> },
                  { path: "draft", element: <DraftReport /> },
                  // Halaman berikut hanya untuk mahasiswa aktif (non-alumni)
                  {
                    element: <RequireNonAlumni />,
                    children: [
                      { path: "attendance", element: <Attendance /> },
                      { path: "logbook/new", element: <LogbookForm /> },
                      { path: "leave", element: <LeaveRequest /> },
                      { path: "document-center", element: <DocumentCenterMahasiswa /> },
                      { path: "picket", element: <Piket /> },
                      { path: "picket/history", element: <PicketHistory /> },
                      { path: "picket/manage", element: <PiketOperator /> },
                      { path: "picket/manage/history", element: <PicketHistory management /> },
                    ],
                  },
                  { path: "scrum", element: <ScrumBoard /> },
                  { path: "scrum-board", element: <ScrumBoard /> },
                  { path: "scrum-board/:researchId", element: <ScrumBoard /> },
                  { path: "board", element: <Navigate to="/research" replace /> },
                ],
              },
            ]
          },
          {
            path: "operator",
            element: <RequireRole allowedRoles={["operator"]} />,
            children: [
              { index: true, element: <Navigate to="/operator/dashboard" replace /> },
              { path: "dashboard", element: <OperatorDashboard /> },
              { path: "mahasiswa", element: <DatabaseMahasiswa /> },
              { path: "riset", element: <DatabaseRiset /> },
              { path: "keanggotaan", element: <KeanggotaanRiset /> },
              { path: "scrum", element: <SprintSummary /> },
              { path: "scrum/planning", element: <ScrumPlanning /> },
              { path: "github", element: <GitHubIntegration /> },
              { path: "scrum/github", element: <GitHubIntegration /> },
              { path: "dosen", element: <DatabaseDosen /> },
              { path: "operator", element: <DatabaseOperator /> },
              { path: "wfh-mahasiswa", element: <PengaturanWfhMahasiswa /> },
              { path: "kegiatan", element: <DatabaseKegiatan /> },
              { path: "logbook", element: <LogbookMonitor /> },
              { path: "kehadiran", element: <KehadiranMahasiswa /> },
              { path: "piket", element: <PiketOperator /> },
              { path: "piket/history", element: <PicketHistory management /> },
              { path: "cuti", element: <PersetujuanCuti /> },
              { path: "pengunduran", element: <PengunduranDiriOperator /> },
              { path: "surat", element: <LayananSurat /> },
              { path: "ekspor", element: <EksporLaporan /> },
              { path: "pengaturan", element: <PengaturanSistem /> },
              { path: "audit", element: <AuditLog /> },
              { path: "progress-board", element: <ProgressBoard /> },
              { path: "progress-board/:researchId", element: <ProgressBoard /> },
              { path: "progress-board/*", element: <ProgressBoard /> },
              { path: "draft", element: <ReviewDraftOperator /> },
              { path: "kelulusan", element: <BerkasKelulusanOperator /> },
              { path: "reaktivasi", element: <ReaktivasiAlumni /> },
              { path: "sertifikat", element: <SertifikatOperator /> },
              { path: "document-center", element: <DocumentCenterOperator /> },
            ],
          },

          {
            path: "dosen",
            element: <RequireRole allowedRoles={["dosen"]} />,
            children: [
              { index: true, element: <Navigate to="/dosen/dashboard" replace /> },
              { path: "dashboard", element: <DashboardDosen /> },
              { path: "riset", element: <RisetDosen /> },
              { path: "scrum", element: <SprintSummary /> },
              { path: "scrum/planning", element: <ScrumPlanning /> },
              { path: "github", element: <GitHubIntegration /> },
              { path: "scrum/github", element: <GitHubIntegration /> },
              { path: "logbook", element: <ReviewLogbook /> },
              { path: "draft", element: <ReviewDraft /> },
              { path: "progress", element: <ProgressTim /> },
              { path: "pengunduran", element: <PengunduranDiriDosen /> },
              { path: "surat", element: <PengajuanDokumenDosen /> },
              { path: "sertifikat", element: <SertifikatMahasiswa /> },
              { path: "kelulusan", element: <BerkasKelulusanDosen /> },
            ],
          },
        ],
      },

      { path: "*", element: <Navigate to="/login" replace /> },
    ],
  },
]);
