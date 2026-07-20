'use client';
/** macro-run-chart.tsx — Part of the /configure/analysis (input-shaper / resonance) UI, charted with uPlot. See docs/ARCHITECTURE.md §4. */

import { shadableTWColors } from '@/app/_helpers/colors';
import { UPlotPSDSeries, UPlotStaticPSDChart } from '@/app/analysis/oss-uplot-charts';
import { ShaperCalibrationResult } from '@/app/analysis/_worker/input-shaper';
import { SequenceData } from '@/app/analysis/macros/[id]/recordings/[runId]/setup';
import { useMemo } from 'react';

interface MacroRunChartProps {
	sequenceSeries: SequenceData[];
	shapers?: ShaperCalibrationResult[];
	recommendedShaper?: ShaperCalibrationResult | null;
	subcomponentSeries: string[];
}

export const MacroRunChart = ({
	sequenceSeries,
	shapers = [],
	recommendedShaper,
	subcomponentSeries,
}: MacroRunChartProps) => {
	const series = useMemo<UPlotPSDSeries[]>(() => {
		const result: UPlotPSDSeries[] = sequenceSeries.map((sequence) => ({
			label: sequence.name,
			color: shadableTWColors[sequence.color][400],
			frequencies: sequence.psd.total.frequencies,
			estimates: sequence.psd.total.estimates,
		}));
		sequenceSeries
			.filter((sequence) => subcomponentSeries.includes(sequence.sequenceId))
			.forEach((sequence) => {
				(['x', 'y', 'z'] as const).forEach((axis) =>
					result.push({
						label: `${sequence.name} ${axis.toUpperCase()}`,
						color: shadableTWColors[axis === 'x' ? 'red' : axis === 'y' ? 'yellow' : 'blue'][400],
						frequencies: sequence.psd[axis].frequencies,
						estimates: sequence.psd[axis].estimates,
						width: 1.5,
					}),
				);
			});
		shapers.forEach((shaper) =>
			result.push({
				label: `${shaper.name.toUpperCase()} shaper`,
				color: shadableTWColors[shaper.color][400],
				frequencies: sequenceSeries[0]?.psd.total.frequencies ?? [],
				estimates: shaper.vals,
				width: shaper.name === recommendedShaper?.name ? 3 : 1,
			}),
		);
		return result;
	}, [recommendedShaper?.name, sequenceSeries, shapers, subcomponentSeries]);
	return <UPlotStaticPSDChart series={series} className="flex-1 bg-zinc-900/50" />;
};
