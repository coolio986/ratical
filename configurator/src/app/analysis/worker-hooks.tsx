'use client';
/** worker-hooks.tsx — Part of the /configure/analysis (input-shaper / resonance) UI, charted with uPlot. See docs/ARCHITECTURE.md §4. */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
	AccelerometerType,
	KlipperAccelSensorName,
	KlipperAccelSensorSchema,
	klipperAccelSensorSchema,
} from '@/zods/hardware';
import { z } from 'zod';
import { useRecoilValue } from 'recoil';
import { ControlboardState } from '@/recoil/printer';
import { useToolheads } from '@/hooks/useToolheadConfiguration';
import {
	WorkerInput,
	WorkerOutput,
	WorkCommand,
	WorkResult,
	WorkerSignalOutput,
	WorkerPSDOutput,
	WorkerAccumulationResultOuput,
	WorkerAccumulationStarted,
} from '@/app/analysis/_worker';
import { fromWorker } from 'observable-webworker';
import { Subject, animationFrames, buffer, filter, firstValueFrom, map, share, timeout } from 'rxjs';
import { getHost } from '@/helpers/util';
import { PSDResult } from '@/app/analysis/_worker/psd';
import { TypedArrayPSD } from '@/app/analysis/periodogram';
import { PSD } from '@/zods/analysis';

function transformPSD(psd: TypedArrayPSD): PSD {
	const transformed = {
		frequencies: Array.from(psd.frequencies),
		estimates: Array.from(psd.estimates),
		powerRange: psd.powerRange,
	};
	return transformed;
}

const getWsURL = () => {
	const host = getHost();
	if (host == null || host.trim() == '') {
		return null;
	}
	if (typeof window == 'undefined') {
		return null;
	}
	return `ws://${host}:7125/klippysocket`;
};

const input$ = new Subject<WorkerInput>();
const worker = fromWorker<WorkerInput, WorkerOutput>(
	() => new Worker(new URL('@/app/analysis/_worker/index', import.meta.url)),
	input$,
).pipe(share());

export const useWorker = (
	enabled: boolean,
	sensor: KlipperAccelSensorName,
	onResult: ReactCallback<(signal: [Float64Array, Float64Array, Float64Array, Float64Array]) => void>,
	onPSDResult: ReactCallback<(psd: Omit<PSDResult, 'source'>) => void>,
	onError: ReactCallback<(err: Error) => void>,
) => {
	const parsedSensor = useAccelerometerWithType(sensor);
	const [wsUrl, setWsUrl] = useState(getWsURL());
	const isRunningRef = useRef(false);
	const isAccumulatingRef = useRef(false);
	const onResultRef = useRef(onResult);
	onResultRef.current = onResult;
	const onPSDResultRef = useRef(onPSDResult);
	onPSDResultRef.current = onPSDResult;

	const startAccumulation = useCallback(async () => {
		if (isAccumulatingRef.current) {
			throw new Error('Already accumulating');
		}
		const psdRes = firstValueFrom(
			worker.pipe(
				filter((output) => output.type === WorkResult.PSD),
				timeout(5000),
			),
		);
		const res = firstValueFrom(
			worker.pipe(
				filter((output): output is WorkerAccumulationStarted => output.type === WorkResult.ACCUMULATING),
				map(() => true),
				timeout(5000),
			),
		);
		await psdRes;
		input$.next({ type: WorkCommand.START_ACCUMULATION });
		await res;
	}, []);
	const stopAccumulation = useCallback(async () => {
		if (!isAccumulatingRef.current) {
			throw new Error('Not accumulating, cannot stop');
		}
		const res = firstValueFrom(
			worker.pipe(
				filter((output): output is WorkerAccumulationResultOuput => output.type === WorkResult.ACCUMULATED),
				map((output) => {
					return {
						x: transformPSD(output.payload.x),
						y: transformPSD(output.payload.y),
						z: transformPSD(output.payload.z),
						total: transformPSD(output.payload.total),
					};
				}),
				timeout(1000 * 60), // 1 minute timeout
			),
		);
		input$.next({ type: WorkCommand.STOP_ACCUMULATION });
		return await res;
	}, []);
	const streamStarted = useCallback(async () => {
		await new Promise((resolve) => setTimeout(resolve, 10));
		if (isRunningRef.current) {
			return;
		}
		const res = firstValueFrom(
			worker.pipe(
				filter((output): output is WorkerAccumulationResultOuput => output.type === WorkResult.STARTED),
				timeout(5000),
			),
		);
		await res;
	}, []);
	const streamStopped = useCallback(async () => {
		await new Promise((resolve) => setTimeout(resolve, 10));
		if (!isRunningRef.current) {
			return;
		}
		const res = firstValueFrom(
			worker.pipe(
				filter((output): output is WorkerAccumulationResultOuput => output.type === WorkResult.STOPPED),
				timeout(5000),
			),
		);
		await res;
	}, []);
	useEffect(() => {
		setWsUrl(getWsURL());
	}, []);
	useEffect(() => {
		if (enabled && wsUrl != null) {
			const sub = worker.subscribe({
				next: (output) => {
					switch (output.type) {
						case WorkResult.STARTED:
							isRunningRef.current = true;
							break;
						case WorkResult.STOPPED:
							isRunningRef.current = false;
							break;
						case WorkResult.ACCUMULATING:
							isAccumulatingRef.current = true;
							break;
						case WorkResult.ACCUMULATED:
							isAccumulatingRef.current = false;
							break;
						case WorkResult.SAMPLE_RATE:
							break;
						case WorkResult.SPEC_SAMPLE_RATE:
							break;
					}
				},
				error: onError,
			});
			const signalSub = worker
				.pipe(
					filter((output): output is WorkerSignalOutput => output.type === WorkResult.SIGNAL),
					map((output) => new Float64Array(output.payload)),
					buffer(animationFrames()),
					filter((signals) => signals.length > 0),
					map((signals) => {
						const time = new Float64Array(signals.length);
						const x = new Float64Array(signals.length);
						const y = new Float64Array(signals.length);
						const z = new Float64Array(signals.length);
						signals.forEach((signal, i) => {
							time[i] = signal[0];
							x[i] = signal[1];
							y[i] = signal[2];
							z[i] = signal[3];
						});
						return [time, x, y, z] as [Float64Array, Float64Array, Float64Array, Float64Array];
					}),
				)
				.subscribe({
					next: (signal: [Float64Array, Float64Array, Float64Array, Float64Array]) => {
						onResultRef.current(signal);
					},
					error: onError,
				});
			const psdSub = worker
				.pipe(
					filter((output): output is WorkerPSDOutput => output.type === WorkResult.PSD),
					map((output) => output.payload),
				)
				.subscribe({
					next: (psd: Omit<PSDResult, 'source'>) => {
						onPSDResultRef.current(psd);
					},
					error: onError,
				});
			input$.next({ type: WorkCommand.START, payload: { url: wsUrl, sensor: parsedSensor } });
			return () => {
				firstValueFrom(
					worker.pipe(
						filter((output): output is WorkerAccumulationResultOuput => output.type === WorkResult.STOPPED),
						timeout(5000),
					),
				).finally(() => {
					isRunningRef.current = false;
					sub.unsubscribe();
					signalSub.unsubscribe();
					psdSub.unsubscribe();
				});
				input$.next({ type: WorkCommand.STOP });
			};
		}
	}, [enabled, onError, parsedSensor, sensor, wsUrl]);
	return {
		streamStarted,
		streamStopped,
		startAccumulation,
		stopAccumulation,
	};
};

export const useAccelerometerWithType = (accelerometerName: KlipperAccelSensorName): KlipperAccelSensorSchema => {
	const controlBoard = useRecoilValue(ControlboardState);
	const toolheads = useToolheads();
	let accelType: z.infer<typeof AccelerometerType> = 'adxl345';

	if (accelerometerName === 'controlboard') {
		if (controlBoard?.ADXL345SPI != null) {
			accelType = 'adxl345';
		}
		if (controlBoard?.LIS2DW != null) {
			accelType = 'lis2dw';
		}
	}
	if (accelerometerName === 'toolboard_t0' || accelerometerName === 'toolboard_t1') {
		const toolboard = toolheads.find((t) => t.getToolboardName() === accelerometerName)?.getToolboard();
		if (toolboard == null) {
			throw new Error(`No toolboard found for T0`);
		}
		if (toolboard.ADXL345SPI != null) {
			accelType = 'adxl345';
		}
		if (toolboard.LIS2DW != null) {
			accelType = 'lis2dw';
		}
	}
	if (accelerometerName === 'beacon') {
		accelType = 'beacon';
	}
	return useMemo(
		() =>
			klipperAccelSensorSchema.parse({
				name: accelerometerName,
				type: accelType,
			}),
		[accelerometerName, accelType],
	);
};
