"use client";

import { useCallback, useEffect, useState, useTransition } from "react";
import { addGroupMembersAction, createGroupAction, deleteMessageAction, pollChatAction, removeGroupMemberAction, sendMessageAction, setMutedAction, startDirectAction } from "../actions";
import { Dialog } from "../../../components/app/Dialog";
import { useAct, useResultToast } from "../../../components/app/useAct";

type Team = { membershipId: string; name: string };
type Poll = Extract<Awaited<ReturnType<typeof pollChatAction>>, { ok: true }>;
type Conv = Poll["conversations"][number];
type Msg = Poll["messages"][number];

const POLL_MS = 5000;

function when(d: Date | string) {
  const t = new Date(d);
  const today = new Date();
  const sameDay = t.toDateString() === today.toDateString();
  return sameDay ? t.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" }) : t.toLocaleDateString([], { month: "short", day: "numeric" }) + " " + t.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
}

export function Messages({ meId, canModerate, team }: { meId: string; canModerate: boolean; team: Team[] }) {
  const [convs, setConvs] = useState<Conv[]>([]);
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [thread, setThread] = useState<Msg[]>([]);
  const [openId, setOpenId] = useState<string | null>(null);
  const [threadId, setThreadId] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [newOpen, setNewOpen] = useState(false);
  const [membersOpen, setMembersOpen] = useState(false);

  const refresh = useCallback(async () => {
    const r = await pollChatAction(openId, threadId);
    if (!r.ok) return;
    setConvs(r.conversations);
    setMsgs(r.messages);
    setThread(r.thread);
    setLoaded(true);
  }, [openId, threadId]);

  useEffect(() => {
    let stop = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const tick = async () => {
      if (document.visibilityState === "visible") await refresh();
      if (!stop) timer = setTimeout(tick, POLL_MS);
    };
    void tick();
    return () => {
      stop = true;
      if (timer) clearTimeout(timer);
    };
  }, [refresh]);

  const current = convs.find((c) => c.id === openId) ?? null;
  const parent = threadId ? msgs.find((m) => m.id === threadId) ?? null : null;

  function open(id: string) {
    setOpenId(id);
    setThreadId(null);
    setMsgs([]);
    setThread([]);
  }

  return (
    <div className="grid gap-4 md:grid-cols-[18rem_1fr]">
      <aside className={`${current ? "hidden md:block" : ""} space-y-3`}>
        <button className="btn btn-primary w-full" onClick={() => setNewOpen(true)}>New message</button>
        {loaded && convs.length === 0 && <p className="card p-4 text-sm text-muted">No conversations yet. Start one with a teammate or make a group.</p>}
        <ul className="card divide-y divide-line">
          {convs.map((c) => (
            <li key={c.id}>
              <button onClick={() => open(c.id)} className={`block w-full px-4 py-3 text-left ${c.id === openId ? "bg-surface-2" : "hover:bg-surface-2"}`}>
                <span className="flex items-center justify-between gap-2">
                  <span className="truncate font-semibold">{c.title}{c.muted ? " (muted)" : ""}</span>
                  {c.unread > 0 && !c.muted ? <span className="pill bg-primary text-primary-fg">{c.unread}</span> : null}
                </span>
                <span className="block truncate text-xs text-muted">{c.lastPreview ?? "No messages yet"}</span>
              </button>
            </li>
          ))}
        </ul>
      </aside>

      {current ? (
        <section className="card flex min-h-[60vh] flex-col">
          <header className="flex items-center justify-between gap-2 border-b border-line px-4 py-3">
            <span className="flex items-center gap-2">
              <button className="btn btn-ghost btn-sm md:hidden" onClick={() => setOpenId(null)}>Back</button>
              <span className="font-bold">{current.title}</span>
              {current.kind === "group" && <span className="text-xs text-muted">{current.memberCount} people</span>}
            </span>
            <span className="flex gap-2">
              {current.kind === "group" && <button className="btn btn-soft btn-sm" onClick={() => setMembersOpen(true)}>People</button>}
              <MuteButton conv={current} onDone={refresh} />
            </span>
          </header>
          <div className="flex-1 space-y-3 overflow-y-auto px-4 py-3">
            {msgs.length === 0 && <p className="text-sm text-muted">No messages yet. Say hello.</p>}
            {msgs.map((m) => (
              <MessageItem key={m.id} m={m} mine={m.senderMembershipId === meId} canDelete={canModerate || m.senderMembershipId === meId} onThread={() => setThreadId(m.id)} onChanged={refresh} />
            ))}
          </div>
          {parent && (
            <div className="border-t border-line bg-surface-2 px-4 py-3">
              <div className="mb-2 flex items-center justify-between">
                <span className="text-sm font-semibold">Thread on: {parent.deleted ? "deleted message" : parent.body.slice(0, 40)}</span>
                <button className="btn btn-ghost btn-sm" onClick={() => setThreadId(null)}>Close</button>
              </div>
              <div className="mb-2 max-h-48 space-y-2 overflow-y-auto">
                {thread.map((m) => (
                  <MessageItem key={m.id} m={m} mine={m.senderMembershipId === meId} canDelete={canModerate || m.senderMembershipId === meId} onChanged={refresh} />
                ))}
                {thread.length === 0 && <p className="text-xs text-muted">No replies yet.</p>}
              </div>
              {!parent.deleted && <Composer conversationId={current.id} parentId={parent.id} placeholder="Reply" onSent={refresh} />}
            </div>
          )}
          {!parent && <div className="border-t border-line px-4 py-3"><Composer conversationId={current.id} placeholder="Write a message" onSent={refresh} /></div>}
        </section>
      ) : (
        <section className="card hidden items-center justify-center p-8 text-muted md:flex">Pick a conversation.</section>
      )}

      <NewDialog open={newOpen} team={team} onClose={() => setNewOpen(false)} onCreated={(id) => { setNewOpen(false); open(id); void refresh(); }} />
      {current?.kind === "group" && <MembersDialog open={membersOpen} meId={meId} conversationId={current.id} team={team} onClose={() => setMembersOpen(false)} onChanged={refresh} />}
    </div>
  );
}

function MuteButton({ conv, onDone }: { conv: Conv; onDone: () => void }) {
  const { act, pending } = useAct();
  return (
    <button className="btn btn-soft btn-sm" disabled={pending} onClick={() => act(() => setMutedAction({ conversationId: conv.id, muted: !conv.muted }), onDone)}>
      {conv.muted ? "Unmute" : "Mute"}
    </button>
  );
}

function MessageItem({ m, mine, canDelete, onThread, onChanged }: { m: Msg; mine: boolean; canDelete: boolean; onThread?: () => void; onChanged: () => void }) {
  const { act, pending } = useAct();
  if (m.deleted) {
    return (
      <div className="text-sm italic text-muted">
        Message deleted
        {onThread && m.replyCount > 0 && <button className="ml-2 underline" onClick={onThread}>{m.replyCount} {m.replyCount === 1 ? "reply" : "replies"}</button>}
      </div>
    );
  }
  return (
    <div className={`max-w-[85%] ${mine ? "ml-auto" : ""}`}>
      <div className="text-xs text-muted">{mine ? "You" : m.senderName} · {when(m.createdAt)}</div>
      <div className={`whitespace-pre-wrap break-words rounded-xl px-3 py-2 text-sm ${mine ? "bg-primary text-primary-fg" : "bg-surface-2"}`}>{m.body}</div>
      <div className="mt-1 flex gap-3 text-xs text-muted">
        {onThread && <button className="underline" onClick={onThread}>{m.replyCount > 0 ? `${m.replyCount} ${m.replyCount === 1 ? "reply" : "replies"}` : "Reply"}</button>}
        {canDelete && (
          <button className="underline" disabled={pending} onClick={() => { if (window.confirm("Delete this message for everyone?")) act(() => deleteMessageAction({ id: m.id }), onChanged); }}>
            Delete
          </button>
        )}
      </div>
    </div>
  );
}

function Composer({ conversationId, parentId, placeholder, onSent }: { conversationId: string; parentId?: string; placeholder: string; onSent: () => void }) {
  const show = useResultToast();
  const [pending, start] = useTransition();
  const [text, setText] = useState("");
  function send() {
    if (!text.trim() || pending) return;
    start(async () => {
      const r = await sendMessageAction({ conversationId, parentId, body: text });
      if (!r.ok) return show(r);
      setText("");
      onSent();
    });
  }
  return (
    <form className="flex gap-2" onSubmit={(e) => { e.preventDefault(); send(); }}>
      <textarea
        className="input flex-1"
        rows={1}
        maxLength={4000}
        value={text}
        placeholder={placeholder}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" && !e.shiftKey) {
            e.preventDefault();
            send();
          }
        }}
      />
      <button className="btn btn-primary" disabled={pending || !text.trim()}>Send</button>
    </form>
  );
}

function NewDialog({ open, team, onClose, onCreated }: { open: boolean; team: Team[]; onClose: () => void; onCreated: (id: string) => void }) {
  const { act, pending } = useAct();
  const [title, setTitle] = useState("");
  const [picked, setPicked] = useState<string[]>([]);
  const toggle = (id: string) => setPicked((p) => (p.includes(id) ? p.filter((x) => x !== id) : [...p, id]));
  return (
    <Dialog open={open} onClose={onClose} title="New message">
      {open && (
        <div className="space-y-4">
          <div>
            <p className="label">Message one person</p>
            <ul className="divide-y divide-line rounded-lg border border-line">
              {team.length === 0 && <li className="px-3 py-2 text-sm text-muted">No one else is on the team yet.</li>}
              {team.map((t) => (
                <li key={t.membershipId}>
                  <button className="block w-full px-3 py-2 text-left hover:bg-surface-2" disabled={pending} onClick={() => act(() => startDirectAction({ membershipId: t.membershipId }), (r) => r.id && onCreated(r.id))}>{t.name}</button>
                </li>
              ))}
            </ul>
          </div>
          <form className="space-y-2" onSubmit={(e) => { e.preventDefault(); act(() => createGroupAction({ title, membershipIds: picked }), (r) => { setTitle(""); setPicked([]); if (r.id) onCreated(r.id); }); }}>
            <p className="label">Or start a group</p>
            <input className="input" placeholder="Group name" value={title} onChange={(e) => setTitle(e.target.value)} required />
            <div className="max-h-40 space-y-1 overflow-y-auto">
              {team.map((t) => (
                <label key={t.membershipId} className="flex items-center gap-2 text-sm"><input type="checkbox" checked={picked.includes(t.membershipId)} onChange={() => toggle(t.membershipId)} />{t.name}</label>
              ))}
            </div>
            <button className="btn btn-primary" disabled={pending || !title.trim()}>Create group</button>
          </form>
        </div>
      )}
    </Dialog>
  );
}

function MembersDialog({ open, meId, conversationId, team, onClose, onChanged }: { open: boolean; meId: string; conversationId: string; team: Team[]; onClose: () => void; onChanged: () => void }) {
  const { act, pending } = useAct();
  const [picked, setPicked] = useState<string[]>([]);
  return (
    <Dialog open={open} onClose={onClose} title="People in this group">
      {open && (
        <div className="space-y-3">
          <p className="text-sm text-muted">Add teammates. The person who made the group or a manager can add and remove people. Anyone can leave.</p>
          <div className="max-h-48 space-y-1 overflow-y-auto">
            {team.map((t) => (
              <label key={t.membershipId} className="flex items-center gap-2 text-sm">
                <input type="checkbox" checked={picked.includes(t.membershipId)} onChange={() => setPicked((p) => (p.includes(t.membershipId) ? p.filter((x) => x !== t.membershipId) : [...p, t.membershipId]))} />
                {t.name}
              </label>
            ))}
          </div>
          <div className="flex flex-wrap gap-2">
            <button className="btn btn-primary" disabled={pending || picked.length === 0} onClick={() => act(() => addGroupMembersAction({ conversationId, membershipIds: picked }), () => { setPicked([]); onChanged(); onClose(); })}>Add selected</button>
            <button className="btn btn-danger" disabled={pending} onClick={() => { if (window.confirm("Leave this group?")) act(() => removeGroupMemberAction({ conversationId, membershipId: meId }), () => { onChanged(); onClose(); }); }}>Leave group</button>
          </div>
        </div>
      )}
    </Dialog>
  );
}
