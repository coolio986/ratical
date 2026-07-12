'use client';

import { shadableTWColors } from '@/app/_helpers/colors';
import { UPlotPSDSeries, UPlotStaticPSDChart } from '@/app/analysis/oss-uplot-charts';
import { macroSequenceSchema } from '@/zods/analysis';
import { useMemo } from 'react';
import { z } from 'zod';

interface MacroChartPreviewProps {
	sequences?: z.input<typeof macroSequenceSchema>[];
}

export const MacroChartPreview = ({ sequences }: MacroChartPreviewProps) => {
	const series = useMemo<UPlotPSDSeries[]>(
		() =>
			(sequences ?? [])
				.filter((sequence) => sequence.recording?.capturePSD)
				.map((sequence, index) => {
					const frequencies = Array.from({ length: 130 }, (_, i) => (200 / 129) * i);
					const seed = index + 1;
					return {
						label: sequence.name,
						color: shadableTWColors[(sequence.recording?.color ?? 'brand') as keyof typeof shadableTWColors][400],
						frequencies,
						estimates: frequencies.map((frequency) =>
							Math.max(0, (Math.sin(frequency / (7 + seed)) + 1.1) * (1200 - frequency * 3) * seed),
						),
					};
				}),
		[sequences],
	);
	return <UPlotStaticPSDChart series={series} className="flex-1" />;
};
