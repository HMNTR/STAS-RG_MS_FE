import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { isMahasiswaKetuaRiset, MAHASISWA_LEADER_ROLE } from "../../src/app/lib/researchRoles";

const rootDir = process.cwd();
const sharedBoardViewPath = path.join(rootDir, "src/app/components/organisms/SharedBoardView.tsx");
const scrumBoardPath = path.join(rootDir, "src/app/components/pages/mahasiswa/ScrumBoard.tsx");

test("isMahasiswaKetuaRiset correctly identifies student research leaders", () => {
  // Direct role/peran on user
  const directLeader = {
    id: "usr-1",
    role: "mahasiswa",
    peran: MAHASISWA_LEADER_ROLE,
  };
  assert.equal(isMahasiswaKetuaRiset(directLeader), true, "Should identify student leader via direct peran");

  const directLeaderCase = {
    id: "usr-1b",
    role: "mahasiswa",
    peran: "Ketua Tim Riset",
  };
  assert.equal(isMahasiswaKetuaRiset(directLeaderCase), true, "Should identify student leader when peran contains 'Ketua'");

  // User is member of project with leader role
  const regularUser = {
    id: "usr-2",
    role: "mahasiswa",
    peran: "Web Developer",
  };
  const membersWithLeader = [
    { user_id: "usr-2", role: MAHASISWA_LEADER_ROLE, member_type: "Mahasiswa" },
    { user_id: "usr-3", role: "Frontend Dev", member_type: "Mahasiswa" },
  ];
  assert.equal(
    isMahasiswaKetuaRiset(regularUser, membersWithLeader),
    true,
    "Should identify student leader when listed as leader in project members"
  );

  // Ordinary member in project
  const membersWithoutLeader = [
    { user_id: "usr-2", role: "Frontend Dev", member_type: "Mahasiswa" },
    { user_id: "usr-3", role: "Backend Dev", member_type: "Mahasiswa" },
  ];
  assert.equal(
    isMahasiswaKetuaRiset(regularUser, membersWithoutLeader),
    false,
    "Should return false for regular student members"
  );

  // Non-student role
  const dosenUser = {
    id: "usr-4",
    role: "dosen",
    peran: "Pembimbing",
  };
  assert.equal(isMahasiswaKetuaRiset(dosenUser), false, "Should return false for dosen");
  assert.equal(isMahasiswaKetuaRiset(null), false, "Should return false for null user");
  assert.equal(isMahasiswaKetuaRiset(undefined), false, "Should return false for undefined user");
});

test("SharedBoardView.tsx enforces read-only board metadata and milestone for students", () => {
  const content = fs.readFileSync(sharedBoardViewPath, "utf-8");

  // canManageMetadata must be restricted to operator and dosen
  assert.ok(
    content.includes('canManageMetadata = currentUser?.role === "operator" || currentUser?.role === "dosen"'),
    "SharedBoardView.tsx must define canManageMetadata restricted to operator or dosen"
  );

  // Edit Board button must be guarded by canManageMetadata
  assert.ok(
    content.includes("{canManageMetadata && ("),
    "SharedBoardView.tsx must guard metadata edit buttons with canManageMetadata"
  );

  // MilestoneBanner editable prop must be bound to canManageMetadata
  assert.ok(
    content.includes("editable={canManageMetadata}"),
    "MilestoneBanner in SharedBoardView.tsx must use canManageMetadata for editable prop"
  );

  // normalizeBoardPermissions must support isLeaderMemberFallback
  assert.ok(
    content.includes("isLeaderMemberFallback"),
    "normalizeBoardPermissions must support isLeaderMemberFallback parameter"
  );
});

test("ScrumBoard.tsx renders active sprint section, read-only metadata, lampiran, and repository", () => {
  const content = fs.readFileSync(scrumBoardPath, "utf-8");

  // Must import and use isMahasiswaKetuaRiset
  assert.ok(
    content.includes("isMahasiswaKetuaRiset"),
    "ScrumBoard.tsx must import and use isMahasiswaKetuaRiset"
  );

  // Must render Active Sprint section matching screenshot
  assert.ok(
    content.includes("Sprint Aktif"),
    "ScrumBoard.tsx must render Sprint Aktif badge"
  );
  assert.ok(
    content.includes("Filter: Tugas Saya Saja"),
    "ScrumBoard.tsx must render 'Filter: Tugas Saya Saja' toggle button"
  );
  assert.ok(
    content.includes("Tampilkan: Semua Tugas (Termasuk Backlog)"),
    "ScrumBoard.tsx must render 'Tampilkan: Semua Tugas (Termasuk Backlog)' toggle button"
  );

  // Must render read-only metadata banner
  assert.ok(
    content.includes("Milestone Riset (Read-Only)"),
    "ScrumBoard.tsx must render read-only milestone banner"
  );
  assert.ok(
    content.includes("Anggota Tim Riset"),
    "ScrumBoard.tsx must render team members section"
  );

  // Must render research documents and external attachment link
  assert.ok(
    content.includes("Dokumen Riset"),
    "ScrumBoard.tsx must render Dokumen Riset section"
  );
  assert.ok(
    content.includes("Dokumen Kerja Sama"),
    "ScrumBoard.tsx must render Dokumen Kerja Sama section"
  );
  assert.ok(
    content.includes("Lampiran Eksternal (Drive / Repository Dokumen)"),
    "ScrumBoard.tsx must render Lampiran Eksternal section"
  );

  // Must render GitHub repository section
  assert.ok(
    content.includes("Repository GitHub Proyek"),
    "ScrumBoard.tsx must render GitHub repository section"
  );
  assert.ok(
    content.includes("Buka GitHub"),
    "ScrumBoard.tsx must render 'Buka GitHub' external link button"
  );

  // Must provide task creation for Mahasiswa Ketua Riset
  assert.ok(
    content.includes("isLeader"),
    "ScrumBoard.tsx must check isLeader for permissions"
  );
  assert.ok(
    content.includes("Tambah Tugas Baru"),
    "ScrumBoard.tsx must render Tambah Tugas modal for Mahasiswa Ketua Riset"
  );
  assert.ok(
    content.includes("handleCreateTask"),
    "ScrumBoard.tsx must implement handleCreateTask"
  );

  // Must maintain attachment resolver and download attributes for existing tests
  assert.ok(
    content.includes("resolveApiAssetUrl(at.file_url || at.fileUrl)"),
    "ScrumBoard.tsx must resolve task attachment URLs"
  );
  assert.ok(
    content.includes("download={at.file_name || at.fileName || undefined}"),
    "ScrumBoard.tsx must provide download attribute on attachments"
  );
  assert.ok(
    content.includes('rel="noopener noreferrer"'),
    "ScrumBoard.tsx must use secure rel='noopener noreferrer' on external links"
  );
});
