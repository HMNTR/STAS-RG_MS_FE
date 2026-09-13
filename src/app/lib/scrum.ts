export type SprintLifecycleStatus = "planning" | "active" | "review" | "closed" | "completed";

export interface ProjectDivision {
  id: string;
  name: string;
  projectId?: string;
  isActive?: boolean;
  sortOrder?: number;
}

export interface NormalizedTaskDivisionFields {
  divisionId: string | null;
  divisionName: string | null;
  divisionIsActive: boolean | null;
  sprintId: string | null;
  storyPoints: number | null;
}

export function normalizeTaskDivisionFields(item: any): NormalizedTaskDivisionFields {
  const divisionId = item?.divisionId ?? item?.division_id ?? null;
  const divisionName = item?.divisionName ?? item?.division_name ?? null;
  const rawDivisionIsActive = item?.divisionIsActive ?? item?.division_is_active;
  const divisionIsActive =
    rawDivisionIsActive !== undefined && rawDivisionIsActive !== null
      ? Boolean(rawDivisionIsActive)
      : null;
  const sprintId = item?.sprintId ?? item?.sprint_id ?? null;
  const rawStoryPoints =
    item?.storyPoints ?? item?.story_points ?? (item?.sp !== undefined && item?.sp !== null ? Number(item.sp) : null);
  const storyPoints =
    rawStoryPoints !== null && rawStoryPoints !== undefined && !Number.isNaN(Number(rawStoryPoints))
      ? Number(rawStoryPoints)
      : null;

  return {
    divisionId: divisionId ? String(divisionId) : null,
    divisionName: divisionName ? String(divisionName) : null,
    divisionIsActive,
    sprintId: sprintId ? String(sprintId) : null,
    storyPoints,
  };
}

export function normalizeDivisionItem(item: any): ProjectDivision {
  return {
    id: String(item?.id ?? ""),
    name: String(item?.name ?? "").trim(),
    projectId: item?.projectId ?? item?.project_id ? String(item?.projectId ?? item?.project_id) : undefined,
    isActive: item?.isActive ?? item?.is_active ?? true,
    sortOrder: Number(item?.sortOrder ?? item?.sort_order ?? 0),
  };
}

export function filterTasksForBoard<
  T extends {
    sprintId?: string | null;
    divisionId?: string | null;
    assigneeUserIds?: string[];
  }
>(
  tasks: T[],
  options: {
    activeSprintId?: string | null;
    selectedDivisionId?: string; // "all", "unassigned", or specific division id
    onlyMyTasks?: boolean;
    currentUserId?: string | null;
  }
): T[] {
  const { activeSprintId, selectedDivisionId = "all", onlyMyTasks = false, currentUserId } = options;

  return tasks.filter((task) => {
    // 1. Active Sprint scope (when active Sprint exists)
    if (activeSprintId) {
      if (task.sprintId !== activeSprintId) {
        return false;
      }
    }

    // 2. Selected Division
    if (selectedDivisionId && selectedDivisionId !== "all") {
      if (selectedDivisionId === "unassigned") {
        if (task.divisionId) return false;
      } else {
        if (task.divisionId !== selectedDivisionId) return false;
      }
    }

    // 3. "Tugas Saya Saja"
    if (onlyMyTasks && currentUserId) {
      if (!task.assigneeUserIds?.includes(currentUserId)) {
        return false;
      }
    }

    return true;
  });
}

export interface DivisionTabInfo {
  id: string; // "all", "unassigned", or divisionId
  label: string;
  count: number;
}

export function getDivisionTabs(
  scopedTasks: Array<{ divisionId?: string | null }>,
  divisions: ProjectDivision[]
): DivisionTabInfo[] {
  const activeDivisions = divisions.filter((d) => d.isActive !== false);

  const tabs: DivisionTabInfo[] = [
    {
      id: "all",
      label: "Semua Divisi",
      count: scopedTasks.length,
    },
  ];

  for (const div of activeDivisions) {
    const count = scopedTasks.filter((t) => t.divisionId === div.id).length;
    tabs.push({
      id: div.id,
      label: div.name,
      count,
    });
  }

  const unassignedCount = scopedTasks.filter((t) => !t.divisionId).length;
  if (unassignedCount > 0) {
    tabs.push({
      id: "unassigned",
      label: "Belum Ada Divisi",
      count: unassignedCount,
    });
  }

  return tabs;
}

export function validateTaskDivision(
  divisionId: string | null | undefined,
  activeDivisions: ProjectDivision[]
): { valid: boolean; error?: string } {
  if (activeDivisions.length > 0 && !divisionId) {
    return {
      valid: false,
      error: "Divisi wajib dipilih untuk proyek ini.",
    };
  }
  return { valid: true };
}

export const END_SPRINT_CONFIRMATION_MESSAGE =
  "Sprint akan masuk ke tahap Review. Summary, rapat, evaluasi anggota, dan keputusan task yang belum selesai akan diproses sebelum Sprint berikutnya dapat dimulai.";
