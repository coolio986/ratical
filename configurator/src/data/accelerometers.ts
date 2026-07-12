import { z } from 'zod';
import { Accelerometer } from '@/zods/hardware';
import { PartialPrinterConfiguration } from '@/zods/printer-configuration';
import { PartialToolheadConfiguration } from '@/zods/toolhead';

// hasBeaconAccel has been moved to accelerometers.server.ts
// to avoid bundling Node.js modules (fs, child_process) into client code

export const xAccelerometerOptions = (
	config?: z.infer<typeof PartialPrinterConfiguration> | null,
	toolheadConfig?: PartialToolheadConfiguration | null,
	hasBeacon: boolean = false,
): z.infer<typeof Accelerometer>[] => {
	const accelerometers: z.infer<typeof Accelerometer>[] = [
		{ id: 'none' as const, title: 'None' },
		{ id: 'sbc' as const, title: 'Wired to Host Computer' },
	];
	if (config?.controlboard?.ADXL345SPI != null || config?.controlboard?.LIS2DW != null) {
		accelerometers.push({ id: 'controlboard' as const, title: 'Wired to Controlboard' });
	}
	if (
		toolheadConfig?.toolboard != null &&
		(toolheadConfig.toolboard.ADXL345SPI != null || toolheadConfig.toolboard.LIS2DW != null)
	) {
		accelerometers.push({ id: 'toolboard' as const, title: 'Integrated on toolboard' });
	}
	if (hasBeacon) {
		accelerometers.push({ id: 'beacon' as const, title: 'Beacon' });
	}
	return accelerometers;
};

export const yAccelerometerOptions = (
	config?: z.infer<typeof PartialPrinterConfiguration> | null,
	toolheadConfig?: PartialToolheadConfiguration | null,
	hasBeacon: boolean = false,
): z.infer<typeof Accelerometer>[] => {
	const accelerometers: z.infer<typeof Accelerometer>[] = [
		{ id: 'none' as const, title: 'None' },
		{ id: 'sbc' as const, title: 'Wired to Host Computer' },
	];
	if (config?.controlboard?.ADXL345SPI != null || config?.controlboard?.LIS2DW != null) {
		accelerometers.push({ id: 'controlboard' as const, title: 'Wired to Controlboard' });
	}
	if (
		toolheadConfig?.toolboard != null &&
		(toolheadConfig.toolboard.ADXL345SPI != null || toolheadConfig.toolboard.LIS2DW != null)
	) {
		accelerometers.push({ id: 'toolboard' as const, title: 'Integrated on toolboard' });
	}
	if (hasBeacon) {
		accelerometers.push({ id: 'beacon' as const, title: 'Beacon' });
	}
	return accelerometers;
};
