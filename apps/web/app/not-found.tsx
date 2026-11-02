import Link from "next/link";

export default function NotFound() {
  return (
    <div className="mx-auto flex max-w-md flex-col items-center gap-4 px-4 py-32 text-center">
      <h1 className="text-3xl font-bold">Page not found</h1>
      <p className="text-muted">That page does not exist or has moved.</p>
      <Link href="/" className="btn btn-primary">Back home</Link>
    </div>
  );
}
