// Shared domain types for every app built from this template. Apps add their own roles and types on top.

/** Base roles every workspace has. Apps can map their own job titles onto these. */
export const ROLES = ["owner", "manager", "member"] as const;
export type Role = (typeof ROLES)[number];
