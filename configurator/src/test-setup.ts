import { vi } from 'vitest';

export const setup = () => {
	// Mock server-only imports to avoid errors during tests
	vi.mock('server-only', () => ({}));
};
