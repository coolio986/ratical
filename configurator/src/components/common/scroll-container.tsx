/** scroll-container.tsx — Shared/common UI component. See docs/ARCHITECTURE.md §4. */
import { twMerge } from 'tailwind-merge';

export const ScrollContainer = (props: JSX.IntrinsicElements['div']) => {
	return <div {...props} className={twMerge('scrollable', props.className)} />;
};
