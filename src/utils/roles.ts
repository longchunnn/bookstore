const ROLE_ID_TO_NAME: Record<string, string> = {
  "1": "ADMIN",
  "2": "STAFF",
  "3": "USER",
};

export function normalizeRole(value: unknown): string {
  const safe = String(value ?? "")
    .trim()
    .toUpperCase();
  if (!safe) return "";

  const withoutPrefix = safe.startsWith("ROLE_") ? safe.slice(5) : safe;
  return ROLE_ID_TO_NAME[withoutPrefix] ?? withoutPrefix;
}

function normalizeRoleEntry(value: unknown): string {
  const normalized = normalizeRole(value);
  return normalized ? `ROLE_${normalized}` : "";
}

export function hasRole(roles: string[] | undefined, role: string): boolean {
  const target = normalizeRoleEntry(role);
  if (!target) return false;
  return Array.isArray(roles)
    ? roles.some((item) => normalizeRoleEntry(item) === target)
    : false;
}

export function isStaffRole(role: string | undefined): boolean {
  const normalized = normalizeRole(role);
  return ["ADMIN", "STAFF", "MANAGER"].includes(normalized);
}

function collectRoleCandidates(value: unknown): unknown[] {
  if (!value) return [];
  if (Array.isArray(value)) return value.flatMap(collectRoleCandidates);
  if (typeof value === "object") {
    const record = value as Record<string, unknown>;
    return [
      record.role,
      record.roleName,
      record.role_name,
      record.authority,
      record.name,
    ].filter((item) => item !== undefined);
  }
  return [value];
}

export function resolvePrimaryRole(payload: unknown): string {
  const record =
    payload && typeof payload === "object"
      ? (payload as Record<string, unknown>)
      : {};

  const candidates = [
    record.primary_role,
    record.primaryRole,
    record.role,
    record.role_name,
    record.roleName,
    record.authority,
    ...collectRoleCandidates(record.roles),
    ...collectRoleCandidates(record.authorities),
  ]
    .map((item) => normalizeRole(item))
    .filter(Boolean);

  if (candidates.includes("ADMIN")) return "ADMIN";
  if (candidates.includes("MANAGER")) return "MANAGER";
  if (candidates.includes("STAFF")) return "STAFF";
  if (candidates.includes("USER")) return "USER";
  return candidates[0] ?? "";
}

export function resolveRoles(payload: unknown, primaryRole = ""): string[] {
  const record =
    payload && typeof payload === "object"
      ? (payload as Record<string, unknown>)
      : {};
  const normalizedPrimaryRole = normalizeRole(primaryRole) || resolvePrimaryRole(payload);
  const candidates = [
    ...collectRoleCandidates(record.roles),
    ...collectRoleCandidates(record.authorities),
    record.primary_role,
    record.primaryRole,
    record.role,
    record.role_name,
    record.roleName,
    record.authority,
    normalizedPrimaryRole,
  ]
    .map((item) => normalizeRole(item))
    .filter(Boolean)
    .map((item) => `ROLE_${item}`);

  return Array.from(new Set(candidates));
}
