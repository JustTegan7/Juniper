"use client";

import { useRouter } from "next/navigation";
import { switchWorkspaceAction } from "../../app/(app)/actions";
import { useAct } from "./useAct";

/** Business picker for people on more than one team. Shows just the name otherwise. */
export function WorkspaceSwitcher({ current, currentName, workspaces }: { current: string; currentName: string; workspaces: { id: string; name: string }[] }) {
  const router = useRouter();
  const { act, pending } = useAct();
  if (workspaces.length < 2) return <p className="px-2 text-xs text-muted">{currentName}</p>;
  return (
    <label className="block px-2">
      <span className="sr-only">Business</span>
      <select
        className="input py-1 text-xs"
        value={current}
        disabled={pending}
        onChange={(e) => act(() => switchWorkspaceAction(e.target.value), () => router.push("/today"))}
      >
        {workspaces.map((w) => (
          <option key={w.id} value={w.id}>{w.name}</option>
        ))}
      </select>
    </label>
  );
}
