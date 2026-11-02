"use client";

export default function Error({ reset }: { error: Error; reset: () => void }) {
  return (
    <div className="mx-auto flex max-w-md flex-col items-center gap-4 px-4 py-32 text-center">
      <h1 className="text-2xl font-bold">Something went wrong</h1>
      <p className="text-muted">Try again. If it keeps happening, let us know.</p>
      <button className="btn btn-primary" onClick={reset}>Try again</button>
    </div>
  );
}
