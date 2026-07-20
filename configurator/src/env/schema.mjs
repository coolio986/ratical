// @ts-check
/**
 * env/schema.mjs — the runtime environment contract (validated with Zod at boot).
 *
 * Defines every env var the app requires: RATICAL_CONFIGURATION_PATH (where board/printer
 * definitions are read), KLIPPER_CONFIG_PATH (where generated config is written), KLIPPER_DIR,
 * KLIPPER_ENV, MOONRAKER_DIR, RATICAL_DATA_DIR, RATICAL_SCRIPT_DIR. Defaults live in `.env`
 * and all hardcode /home/pi. Changing the user means editing .env here AND config.env
 * (RK_USER). See docs/modifying/configurator.md §2.
 */
import { z } from 'zod';

/**
 * Specify your server-side environment variables schema here.
 * This way you can ensure the app isn't built with invalid env vars.
 */
export const serverSchema = z.object({
	USER: z.string().default('pi'),
	NODE_ENV: z.enum(['development', 'test', 'production']),
	RATICAL_CONFIGURATION_PATH: z.string(),
	RATICAL_SCRIPT_DIR: z.string(),
	KLIPPER_CONFIG_PATH: z.string(),
	KLIPPER_DIR: z.string(),
	KLIPPER_ENV: z.string(),
	MOONRAKER_DIR: z.string(),
	LOG_FILE: z.string(),
	RATICAL_DATA_DIR: z.string(),
});

/**
 * Specify your client-side environment variables schema here.
 * This way you can ensure the app isn't built with invalid env vars.
 * To expose them to the client, prefix them with `NEXT_PUBLIC_`.
 */
export const clientSchema = z.object({
	NEXT_PUBLIC_KLIPPER_HOSTNAME: z.string().optional(),
});

/**
 * You can't destruct `process.env` as a regular object, so you have to do
 * it manually here. This is because Next.js evaluates this at build time,
 * and only used environment variables are included in the build.
 * @type {{ [k in keyof z.infer<typeof clientSchema>]: z.infer<typeof clientSchema>[k] | undefined }}
 */
export const clientEnv = {
	NEXT_PUBLIC_KLIPPER_HOSTNAME: process.env.NEXT_PUBLIC_KLIPPER_HOSTNAME,
};
