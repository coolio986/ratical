/** layout.tsx — Part of the /configure/calibration VAOC (camera nozzle-offset) UI. See docs/ARCHITECTURE.md §4. */
import { headers } from 'next/headers';

export default function WizardLayout({ children }: { children: React.ReactNode }) {
	// Stupid hack to make this a dynamic component. Too much Next.js magic.
	headers().get('x-configurator');
	return (
		<main className="">
			<div className="mx-auto max-w-full">{children}</div>
		</main>
	);
}
