'use client';
import { useRouter } from 'next/navigation';
import { useEffect } from 'react';

export default function MacroPage({ params }: { params: { id: string } }) {
	const router = useRouter();

	useEffect(() => {
		router.replace(`/analysis/macros/${params.id}/recordings`);
	}, [params.id, router]);
}
