import test from "node:test";
import assert from "node:assert/strict";
import { parseTaskDescriptionBlocks, getTaskDescriptionPreview } from "../../src/app/lib/taskDescription";

const USER_DESCRIPTION_SAMPLE = `Membuat daftar halaman yang perlu dibuat pada website Smart Mannequin
beserta informasi utama yang harus ditampilkan pada setiap halaman.

Tujuan:
Menentukan halaman apa saja yang akan dirancang sebelum masuk ke tahap wireframe.

Bentuk Pengerjaan:
Buat 1 dokumen menggunakan Google Docs atau Microsoft Word.

Dokumen cukup berisi tabel daftar halaman dan kebutuhan tampilannya.
Tidak perlu membuat desain atau wireframe pada tahap ini.

Gunakan format tabel:

| No | Nama Halaman | Fungsi Halaman | Informasi yang Ditampilkan | Catatan |

Halaman minimal yang perlu dicatat:

1. Halaman Utama / Dashboard
2. Halaman Manekin
3. Halaman Monitoring Sensor
4. Halaman Kamera
5. Tampilan Loading
6. Tampilan Data Kosong
7. Tampilan Error
8. Tampilan Sensor Offline / Terputus

Untuk halaman Monitoring Sensor, catat sensor yang akan menggunakan tampilan
yang sama, seperti:
- Sensor Suara
- Sensor Gas
- Sensor Lidar
- ADXL345
- MPU6050
- BME280
- Load Cell
- Sensor Kulit

Tidak perlu membuat halaman terpisah untuk setiap sensor jika struktur tampilannya sama.
Cukup jelaskan perbedaan data atau parameter yang ditampilkan.

Deliverable:
1. 1 dokumen Google Docs atau Microsoft Word.
2. Daftar halaman yang akan dibuat.
3. Fungsi setiap halaman.
4. Informasi utama yang harus ditampilkan pada setiap halaman.
5. Daftar sensor yang menggunakan tampilan monitoring yang sama.
6. Link dokumen dilampirkan pada task.

Acceptance Criteria:
- Semua halaman utama sudah dicatat.
- Fungsi setiap halaman jelas.
- Informasi yang perlu ditampilkan sudah ditentukan.
- Sensor dengan tampilan serupa sudah dikelompokkan.
- Dokumen dapat digunakan sebagai acuan membuat wireframe.

Definition of Done:
- Dokumen selesai dibuat.
- Link dokumen sudah dilampirkan.
- Dokumen sudah direview.
- Revisi sudah dilakukan jika ada.
- Daftar halaman sudah disetujui sebelum masuk ke wireframe.`;

test("parseTaskDescriptionBlocks parses empty/null safely", () => {
  assert.deepEqual(parseTaskDescriptionBlocks(""), []);
  assert.deepEqual(parseTaskDescriptionBlocks(null), []);
  assert.deepEqual(parseTaskDescriptionBlocks(undefined), []);
  assert.deepEqual(parseTaskDescriptionBlocks("   \n\n  "), []);
});

test("parseTaskDescriptionBlocks accurately parses user description sample into structured blocks", () => {
  const blocks = parseTaskDescriptionBlocks(USER_DESCRIPTION_SAMPLE);
  assert.ok(blocks.length > 10, "Should generate multiple structured blocks");

  // Verify first block is paragraph
  assert.equal(blocks[0].type, "paragraph");
  assert.ok((blocks[0] as any).text.includes("Membuat daftar halaman"));

  // Verify sections
  const sectionTitles = blocks.filter((b) => b.type === "section").map((b: any) => b.title);
  assert.ok(sectionTitles.includes("Tujuan:"), "Must extract Tujuan: section");
  assert.ok(sectionTitles.includes("Bentuk Pengerjaan:"), "Must extract Bentuk Pengerjaan: section");
  assert.ok(sectionTitles.includes("Deliverable:"), "Must extract Deliverable: section");
  assert.ok(sectionTitles.includes("Acceptance Criteria:"), "Must extract Acceptance Criteria: section");
  assert.ok(sectionTitles.includes("Definition of Done:"), "Must extract Definition of Done: section");

  // Verify markdown table
  const tableBlock = blocks.find((b) => b.type === "table") as any;
  assert.ok(tableBlock, "Must detect markdown table");
  assert.deepEqual(tableBlock.headers, [
    "No",
    "Nama Halaman",
    "Fungsi Halaman",
    "Informasi yang Ditampilkan",
    "Catatan"
  ]);

  // Verify numbered lists
  const numberedLists = blocks.filter((b) => b.type === "list" && (b as any).ordered) as any[];
  assert.ok(numberedLists.length >= 2, "Must contain at least 2 numbered lists");
  assert.ok(numberedLists[0].items.includes("Halaman Utama / Dashboard"));
  assert.ok(numberedLists[0].items.includes("Halaman Manekin"));

  // Verify bullet lists
  const bulletLists = blocks.filter((b) => b.type === "list" && !(b as any).ordered) as any[];
  assert.ok(bulletLists.length >= 3, "Must contain at least 3 bullet lists");
  assert.ok(bulletLists[0].items.includes("Sensor Suara"));
  assert.ok(bulletLists[0].items.includes("Sensor Gas"));
});

test("parseTaskDescriptionBlocks handles full markdown table with separator row", () => {
  const tableText = `| Kolom 1 | Kolom 2 |
|---|---|
| Data 1 | Data 2 |
| Data 3 | Data 4 |`;

  const blocks = parseTaskDescriptionBlocks(tableText);
  assert.equal(blocks.length, 1);
  assert.equal(blocks[0].type, "table");
  const table = blocks[0] as any;
  assert.deepEqual(table.headers, ["Kolom 1", "Kolom 2"]);
  assert.deepEqual(table.rows, [
    ["Data 1", "Data 2"],
    ["Data 3", "Data 4"]
  ]);
});

test("getTaskDescriptionPreview cleans markdown syntax and limits preview lines", () => {
  const preview = getTaskDescriptionPreview(USER_DESCRIPTION_SAMPLE, 2);
  const lines = preview.split("\n");
  assert.equal(lines.length, 2);
  assert.ok(!preview.includes("| No |"));
  assert.ok(!preview.includes("**"));
});
