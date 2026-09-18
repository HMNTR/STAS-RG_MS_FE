import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { MAHASISWA_RESEARCH_ROLES } from "../../src/app/lib/researchRoles";

const rootDir = process.cwd();
const scrumPlanningPath = path.join(rootDir, "src/app/components/pages/operator/ScrumPlanning.tsx");

test("ScrumPlanning.tsx maintains distinct loading, error, and empty states for members and divisions", () => {
  const content = fs.readFileSync(scrumPlanningPath, "utf-8");

  // State declarations
  assert.ok(content.includes("membersLoading"), "Must have membersLoading state");
  assert.ok(content.includes("membersError"), "Must have membersError state");
  assert.ok(content.includes("divisionsLoading"), "Must have divisionsLoading state");
  assert.ok(content.includes("divisionsError"), "Must have divisionsError state");

  // Loading indicator for assignees and divisions
  assert.ok(content.includes("Memuat daftar mahasiswa..."), "Must show loading text for members");
  assert.ok(content.includes("Memuat divisi riset..."), "Must show loading text for divisions");

  // Error indicators with retry
  assert.ok(content.includes("Gagal memuat mahasiswa"), "Must display error state for members");
  assert.ok(content.includes("Gagal memuat divisi"), "Must display error state for divisions");

  // Empty state preserved
  assert.ok(content.includes("Belum ada mahasiswa di riset ini untuk ditugaskan."), "Must preserve empty student state");
  assert.ok(content.includes("Tanpa Divisi (Proyek belum memiliki divisi)"), "Must preserve empty division state");
});

test("ScrumPlanning.tsx prevents race conditions and stale data when switching projects", () => {
  const content = fs.readFileSync(scrumPlanningPath, "utf-8");

  // Ref for active fetch project ID
  assert.ok(content.includes("activeFetchProjectIdRef"), "Must use activeFetchProjectIdRef to guard async responses");

  // Immediate state cleanup before fetching new project data
  assert.ok(content.includes("setMembers([]);"), "Must clear members when starting new project load");
  assert.ok(content.includes("setDivisions([]);"), "Must clear divisions when starting new project load");
});

test("'Frontend Dev' is confirmed as a member role, distinct from Scrum division entities", () => {
  assert.ok(
    MAHASISWA_RESEARCH_ROLES.includes("Frontend Dev"),
    "MAHASISWA_RESEARCH_ROLES must include 'Frontend Dev' as a member role"
  );
});
