/** lists.ts — Internal helper/hook for the App-Router pages. See docs/ARCHITECTURE.md §4. */
export const categorizeList = <T>(list: T[], categorizer: (item: T) => string): Record<string, T[]> => {
	const categorizedList: Record<string, T[]> = {};

	list.forEach((item) => {
		const category = categorizer(item);
		if (!categorizedList[category]) {
			categorizedList[category] = [];
		}
		categorizedList[category].push(item);
	});

	return categorizedList;
};
