/**
 * data/nozzles.ts — the nozzle registry (diameters/materials) used by the wizard and by
 * VAOC (outer nozzle diameter feeds camera calibration).
 */
import { z } from 'zod';
import { Nozzle } from '@/zods/hardware';

export const getDefaultNozzle = () => {
	return { diameter: 0.4, type: 'Regular' } satisfies z.infer<typeof Nozzle>;
};
