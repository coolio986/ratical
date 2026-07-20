/**
 * data/accelerometers.server.ts — server-only accelerometer detection (shells out to probe
 * what's actually connected). Kept separate from accelerometers.ts so the client bundle never
 * imports child_process.
 */
import { execSync } from 'child_process';
import { existsSync } from 'fs';

export const hasBeaconAccel = () => {
	// I really need a better way to detect this :(
	try {
		const beaconID = existsSync('/dev/beacon')
			? execSync(`udevadm info /dev/beacon | grep "ID_MODEL="`).toString().trim()
			: null;
		if (beaconID && beaconID.endsWith('RevH')) {
			return true;
		}
	} catch (e) {
		return false;
	}
	return false;
};
