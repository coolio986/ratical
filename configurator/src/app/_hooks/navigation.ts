'use client';
/** navigation.ts — Internal helper/hook for the App-Router pages. See docs/ARCHITECTURE.md §4. */
import { usePathname, useRouter } from 'next/navigation';
import React, { useCallback, useEffect } from 'react';
import type { Route } from 'next';
import { AreaChart, LucideProps, Monitor, Move3D, Video, Wand, Wand2, FileText } from 'lucide-react';

export const useLocalPathname = () => {
	const pathname = (usePathname() ?? '/').replace('/configure', '') as Route;
	return pathname;
};

export const useIsRouteActive = () => {
	const pathname = useLocalPathname();
	return useCallback(
		(href: string) => {
			return pathname.startsWith(href);
		},
		[pathname],
	);
};

export type NavigationItem = {
	name: string;
	href: Route;
	current: boolean;
	icon: React.ComponentType<any>;
	iconClass?: string;
};

const routes: NavigationItem[] = [
	{ name: 'Setup Wizard', href: '/wizard', current: false, icon: Wand2 },
	{ name: 'Dashboard', href: '/', current: false, icon: Monitor },
	{ name: 'Motion', href: '/motion', current: false, icon: Move3D },
	{ name: 'Visual Calibration (BETA)', href: '/calibration', current: false, icon: Video },
	{ name: 'Realtime Analysis (BETA)', href: '/analysis', current: false, icon: AreaChart },
	{ name: 'Update Logs', href: '/update-logs', current: false, icon: FileText },
	// { name: 'Boards', href: '/', current: false, icon: Cpu },
	// { name: 'Toolhead', href: '/toolhead', current: false, icon: ArrowDownOnSquareIcon },
];

export const useNavigation = () => {
	const isRouteActive = useIsRouteActive();
	let prevActive: number | null = null;
	const result: typeof routes = [];
	routes.forEach((n, i) => {
		n.current = isRouteActive(n.href);
		if (n.current) {
			if (prevActive !== null && result[prevActive]?.href.length < n.href.length) {
				result[prevActive].current = false;
				prevActive = i;
			} else if (prevActive !== null) {
				n.current = false;
			} else {
				prevActive = i;
			}
		}
		result.push(n);
	});
	return result;
};

interface RedirecterProps extends React.PropsWithChildren {
	hasLastPrinterSettings: boolean;
}

export const Redirecter: React.FC<RedirecterProps> = (props) => {
	const router = useRouter();
	const isRouteActive = useIsRouteActive();

	// Compute the redirect condition at render time but perform navigation from within an effect.
	const shouldRedirect = !props.hasLastPrinterSettings && !isRouteActive('/wizard');

	useEffect(() => {
		if (shouldRedirect) {
			// Router navigation updates state; schedule it after render to avoid React warnings.
			router.replace('/wizard');
		}
	}, [shouldRedirect, router]);

	if (shouldRedirect) {
		// While redirecting, render nothing to avoid presenting the protected UI transiently.
		return null;
	}
	return props.children;
};
