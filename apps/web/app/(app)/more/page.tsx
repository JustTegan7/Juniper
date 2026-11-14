import type { Metadata } from "next";
import Link from "next/link";
import { isManager } from "@evergreen/core";
import { getCtx } from "../../../lib/services/ctx";

export const metadata: Metadata = { title: "More" };

/** Phone menu for the screens that do not fit in the bottom tabs. */
export default async function MorePage() {
  const ctx = await getCtx();
  const v = ctx.workspace.vocab;
  const links = [
    { href: "/messages", label: "Messages" },
    { href: "/time-off", label: "Time off" },
    { href: "/timesheets", label: "Timesheets" },
    ...(ctx.workspace.settings.shop.enabled ? [{ href: "/register", label: "Register" }, ...(isManager(ctx.role) ? [{ href: "/products", label: "Products" }] : [])] : []),
    ...(isManager(ctx.role)
      ? [
          { href: "/services", label: v.servicePlural },
          { href: "/team", label: "Team and schedules" },
          { href: "/settings", label: "Settings" },
        ]
      : []),
  ];
  return (
    <div>
      <h1 className="text-3xl font-bold">More</h1>
      <ul className="card mt-6 divide-y divide-line">
        {links.map((l) => (
          <li key={l.href}>
            <Link href={l.href} className="block px-4 py-3 font-semibold">{l.label}</Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
