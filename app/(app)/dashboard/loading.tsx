import { Skeleton } from "@/components/ui/primitives";

export default function DashboardLoading() {
  return (
    <div className="mx-auto max-w-[1400px] px-8 py-8">
      <div className="mb-8 flex items-end justify-between gap-4">
        <div className="space-y-2">
          <Skeleton className="h-4 w-32" />
          <Skeleton className="h-10 w-64" />
        </div>
        <Skeleton className="h-9 w-36" />
      </div>

      <div className="mb-5 flex items-center gap-3">
        <Skeleton className="h-9 w-72" />
        <Skeleton className="h-9 w-64" />
      </div>

      <div className="grid grid-cols-2 gap-x-5 gap-y-7 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6">
        {Array.from({ length: 12 }).map((_, index) => (
          <div key={index}>
            <Skeleton className="aspect-[3/4] w-full rounded-xl" />
            <Skeleton className="mt-2.5 h-4 w-3/4" />
            <Skeleton className="mt-1.5 h-3 w-1/2" />
          </div>
        ))}
      </div>
    </div>
  );
}
