/** loading.tsx — Part of the /configure/analysis (input-shaper / resonance) UI, charted with uPlot. See docs/ARCHITECTURE.md §4. */
import { Card } from '@/components/common/card';
import { FullLoadScreen } from '@/components/common/full-load-screen';
import { Skeleton } from '@/components/ui/skeleton';
export default function Loading() {
	return <FullLoadScreen />;
}
