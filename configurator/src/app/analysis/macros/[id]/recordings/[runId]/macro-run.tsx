'use client';
/** macro-run.tsx — Part of the /configure/analysis (input-shaper / resonance) UI, charted with uPlot. See docs/ARCHITECTURE.md §4. */
import { MacroRunChart } from '@/app/analysis/macros/[id]/recordings/[runId]/macro-run-chart';
import { SequenceData, SequenceDataChartType } from '@/app/analysis/macros/[id]/recordings/[runId]/setup';
import { InputShapers } from '@/app/analysis/macros/[id]/recordings/[runId]/input-shapers';
import { BeltTensionComparison } from '@/app/analysis/macros/[id]/recordings/[runId]/belt-tension-comparison';
import { useBeltTensionState, useInputShapersState, useSeriesSubcomponentsChart } from '@/app/analysis/macros/hooks';
import { TWShadeableColorName } from '@/app/_helpers/colors';
import { Card } from '@/components/common/card';
import { CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { useTopMenu } from '@/app/topmenu';
import { trpc } from '@/utils/trpc';
import { ChevronLeft, SkipBack, SkipForward } from 'lucide-react';
import * as luxon from 'luxon';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useHotkeys } from 'react-hotkeys-hook';
import deepEqual from 'deep-equal';

luxon.Settings.defaultLocale = 'en-GB';
const userLocale = luxon.DateTime.local().locale;

export const MacroRun = ({ id, runId }: { id: string; runId: string }) => {
	const [currentRun, setCurrentRun] = useState(runId);
	const [macro] = trpc.analysis.findMacro.useSuspenseQuery({ id });
	const [recordings] = trpc.analysis.getRunRecordings.useSuspenseQuery(
		{ runId: currentRun, macroId: id },
		{ keepPreviousData: true },
	);
	const inputShapersState = useInputShapersState();
	const seriesSubcomponents = useSeriesSubcomponentsChart();
	const beltTensionState = useBeltTensionState();
	const [{ next, previous }] = trpc.analysis.getNextAndPreviousRunRecordingIds.useSuspenseQuery(
		{ macroId: id, runId: currentRun },
		{ keepPreviousData: true },
	);
	useHotkeys('left', () => previous != null && setCurrentRun(previous), [previous]);
	useHotkeys('right', () => next != null && setCurrentRun(next), [next]);
	const sequenceSeries = useMemo<SequenceData[]>(
		() =>
			recordings.result.flatMap((rec) => {
				const sequence = macro.sequences.find((item) => item.id === rec.sequenceId);
				return sequence?.recording
					? [
							{
								sequenceId: sequence.id,
								color: (sequence.recording.color ?? 'lime') as TWShadeableColorName,
								name: rec.name,
								psd: rec.psd,
								type: SequenceDataChartType.Mountain,
							},
						]
					: [];
			}),
		[macro, recordings],
	);
	const sequencePair = useRef(beltTensionState.sequencePair);
	sequencePair.current = beltTensionState.sequencePair;
	useEffect(() => {
		if (recordings.result.length === 1) {
			const sequenceId = recordings.result[0].sequenceId;
			inputShapersState.setSequenceId(sequenceId);
			seriesSubcomponents.setSubcomponentSeries([sequenceId]);
		} else {
			inputShapersState.setSequenceId(null);
			seriesSubcomponents.setSubcomponentSeries([]);
		}
	}, [inputShapersState.setSequenceId, recordings.result, seriesSubcomponents.setSubcomponentSeries]);
	useEffect(() => {
		const pair =
			sequenceSeries.length === 2 ? ([sequenceSeries[0], sequenceSeries[1]] as [SequenceData, SequenceData]) : null;
		if (!deepEqual(sequencePair.current, pair)) beltTensionState.setSequencePair(pair);
	}, [beltTensionState.setSequencePair, sequenceSeries]);
	useTopMenu(
		'Analysis',
		useCallback(
			(Menu) => (
				<>
					<Menu.MenubarMenu>
						<Menu.MenubarTrigger className="cursor-pointer" asChild>
							<span onClick={() => window.history.back()}>
								<Menu.MenubarIcon Icon={ChevronLeft} />
								<span className="hidden lg:inline">Back</span>
							</span>
						</Menu.MenubarTrigger>
						<Menu.MenubarContent className="hidden" />
					</Menu.MenubarMenu>
					<Menu.MenubarMenu>
						<Menu.MenubarTrigger asChild disabled={previous == null}>
							<span onClick={() => previous != null && setCurrentRun(previous)}>
								<Menu.MenubarIcon Icon={SkipBack} />
								<span className="hidden lg:inline">Previous recording</span>
							</span>
						</Menu.MenubarTrigger>
						<Menu.MenubarContent className="hidden" />
					</Menu.MenubarMenu>
					<Menu.MenubarMenu>
						<Menu.MenubarTrigger asChild disabled={next == null}>
							<span onClick={() => next != null && setCurrentRun(next)}>
								<Menu.MenubarIcon Icon={SkipForward} />
								<span className="hidden lg:inline">Next recording</span>
							</span>
						</Menu.MenubarTrigger>
						<Menu.MenubarContent className="hidden" />
					</Menu.MenubarMenu>
				</>
			),
			[next, previous],
		),
	);
	const date = useMemo(
		() =>
			luxon.DateTime.fromMillis(recordings.result[0].startTimeStamp)
				.setLocale(userLocale)
				.toLocaleString({ dateStyle: 'long', timeStyle: 'short' }),
		[recordings],
	);
	return (
		<div className="relative flex flex-1">
			<MacroRunChart
				sequenceSeries={sequenceSeries}
				shapers={inputShapersState.shapers}
				recommendedShaper={inputShapersState.recommendedShaper}
				subcomponentSeries={seriesSubcomponents.subcomponentSeries}
			/>
			<Card className="absolute right-4 top-4 w-[420px]">
				<CardHeader className="flex flex-row items-center gap-2 space-y-0 p-3 @sm:p-3">
					<CardTitle className="flex-1">{macro.name}</CardTitle>
					<CardDescription className="m-0 text-right text-xs">{date}</CardDescription>
				</CardHeader>
				<BeltTensionComparison {...beltTensionState} />
				{recordings.result.length === 1 && (
					<InputShapers currentRunId={currentRun} {...inputShapersState} recordings={recordings.result} />
				)}
			</Card>
		</div>
	);
};
