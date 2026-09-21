/**
 * Task Description Parser & Formatter
 * Mengonversi format markdown/teks terstruktur pada deskripsi task Scrum
 * menjadi block terstruktur (Header, Section, Table, List, Paragraph)
 * serta menyediakan preview bersih untuk kartu Kanban.
 */

export type TaskDescriptionBlock =
  | { type: "header"; level: number; text: string }
  | { type: "section"; title: string }
  | { type: "table"; headers: string[]; rows: string[][] }
  | { type: "list"; ordered: boolean; items: string[] }
  | { type: "paragraph"; text: string };

function isTableRow(line: string): boolean {
  const trimmed = line.trim();
  return trimmed.startsWith("|") && trimmed.endsWith("|") && trimmed.length >= 2;
}

function parseTableCells(line: string): string[] {
  const trimmed = line.trim().replace(/^\|/, "").replace(/\|$/, "");
  return trimmed.split("|").map((cell) => cell.trim());
}

function isTableSeparator(cells: string[]): boolean {
  return cells.length > 0 && cells.every((cell) => /^[-: ]+$/.test(cell));
}

function isBulletItem(line: string): { isBullet: boolean; text: string } {
  const match = line.trim().match(/^[-*]\s+(.+)$/);
  if (match) {
    return { isBullet: true, text: match[1].trim() };
  }
  return { isBullet: false, text: "" };
}

function isNumberedItem(line: string): { isNumbered: boolean; text: string } {
  const match = line.trim().match(/^\d+[.)]\s+(.+)$/);
  if (match) {
    return { isNumbered: true, text: match[1].trim() };
  }
  return { isNumbered: false, text: "" };
}

function isSectionTitle(line: string): boolean {
  const trimmed = line.trim();
  if (trimmed.length > 45 || trimmed.length < 3) return false;
  if (trimmed.startsWith("http://") || trimmed.startsWith("https://")) return false;
  if (trimmed.includes(",") || trimmed.includes(".")) return false;
  return trimmed.endsWith(":");
}

/**
 * Parse teks deskripsi menjadi array block terstruktur.
 */
export function parseTaskDescriptionBlocks(raw: string | undefined | null): TaskDescriptionBlock[] {
  if (!raw || !raw.trim()) return [];

  const rawLines = raw.replace(/\r\n/g, "\n").replace(/\r/g, "\n").split("\n");
  const blocks: TaskDescriptionBlock[] = [];

  let i = 0;
  while (i < rawLines.length) {
    const line = rawLines[i];
    const trimmed = line.trim();

    // 1. Skip empty lines
    if (!trimmed) {
      i++;
      continue;
    }

    // 2. Check Table
    if (isTableRow(line)) {
      const tableLines: string[] = [];
      while (i < rawLines.length && isTableRow(rawLines[i])) {
        tableLines.push(rawLines[i]);
        i++;
      }

      if (tableLines.length > 0) {
        const firstCells = parseTableCells(tableLines[0]);
        if (tableLines.length >= 2 && isTableSeparator(parseTableCells(tableLines[1]))) {
          const headers = firstCells;
          const rows = tableLines.slice(2).map(parseTableCells);
          blocks.push({ type: "table", headers, rows });
        } else {
          // Table tanpa pemisah eksplisit
          const headers = firstCells;
          const rows = tableLines.slice(1).map(parseTableCells);
          blocks.push({ type: "table", headers, rows });
        }
      }
      continue;
    }

    // 3. Check Bullet List
    const bulletCheck = isBulletItem(line);
    if (bulletCheck.isBullet) {
      const items: string[] = [bulletCheck.text];
      i++;
      while (i < rawLines.length) {
        const nextCheck = isBulletItem(rawLines[i]);
        if (nextCheck.isBullet) {
          items.push(nextCheck.text);
          i++;
        } else {
          break;
        }
      }
      blocks.push({ type: "list", ordered: false, items });
      continue;
    }

    // 4. Check Numbered List
    const numCheck = isNumberedItem(line);
    if (numCheck.isNumbered) {
      const items: string[] = [numCheck.text];
      i++;
      while (i < rawLines.length) {
        const nextCheck = isNumberedItem(rawLines[i]);
        if (nextCheck.isNumbered) {
          items.push(nextCheck.text);
          i++;
        } else {
          break;
        }
      }
      blocks.push({ type: "list", ordered: true, items });
      continue;
    }

    // 5. Check Markdown Heading (# Heading)
    const headingMatch = trimmed.match(/^(#{1,6})\s+(.+)$/);
    if (headingMatch) {
      blocks.push({
        type: "header",
        level: headingMatch[1].length,
        text: headingMatch[2].trim()
      });
      i++;
      continue;
    }

    // 6. Check Section Title (e.g., "Tujuan:", "Deliverable:")
    if (isSectionTitle(line)) {
      blocks.push({
        type: "section",
        title: trimmed
      });
      i++;
      continue;
    }

    // 7. Regular Paragraph
    const paragraphLines: string[] = [trimmed];
    i++;
    while (
      i < rawLines.length &&
      rawLines[i].trim() &&
      !isTableRow(rawLines[i]) &&
      !isBulletItem(rawLines[i]).isBullet &&
      !isNumberedItem(rawLines[i]).isNumbered &&
      !rawLines[i].trim().match(/^#{1,6}\s+/) &&
      !isSectionTitle(rawLines[i])
    ) {
      paragraphLines.push(rawLines[i].trim());
      i++;
    }

    blocks.push({
      type: "paragraph",
      text: paragraphLines.join("\n")
    });
  }

  return blocks;
}

/**
 * Menghasilkan preview teks ringkas dan bersih untuk kartu Kanban tanpa simbol markdown berantakan.
 */
export function getTaskDescriptionPreview(raw: string | undefined | null, maxLines: number = 3): string {
  if (!raw || !raw.trim()) return "";

  const clean = raw
    // Hapus format tabel markdown: | col1 | col2 | -> col1 • col2
    .replace(/^\|(.*)\|$/gm, (_, inner) => {
      const cells = inner.split("|").map((c: string) => c.trim()).filter(Boolean);
      if (cells.every((c: string) => /^[-: ]+$/.test(c))) return "";
      return cells.join(" • ");
    })
    // Ganti bullet list markdown - atau * dengan •
    .replace(/^[-*]\s+/gm, "• ")
    // Hapus heading hashes #
    .replace(/^#{1,6}\s+/gm, "")
    // Hapus bold/italic markers
    .replace(/\*\*(.*?)\*\*/g, "$1")
    .replace(/\*(.*?)\*/g, "$1")
    .replace(/__(.*?)__/g, "$1")
    .replace(/_(.*?)_/g, "$1")
    // Hapus inline code backticks
    .replace(/`([^`]+)`/g, "$1")
    .trim();

  // Pisahkan per baris non-empty
  const lines = clean.split("\n").map((l) => l.trim()).filter(Boolean);
  return lines.slice(0, maxLines).join("\n");
}
