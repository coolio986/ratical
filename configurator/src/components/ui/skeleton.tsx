/** skeleton.tsx — Design-system UI primitive (shared, presentational). See docs/ARCHITECTURE.md §4. */
import { cn } from '@/helpers/utils';

function Skeleton({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
	return <div className={cn('animate-pulse rounded-md bg-zinc-400/10', className)} {...props} />;
}

export { Skeleton };
