/** hooks.tsx — Part of the /configure/analysis (input-shaper / resonance) UI, charted with uPlot. See docs/ARCHITECTURE.md §4. */
import { SequenceData } from '@/app/analysis/macros/[id]/recordings/[runId]/setup';
import { ShaperCalibrationResult } from '@/app/analysis/_worker/input-shaper';
import { useState } from 'react';

export type Peak = { freq: number; amplitude: number };
export type PeakPairingResult = { pairedPeaks: [Peak, Peak][]; unpairedPeaks1: Peak[]; unpairedPeaks2: Peak[] };
export type MechanicalHealthResult = { mhi: number; label: string };

export const useBeltTensionState = () => {
	const [sequencePair, setSequencePair] = useState<[SequenceData, SequenceData] | null>(null);
	const [peakPairingResults, setPeakPairingResults] = useState<PeakPairingResult | null>(null);
	const [mechanicalHealth, setMechanicalHealth] = useState<MechanicalHealthResult | null>(null);
	return {
		sequencePair,
		setSequencePair,
		peakPairingResults,
		setPeakPairingResults,
		mechanicalHealth,
		setMechanicalHealth,
	};
};

export const useSeriesSubcomponentsChart = () => {
	const [subcomponentSeries, setSubcomponentSeries] = useState<string[]>([]);
	return { subcomponentSeries, setSubcomponentSeries };
};

export const useInputShapersState = () => {
	const [sequenceId, setSequenceId] = useState<string | null>(null);
	const [shapers, setShapers] = useState<ShaperCalibrationResult[]>([]);
	const [recommendedShaper, setRecommendedShaper] = useState<ShaperCalibrationResult | null>(null);
	return { shapers, setShapers, recommendedShaper, setRecommendedShaper, sequenceId, setSequenceId };
};
