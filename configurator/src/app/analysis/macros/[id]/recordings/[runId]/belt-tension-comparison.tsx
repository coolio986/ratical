import { computeMechanicalHealth, detectPeaks, pairPeaks } from '@/app/analysis/_worker/graph-comparison';
import { MechanicalHealthResult, PeakPairingResult } from '@/app/analysis/macros/hooks';
import { SequenceData } from '@/app/analysis/macros/[id]/recordings/[runId]/setup';
import { AnimatedContainer } from '@/components/common/animated-container';
import { CardDescription, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { useEffect } from 'react';
import { twJoin } from 'tailwind-merge';

interface BeltTensionComparisonProps {
	sequencePair: [SequenceData, SequenceData] | null;
	peakPairingResults: PeakPairingResult | null;
	mechanicalHealth: MechanicalHealthResult | null;
	setPeakPairingResults: React.Dispatch<React.SetStateAction<PeakPairingResult | null>>;
	setMechanicalHealth: React.Dispatch<React.SetStateAction<MechanicalHealthResult | null>>;
}

export const BeltTensionComparison = ({
	sequencePair,
	setPeakPairingResults,
	setMechanicalHealth,
	peakPairingResults,
	mechanicalHealth,
}: BeltTensionComparisonProps) => {
	useEffect(() => {
		if (!sequencePair) {
			setPeakPairingResults(null);
			setMechanicalHealth(null);
			return;
		}
		const threshold =
			Math.max(sequencePair[0].psd.total.powerRange.max, sequencePair[1].psd.total.powerRange.max) * 0.12;
		const pairing = pairPeaks(
			detectPeaks(sequencePair[0].psd.total, threshold),
			detectPeaks(sequencePair[1].psd.total, threshold),
		);
		setPeakPairingResults(pairing);
		setMechanicalHealth(
			computeMechanicalHealth(
				{ pairedPeaks: pairing.pairedPeaks, unpairedPeaks: pairing.unpairedPeaks1, psd: sequencePair[0].psd.total },
				{ pairedPeaks: pairing.pairedPeaks, unpairedPeaks: pairing.unpairedPeaks2, psd: sequencePair[1].psd.total },
			),
		);
	}, [sequencePair, setMechanicalHealth, setPeakPairingResults]);

	return (
		<AnimatedContainer containerClassName="overflow-hidden">
			{peakPairingResults && sequencePair && (
				<div>
					<Table className="rounded-none" containerClassName="rounded-none">
						<TableHeader>
							<TableRow className="text-xs">
								<TableHead>Pair</TableHead>
								<TableHead className="text-right">Freq. Delta</TableHead>
								<TableHead className="text-right">Ampl. Delta</TableHead>
							</TableRow>
						</TableHeader>
						<TableBody>
							{peakPairingResults.pairedPeaks.map((pair, index) => (
								<TableRow key={`${pair[0].freq}-${pair[1].freq}`} className={twJoin('text-xs')}>
									<TableCell>Peaks {String.fromCharCode(65 + index)}</TableCell>
									<TableCell className="text-right">{Math.abs(pair[0].freq - pair[1].freq).toFixed(1)}hz</TableCell>
									<TableCell className="text-right">
										{(
											(Math.abs(pair[0].amplitude - pair[1].amplitude) /
												Math.max(pair[0].amplitude, pair[1].amplitude)) *
											100
										).toFixed(1)}
										%
									</TableCell>
								</TableRow>
							))}
						</TableBody>
					</Table>
					<div className="mt-0 grid grid-cols-2 gap-3 p-3">
						<div>
							<CardTitle className="text-sm">Estimated Similarity</CardTitle>
							<CardDescription className="text-xs">{mechanicalHealth?.mhi.toFixed(1)}%</CardDescription>
						</div>
						<div>
							<CardTitle className="text-sm">Status</CardTitle>
							<CardDescription className="text-xs">{mechanicalHealth?.label}</CardDescription>
						</div>
						<div className="col-span-full">
							<CardTitle className="text-sm">Unpaired Peaks</CardTitle>
							<CardDescription className="text-xs">
								{peakPairingResults.unpairedPeaks1.length} on {sequencePair[0].name}
							</CardDescription>
							<CardDescription className="text-xs">
								{peakPairingResults.unpairedPeaks2.length} on {sequencePair[1].name}
							</CardDescription>
						</div>
					</div>
				</div>
			)}
		</AnimatedContainer>
	);
};
