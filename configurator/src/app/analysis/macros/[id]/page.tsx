'use client';
/** page.tsx — Part of the /configure/analysis (input-shaper / resonance) UI, charted with uPlot. See docs/ARCHITECTURE.md §4. */
import { useRouter } from 'next/navigation';
import { useEffect } from 'react';

export default function MacroPage({ params }: { params: { id: string } }) {
	const router = useRouter();

	useEffect(() => {
		router.replace(`/analysis/macros/${params.id}/recordings`);
	}, [params.id, router]);
}
