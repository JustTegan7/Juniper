// A tiny event bus so one screen can tell another "this changed" without a global store.
// Used when the Request time off screen closes: the Time off list refreshes and shows the server's message.
export type Topic = "time-off";
type Listener = (message?: string) => void;

const listeners = new Map<Topic, Set<Listener>>();

export function subscribe(topic: Topic, fn: Listener): () => void {
  let set = listeners.get(topic);
  if (!set) listeners.set(topic, (set = new Set()));
  set.add(fn);
  return () => {
    set.delete(fn);
  };
}

export function publish(topic: Topic, message?: string): void {
  for (const fn of [...(listeners.get(topic) ?? [])]) fn(message);
}
