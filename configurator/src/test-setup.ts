/** test-setup.ts — Configurator source module. See docs/ARCHITECTURE.md §4. */
import { vi } from 'vitest';

export const setup = () => {
	// Mock server-only imports to avoid errors during tests
	vi.mock('server-only', () => ({}));
};
