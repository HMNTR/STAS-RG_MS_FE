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

test("SharedBoardView.tsx and ScrumBoard.tsx allow research edit access only to ketua riset, dosen, and admin", () => {
  const sharedContent = fs.readFileSync(sharedBoardViewPath, "utf-8");
  const scrumContent = fs.readFileSync(scrumBoardPath, "utf-8");

  // canManageMetadata must be granted to operator, dosen, or isLeader (ketua riset)
  assert.ok(
    sharedContent.includes('canManageMetadata = currentUser?.role === "operator" || currentUser?.role === "dosen" || isLeader'),
    "SharedBoardView.tsx must define canManageMetadata allowing operator, dosen, or isLeader"
  );
  assert.ok(
    scrumContent.includes('canManageMetadata = currentUser?.role === "operator" || currentUser?.role === "dosen" || isLeader'),
    "ScrumBoard.tsx must define canManageMetadata allowing operator, dosen, or isLeader"
  );

  // Edit Board buttons must be guarded by canManageMetadata
  assert.ok(
    sharedContent.includes("{canManageMetadata && ("),
    "SharedBoardView.tsx must guard metadata edit buttons with canManageMetadata"
  );
  assert.ok(
    scrumContent.includes("{canManageMetadata && ("),
    "ScrumBoard.tsx must guard metadata edit buttons with canManageMetadata"
  );

  // Milestone banner editable prop must be bound to canManageMetadata
  assert.ok(
    sharedContent.includes("editable={canManageMetadata}"),
    "MilestoneBanner in SharedBoardView.tsx must use canManageMetadata for editable prop"
  );
  assert.ok(
    scrumContent.includes("editable={canManageMetadata}"),
    "MilestoneBanner in ScrumBoard.tsx must use canManageMetadata for editable prop"
  );

  // External attachment link edit must be guarded by canManageMetadata
  assert.ok(
    scrumContent.includes("setIsEditingAttachment"),
    "ScrumBoard.tsx must support toggling attachment editing"
  );
  assert.ok(
    scrumContent.includes("handleSaveAttachmentLink"),
    "ScrumBoard.tsx must implement handleSaveAttachmentLink"
  );

  // Edit Board modal must exist in ScrumBoard.tsx
  assert.ok(
    scrumContent.includes("isEditBoardOpen && canManageMetadata"),
    "ScrumBoard.tsx must guard EditBoard modal with isEditBoardOpen and canManageMetadata"
  );
  assert.ok(
    scrumContent.includes("handleSaveBoardHeader"),
    "ScrumBoard.tsx must implement handleSaveBoardHeader"
  );

  // Kelola Milestone modal must exist in ScrumBoard.tsx
  assert.ok(
    scrumContent.includes("isMilestoneOpen && canManageMetadata"),
    "ScrumBoard.tsx must guard Milestone modal with isMilestoneOpen and canManageMetadata"
  );
  assert.ok(
    scrumContent.includes("handleAddMilestone"),
    "ScrumBoard.tsx must implement handleAddMilestone"
  );
  assert.ok(
    scrumContent.includes("handleRenameMilestone"),
    "ScrumBoard.tsx must implement handleRenameMilestone"
  );
  assert.ok(
    scrumContent.includes("handleRemoveMilestone"),
    "ScrumBoard.tsx must implement handleRemoveMilestone"
  );
  assert.ok(
    scrumContent.includes("handleToggleMilestone"),
    "ScrumBoard.tsx must implement handleToggleMilestone"
  );

  // normalizeBoardPermissions must support isLeaderMemberFallback
  assert.ok(
    sharedContent.includes("isLeaderMemberFallback"),
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

  // Must render read-only metadata banner for ordinary students
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

test("ScrumBoard.tsx supports Kanban Drag & Drop, Task Comments, and Git branch helper", () => {
  const content = fs.readFileSync(scrumBoardPath, "utf-8");

  // Drag and Drop
  assert.ok(
    content.includes("handleTaskDragStart"),
    "ScrumBoard.tsx must implement handleTaskDragStart"
  );
  assert.ok(
    content.includes("handleColumnDragOver"),
    "ScrumBoard.tsx must implement handleColumnDragOver"
  );
  assert.ok(
    content.includes("handleColumnDrop"),
    "ScrumBoard.tsx must implement handleColumnDrop"
  );

  // Task Comments
  assert.ok(
    content.includes("handleSendComment"),
    "ScrumBoard.tsx must implement handleSendComment"
  );
  assert.ok(
    content.includes("loadComments"),
    "ScrumBoard.tsx must implement loadComments"
  );

  // Git Branch Helper
  assert.ok(
    content.includes("generateBranchTemplate"),
    "ScrumBoard.tsx must use generateBranchTemplate"
  );
  assert.ok(
    content.includes("Copy Branch Template"),
    "ScrumBoard.tsx must include Copy Branch Template action"
  );
});
