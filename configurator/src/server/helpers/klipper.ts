/**
 * klipper.ts — helpers for talking to / inspecting the Klipper (Kalico) install:
 * checkout state, service restart, and reading klippy-side status. Used by the routers and
 * config flow. Paths come from KLIPPER_DIR / KLIPPER_ENV in the app .env.
 */
import { getLogger } from '@/server/helpers/logger';
import { getErrorMessage } from '@/utils/exception-handling';
import { MoonrakerPrinterState, MoonrakerPrinterStateErrorEnum, parseMoonrakerHTTPResponse } from '@/zods/moonraker';
import { ZodError } from 'zod';

/**
 * Query Moonraker for the printer's current print state.
 *
 * This function hits Moonraker's `printer/objects/query?print_stats` endpoint and
 * returns the `state` field from `print_stats`.
 *
 * If Moonraker is offline, failing, or returns unexpected data, this function returns
 * `'error'`.
 */
export const queryPrinterState = async (): Promise<
	Zod.output<typeof MoonrakerPrinterState>['status']['print_stats']['state']
> => {
	try {
		const moonrakerRes = await fetch('http://localhost:7125/printer/objects/query?print_stats');
		if (moonrakerRes)
			return (await parseMoonrakerHTTPResponse(moonrakerRes, MoonrakerPrinterState)).result.status.print_stats.state;
	} catch (e) {
		if (
			e instanceof Error &&
			(e.cause === MoonrakerPrinterStateErrorEnum.MOONRAKER_OFFLINE ||
				e.cause === MoonrakerPrinterStateErrorEnum.MOONRAKER_INTERNAL_ERROR)
		) {
			return 'error';
		} else if (e instanceof ZodError) {
			return 'error';
		} else {
			throw e;
		}
	}
	return 'error';
};

/**
 * Restart Klipper (and optionally other services) via Moonraker.
 *
 * This helper will first check the printer state (unless `force` is true) and
 * will only send a restart request if the printer is in an idle/finished/error
 * state. When the printer is actively printing, restart will be skipped.
 *
 * @param opts.force - If true, skip querying printer state and always attempt restarts.
 * @param opts.servicesToRestart - Optional list of permitted services to restart before
 *   triggering the Klipper restart. Service restarts are only attempted if
 *   the printer state allows for a restart or if `force` is true.
 * @param opts.abortOnServiceRestartFailure - If true, abort the whole restart process
 *   when any service restart request fails.
 * @returns `true` when the klipper restart command was successfully sent, `false` otherwise.
 *   Note that service restart failures do not affect the return value unless
 *   `abortOnServiceRestartFailure` is set to true.
 */
export const klipperRestart = async (opts?: {
	force?: boolean;
	servicesToRestart?: PermittedServices[];
	abortOnServiceRestartFailure?: boolean;
}) => {
	if (opts?.force === true) {
		getLogger().info('Restarting Klipper without checking printer state...');
	} else {
		let state: string | undefined;
		try {
			state = await queryPrinterState();
		} catch (e) {
			getLogger().error(`Failed to query printer state before Klipper restart: ${getErrorMessage(e)}`);
			return false;
		}
		if (!['error', 'complete', 'canceled', 'standby', undefined].includes(state)) {
			getLogger().info(`Skipping Klipper restart because printer is in '${state}' state.`);
			return false;
		}
		getLogger().info(`Restarting Klipper, printer is currently in '${state}' state...`);
	}

	if (opts?.servicesToRestart && opts.servicesToRestart.length > 0) {
		for (const service of opts.servicesToRestart) {
			const restarted = await serviceRestart(service);
			if (!restarted && opts?.abortOnServiceRestartFailure === true) {
				getLogger().error(`Failed to restart service ${service}, aborting Klipper restart.`);
				return false;
			}
		}
	}

	try {
		await fetch('http://localhost:7125/printer/restart', { method: 'POST' });
		getLogger().info('Klipper restart command sent successfully.');
		return true;
	} catch (e) {
		getLogger().error(`Failed to send Klipper restart command: ${getErrorMessage(e)}`);
	}

	return false;
};

// Keep in sync with the expected content of moonraker.asvc (see ratical-common.sh)
export type PermittedServices =
	| 'klipper_mcu'
	| 'webcamd'
	| 'MoonCord'
	| 'KlipperScreen'
	| 'moonraker-telegram-bot'
	| 'moonraker-obico'
	| 'sonar'
	| 'crowsnest'
	| 'octoeverywhere'
	| 'ratical-configurator';

/**
 * Restart a permitted service through Moonraker.
 *
 * This simply sends a restart request to Moonraker's service API.
 *
 * @param service - One of the allowed services defined by `PermittedServices`.
 * @returns `true` when the restart request was sent successfully, `false` on error.
 */
export const serviceRestart = async (service: PermittedServices) => {
	getLogger().info(`Attempting to restart service ${service} via Moonraker...`);
	try {
		await fetch('http://localhost:7125/machine/services/restart', {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ service }),
		});
		getLogger().info(`${service} restart command sent successfully.`);
		return true;
	} catch (e) {
		getLogger().error(`Failed to send ${service} restart command: ${getErrorMessage(e)}`);
	}

	return false;
};
