/** logger.ts — Internal helper/hook for the App-Router pages. See docs/ARCHITECTURE.md §4. */
import pino from 'pino';
import { globalPinoOpts } from '@/helpers/logger';
import { trpcClient } from '@/helpers/trpc';
import { PinoLogEvent } from '@/zods/util';
import { prettyFactory, write } from 'pino-pretty-browser';

const send = async function (level: pino.Level, logEvent: pino.LogEvent) {
	trpcClient.clientLog.mutate({ level, logEvent: PinoLogEvent.parse(logEvent) });
};

let logger: pino.Logger | null = null;
export const getLogger = () => {
	if (logger != null) {
		return logger;
	}
	logger = pino({
		...globalPinoOpts,
		browser: {
			transmit: {
				send,
			},
		},
	});
	return logger;
};
