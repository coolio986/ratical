/** layout.tsx — Part of the /configure/analysis (input-shaper / resonance) UI, charted with uPlot. See docs/ARCHITECTURE.md §4. */
import { headers } from 'next/headers';

export default function MotionLayout({ children }: { children: React.ReactNode }) {
	// Stupid hack to make this a dynamic component. Too much Next.js magic.
	headers().get('x-configurator');
	return <main className="h-full">{children}</main>;
}
