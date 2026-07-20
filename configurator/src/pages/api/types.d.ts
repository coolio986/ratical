/** types.d.ts — Legacy Next.js pages/ API route. See docs/ARCHITECTURE.md §4. */
export interface GenericErrorResponse {
	result: 'error';
	data: {
		message: string;
	};
}
