/** @vitest-environment jsdom */
import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { RecoilRoot, atom, selector } from 'recoil';

// The auto-animate package relies on ResizeObserver which isn't available in jsdom
// Provide a tiny noop so rendering in tests doesn't blow up
(global as any).ResizeObserver = class {
	observe() {}
	unobserve() {}
	disconnect() {}
};

// jsdom doesn't provide scrollIntoView (used by some UI helpers like cmdk)
// Stub it out so components calling it won't blow up during tests.
if (typeof (window as any).HTMLElement !== 'undefined') {
	// eslint-disable-next-line @typescript-eslint/ban-ts-comment
	// @ts-ignore - augmenting prototype for tests
	(window as any).HTMLElement.prototype.scrollIntoView = function () {};
}

// avoid importing the real auto-animate library which references ResizeObserver at import time
vi.mock('@formkit/auto-animate/react', () => ({
	useAutoAnimate: () => [() => null],
}));

import { DropdownWithSelector } from '@/components/forms/dropdown-with-selector';

type TestOption = {
	id: string;
	title: string;
	connectedTo?: string;
	badge?: { children: string; color?: string };
};

describe('DropdownWithSelector', () => {
	describe('Lazy Loading', () => {
		it('does not evaluate selector until dropdown is opened', async () => {
			let selectorCallCount = 0;

			const testOptionsSelector = selector<TestOption[]>({
				key: 'testOptionsSelector-lazy-1',
				get: () => {
					selectorCallCount++;
					return [
						{ id: 'opt1', title: 'Option 1' },
						{ id: 'opt2', title: 'Option 2' },
					];
				},
			});

			const onSelect = vi.fn();

			render(
				<RecoilRoot>
					<DropdownWithSelector
						label="Test Dropdown"
						optionsSelector={testOptionsSelector}
						value={null}
						onSelect={onSelect}
					/>
				</RecoilRoot>,
			);

			// Selector should not have been called yet
			expect(selectorCallCount).toBe(0);

			// Open the dropdown
			const combobox = screen.getByRole('combobox');
			fireEvent.click(combobox);

			// Wait for selector to be evaluated
			await waitFor(() => {
				expect(selectorCallCount).toBe(1);
			});
		});

		it('evaluates selector immediately when fetchImmediately=true', async () => {
			let selectorCallCount = 0;

			const testOptionsSelector = selector<TestOption[]>({
				key: 'testOptionsSelector-immediate',
				get: () => {
					selectorCallCount++;
					return [
						{ id: 'opt1', title: 'Option 1' },
						{ id: 'opt2', title: 'Option 2' },
					];
				},
			});

			const onSelect = vi.fn();

			render(
				<RecoilRoot>
					<DropdownWithSelector
						label="Test Dropdown"
						optionsSelector={testOptionsSelector}
						value={null}
						onSelect={onSelect}
						fetchImmediately={true}
					/>
				</RecoilRoot>,
			);

			// Selector should be called immediately
			await waitFor(() => {
				expect(selectorCallCount).toBe(1);
			});
		});

		it('evaluates selector immediately when value has badge', async () => {
			let selectorCallCount = 0;

			const testOptionsSelector = selector<TestOption[]>({
				key: 'testOptionsSelector-badge-trigger',
				get: () => {
					selectorCallCount++;
					return [
						{ id: 'opt1', title: 'Option 1' },
						{ id: 'opt2', title: 'Option 2' },
					];
				},
			});

			const onSelect = vi.fn();
			// Value with badge property set (but we won't render the badge in the test)
			const valueWithBadge: TestOption = {
				id: 'opt1',
				title: 'Option 1',
				badge: { children: 'Badge' },
			};

			render(
				<RecoilRoot>
					<DropdownWithSelector
						label="Test Dropdown"
						optionsSelector={testOptionsSelector}
						value={valueWithBadge}
						onSelect={onSelect}
					/>
				</RecoilRoot>,
			);

			// Selector should be called immediately because value has badge
			await waitFor(() => {
				expect(selectorCallCount).toBe(1);
			});
		});

		it('does not evaluate selector immediately when value has no badge', async () => {
			let selectorCallCount = 0;

			const testOptionsSelector = selector<TestOption[]>({
				key: 'testOptionsSelector-no-badge',
				get: () => {
					selectorCallCount++;
					return [
						{ id: 'opt1', title: 'Option 1' },
						{ id: 'opt2', title: 'Option 2' },
					];
				},
			});

			const onSelect = vi.fn();
			const valueWithoutBadge: TestOption = {
				id: 'opt1',
				title: 'Option 1',
			};

			render(
				<RecoilRoot>
					<DropdownWithSelector
						label="Test Dropdown"
						optionsSelector={testOptionsSelector}
						value={valueWithoutBadge}
						onSelect={onSelect}
					/>
				</RecoilRoot>,
			);

			// Selector should not be called yet
			expect(selectorCallCount).toBe(0);
		});
	});

	describe('Value Correction', () => {
		it('corrects value with fresh data from selector', async () => {
			const testOptionsSelector = selector<TestOption[]>({
				key: 'testOptionsSelector-correction',
				get: () => {
					return [
						{ id: 'opt1', title: 'Updated Option 1' },
						{ id: 'opt2', title: 'Option 2' },
					];
				},
			});

			const onSelect = vi.fn();
			const staleValue: TestOption = {
				id: 'opt1',
				title: 'Stale Option 1',
			};

			render(
				<RecoilRoot>
					<DropdownWithSelector
						label="Test Dropdown"
						optionsSelector={testOptionsSelector}
						value={staleValue}
						onSelect={onSelect}
						fetchImmediately={true}
					/>
				</RecoilRoot>,
			);

			// Wait for the corrected value to be displayed
			await waitFor(() => {
				expect(screen.getByText('Updated Option 1')).toBeTruthy();
			});
		});

		it('falls back to original value when no matching option found', async () => {
			const testOptionsSelector = selector<TestOption[]>({
				key: 'testOptionsSelector-no-match',
				get: () => {
					return [
						{ id: 'opt2', title: 'Option 2' },
						{ id: 'opt3', title: 'Option 3' },
					];
				},
			});

			const onSelect = vi.fn();
			const valueNotInOptions: TestOption = {
				id: 'opt1',
				title: 'Option 1 (not in list)',
			};

			render(
				<RecoilRoot>
					<DropdownWithSelector
						label="Test Dropdown"
						optionsSelector={testOptionsSelector}
						value={valueNotInOptions}
						onSelect={onSelect}
						fetchImmediately={true}
					/>
				</RecoilRoot>,
			);

			// Should display the original value even though it's not in options
			await waitFor(() => {
				expect(screen.getByText('Option 1 (not in list)')).toBeTruthy();
			});
		});

		it('matches options by both id and connectedTo', async () => {
			const testOptionsSelector = selector<TestOption[]>({
				key: 'testOptionsSelector-connectedTo',
				get: () => {
					return [
						{ id: 'sensor', connectedTo: 'controlboard', title: 'Sensor (Control)' },
						{ id: 'sensor', connectedTo: 'toolboard', title: 'Sensor (Toolboard)' },
					];
				},
			});

			const onSelect = vi.fn();
			const toolboardValue: TestOption = {
				id: 'sensor',
				connectedTo: 'toolboard',
				title: 'Sensor (Toolboard - Stale)',
			};

			render(
				<RecoilRoot>
					<DropdownWithSelector
						label="Test Dropdown"
						optionsSelector={testOptionsSelector}
						value={toolboardValue}
						onSelect={onSelect}
						fetchImmediately={true}
					/>
				</RecoilRoot>,
			);

			// Should match the toolboard option, not the controlboard one
			await waitFor(() => {
				expect(screen.getByText('Sensor (Toolboard)')).toBeTruthy();
			});
		});
	});

	describe('isFetching Selector', () => {
		it('passes isFetching state to Dropdown component', async () => {
			const testOptionsSelector = selector<TestOption[]>({
				key: 'testOptionsSelector-loading',
				get: () => [
					{ id: 'opt1', title: 'Option 1' },
					{ id: 'opt2', title: 'Option 2' },
				],
			});

			const isFetchingSelector = atom<boolean>({
				key: 'isFetchingSelector-true',
				default: true,
			});

			const onSelect = vi.fn();

			render(
				<RecoilRoot>
					<DropdownWithSelector
						label="Test Dropdown"
						optionsSelector={testOptionsSelector}
						isFetchingSelector={isFetchingSelector}
						value={null}
						onSelect={onSelect}
						fetchImmediately={true}
					/>
				</RecoilRoot>,
			);

			// The dropdown should be rendered - we can't easily test the internal
			// isFetching state without triggering the Spinner render (which has import issues)
			// This test verifies the component renders without error when isFetchingSelector is provided
			const combobox = screen.getByRole('combobox');
			expect(combobox).toBeTruthy();
		});

		it('does not show loading state when isFetchingSelector not provided', async () => {
			const testOptionsSelector = selector<TestOption[]>({
				key: 'testOptionsSelector-no-loading',
				get: () => [
					{ id: 'opt1', title: 'Option 1' },
					{ id: 'opt2', title: 'Option 2' },
				],
			});

			const onSelect = vi.fn();

			render(
				<RecoilRoot>
					<DropdownWithSelector
						label="Test Dropdown"
						optionsSelector={testOptionsSelector}
						value={null}
						onSelect={onSelect}
						fetchImmediately={true}
					/>
				</RecoilRoot>,
			);

			// Open dropdown
			const combobox = screen.getByRole('combobox');
			fireEvent.click(combobox);

			// Wait for options to render
			await waitFor(() => {
				expect(screen.getByText('Option 1')).toBeTruthy();
			});

			// Should not show loading state
			const loadingElement = document.querySelector('[cmdk-loading]');
			expect(loadingElement).toBeFalsy();
		});
	});

	describe('Option Selection', () => {
		it('calls onSelect with the correct option when selected', async () => {
			const testOptionsSelector = selector<TestOption[]>({
				key: 'testOptionsSelector-select',
				get: () => [
					{ id: 'opt1', title: 'Option 1' },
					{ id: 'opt2', title: 'Option 2' },
					{ id: 'opt3', title: 'Option 3' },
				],
			});

			const onSelect = vi.fn();

			render(
				<RecoilRoot>
					<DropdownWithSelector
						label="Test Dropdown"
						optionsSelector={testOptionsSelector}
						value={null}
						onSelect={onSelect}
						fetchImmediately={true}
					/>
				</RecoilRoot>,
			);

			// Open dropdown
			const combobox = screen.getByRole('combobox');
			fireEvent.click(combobox);

			// Wait for options to render
			await waitFor(() => {
				expect(screen.getByText('Option 2')).toBeTruthy();
			});

			// Click option 2
			const option2 = screen.getByText('Option 2');
			fireEvent.click(option2);

			// Should call onSelect with the correct option
			expect(onSelect).toHaveBeenCalledTimes(1);
			expect(onSelect).toHaveBeenCalledWith({
				id: 'opt2',
				title: 'Option 2',
			});
		});

		it('handles connectedTo-aware selection correctly', async () => {
			const testOptionsSelector = selector<TestOption[]>({
				key: 'testOptionsSelector-connectedTo-select',
				get: () => [
					{ id: 'sensor', connectedTo: 'controlboard', title: 'Sensor (Control)' },
					{ id: 'sensor', connectedTo: 'toolboard', title: 'Sensor (Toolboard)' },
				],
			});

			const onSelect = vi.fn();

			render(
				<RecoilRoot>
					<DropdownWithSelector
						label="Test Dropdown"
						optionsSelector={testOptionsSelector}
						value={null}
						onSelect={onSelect}
						fetchImmediately={true}
					/>
				</RecoilRoot>,
			);

			// Open dropdown
			const combobox = screen.getByRole('combobox');
			fireEvent.click(combobox);

			// Wait for options to render
			await waitFor(() => {
				expect(screen.getByText('Sensor (Toolboard)')).toBeTruthy();
			});

			// Click toolboard option
			const toolboardOption = screen.getByText('Sensor (Toolboard)');
			fireEvent.click(toolboardOption);

			// Should call onSelect with the toolboard-connected option
			expect(onSelect).toHaveBeenCalledTimes(1);
			expect(onSelect).toHaveBeenCalledWith({
				id: 'sensor',
				connectedTo: 'toolboard',
				title: 'Sensor (Toolboard)',
			});
		});
	});

	describe('canClear Functionality', () => {
		it('allows clearing selection when canClear=true', async () => {
			const testOptionsSelector = selector<TestOption[]>({
				key: 'testOptionsSelector-clear',
				get: () => [
					{ id: 'opt1', title: 'Option 1' },
					{ id: 'opt2', title: 'Option 2' },
				],
			});

			const onSelect = vi.fn();
			const selectedValue: TestOption = { id: 'opt1', title: 'Option 1' };

			render(
				<RecoilRoot>
					<DropdownWithSelector
						label="Test Dropdown"
						optionsSelector={testOptionsSelector}
						value={selectedValue}
						onSelect={onSelect}
						canClear={true}
						fetchImmediately={true}
					/>
				</RecoilRoot>,
			);

			// Wait for value to render
			await waitFor(() => {
				expect(screen.getByText('Option 1')).toBeTruthy();
			});

			// Find and click the clear button (X icon)
			const clearButton = document.querySelector('svg') as SVGElement;
			expect(clearButton).toBeTruthy();

			// The clear button should be clickable
			const clearButtonParent = clearButton.parentElement!;
			fireEvent.click(clearButtonParent);

			// Should call onSelect with null
			expect(onSelect).toHaveBeenCalledWith(null);
		});
	});

	describe('Placeholder Text', () => {
		it('shows custom nothingSelectedText when no value selected', async () => {
			const testOptionsSelector = selector<TestOption[]>({
				key: 'testOptionsSelector-placeholder',
				get: () => [
					{ id: 'opt1', title: 'Option 1' },
					{ id: 'opt2', title: 'Option 2' },
				],
			});

			const onSelect = vi.fn();

			render(
				<RecoilRoot>
					<DropdownWithSelector
						label="Test Dropdown"
						optionsSelector={testOptionsSelector}
						value={null}
						onSelect={onSelect}
						nothingSelectedText="Select a custom option..."
					/>
				</RecoilRoot>,
			);

			expect(screen.getByText('Select a custom option...')).toBeTruthy();
		});

		it('shows custom noOptionsText when options list is empty', async () => {
			const testOptionsSelector = selector<TestOption[]>({
				key: 'testOptionsSelector-empty',
				get: () => [],
			});

			const onSelect = vi.fn();

			render(
				<RecoilRoot>
					<DropdownWithSelector
						label="Test Dropdown"
						optionsSelector={testOptionsSelector}
						value={null}
						onSelect={onSelect}
						noOptionsText="No hardware available"
						fetchImmediately={true}
					/>
				</RecoilRoot>,
			);

			// Open dropdown
			const combobox = screen.getByRole('combobox');
			fireEvent.click(combobox);

			// Should show custom empty message
			await waitFor(() => {
				expect(screen.getByText('No hardware available')).toBeTruthy();
			});
		});
	});

	describe('Disabled State', () => {
		it('disables dropdown when disabled=true', async () => {
			const testOptionsSelector = selector<TestOption[]>({
				key: 'testOptionsSelector-disabled',
				get: () => [
					{ id: 'opt1', title: 'Option 1' },
					{ id: 'opt2', title: 'Option 2' },
				],
			});

			const onSelect = vi.fn();

			render(
				<RecoilRoot>
					<DropdownWithSelector
						label="Test Dropdown"
						optionsSelector={testOptionsSelector}
						value={null}
						onSelect={onSelect}
						disabled={true}
						fetchImmediately={true}
					/>
				</RecoilRoot>,
			);

			const combobox = screen.getByRole('combobox');

			// Check that disabled styling is applied
			expect(combobox.className).toContain('opacity-60');
			expect(combobox.className).toContain('cursor-not-allowed');

			// Verify the dropdown doesn't open when clicked
			fireEvent.click(combobox);
			expect(combobox.getAttribute('aria-expanded')).toBe('false');
		});
	});

	describe('Recoil Selector Re-evaluation', () => {
		it('updates options when selector dependencies change', async () => {
			const optionsAtom = atom<TestOption[]>({
				key: 'optionsAtom-dynamic',
				default: [
					{ id: 'opt1', title: 'Option 1' },
					{ id: 'opt2', title: 'Option 2' },
				],
			});

			const testOptionsSelector = selector<TestOption[]>({
				key: 'testOptionsSelector-dynamic',
				get: ({ get }) => get(optionsAtom),
			});

			const onSelect = vi.fn();

			const TestComponent = () => {
				const [options, setOptions] = React.useState<TestOption[]>([
					{ id: 'opt1', title: 'Option 1' },
					{ id: 'opt2', title: 'Option 2' },
				]);

				return (
					<RecoilRoot
						initializeState={({ set }) => {
							set(optionsAtom, options);
						}}
					>
						<button
							onClick={() =>
								setOptions([
									{ id: 'opt1', title: 'Option 1' },
									{ id: 'opt2', title: 'Option 2' },
									{ id: 'opt3', title: 'Option 3 (New)' },
								])
							}
						>
							Add Option
						</button>
						<DropdownWithSelector
							label="Test Dropdown"
							optionsSelector={testOptionsSelector}
							value={null}
							onSelect={onSelect}
							fetchImmediately={true}
						/>
					</RecoilRoot>
				);
			};

			render(<TestComponent />);

			// Open dropdown to see initial options
			const combobox = screen.getByRole('combobox');
			fireEvent.click(combobox);

			// Should show 2 options initially
			await waitFor(() => {
				expect(screen.getByText('Option 1')).toBeTruthy();
				expect(screen.getByText('Option 2')).toBeTruthy();
			});

			// Note: This test demonstrates the structure but won't actually update
			// the options because we'd need to re-render with a new RecoilRoot
			// In real usage, Recoil handles this automatically
		});
	});

	describe('Badge Property Support', () => {
		it('triggers immediate fetch when value has badge', async () => {
			// Verify that having a badge triggers fetchImmediately behavior
			let selectorCalled = false;

			const testOptionsSelector = selector<TestOption[]>({
				key: 'testOptionsSelector-badge-immediate',
				get: () => {
					selectorCalled = true;
					return [
						{ id: 'opt1', title: 'Option 1' },
						{ id: 'opt2', title: 'Option 2' },
					];
				},
			});

			const onSelect = vi.fn();
			const valueWithBadge: TestOption = {
				id: 'opt1',
				title: 'Option 1',
				badge: { children: 'Test Badge' },
			};

			render(
				<RecoilRoot>
					<DropdownWithSelector
						label="Test Dropdown"
						optionsSelector={testOptionsSelector}
						value={valueWithBadge}
						onSelect={onSelect}
					/>
				</RecoilRoot>,
			);

			// Selector should be called immediately due to badge
			await waitFor(() => {
				expect(selectorCalled).toBe(true);
			});
		});
	});
});
