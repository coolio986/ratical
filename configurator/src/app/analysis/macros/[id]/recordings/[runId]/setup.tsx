import { TWShadeableColorName } from '@/app/_helpers/colors';
import { PSD } from '@/zods/analysis';

export enum SequenceDataChartType {
	Line = 'line',
	Mountain = 'mountain',
}

export type SequenceData = {
	sequenceId: string;
	color: TWShadeableColorName;
	name: string;
	psd: { total: PSD; x: PSD; y: PSD; z: PSD };
	type: SequenceDataChartType;
};
