import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { getDashboardShare } from "@/lib/shares";
import { SharedDashboardEditor } from "@/components/shared-dashboard-editor";
import { ThemeToggle } from "@/components/theme-toggle";
import type { Spec } from "@json-render/react";

interface PageProps {
  params: Promise<{ shareId: string }>;
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { shareId } = await params;
  const share = await getDashboardShare(shareId);

  if (!share) {
    return {
      title: "Dashboard not found",
    };
  }

  return {
    title: `${share.title} | Shared dashboard`,
    description: "Shared json-render dashboard",
  };
}

export default async function SharedDashboardPage({ params }: PageProps) {
  const { shareId } = await params;
  const share = await getDashboardShare(shareId);

  if (!share) {
    notFound();
  }

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b border-border/60">
        <div className="mx-auto flex w-full max-w-7xl items-center justify-between px-6 py-3">
          <div>
            <h1 className="text-sm font-semibold tracking-tight">{share.title}</h1>
            <p className="text-xs text-muted-foreground">
              Shared dashboard &middot; {new Date(share.createdAt).toLocaleString()}
            </p>
          </div>
          <div className="flex items-center gap-3">
            <ThemeToggle />
            <Link
              href="/"
              className="rounded-md border border-border/60 px-3 py-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors"
            >
              Back to chat
            </Link>
          </div>
        </div>
      </header>

      <main className="mx-auto w-full max-w-[110rem] px-6 py-5">
        <SharedDashboardEditor
          shareId={share.id}
          initialSpec={share.spec as Spec}
        />
      </main>
    </div>
  );
}
