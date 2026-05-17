import { cn } from '../types';

interface SkeletonProps {
  className?: string;
}

export function Skeleton({ className }: SkeletonProps) {
  return (
    <div 
      className={cn(
        "animate-pulse bg-brand-border/30 rounded-md",
        className
      )} 
    />
  );
}

export function CardSkeleton() {
  return (
    <div role="status" aria-label="Cargando contenido" className="p-4 rounded-2xl border border-brand-border/30 bg-brand-bg-card/30 space-y-4 mb-3">
      <div className="flex justify-between items-center">
        <div className="flex flex-col items-center space-y-2">
          <Skeleton className="w-10 h-10 rounded-xl" />
          <Skeleton className="h-2 w-16" />
        </div>
        <div className="flex flex-col items-center space-y-2">
          <Skeleton className="h-6 w-12 rounded-lg" />
          <Skeleton className="h-2 w-8" />
        </div>
        <div className="flex flex-col items-center space-y-2">
          <Skeleton className="w-10 h-10 rounded-xl" />
          <Skeleton className="h-2 w-16" />
        </div>
      </div>
      <div className="bg-brand-bg-primary/20 rounded-xl p-3 space-y-3">
        <div className="space-y-1">
          <div className="flex justify-between">
            <Skeleton className="h-2 w-8" />
            <Skeleton className="h-2 w-12" />
            <Skeleton className="h-2 w-8" />
          </div>
          <Skeleton className="h-1.5 w-full rounded-full" />
        </div>
        <div className="flex justify-between">
          <Skeleton className="h-3 w-10 rounded" />
          <Skeleton className="h-3 w-20 rounded" />
          <Skeleton className="h-3 w-10 rounded" />
        </div>
      </div>
    </div>
  );
}

export function TableRowSkeleton() {
  return (
    <div aria-label="Cargando fila" className="flex items-center space-x-4 p-3 border-b border-brand-border/30">
      <Skeleton className="w-6 h-6 rounded" />
      <Skeleton className="w-8 h-8 rounded-full" />
      <Skeleton className="h-4 flex-1 max-w-[120px]" />
      <Skeleton className="h-3 w-8" />
      <Skeleton className="h-3 w-8" />
      <Skeleton className="h-3 w-8" />
    </div>
  );
}
