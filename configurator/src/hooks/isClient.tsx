'use client';
/** isClient.tsx — Custom React hook (client-side data/state). See docs/ARCHITECTURE.md §4. */
import { useEffect, useState } from 'react';

export const useIsClient = () => {
	const [isClient, setIsClient] = useState(false);
	useEffect(() => {
		if (typeof window !== 'undefined') {
			setIsClient(true);
		}
	}, []);
	return isClient;
};
