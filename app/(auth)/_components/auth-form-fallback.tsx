import { Skeleton } from "@/components/ui/primitives";

export function AuthFormFallback() {
  return (
    <div className="space-y-7">
      <div className="space-y-2">
        <Skeleton className="h-9 w-56" />
        <Skeleton className="h-4 w-72" />
      </div>
      <div className="space-y-4">
        <Skeleton className="h-14 w-full" />
        <Skeleton className="h-14 w-full" />
        <Skeleton className="h-11 w-full" />
      </div>
    </div>
  );
}
