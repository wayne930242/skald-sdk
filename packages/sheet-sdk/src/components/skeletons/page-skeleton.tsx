import { Skeleton } from "@skald/sheet-sdk/components/ui/skeleton";
import { Card, CardContent, CardHeader } from "@skald/sheet-sdk/components/ui/card";

/**
 * Hero section skeleton - matches the hero header pattern used across pages
 */
export function HeroSkeleton({
  showButton = false,
}: {
  showButton?: boolean;
}) {
  return (
    <div className="border-b bg-gradient-to-b from-muted/50 to-background">
      <div className="container mx-auto px-4 py-8 md:py-12">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div className="max-w-2xl space-y-3">
            <Skeleton className="h-9 w-48 md:h-10 md:w-64" />
            <Skeleton className="h-5 w-72" />
          </div>
          {showButton && <Skeleton className="h-11 w-36 rounded-md" />}
        </div>
      </div>
    </div>
  );
}

/**
 * Filter pills skeleton - matches category/filter button rows
 */
export function FilterPillsSkeleton({ count = 3 }: { count?: number }) {
  return (
    <div className="flex flex-wrap gap-2">
      {Array.from({ length: count }).map((_, i) => (
        <Skeleton key={i} className="h-10 w-24 rounded-full" />
      ))}
    </div>
  );
}

/**
 * System card skeleton - matches the SystemSelector card layout
 */
export function SystemCardSkeleton() {
  return (
    <Card className="flex flex-col">
      <CardHeader className="relative overflow-visible pb-3">
        <div className="absolute -top-5 right-0">
          <div className="flex gap-1 rounded-full border bg-background p-1 shadow-sm">
            <Skeleton className="h-8 w-8 rounded-md" />
            <Skeleton className="h-8 w-8 rounded-md" />
            <Skeleton className="h-8 w-8 rounded-md" />
          </div>
        </div>
        <div className="space-y-2 pt-8">
          <Skeleton className="h-5 w-32" />
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-4 w-2/3" />
        </div>
      </CardHeader>
      <CardContent className="flex flex-col flex-1 pt-0">
        <div className="space-y-2 flex-1 mb-4">
          <Skeleton className="h-3 w-20" />
          <div className="flex flex-wrap gap-1.5">
            {Array.from({ length: 3 }).map((_, i) => (
              <Skeleton key={i} className="h-6 w-16 rounded-md" />
            ))}
          </div>
        </div>
        <Skeleton className="h-10 w-full rounded-md" />
      </CardContent>
    </Card>
  );
}

/**
 * Character card skeleton - matches the character card layout
 */
export function CharacterCardSkeleton() {
  return (
    <Card className="h-full flex flex-col">
      <CardContent className="p-5 flex flex-col flex-1">
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-3">
            <Skeleton className="w-12 h-12 rounded-full" />
            <div className="space-y-2">
              <Skeleton className="h-5 w-28" />
              <Skeleton className="h-4 w-20" />
            </div>
          </div>
          <Skeleton className="h-5 w-16 rounded-full" />
        </div>
        <div className="flex-1" />
        <div className="flex items-center gap-2 mt-4 pt-4 border-t">
          <Skeleton className="h-8 w-16 rounded-md" />
          <Skeleton className="h-8 w-28 rounded-md" />
          <div className="flex-1" />
          <Skeleton className="h-8 w-8 rounded-md" />
        </div>
      </CardContent>
    </Card>
  );
}

/**
 * Grid skeleton - displays multiple card skeletons in a responsive grid
 */
export function GridSkeleton({
  count = 6,
  variant = "system",
}: {
  count?: number;
  variant?: "system" | "character";
}) {
  const CardComponent =
    variant === "character" ? CharacterCardSkeleton : SystemCardSkeleton;

  return (
    <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
      {Array.from({ length: count }).map((_, i) => (
        <CardComponent key={i} />
      ))}
    </div>
  );
}

/**
 * Complete page skeleton - combines hero + filters + grid
 */
export function PageSkeleton({
  showHeroButton = false,
  filterCount = 3,
  gridCount = 6,
  variant = "system",
}: {
  showHeroButton?: boolean;
  filterCount?: number;
  gridCount?: number;
  variant?: "system" | "character";
}) {
  return (
    <>
      <HeroSkeleton showButton={showHeroButton} />
      <main className="flex-1 container mx-auto px-4 py-8">
        <div className="space-y-8">
          <FilterPillsSkeleton count={filterCount} />
          <GridSkeleton count={gridCount} variant={variant} />
        </div>
      </main>
    </>
  );
}
