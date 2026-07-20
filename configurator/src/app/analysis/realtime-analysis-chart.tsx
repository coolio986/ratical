'use client';
/** realtime-analysis-chart.tsx — Part of the /configure/analysis (input-shaper / resonance) UI, charted with uPlot. See docs/ARCHITECTURE.md §4. */

import React, { useCallback, useMemo, useRef, useState } from 'react';

import { useToolheads } from '@/hooks/useToolheadConfiguration';
import { Card } from '@/components/common/card';
import { twJoin } from 'tailwind-merge';
import { useWorker } from '@/app/analysis/worker-hooks';
import { FullLoadScreen } from '@/components/common/full-load-screen';
import { MacroRecordingSettings } from '@/zods/analysis';
import { useRecoilValue } from 'recoil';
import { ControlboardState } from '@/recoil/printer';
import { toast } from 'sonner';
import { getLogger } from '@/app/_helpers/logger';
import { AccelerometerType } from '@/zods/hardware';
import { z } from 'zod';
import { PSDResult } from '@/app/analysis/_worker/psd';
import { LiveGcodeResponse } from '@/components/common/live-gcode-response';
import { UPlotPSDChart, UPlotSignalChart } from '@/app/analysis/oss-uplot-charts';

type SignalSetter = (t: Float64Array | number[], y: Float64Array | number[]) => void;
type PSDSetter = (series: { freq: number[]; x: number[]; y: number[]; z: number[]; total: number[] }) => void;

/** Realtime analysis charts using MIT-licensed uPlot. */
export const useRealtimeAnalysisChart = (
	accelerometer?: MacroRecordingSettings['accelerometer'],
	accelerometerType: z.infer<typeof AccelerometerType> = 'adxl345',
) => {
	const [isChartEnabled, _setIsChartEnabled] = useState(false);
	const [isLoading, setIsLoading] = useState(false);
	const toolheads = useToolheads();
	const controlBoard = useRecoilValue(ControlboardState);
	const adxl = accelerometer ?? toolheads[0].getYAccelerometerName() ?? 'controlboard';
	const adxlHardwareName =
		(adxl === 'controlboard'
			? controlBoard?.name
			: adxl === 'toolboard_t0'
				? toolheads[0]?.getToolboard()?.name
				: adxl === 'toolboard_t1'
					? toolheads[1]?.getToolboard()?.name
					: adxl === 'rpi'
						? 'Raspberry Pi'
						: adxl === 'beacon'
							? 'Beacon'
							: 'N/A') ?? 'N/A';

	const xSetter = useRef<SignalSetter>(() => {});
	const ySetter = useRef<SignalSetter>(() => {});
	const zSetter = useRef<SignalSetter>(() => {});
	const psdSetter = useRef<PSDSetter>(() => {});
	const updateLoadingState = useRef(async (_val: boolean) => {});

	const registerX = useCallback((fn: SignalSetter) => {
		xSetter.current = fn;
	}, []);
	const registerY = useCallback((fn: SignalSetter) => {
		ySetter.current = fn;
	}, []);
	const registerZ = useCallback((fn: SignalSetter) => {
		zSetter.current = fn;
	}, []);
	const registerPsd = useCallback((fn: PSDSetter) => {
		psdSetter.current = fn;
	}, []);

	const setIsChartEnabled = useCallback(async (val: boolean) => {
		_setIsChartEnabled((curVal) => {
			if (curVal === false && val === true) {
				timeSinceLastPsd.current = performance.now();
			}
			return val;
		});
		if (!val) {
			await updateLoadingState.current(val);
			xSetter.current([], []);
			ySetter.current([], []);
			zSetter.current([], []);
			psdSetter.current({ freq: [], x: [], y: [], z: [], total: [] });
		}
		if (val) {
			await updateLoadingState.current(val);
		}
	}, []);

	const timeSinceLastPsd = useRef<number>(performance.now());

	const updatePSD = useCallback((res: Omit<PSDResult, 'source'>) => {
		timeSinceLastPsd.current = performance.now();
		if (res.total.frequencies.reduce((acc, val) => acc + val, 0) < 200) {
			return;
		}
		psdSetter.current({
			freq: Array.from(res.total.frequencies),
			x: Array.from(res.x.estimates),
			y: Array.from(res.y.estimates),
			z: Array.from(res.z.estimates),
			total: Array.from(res.total.estimates),
		});
	}, []);

	const updateSignals = useCallback(
		async ([time, x, y, z]: [Float64Array, Float64Array, Float64Array, Float64Array]) => {
			xSetter.current(time, x);
			ySetter.current(time, y);
			zSetter.current(time, z);
		},
		[],
	);

	const onStreamError = useCallback(
		(err: Error) => {
			setIsChartEnabled(false);
			getLogger().error(err);
			toast.error('Error during accelerometer data streaming', { description: err.message });
		},
		[setIsChartEnabled],
	);

	const { startAccumulation, stopAccumulation, streamStarted, streamStopped } = useWorker(
		isChartEnabled,
		adxl,
		updateSignals,
		updatePSD,
		onStreamError,
	);

	updateLoadingState.current = useCallback(
		async (val: boolean) => {
			setIsLoading(true);
			if (val === false) {
				return streamStopped().finally(() => {
					setIsLoading(false);
				});
			} else {
				return streamStarted().finally(() => {
					setIsLoading(false);
				});
			}
		},
		[streamStarted, streamStopped],
	);

	return useMemo(
		() => ({
			isChartEnabled,
			isLoading,
			setIsChartEnabled,
			streamStarted,
			streamStopped,
			psds: {
				startAccumulation,
				stopAccumulation,
			},
			currentAccelerometer: adxl,
			currentAccelerometerHardwareName: adxlHardwareName,
			chartProps: {
				registerX,
				registerY,
				registerZ,
				registerPsd,
				isLoading,
			},
		}),
		[
			isChartEnabled,
			isLoading,
			setIsChartEnabled,
			streamStarted,
			streamStopped,
			startAccumulation,
			stopAccumulation,
			adxl,
			adxlHardwareName,
			registerX,
			registerY,
			registerZ,
			registerPsd,
		],
	);
};

type RealtimeAnalysisChartProps = ReturnType<typeof useRealtimeAnalysisChart>['chartProps'];

export const RealtimeAnalysisChart: React.FC<RealtimeAnalysisChartProps> = React.memo(
	({ registerX, registerY, registerZ, registerPsd, isLoading }) => {
		return (
			<div className="relative flex max-h-full min-h-full flex-col space-y-4 @container">
				{isLoading && (
					<div className="absolute inset-0 z-10 flex items-center justify-center bg-zinc-950/40">
						<FullLoadScreen />
					</div>
				)}
				<div className="grid grid-cols-1 gap-4 @screen-lg:grid-cols-3">
					<Card className="relative flex h-32 flex-col overflow-hidden @screen-lg:h-72">
						<h3 className="text-md absolute left-0 right-0 top-0 z-10 flex items-center space-x-2 p-4 font-semibold">
							<div className={twJoin('flex-none rounded-full bg-yellow-400/10 p-1 text-yellow-400')}>
								<div className="h-2 w-2 rounded-full bg-current" />
							</div>
							<span className="text-zinc-100">X Signal</span>
						</h3>
						<UPlotSignalChart label="X" color="#facc15" register={registerX} className="mt-10 h-full w-full" />
					</Card>
					<Card className="relative flex h-32 flex-col overflow-hidden @screen-lg:h-72">
						<h3 className="text-md absolute left-0 right-0 top-0 z-10 flex items-center space-x-2 p-4 font-semibold">
							<div className={twJoin('flex-none rounded-full bg-sky-400/10 p-1 text-sky-400')}>
								<div className="h-2 w-2 rounded-full bg-current" />
							</div>
							<span className="text-zinc-100">Y Signal</span>
						</h3>
						<UPlotSignalChart label="Y" color="#38bdf8" register={registerY} className="mt-10 h-full w-full" />
					</Card>
					<Card className="relative flex h-32 flex-col overflow-hidden @screen-lg:h-72">
						<h3 className="text-md absolute left-0 right-0 top-0 z-10 flex items-center space-x-2 p-4 font-semibold">
							<div className={twJoin('flex-none rounded-full bg-rose-400/10 p-1 text-rose-400')}>
								<div className="h-2 w-2 rounded-full bg-current" />
							</div>
							<span className="text-zinc-100">Z Signal</span>
						</h3>
						<UPlotSignalChart label="Z" color="#fb7185" register={registerZ} className="mt-10 h-full w-full" />
					</Card>
				</div>
				<Card className="relative flex h-[20rem] flex-col overflow-hidden p-2 @screen-lg:h-[28rem]">
					<UPlotPSDChart register={registerPsd} className="h-full w-full" />
					<LiveGcodeResponse className="absolute right-4 top-4" />
				</Card>
			</div>
		);
	},
);

RealtimeAnalysisChart.displayName = 'RealtimeAnalysisChart';
