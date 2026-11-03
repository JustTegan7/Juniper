"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { publicCancelAction, publicRescheduleAction } from "../../actions";
import { TimePicker } from "../../../../../components/booking/BookingFlow";

export function ManageView({ slug, token, tz, days, serviceId, staffId }: { slug: string; token: string; tz: string; days: string[]; serviceId: string; staffId: string }) {
  const router = useRouter();
  const [mode, setMode] = useState<"idle" | "move" | "cancel">("idle");
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function cancel() {
    setPending(true);
    const r = await publicCancelAction(slug, token);
    setPending(false);
    if (!r.ok) return setErr(r.error);
    setMsg(r.message);
    router.refresh();
  }

  async function move(start: string) {
    setPending(true);
    setErr(null);
    const r = await publicRescheduleAction(slug, token, start);
    setPending(false);
    if (!r.ok) return setErr(r.error);
    router.replace(`/b/${slug}/manage/${r.data}`);
    router.refresh();
  }

  if (msg) return <p className="card p-4 text-center font-semibold">{msg}</p>;

  return (
    <div className="space-y-3" style={{ ["--brand" as string]: "var(--brand)" }}>
      {err && <p className="text-sm text-overdue" role="alert">{err}</p>}
      {mode === "idle" && (
        <div className="flex flex-wrap gap-2">
          <button type="button" className="btn btn-primary" onClick={() => setMode("move")}>Pick a new time</button>
          <button type="button" className="btn btn-danger" onClick={() => setMode("cancel")}>Cancel appointment</button>
        </div>
      )}
      {mode === "cancel" && (
        <div className="card space-y-3 p-4">
          <p className="font-semibold">Cancel this appointment?</p>
          <div className="flex gap-2">
            <button type="button" className="btn btn-danger" disabled={pending} onClick={cancel}>{pending ? "Cancelling..." : "Yes, cancel it"}</button>
            <button type="button" className="btn btn-ghost" onClick={() => setMode("idle")}>Keep it</button>
          </div>
        </div>
      )}
      {mode === "move" && serviceId && (
        <div className="card p-4">
          <p className="mb-3 font-semibold">Pick a new time with the same person</p>
          <TimePicker slug={slug} days={days} tz={tz} query={{ serviceId, staffId }} value={null} onPick={(s) => !pending && move(s.start)} token={token} />
          <button type="button" className="btn btn-ghost btn-sm mt-2" onClick={() => setMode("idle")}>Never mind</button>
        </div>
      )}
    </div>
  );
}
