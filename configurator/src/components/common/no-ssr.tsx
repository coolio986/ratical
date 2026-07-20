'use client';
/** no-ssr.tsx — Shared/common UI component. See docs/ARCHITECTURE.md §4. */
import { useIsClient } from '@/hooks/isClient';
import dynamic from 'next/dynamic';
import React, { lazy } from 'react';
import { FullLoadScreen } from '@/components/common/full-load-screen';
export const NoSSR = (props: React.PropsWithChildren<{ fallback?: React.ReactNode }>) => {
	const isClient = useIsClient();
	return isClient ? <DynamicImport>{props.children}</DynamicImport> : props.fallback ?? <FullLoadScreen />;
};
const DynamicImport = lazy(() =>
	Promise.resolve({ default: (props: React.PropsWithChildren) => <>{props.children}</> }),
);
