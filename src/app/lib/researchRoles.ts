export const MAHASISWA_LEADER_ROLE = "Mahasiswa Ketua Riset";

export const MAHASISWA_RESEARCH_ROLES = [
  MAHASISWA_LEADER_ROLE,
  "Web Developer",
  "QA",
  "IoT",
  "Data Science",
  "Machine Learning",
  "Sosial Media",
  "Creative Content",
  "Anggota Inti",
  "Backend Dev",
  "Frontend Dev",
  "Hardware Dev",
  "Data Analyst",
  "Asisten Peneliti",
  "Fullstack Dev",
  "Anggota"
];

export const DOSEN_RESEARCH_ROLES = [
  "Ketua Riset",
  "Pembimbing",
  "Co-Investigator",
  "Anggota Dosen"
];

export function isMahasiswaMemberType(memberType?: string | null) {
  return String(memberType || "").toLowerCase() === "mahasiswa";
}

export function getResearchRoleOptions(memberType?: string | null) {
  return isMahasiswaMemberType(memberType) ? MAHASISWA_RESEARCH_ROLES : DOSEN_RESEARCH_ROLES;
}

export function normalizeResearchRoleForMemberType(peran: string, memberType?: string | null) {
  if (isMahasiswaMemberType(memberType)) {
    return DOSEN_RESEARCH_ROLES.includes(peran) ? "Anggota" : peran;
  }

  if (peran === MAHASISWA_LEADER_ROLE || MAHASISWA_RESEARCH_ROLES.includes(peran)) {
    return peran === "Pembimbing" ? peran : "Pembimbing";
  }

  return peran;
}

export interface DivisionRole {
  id: string;
  divisionId: string;
  projectId: string;
  name: string;
  isActive: boolean;
  sortOrder?: number;
}

export const DEFAULT_DIVISION_ROLES: Record<string, string[]> = {
  web: [
    "Frontend Developer",
    "Backend Developer",
    "Fullstack Developer",
    "UI/UX Designer",
    "QA Engineer",
    "Web Division Lead"
  ],
  iot: [
    "Hardware Engineer",
    "Firmware Developer",
    "Embedded Systems",
    "IoT Specialist",
    "IoT Division Lead"
  ],
  ai: [
    "Machine Learning Engineer",
    "Data Scientist",
    "Data Analyst",
    "NLP/CV Specialist",
    "AI Division Lead"
  ],
  mobile: [
    "Android Developer",
    "iOS Developer",
    "Flutter/RN Developer",
    "Mobile UI/UX",
    "Mobile Division Lead"
  ]
};

export function normalizeDivisionRole(item: any): DivisionRole {
  return {
    id: String(item?.id ?? `role-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`),
    divisionId: String(item?.divisionId ?? item?.division_id ?? ""),
    projectId: String(item?.projectId ?? item?.project_id ?? ""),
    name: String(item?.name ?? "").trim(),
    isActive: item?.isActive ?? item?.is_active ?? true,
    sortOrder: Number(item?.sortOrder ?? item?.sort_order ?? 0)
  };
}

export function validateDivisionRoleName(
  name: string,
  existingRoles: Array<DivisionRole | string>
): { valid: boolean; error?: string } {
  const trimmed = name.trim();
  if (!trimmed) {
    return { valid: false, error: "Nama role tidak boleh kosong." };
  }
  if (trimmed.length < 2) {
    return { valid: false, error: "Nama role minimal 2 karakter." };
  }
  if (trimmed.length > 50) {
    return { valid: false, error: "Nama role maksimal 50 karakter." };
  }

  const lower = trimmed.toLowerCase();
  const duplicate = existingRoles.some((r) => {
    const existingName = typeof r === "string" ? r : r?.name;
    return String(existingName || "").trim().toLowerCase() === lower;
  });

  if (duplicate) {
    return { valid: false, error: "Role dengan nama tersebut sudah ada." };
  }

  return { valid: true };
}

export function getRolesForDivision(
  divisionId?: string | null,
  divisionName?: string | null,
  customDivisionRoles?: DivisionRole[]
): string[] {
  const custom = (customDivisionRoles || [])
    .filter((r) => (!divisionId || r.divisionId === divisionId) && r.isActive !== false)
    .map((r) => r.name.trim())
    .filter(Boolean);

  let defaults: string[] = [];
  if (divisionName) {
    const key = divisionName.trim().toLowerCase();
    for (const [prefix, roles] of Object.entries(DEFAULT_DIVISION_ROLES)) {
      if (key.includes(prefix)) {
        defaults = roles;
        break;
      }
    }
  }

  return Array.from(new Set([...custom, ...defaults]));
}

export function getCombinedMemberRoles(
  memberType?: string | null,
  divisionId?: string | null,
  divisionName?: string | null,
  customDivisionRoles?: DivisionRole[]
): string[] {
  const baseRoles = getResearchRoleOptions(memberType);
  if (!isMahasiswaMemberType(memberType)) {
    return baseRoles;
  }

  const divisionRoles = getRolesForDivision(divisionId, divisionName, customDivisionRoles);
  return Array.from(new Set([...divisionRoles, ...baseRoles]));
}

export function getStorageKeyForDivisionRoles(projectId: string, divisionId?: string): string {
  return divisionId
    ? `stasrg_div_roles_${projectId}_${divisionId}`
    : `stasrg_div_roles_${projectId}`;
}

export function loadStoredDivisionRoles(projectId: string, divisionId?: string): DivisionRole[] {
  if (typeof window === "undefined" || !window.localStorage) return [];
  try {
    const raw = window.localStorage.getItem(getStorageKeyForDivisionRoles(projectId, divisionId));
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.map(normalizeDivisionRole) : [];
  } catch {
    return [];
  }
}

export function saveStoredDivisionRoles(projectId: string, divisionId: string, roles: DivisionRole[]): void {
  if (typeof window === "undefined" || !window.localStorage) return;
  try {
    window.localStorage.setItem(
      getStorageKeyForDivisionRoles(projectId, divisionId),
      JSON.stringify(roles)
    );
  } catch {}
}

