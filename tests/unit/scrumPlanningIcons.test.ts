import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const rootDir = process.cwd();
const scrumPlanningPath = path.join(rootDir, "src/app/components/pages/operator/ScrumPlanning.tsx");
const sharedBoardPath = path.join(rootDir, "src/app/components/organisms/SharedBoardView.tsx");

test("ScrumPlanning.tsx imports FileText from lucide-react", () => {
  const content = fs.readFileSync(scrumPlanningPath, "utf-8");

  // Verify lucide-react import contains FileText
  const lucideImportMatch = content.match(/import\s*\{([^}]+)\}\s*from\s*["']lucide-react["']/);
  assert.ok(lucideImportMatch, "lucide-react import statement must exist");

  const importedIcons = lucideImportMatch[1]
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);

  assert.ok(
    importedIcons.includes("FileText"),
    `FileText must be explicitly imported from lucide-react. Found imports: ${importedIcons.join(", ")}`
  );
});

test("ScrumPlanning.tsx has no undefined JSX icon or component references", () => {
  const content = fs.readFileSync(scrumPlanningPath, "utf-8");

  // Extract all imported identifiers from lucide-react
  const lucideImportMatch = content.match(/import\s*\{([^}]+)\}\s*from\s*["']lucide-react["']/);
  const lucideIcons = new Set(
    (lucideImportMatch ? lucideImportMatch[1] : "")
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean)
  );

  // Extract all JSX tags: <Tag ... or <Tag />
  const lines = content.split("\n");
  const jsxTagRegex = /(?:^|[\s\(\{\[\>\,\;])<([A-Z][A-Za-z0-9_]*)(?=[\s\/\>])/g;

  const knownLocalOrImported = new Set([
    "LayoutComponent",
    "OperatorLayout",
    "DosenLayout",
    "React",
    ...lucideIcons,
  ]);

  const usedComponents = new Set<string>();
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    let match;
    while ((match = jsxTagRegex.exec(line)) !== null) {
      usedComponents.add(match[1]);
    }
  }

  for (const comp of usedComponents) {
    assert.ok(
      knownLocalOrImported.has(comp),
      `JSX component <${comp} /> used in ScrumPlanning.tsx must be imported or defined. Line tag: ${comp}`
    );
  }
});

test("ScrumPlanning.tsx renders FileText icon inside Review and Closed sprint summary buttons", () => {
  const content = fs.readFileSync(scrumPlanningPath, "utf-8");

  // Review sprint button
  assert.ok(
    content.includes("Buka Summary"),
    "ScrumPlanning must contain 'Buka Summary' button for review sprints"
  );
  assert.ok(
    /<button[\s\S]*?<FileText\s+size=\{14\}\s*\/>[\s\S]*?Buka Summary[\s\S]*?<\/button>/.test(content),
    "Buka Summary button must render <FileText size={14} /> icon"
  );

  // Closed sprint button
  assert.ok(
    content.includes("Lihat Summary"),
    "ScrumPlanning must contain 'Lihat Summary' button for closed sprints"
  );
  assert.ok(
    /<button[\s\S]*?<FileText\s+size=\{14\}\s*\/>[\s\S]*?Lihat Summary[\s\S]*?<\/button>/.test(content),
    "Lihat Summary button must render <FileText size={14} /> icon"
  );
});

test("SharedBoardView.tsx preserves hook order before early returns", () => {
  const content = fs.readFileSync(sharedBoardPath, "utf-8");
  const lines = content.split("\n");

  let firstReturnLine = -1;
  let loadTaskDevLine = -1;

  for (let i = 0; i < lines.length; i++) {
    const lineNum = i + 1;
    const line = lines[i];

    if (firstReturnLine === -1 && line.includes("if (loading) {")) {
      firstReturnLine = lineNum;
    }
    if (line.includes("loadTaskDevelopmentData = React.useCallback(")) {
      loadTaskDevLine = lineNum;
    }
  }

  assert.ok(firstReturnLine > 0, "Early return 'if (loading) {' must exist");
  assert.ok(loadTaskDevLine > 0, "loadTaskDevelopmentData hook must exist");
  assert.ok(
    loadTaskDevLine < firstReturnLine,
    `loadTaskDevelopmentData (line ${loadTaskDevLine}) must execute before early return (line ${firstReturnLine})`
  );
});
