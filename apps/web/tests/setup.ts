import '@testing-library/jest-dom/vitest';
import { vi } from 'vitest';

// Mock fetch for offline service check in unit tests
vi.stubGlobal(
  'fetch',
  vi.fn(() => Promise.reject(new Error('Offline in test environment'))),
);

if (typeof HTMLCanvasElement !== 'undefined') {
  HTMLCanvasElement.prototype.getContext = vi.fn(() => null) as unknown as typeof HTMLCanvasElement.prototype.getContext;
}
