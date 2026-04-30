import { Skeleton } from "@/components/ui/skeleton";

export default function SharedDashboardLoading() {
  return (
    <div className="min-h-screen bg-background">
      <header className="border-b border-border/60">
        <div className="mx-auto flex w-full max-w-7xl items-center justify-between px-6 py-3">
          <div>
            <Skeleton className="mb-2 h-4 w-56" />
            <Skeleton className="h-3 w-40" />
          </div>
          <div className="flex items-center gap-3">
            <Skeleton className="h-8 w-8 rounded-md" />
            <Skeleton className="h-8 w-24" />
          </div>
        </div>
      </header>

      <main className="mx-auto w-full max-w-[110rem] px-6 py-5">
        <div className="rounded-lg border border-border/60 p-4">
          <div className="mb-4 flex items-center justify-between gap-3">
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <span className="h-4 w-4 animate-spin rounded-full border-2 border-primary border-t-transparent" />
              <span>Loading dashboard...</span>
            </div>
            <Skeleton className="h-8 w-28 rounded-full" />
          </div>

          <div className="grid gap-4 xl:grid-cols-12">
            <div className="rounded-lg border border-border/40 bg-card/50 p-4 xl:col-span-12">
              <Skeleton className="mb-4 h-5 w-64" />
              <div className="grid gap-3 md:grid-cols-4">
                {Array.from({ length: 4 }).map((_, index) => (
                  <Skeleton key={index} className="h-24 w-full" />
                ))}
              </div>
            </div>

            <div className="rounded-lg border border-border/40 bg-card/50 p-4 xl:col-span-7">
              <Skeleton className="mb-4 h-4 w-36" />
              <Skeleton className="h-[34rem] w-full" />
            </div>

            <div className="grid gap-4 xl:col-span-5">
              <div className="rounded-lg border border-border/40 bg-card/50 p-4">
                <Skeleton className="mb-4 h-4 w-40" />
                <Skeleton className="h-60 w-full" />
              </div>
              <div className="rounded-lg border border-border/40 bg-card/50 p-4">
                <Skeleton className="mb-4 h-4 w-44" />
                <div className="space-y-3">
                  {Array.from({ length: 6 }).map((_, index) => (
                    <Skeleton key={index} className="h-8 w-full" />
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
