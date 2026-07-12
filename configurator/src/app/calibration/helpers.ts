export type CameraOption = {
	key: string;
	value?: number | boolean;
	/** camera-streamer device name (CAMERA, VIDEO, …); absent for ustreamer */
	device?: string;
} & ({ min: number; max: number; float?: boolean } | { toggle?: true });

/**
 * The value stored in the database for each camera stream setting.
 * This is a simplified version - the full CameraOption type includes
 * metadata (min/max/toggle) that comes from the camera API.
 */
export type CameraStreamSettingValue = {
	value?: number | boolean;
};

export type CameraStreamerStatus = {
	devices?: Array<{
		name: string;
		options?: Record<
			string,
			{
				type?: string;
				name?: string;
				value?: string | number | boolean | null;
				description?: string;
				menu?: Record<string, string>;
			}
		>;
	}>;
};

/** ustreamer text listing from `/option?compressionquality=` */
export const parseOptions = (options: string) => {
	const ints = options.matchAll(/- available option:\s(\w+)\s.+(\[-?\d+\.\.\d+\])/g);
	let result: CameraOption[] = [];
	for (const match of ints) {
		const [min, max] = match[2]
			.slice(1, -1)
			.split('..')
			.map((n) => parseInt(n, 10));
		const existing = result.find((o) => o.key === match[1]);
		if (existing && 'max' in existing && existing.max && existing.max <= max) {
			continue;
		}
		result.push({
			key: match[1],
			min,
			max: ['redbalance', 'bluebalance', 'greenbalance'].includes(match[1]) ? 2000 : max,
		});
	}
	const floats = options.matchAll(/- available option:\s(\w+)\s.+(\[-?\d+\.\d+\.\.\d+\.\d+\])/g);
	for (const match of floats) {
		const [min, max] = match[2]
			.slice(1, -1)
			.split('..')
			.map((n) => parseFloat(n));
		const existing = result.find((o) => o.key === match[1]);
		if (existing && 'max' in existing && existing.max && existing.max <= max) {
			continue;
		}
		result.push({
			key: match[1],
			float: true,
			min,
			max: ['redbalance', 'bluebalance', 'greenbalance'].includes(match[1]) ? 2000 : max,
		});
	}
	const bools = options.matchAll(/- available option:\s(\w+)\s.+(\[false\.\.true\])/g);
	for (const match of bools) {
		result.push({
			key: match[1],
			toggle: true,
		});
	}
	return result;
};

const parseRangeDescription = (description?: string): { min: number; max: number; float: boolean } | null => {
	if (!description) {
		return null;
	}
	const floatMatch = description.match(/^\[(-?\d+\.\d+)\.\.(-?\d+\.\d+)\]$/);
	if (floatMatch) {
		return { min: parseFloat(floatMatch[1]), max: parseFloat(floatMatch[2]), float: true };
	}
	const intMatch = description.match(/^\[(-?\d+)\.\.(-?\d+)\]$/);
	if (intMatch) {
		return { min: parseInt(intMatch[1], 10), max: parseInt(intMatch[2], 10), float: false };
	}
	return null;
};

const coerceOptionValue = (
	raw: string | number | boolean | null | undefined,
	opt: { type?: string; menu?: Record<string, string> },
	range: { min: number; max: number; float: boolean } | null,
): number | boolean | undefined => {
	if (raw == null) {
		return undefined;
	}
	if (opt.type === 'bool') {
		if (typeof raw === 'boolean') {
			return raw;
		}
		if (raw === '1' || raw === 1 || raw === 'true') {
			return true;
		}
		if (raw === '0' || raw === 0 || raw === 'false') {
			return false;
		}
		return Boolean(raw);
	}
	if (opt.menu && typeof raw === 'string') {
		const entry = Object.entries(opt.menu).find(([, label]) => label === raw);
		if (entry) {
			return Number(entry[0]);
		}
	}
	if (typeof raw === 'number') {
		return raw;
	}
	if (typeof raw === 'string' && raw.trim() !== '' && !Number.isNaN(Number(raw))) {
		return range?.float ? parseFloat(raw) : parseInt(raw, 10);
	}
	return undefined;
};

/**
 * camera-streamer exposes controls via GET `/status` (JSON) and
 * POST `/option?device=&key=&value=` — not ustreamer's `/option?key=value` text API.
 */
export const parseCameraStreamerStatus = (status: CameraStreamerStatus): CameraOption[] => {
	const result: CameraOption[] = [];
	for (const device of status.devices ?? []) {
		if (!device.name || !device.options) {
			continue;
		}
		// Prefer CAMERA controls for VAOC exposure/color; skip codec-only devices by default
		// but still include VIDEO bitrate-ish knobs under Advanced (UI shows all when advanced).
		for (const [key, opt] of Object.entries(device.options)) {
			if (!opt || opt.description === 'button') {
				continue;
			}
			if (opt.type === 'bool') {
				result.push({
					key,
					device: device.name,
					toggle: true,
					value: coerceOptionValue(opt.value, opt, null) as boolean | undefined,
				});
				continue;
			}
			const range = parseRangeDescription(opt.description);
			if (!range || range.min === range.max) {
				continue;
			}
			const value = coerceOptionValue(opt.value, opt, range);
			result.push({
				key,
				device: device.name,
				min: range.min,
				max: ['redbalance', 'bluebalance', 'greenbalance'].includes(key) ? 2000 : range.max,
				float: range.float || opt.type === 'float',
				value: typeof value === 'number' ? value : undefined,
			});
		}
	}
	return result;
};
