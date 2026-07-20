/** firmware-options.tsx — A step in the setup wizard. See docs/ARCHITECTURE.md §4. */
import React from 'react';
import { FirmwareOption } from '@/zods/boards';
import { Spinner } from '@/components/common/spinner';
import { Badge } from '@/components/common/badge';

interface FirmwareOptionsPanelProps {
	options: FirmwareOption[];
	selected: string[];
	onChange: (symbols: string[]) => void;
	isLoading?: boolean;
}

/**
 * Collapsible list of the advanced Kalico menuconfig options a board exposes, detected
 * live from the installed Kalico branch. Ticked options are compiled into the firmware.
 */
export const FirmwareOptionsPanel: React.FC<FirmwareOptionsPanelProps> = (props) => {
	const { options, selected, onChange, isLoading } = props;

	if (!isLoading && options.length === 0) {
		return null;
	}

	const toggle = (symbol: string, checked: boolean) => {
		const next = new Set(selected);
		if (checked) {
			next.add(symbol);
		} else {
			next.delete(symbol);
		}
		onChange(Array.from(next));
	};

	return (
		<details className="rounded-lg border border-zinc-200 bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-800/50">
			<summary className="flex cursor-pointer select-none items-center justify-between gap-2 px-4 py-3 text-sm font-medium text-zinc-900 dark:text-zinc-100">
				<span className="flex items-center gap-2">
					Advanced firmware options
					{isLoading ? (
						<Spinner className="inline" noMargin={true} />
					) : (
						<Badge color="sky">{options.length}</Badge>
					)}
				</span>
				<span className="text-xs font-normal text-zinc-500 dark:text-zinc-400">optional</span>
			</summary>
			<div className="border-t border-zinc-200 px-4 py-3 dark:border-zinc-700">
				<p className="mb-3 text-xs text-zinc-500 dark:text-zinc-400">
					These extra firmware features are detected from your installed Kalico branch. Changing them recompiles the
					firmware. Leave the defaults if you're unsure.
				</p>
				<ul className="space-y-3">
					{options.map((option) => (
						<li key={option.symbol} className="flex items-start gap-3">
							<input
								id={`fwopt-${option.symbol}`}
								type="checkbox"
								className="mt-1 h-4 w-4 rounded border-zinc-300 text-brand-600 focus:ring-brand-500 dark:border-zinc-600 dark:bg-zinc-700"
								checked={selected.includes(option.symbol)}
								onChange={(e) => toggle(option.symbol, e.target.checked)}
							/>
							<label htmlFor={`fwopt-${option.symbol}`} className="cursor-pointer">
								<span className="block text-sm text-zinc-900 dark:text-zinc-100">{option.name}</span>
								<span className="block font-mono text-xs text-zinc-400 dark:text-zinc-500">{option.config}</span>
								{option.help ? (
									<span className="mt-1 block whitespace-pre-line text-xs text-zinc-500 dark:text-zinc-400">
										{option.help}
									</span>
								) : null}
							</label>
						</li>
					))}
				</ul>
			</div>
		</details>
	);
};
