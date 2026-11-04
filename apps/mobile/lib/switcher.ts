// Business switcher rules. Pure functions, so they can be tested without a phone.
import type { BusinessRef } from "./types";

export type WorkspaceChoice =
  /** Use this business. `switchNeeded` is true when it differs from the one /me already returned. */
  | { kind: "use"; id: string; switchNeeded: boolean }
  /** On several businesses and nothing saved (or the saved one is gone): ask. */
  | { kind: "choose" }
  /** Not on any business. */
  | { kind: "none" };

/**
 * Decide which business the app works in.
 * `current` is the business the server picked for the last /me call (the saved one, or the first when none was sent).
 */
export function resolveWorkspace(workspaces: BusinessRef[], savedId: string | null, currentId: string | null): WorkspaceChoice {
  if (workspaces.length === 0) return { kind: "none" };
  if (savedId && workspaces.some((w) => w.id === savedId)) {
    return { kind: "use", id: savedId, switchNeeded: savedId !== currentId };
  }
  if (workspaces.length === 1) {
    const only = workspaces[0].id;
    return { kind: "use", id: only, switchNeeded: only !== currentId };
  }
  return { kind: "choose" };
}

/** Whether the More tab should offer "Switch business". */
export function canSwitch(workspaces: BusinessRef[]): boolean {
  return workspaces.length > 1;
}

/** Businesses other than the active one, in the order the server gave them. */
export function otherBusinesses(workspaces: BusinessRef[], activeId: string | null): BusinessRef[] {
  return workspaces.filter((w) => w.id !== activeId);
}
