export default function DashboardLoading() {
  return (
    <div className="mx-auto w-full max-w-4xl px-6 py-10">
      <div className="h-8 w-48 animate-pulse rounded-md bg-muted" />
      <div className="mt-2 h-4 w-72 animate-pulse rounded-md bg-muted" />
      <div className="mt-8 grid gap-4 sm:grid-cols-2">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="flex gap-4 rounded-lg border border-border p-4">
            <div className="h-16 w-16 animate-pulse rounded-full bg-muted" />
            <div className="flex-1">
              <div className="h-4 w-2/3 animate-pulse rounded bg-muted" />
              <div className="mt-2 h-3 w-full animate-pulse rounded bg-muted" />
              <div className="mt-1 h-3 w-1/2 animate-pulse rounded bg-muted" />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
