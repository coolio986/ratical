import React, { useEffect, useState } from 'react';
import { RecoilValueReadOnly, useRecoilValue, constSelector } from 'recoil';
import { Dropdown, DropdownProps } from '@/components/forms/dropdown';

type Option = {
	id: number | string;
	connectedTo?: string;
	title: string;
	disabled?: boolean;
	badge?: any;
};

interface DropdownWithSelectorProps<DropdownOption extends Option = Option, CanClear extends boolean = false>
	extends Omit<DropdownProps<DropdownOption, CanClear>, 'options' | 'onShown' | 'isFetching'> {
	/**
	 * Recoil selector that provides the dropdown options.
	 * Should return an array of options compatible with the Dropdown component.
	 */
	optionsSelector: RecoilValueReadOnly<DropdownOption[]>;

	/**
	 * Optional: Recoil selector that tracks whether options are being fetched.
	 * If not provided, no loading state will be shown.
	 */
	isFetchingSelector?: RecoilValueReadOnly<boolean>;

	/**
	 * Whether to fetch options immediately or wait until dropdown is opened.
	 * Default: false (lazy load on open)
	 */
	fetchImmediately?: boolean;
}

const falseSelector = constSelector(false);

// Internal component that always subscribes to selectors
const DropdownWithSelectorInternal = <DropdownOption extends Option = Option, CanClear extends boolean = false>(
	props: Omit<DropdownWithSelectorProps<DropdownOption, CanClear>, 'fetchImmediately'> & {
		onShown: () => void;
	},
) => {
	const { optionsSelector, isFetchingSelector, value, onShown, ...dropdownProps } = props;

	// Subscribe to selectors
	const options = useRecoilValue(optionsSelector);
	const isFetchingValue = useRecoilValue(isFetchingSelector ?? falseSelector);

	// Correct the value by finding the matching option from the current options
	// This ensures badges and other dynamic properties are up-to-date
	const selectedOption = options.find((o) => {
		return o.id === value?.id && o.connectedTo === value?.connectedTo;
	});
	const correctedValue = selectedOption ?? value;

	return (
		<Dropdown
			{...dropdownProps}
			value={correctedValue}
			options={options}
			isFetching={isFetchingValue}
			onShown={onShown}
		/>
	);
};

/**
 * Dropdown component that uses Recoil selectors as the data source.
 * Provides lazy loading by default - options are only fetched when the dropdown is opened.
 *
 * This complements DropdownWithPrinterQuery by allowing selectors (which may aggregate
 * multiple queries or provide cached data) to be used as dropdown sources while maintaining
 * the same UX patterns (lazy loading, loading states, value correction).
 */
export const DropdownWithSelector = <DropdownOption extends Option = Option, CanClear extends boolean = false>(
	props: DropdownWithSelectorProps<DropdownOption, CanClear>,
) => {
	const { fetchImmediately = false, value, ...rest } = props;

	const [isShown, setIsShown] = useState(fetchImmediately);

	// Query the selector immediately if value has badges (same pattern as DropdownWithPrinterQuery)
	useEffect(() => {
		if (value?.badge != null && !isShown) {
			setIsShown(true);
		}
	}, [value?.badge, isShown]);

	if (!isShown) {
		// Before the dropdown is shown, render with minimal data to avoid triggering selectors
		// Must pass empty array to avoid badge rendering which would trigger selector
		const emptyOptions: DropdownOption[] = [];
		return (
			<React.Suspense>
				<Dropdown {...rest} value={null} options={emptyOptions} isFetching={false} onShown={() => setIsShown(true)} />
			</React.Suspense>
		);
	}

	return (
		<React.Suspense>
			<DropdownWithSelectorInternal {...rest} value={value} onShown={() => setIsShown(true)} />
		</React.Suspense>
	);
};
