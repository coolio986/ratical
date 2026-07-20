/** layout.tsx — Part of the motion/kinematics configuration UI. See docs/ARCHITECTURE.md §4. */
import { headers } from 'next/headers';

export default function MotionLayout({ children }: { children: React.ReactNode }) {
	// Stupid hack to make this a dynamic component. Too much Next.js magic.
	headers().get('x-configurator');
	return <main className="">{children}</main>;
}
