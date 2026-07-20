/** logger.ts — Shared helper used across the app. See docs/ARCHITECTURE.md §4. */
import { LoggerOptions } from 'pino';

export const globalPinoOpts: LoggerOptions = {
	timestamp: true,
	level: process.env.NODE_ENV === 'development' ? 'debug' : 'info',
};
