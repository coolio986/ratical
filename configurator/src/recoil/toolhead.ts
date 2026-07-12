import { atomFamily, DefaultValue, selector, selectorFamily, noWait, waitForAll } from 'recoil';
import { ReadAtomInterface, syncEffect, WriteAtomInterface } from 'recoil-sync';
import { z } from 'zod';
import { getRefineCheckerForZodSchema } from 'zod-refine';
import { trpcClient } from '@/helpers/trpc';
import { BoardID, BoardPath, Toolboard } from '@/zods/boards';
import { PrinterAxis } from '@/zods/motion';
import {
	BaseToolheadConfiguration,
	SerializedToolheadConfiguration,
	ToolheadConfiguration,
	ToolNumber,
} from '@/zods/toolhead';
import { PrinterState } from '@/recoil/printer';
import { moonrakerWriteEffect } from '@/components/sync-with-moonraker';
import { getLogger } from '@/app/_helpers/logger';
import { serializePartialToolheadConfiguration } from '@/utils/serialization';

export const isAxisValidForTool = (axis: PrinterAxis, tool: ToolNumber) => {
	if (axis === PrinterAxis.dual_carriage && tool === 1) {
		return true;
	}
	if (axis === PrinterAxis.x) {
		return true;
	}
	return false;
};

export const PrinterToolheadState = atomFamily<
	(ToolheadConfiguration<any> & { toolNumber: ToolNumber }) | null,
	ToolNumber
>({
	key: 'PrinterToolhead',
	default: null,
	effects: (param) => [
		moonrakerWriteEffect(),
		syncEffect({
			read: async ({
				read,
			}: ReadAtomInterface): Promise<(ToolheadConfiguration<any> & { toolNumber: ToolNumber }) | null> => {
				const state = await read(PrinterToolheadState(param).key);
				if (typeof state !== 'object') {
					return null;
				}
				if (state == null) {
					return null;
				}
				const { toolNumber: tNum, ...printerToolheadState } = state as ToolheadConfiguration<any> & {
					toolNumber: ToolNumber;
				};
				if (printerToolheadState != null) {
					// First try to parse as-is (in case it's already a full configuration)
					const directParse = ToolheadConfiguration.safeParse(printerToolheadState);
					if (directParse.success) {
						// Check if the toolboard needs to be refreshed (it might be just an ID)
						let freshToolboard = directParse.data.toolboard;
						if (freshToolboard != null) {
							const toolboardPath = z.object({ id: BoardID }).safeParse(freshToolboard);
							if (toolboardPath.success) {
								const boardReq = await trpcClient.mcu.boards.query({ boardFilters: { toolboard: true } });
								const maybeToolboard = boardReq.find((b) => b.id === toolboardPath.data.id);
								if (maybeToolboard) {
									freshToolboard = Toolboard.parse(maybeToolboard);
								}
							}
						}
						return { ...directParse.data, toolboard: freshToolboard, toolNumber: param };
					}

					// If direct parse fails, try server-side deserialization
					// This handles cases where fields are stored as string IDs
					const printerState = await read('Printer');
					const controlboardId =
						typeof printerState === 'object' && printerState != null && 'controlboard' in printerState
							? (printerState as any).controlboard
							: null;

					try {
						// Add toolNumber to the config before deserializing so badges are generated correctly
						const deserializedToolhead = await trpcClient.printer.deserializeToolheadConfiguration.query({
							config: { ...printerToolheadState, toolNumber: param } as any,
							printerConfig: { controlboard: controlboardId },
						});
						const parsedToolhead = ToolheadConfiguration.safeParse(deserializedToolhead);
						if (parsedToolhead.success) {
							return { ...parsedToolhead.data, toolNumber: param };
						}
						getLogger().debug(
							'RecoilSync: failed to parse deserialized toolhead!',
							PrinterToolheadState(param).key,
							parsedToolhead.error,
							deserializedToolhead,
						);
					} catch (error) {
						getLogger().error(
							'RecoilSync: failed to deserialize toolhead configuration!',
							PrinterToolheadState(param).key,
							error,
							printerToolheadState,
						);
					}
					// If all else fails, return null
					return null;
				}
				return null;
			},
			write: ({ write }: WriteAtomInterface, newValue) => {
				// Serialize the toolhead configuration before storing it
				// This converts full objects to string IDs for storage
				if (newValue instanceof DefaultValue || newValue == null) {
					write(PrinterToolheadState(param).key, newValue);
					return;
				}
				const { toolNumber, ...toolheadConfig } = newValue;
				const serialized = serializePartialToolheadConfiguration(toolheadConfig);
				write(PrinterToolheadState(param).key, { ...serialized, toolNumber });
			},
			refine: getRefineCheckerForZodSchema(BaseToolheadConfiguration.extend({ toolNumber: ToolNumber }).nullable()),
		}),
	],
});

export const DeserializeToolheadQuery = selectorFamily<
	(ToolheadConfiguration<any> & { toolNumber: ToolNumber }) | null,
	{ th: SerializedToolheadConfiguration; boardId: string; toolNumber: ToolNumber }
>({
	key: 'DeserializeToolheadQuery',
	get:
		(param) =>
		async ({ get }) => {
			const parsedToolhead = ToolheadConfiguration.safeParse(
				await trpcClient.printer.deserializeToolheadConfiguration.query({
					config: param.th,
					printerConfig: { controlboard: param.boardId },
				}),
			);
			if (!parsedToolhead.success) {
				return null;
			}
			return { ...parsedToolhead.data, toolNumber: param.toolNumber };
		},
});

export const PrinterToolheadsState = selector<(ToolheadConfiguration<any> & { toolNumber: ToolNumber })[]>({
	key: 'PrinterToolheadsState',
	get: ({ get }) => {
		const printer = get(PrinterState);
		if (printer == null) {
			return [];
		}
		return get(waitForAll(printer.defaults.toolheads.map((th, i) => PrinterToolheadState(i as ToolNumber)))).filter(
			Boolean,
		);
	},
	set: ({ set, reset }, newValue) => {
		if (newValue instanceof DefaultValue) {
			throw new Error('ToolheadsState cannot be reset, please reset the individual ToolheadState instead');
		}
		newValue.forEach((th) => {
			set(PrinterToolheadState(th.toolNumber), { ...th, toolNumber: th.toolNumber });
		});
	},
});

export const LoadablePrinterToolheadsState = selector<(ToolheadConfiguration<any> & { toolNumber: ToolNumber })[]>({
	key: 'LoadablePrinterToolheadsState',
	get: async ({ get }) => {
		const loadable = get(noWait(PrinterToolheadsState));
		return {
			hasValue: () => loadable.contents,
			hasError: () => [],
			loading: () => [],
		}[loadable.state]();
	},
});
