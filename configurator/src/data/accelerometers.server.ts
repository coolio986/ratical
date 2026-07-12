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
