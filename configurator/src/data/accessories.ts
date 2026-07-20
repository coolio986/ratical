/**
 * data/accessories.ts — registries for optional accessories: filament sensors, chamber air
 * filters, chamber lighting, and toolhead-alignment systems. Add an entry to surface it in
 * the wizard; each maps to a fragment under `configuration/`.
 */
import { FilamentSensor, ChamberAirFilter, ChamberLighting, ToolheadAlignmentSystem } from '@/zods/hardware';
import type { PartialPrinterConfiguration } from '@/zods/printer-configuration';
import { PartialToolheadConfiguration } from '@/zods/toolhead';
import { getCompatibleHardwareInstancesAsync } from '@/templates/template-api';

/**
 * Return valid filament sensor options considering the controlboard and/or toolhead configuration.
 * See documentation on {@link getCompatibleHardwareInstancesAsync} for usage details.
 */
export async function getFilamentSensorOptionsAsync(
	config?: PartialPrinterConfiguration | null,
	toolNumber?: number | null,
	toolheadConfig?: PartialToolheadConfiguration | null,
): Promise<FilamentSensor[]> {
	return await getCompatibleHardwareInstancesAsync('filament-sensor', config, toolNumber, toolheadConfig);
}

/**
 * Return valid chamber air filter  options considering the controlboard and/or toolhead configuration.
 * See documentation on {@link getCompatibleHardwareInstancesAsync} for usage details.
 */
export async function getChamberAirFilterOptionsAsync(
	config?: PartialPrinterConfiguration | null,
): Promise<ChamberAirFilter[]> {
	return await getCompatibleHardwareInstancesAsync('chamber-air-filter', config);
}

/**
 * Return valid chamber lighting options considering the controlboard and/or toolhead configuration.
 * See documentation on {@link getCompatibleHardwareInstancesAsync} for usage details.
 */
export async function getChamberLightingOptionsAsync(
	config?: PartialPrinterConfiguration | null,
): Promise<ChamberLighting[]> {
	return await getCompatibleHardwareInstancesAsync('chamber-lighting', config);
}

/**
 * Return valid toolhead alignment system options considering the controlboard and/or toolhead configuration.
 * See documentation on {@link getCompatibleHardwareInstancesAsync} for usage details.
 */
export async function getToolheadAlignmentSystemOptionsAsync(
	config?: PartialPrinterConfiguration | null,
): Promise<ToolheadAlignmentSystem[]> {
	return await getCompatibleHardwareInstancesAsync('toolhead-alignment-system', config);
}
