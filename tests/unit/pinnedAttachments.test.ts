import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import {
  getPinnedStorageKey,
  getPinnedAttachments,
  savePinnedAttachment,
  removePinnedAttachment
} from "../../src/app/lib/attachmentPins";

const rootDir = process.cwd();
const sharedBoardViewPath = path.join(rootDir, "src/app/components/organisms/SharedBoardView.tsx");
const scrumBoardPath = path.join(rootDir, "src/app/components/pages/mahasiswa/ScrumBoard.tsx");

test("attachmentPins storage helpers handle keys and localStorage gracefully", () => {
  assert.equal(getPinnedStorageKey("proj-123"), "stas_pinned_attachments_proj-123");
  assert.equal(getPinnedStorageKey(""), "stas_pinned_attachments_default");
  assert.equal(getPinnedStorageKey(null), "stas_pinned_attachments_default");

  // In Node environment without window/localStorage, functions must not crash and return empty object
  assert.deepEqual(getPinnedAttachments("proj-123"), {});
  assert.deepEqual(removePinnedAttachment("proj-123", "att-1"), {});
});

test("attachmentPins save and remove work as expected when localStorage is available", () => {
  const store: Record<string, string> = {};
  const mockLocalStorage = {
    getItem: (key: string) => store[key] || null,
    setItem: (key: string, val: string) => {
      store[key] = val;
    },
    removeItem: (key: string) => {
      delete store[key];
    },
    clear: () => {
      Object.keys(store).forEach((k) => delete store[k]);
    }
  };

  const fakeWindow = {
    localStorage: mockLocalStorage,
    dispatchEvent: () => true
  };

  (globalThis as any).window = fakeWindow;

  try {
    const meta = {
      attachmentId: "att-001",
      taskId: "task-10",
      taskTitle: "Implementasi Feature A",
      fileName: "dokumen_revisi.pdf",
      fileUrl: "/uploads/dokumen_revisi.pdf",
      sizeLabel: "2.4 MB",
      caption: "Dokumen acuan pengerjaan bab 3",
      pinnedBy: "Admin",
      pinnedAt: "2026-09-27T10:00:00.000Z"
    };

    savePinnedAttachment("proj-99", meta);

    const saved = getPinnedAttachments("proj-99");
    assert.ok(saved["att-001"], "Saved attachment must be present");
    assert.equal(saved["att-001"].fileName, "dokumen_revisi.pdf");
    assert.equal(saved["att-001"].caption, "Dokumen acuan pengerjaan bab 3");
    assert.equal(saved["att-001"].taskTitle, "Implementasi Feature A");

    removePinnedAttachment("proj-99", "att-001");
    const afterRemove = getPinnedAttachments("proj-99");
    assert.equal(afterRemove["att-001"], undefined, "Removed attachment must no longer exist");
  } finally {
    delete (globalThis as any).window;
  }
});

test("SharedBoardView.tsx includes pinned attachments banner, captions, and pin modal", () => {
  const content = fs.readFileSync(sharedBoardViewPath, "utf-8");

  // Imports
  assert.ok(content.includes("getPinnedAttachments"), "SharedBoardView must import getPinnedAttachments");
  assert.ok(content.includes("savePinnedAttachment"), "SharedBoardView must import savePinnedAttachment");
  assert.ok(content.includes("removePinnedAttachment"), "SharedBoardView must import removePinnedAttachment");
  assert.ok(content.includes("subscribePinnedAttachments"), "SharedBoardView must import subscribePinnedAttachments");

  // UI Banner & Modal
  assert.ok(content.includes("Lampiran Penting Disematkan"), "SharedBoardView must render Pinned Attachments highlight banner");
  assert.ok(content.includes("Sematkan Lampiran Penting"), "SharedBoardView must have Pin Caption modal");
  assert.ok(content.includes("Catatan / Keterangan Penting (Caption)"), "SharedBoardView must provide caption input for pinned attachments");
  assert.ok(content.includes("handleOpenPinModal"), "SharedBoardView must implement handleOpenPinModal");
  assert.ok(content.includes("handleSavePin"), "SharedBoardView must implement handleSavePin");
});

test("ScrumBoard.tsx renders Lampiran Tugas section, pinned attachments, captions, and pin modal", () => {
  const content = fs.readFileSync(scrumBoardPath, "utf-8");

  // Imports
  assert.ok(content.includes("getPinnedAttachments"), "ScrumBoard must import getPinnedAttachments");
  assert.ok(content.includes("savePinnedAttachment"), "ScrumBoard must import savePinnedAttachment");
  assert.ok(content.includes("removePinnedAttachment"), "ScrumBoard must import removePinnedAttachment");
  assert.ok(content.includes("subscribePinnedAttachments"), "ScrumBoard must import subscribePinnedAttachments");

  // Lampiran Tugas section on student board
  assert.ok(content.includes("Lampiran Tugas"), "ScrumBoard must render Lampiran Tugas section");
  assert.ok(content.includes("Lampiran Penting Disematkan"), "ScrumBoard must render Pinned Attachments highlight banner");
  assert.ok(content.includes("tasksWithAttachments"), "ScrumBoard must compute tasksWithAttachments");

  // Pin & Caption Modal for leaders/admins
  assert.ok(content.includes("Sematkan Lampiran Penting"), "ScrumBoard must render Pin Caption modal");
  assert.ok(content.includes("Catatan / Keterangan Penting (Caption)"), "ScrumBoard must provide caption input for pinned attachments");
  assert.ok(content.includes("handleOpenPinModal"), "ScrumBoard must implement handleOpenPinModal");
  assert.ok(content.includes("handleSavePin"), "ScrumBoard must implement handleSavePin");
});
