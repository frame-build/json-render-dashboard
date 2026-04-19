import Link from "next/link";

export default function DashboardNotFound() {
  return (
    <div className="mx-auto flex min-h-screen w-full max-w-2xl flex-col items-center justify-center gap-4 px-6 text-center">
      <h1 className="text-2xl font-semibold">Shared dashboard not found</h1>
      <p className="text-sm text-muted-foreground">
        This share link may be invalid or expired.
      </p>
      <Link
        href="/"
        className="rounded-md border px-3 py-1.5 text-sm text-muted-foreground hover:text-foreground"
      >
        Back to chat
      </Link>
    </div>
  );
}
