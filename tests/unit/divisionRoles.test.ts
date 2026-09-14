import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import {
  normalizeDivisionRole,
  validateDivisionRoleName,
  getRolesForDivision,
  getCombinedMemberRoles,
  DEFAULT_DIVISION_ROLES,
  DOSEN_RESEARCH_ROLES,
  type DivisionRole,
} from "../../src/app/lib/researchRoles.ts";

test("1. normalizeDivisionRole handles camelCase and snake_case backend payloads", () => {
  const camel = normalizeDivisionRole({
    id: "drole-1",
    divisionId: "div-web",
    projectId: "proj-1",
    name: "Frontend Lead",
    isActive: true,
    sortOrder: 1,
  });
  assert.equal(camel.id, "drole-1");
  assert.equal(camel.divisionId, "div-web");
  assert.equal(camel.projectId, "proj-1");
  assert.equal(camel.name, "Frontend Lead");
  assert.equal(camel.isActive, true);
  assert.equal(camel.sortOrder, 1);

  const snake = normalizeDivisionRole({
    id: "drole-2",
    division_id: "div-iot",
    project_id: "proj-2",
    name: "Firmware Dev",
    is_active: false,
    sort_order: 3,
  });
  assert.equal(snake.id, "drole-2");
  assert.equal(snake.divisionId, "div-iot");
  assert.equal(snake.projectId, "proj-2");
  assert.equal(snake.name, "Firmware Dev");
  assert.equal(snake.isActive, false);
  assert.equal(snake.sortOrder, 3);
});

test("2. validateDivisionRoleName validates empty, length, and duplicates case-insensitively", () => {
  const existing = ["Frontend Developer", "Backend Developer"];

  // Empty string
  assert.equal(validateDivisionRoleName("", existing).valid, false);
  assert.equal(validateDivisionRoleName("   ", existing).valid, false);

  // Too short
  assert.equal(validateDivisionRoleName("A", existing).valid, false);

  // Valid new role
  assert.equal(validateDivisionRoleName("UI/UX Designer", existing).valid, true);

  // Duplicate exact match
  const dup1 = validateDivisionRoleName("Frontend Developer", existing);
  assert.equal(dup1.valid, false);
  assert.equal(dup1.error, "Role dengan nama tersebut sudah ada.");

  // Duplicate case-insensitive & trimmed
  const dup2 = validateDivisionRoleName("  frontend developer  ", existing);
  assert.equal(dup2.valid, false);
  assert.equal(dup2.error, "Role dengan nama tersebut sudah ada.");

  // Check with DivisionRole objects as existing array
  const existingObjects: DivisionRole[] = [
    { id: "1", divisionId: "d1", projectId: "p1", name: "QA Tester", isActive: true },
  ];
  assert.equal(validateDivisionRoleName("qa tester", existingObjects).valid, false);
  assert.equal(validateDivisionRoleName("DevOps", existingObjects).valid, true);
});

test("3. getRolesForDivision prioritizes custom division roles and falls back to default mapping", () => {
  const customRoles: DivisionRole[] = [
    { id: "1", divisionId: "div-web", projectId: "p1", name: "React Architect", isActive: true },
    { id: "2", divisionId: "div-web", projectId: "p1", name: "Next.js Specialist", isActive: true },
    { id: "3", divisionId: "div-web", projectId: "p1", name: "Deprecated Role", isActive: false },
    { id: "4", divisionId: "div-iot", projectId: "p1", name: "ESP32 Engineer", isActive: true },
  ];

  // For div-web with custom roles and division name "Web Development"
  const webRoles = getRolesForDivision("div-web", "Web Development", customRoles);
  assert.ok(webRoles.includes("React Architect"));
  assert.ok(webRoles.includes("Next.js Specialist"));
  // Inactive role must not be included
  assert.ok(!webRoles.includes("Deprecated Role"));
  // Should also include default web roles like Frontend Developer
  assert.ok(webRoles.includes("Frontend Developer"));

  // For div-iot
  const iotRoles = getRolesForDivision("div-iot", "IoT & Hardware", customRoles);
  assert.ok(iotRoles.includes("ESP32 Engineer"));
  assert.ok(iotRoles.includes("Hardware Engineer"));

  // For division with NO custom roles, returns default roles
  const aiRoles = getRolesForDivision("div-ai", "AI Research", []);
  assert.deepEqual(aiRoles, DEFAULT_DIVISION_ROLES.ai);

  // For unknown division name with NO custom roles, returns empty array
  const unknownRoles = getRolesForDivision("div-x", "Divisi Bisnis", []);
  assert.deepEqual(unknownRoles, []);
});

test("4. getCombinedMemberRoles combines division roles with standard roles for Mahasiswa", () => {
  const customRoles: DivisionRole[] = [
    { id: "1", divisionId: "div-web", projectId: "p1", name: "Frontend Lead", isActive: true },
  ];

  const mahasiswaRoles = getCombinedMemberRoles("Mahasiswa", "div-web", "Web", customRoles);
  // Custom role comes first
  assert.equal(mahasiswaRoles[0], "Frontend Lead");
  // Standard roles are present
  assert.ok(mahasiswaRoles.includes("Web Developer"));
  assert.ok(mahasiswaRoles.includes("Anggota"));
  // No duplicates
  const uniqueCount = new Set(mahasiswaRoles).size;
  assert.equal(mahasiswaRoles.length, uniqueCount);

  // Dosen only gets DOSEN_RESEARCH_ROLES regardless of division
  const dosenRoles = getCombinedMemberRoles("Dosen", "div-web", "Web", customRoles);
  assert.deepEqual(dosenRoles, DOSEN_RESEARCH_ROLES);
});

test("5. ScrumPlanning.tsx contains Division Role management UI and actions", () => {
  const rootDir = process.cwd();
  const content = fs.readFileSync(
    path.join(rootDir, "src/app/components/pages/operator/ScrumPlanning.tsx"),
    "utf-8"
  );

  assert.ok(
    content.includes("Role / Posisi Divisi"),
    "ScrumPlanning.tsx must render header for Role Divisi"
  );
  assert.ok(
    content.includes("Tambah Role"),
    "ScrumPlanning.tsx must render 'Tambah Role' button"
  );
  assert.ok(
    content.includes("handleAddDivisionRole"),
    "ScrumPlanning.tsx must have handleAddDivisionRole function"
  );
  assert.ok(
    content.includes("handleDeleteDivisionRole"),
    "ScrumPlanning.tsx must have handleDeleteDivisionRole function"
  );
  assert.ok(
    content.includes("handleApplyRecommendedRoles"),
    "ScrumPlanning.tsx must have handleApplyRecommendedRoles function"
  );
});

test("6. KeanggotaanRiset.tsx supports division filtering and custom role creation", () => {
  const rootDir = process.cwd();
  const content = fs.readFileSync(
    path.join(rootDir, "src/app/components/pages/operator/KeanggotaanRiset.tsx"),
    "utf-8"
  );

  assert.ok(
    content.includes("Divisi Proyek (Opsional)"),
    "KeanggotaanRiset.tsx must have division selector in Edit Role modal"
  );
  assert.ok(
    content.includes("+ Role Kustom"),
    "KeanggotaanRiset.tsx must have '+ Role Kustom' toggle button"
  );
  assert.ok(
    content.includes("getCombinedMemberRoles"),
    "KeanggotaanRiset.tsx must use getCombinedMemberRoles"
  );
});
