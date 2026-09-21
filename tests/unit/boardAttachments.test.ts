import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { resolveApiAssetUrl } from "../../src/app/lib/api";

const rootDir = process.cwd();
const sharedBoardViewPath = path.join(rootDir, "src/app/components/organisms/SharedBoardView.tsx");
const scrumBoardPath = path.join(rootDir, "src/app/components/pages/mahasiswa/ScrumBoard.tsx");

test("resolveApiAssetUrl properly prefixes relative upload paths and preserves absolute/blob URLs", () => {
  // Relative paths should be prefixed with API origin
  const uploadUrl = "/uploads/board-tasks/1789732551-7bdf-skpl.docx";
  const resolvedUpload = resolveApiAssetUrl(uploadUrl);
  assert.ok(resolvedUpload, "Resolved upload URL must not be null");
  assert.ok(resolvedUpload.endsWith("/uploads/board-tasks/1789732551-7bdf-skpl.docx"), "Resolved URL must contain the asset path");
  assert.ok(!resolvedUpload.startsWith("/uploads/"), "Resolved URL must not remain relative when API_ORIGIN is configured");

  // Preserves absolute URLs
  const absoluteUrl = "https://example.com/files/doc.pdf";
  assert.strictEqual(resolveApiAssetUrl(absoluteUrl), absoluteUrl, "Should preserve external absolute https URLs");

  // Preserves blob and data URLs
  const blobUrl = "blob:https://ms.stas-rg.com/uuid-1234";
  assert.strictEqual(resolveApiAssetUrl(blobUrl), blobUrl, "Should preserve blob URLs");

  const dataUrl = "data:application/pdf;base64,JVBERi0xLjQK...";
  assert.strictEqual(resolveApiAssetUrl(dataUrl), dataUrl, "Should preserve data URLs");

  // Gracefully handles null / undefined / empty
  assert.strictEqual(resolveApiAssetUrl(null), null);
  assert.strictEqual(resolveApiAssetUrl(undefined), null);
  assert.strictEqual(resolveApiAssetUrl(""), null);
  assert.strictEqual(resolveApiAssetUrl("   "), null);
});

test("SharedBoardView.tsx correctly resolves task attachment URLs and renders download links", () => {
  const content = fs.readFileSync(sharedBoardViewPath, "utf-8");

  // Must import resolveApiAssetUrl
  assert.ok(
    content.includes("resolveApiAssetUrl"),
    "SharedBoardView.tsx must import and use resolveApiAssetUrl"
  );

  // normalizeTaskAttachment must use resolveApiAssetUrl
  assert.ok(
    content.includes("resolveApiAssetUrl(rawUrl)"),
    "normalizeTaskAttachment must resolve rawUrl using resolveApiAssetUrl"
  );

  // BoardDocumentLink must use resolveApiAssetUrl
  assert.ok(
    content.includes("resolveApiAssetUrl(url)"),
    "BoardDocumentLink must resolve document URLs with resolveApiAssetUrl"
  );

  // Attachment links in Lampiran Tugas section must have target=_blank, rel=noopener noreferrer, and download attribute
  assert.ok(
    content.includes('download={attachment.name || undefined}'),
    "Attachment download button in Lampiran Tugas must have download attribute"
  );
  assert.ok(
    content.includes('rel="noopener noreferrer"'),
    "External attachment links must specify rel='noopener noreferrer'"
  );

  // Task detail modal must also render task attachments list with download links
  assert.ok(
    content.includes("taskAttachments.length > 0 &&"),
    "Task detail modal must display task attachments list when available"
  );
});

test("ScrumBoard.tsx correctly resolves task attachment URLs and sets secure download attributes", () => {
  const content = fs.readFileSync(scrumBoardPath, "utf-8");

  // Must import resolveApiAssetUrl
  assert.ok(
    content.includes("resolveApiAssetUrl"),
    "ScrumBoard.tsx must import resolveApiAssetUrl"
  );

  // Must resolve attachment file_url or fileUrl
  assert.ok(
    content.includes("resolveApiAssetUrl(at.file_url || at.fileUrl)"),
    "ScrumBoard.tsx must resolve attachment URLs using resolveApiAssetUrl"
  );

  // Must include download attribute with user-friendly file name
  assert.ok(
    content.includes("download={at.file_name || at.fileName || undefined}"),
    "ScrumBoard.tsx must specify download attribute with fileName fallback"
  );
  assert.ok(
    content.includes('rel="noopener noreferrer"'),
    "ScrumBoard.tsx attachment link must specify rel='noopener noreferrer'"
  );
});
