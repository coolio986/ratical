/** lib-tailwind.d.ts — Configurator source module. See docs/ARCHITECTURE.md §4. */
declare module 'tailwindcss/lib/util/flattenColorPalette' {
	export default function flattenColorPalette(
		colors: Record<string, string | Record<string, string>>,
	): Record<string, string>;
}

declare module 'tailwindcss/lib/util/color' {
	export const parseColor: (color: string) => {
		mode: 'hsl' | 'rgb' | 'hsla' | 'rgba';
		color: [number, number, number];
		alpha?: string;
	};
	export const formatColor: (color: {
		mode: 'hsl' | 'rgb' | 'hsla' | 'rgba';
		color: [number, number, number];
		alpha?: string;
	}) => string;
}
