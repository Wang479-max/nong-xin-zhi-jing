import React from 'react';
import { cn } from '../../lib/utils';

export const Skeleton = ({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) => {
  return (
    <div
      className={cn(
        "relative overflow-hidden rounded-md bg-slate-200 dark:bg-slate-800",
        className
      )}
      {...props}
    >
      <div 
        className="absolute inset-0 z-10 w-full h-full transform"
        style={{
          backgroundImage: 'linear-gradient(90deg, transparent 0%, rgba(255,255,255,0.08) 50%, transparent 100%)',
          animation: 'shimmer 2s infinite linear'
        }}
      />
    </div>
  );
};
