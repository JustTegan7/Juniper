// Shared domain types. Juniper One keeps the template's three base roles and
// gives each person a job title (Stylist, Front desk) as data.

/**
 * owner: everything, including billing-level settings and temporary passwords.
 * manager: runs the day (calendar for everyone, approves time off, edits timesheets, settings).
 * member: their own calendar, clients, time clock and time off.
 */
export const ROLES = ["owner", "manager", "member"] as const;
export type Role = (typeof ROLES)[number];

export const ROLE_LABELS: Record<Role, string> = { owner: "Owner", manager: "Manager", member: "Team member" };

export function isManager(role: Role): boolean {
  return role === "owner" || role === "manager";
}
