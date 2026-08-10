import { Skeleton } from "@/components/ui/primitives";

export default function NotebookLoading() {
  return (
    <div className="mx-auto max-w-[1400px] px-8 py-8">
      <Skeleton className="mb-6 h-4 w-28" />

      <div className="mb-8 flex gap-6">
        <Skeleton className="hidden h-32 w-24 rounded-lg sm:block" />
        <div className="flex-1 space-y-2.5">
          <Skeleton className="h-10 w-72" />
          <Skeleton className="h-4 w-96" />
          <Skeleton className="h-4 w-56" />
        </div>
      </div>

      <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_260px]">
        <div className="grid grid-cols-2 gap-x-4 gap-y-6 sm:grid-cols-3 lg:grid-cols-4">
          {Array.from({ length: 8 }).map((_, index) => (
            <div key={index}>
              <Skeleton className="aspect-[3/4] w-full rounded-xl" />
              <Skeleton className="mt-2 h-4 w-2/3" />
            </div>
          ))}
        </div>
        <div className="hidden space-y-3 lg:block">
          <Skeleton className="h-4 w-32" />
          {Array.from({ length: 5 }).map((_, index) => (
            <Skeleton key={index} className="h-8 w-full" />
          ))}
        </div>
      </div>
    </div>
  );
}
