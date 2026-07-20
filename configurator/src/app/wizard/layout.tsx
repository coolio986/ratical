/** layout.tsx — Part of the setup-wizard UI (the flow that generates Ratical.cfg). See docs/ARCHITECTURE.md §4. */
import { headers } from 'next/headers';

export default function WizardLayout({ children }: { children: React.ReactNode }) {
	// Stupid hack to make this a dynamic component. Too much Next.js magic.
	headers().get('x-configurator');
	return <main className="min-h-full">{children}</main>;
}
