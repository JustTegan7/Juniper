import type { Metadata } from "next";
import { getCtx } from "../../../lib/services/ctx";

export const metadata: Metadata = { title: "Home" };

// Placeholder home screen. Each app replaces this with its own first screen.
export default async function HomePage() {
  const ctx = await getCtx();
  return (
    <div>
      <h1 className="text-3xl font-bold">Hi, {ctx.name.split(" ")[0]}</h1>
      <p className="mt-2 text-muted">
        You are signed in to {ctx.workspace.name} as <span className="capitalize">{ctx.role}</span>.
      </p>
      <p className="card mt-6 p-10 text-center text-muted">Built from the Evergreen Digital App Template. App screens go here.</p>
    </div>
  );
}
