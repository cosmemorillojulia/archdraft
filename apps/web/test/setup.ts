import '@testing-library/jest-dom/vitest';
import { cleanup } from '@testing-library/react';
import { MotionGlobalConfig } from 'motion/react';
import { afterEach, beforeEach, vi } from 'vitest';

// Animations jump to their end state, so tests check outcomes without waiting for them.
MotionGlobalConfig.skipAnimations = true;

/*
 * jsdom has no layout engine. React Flow needs these to measure its pane and
 * nodes, as its testing guide describes; sizes come from inline styles.
 */
class ResizeObserverStub {
  private readonly callback: ResizeObserverCallback;
  constructor(callback: ResizeObserverCallback) {
    this.callback = callback;
  }
  observe(target: Element) {
    const contentRect = { width: 1000, height: 700 } as DOMRectReadOnly;
    this.callback([{ target, contentRect } as ResizeObserverEntry], this);
  }
  unobserve() {}
  disconnect() {}
}

class DOMMatrixReadOnlyStub {
  readonly m22: number;
  constructor(transform?: string) {
    const scale = /scale\(([\d.]+)\)/.exec(transform ?? '')?.[1];
    this.m22 = scale === undefined ? 1 : Number(scale);
  }
}

globalThis.ResizeObserver = ResizeObserverStub;
globalThis.DOMMatrixReadOnly = DOMMatrixReadOnlyStub as unknown as typeof DOMMatrixReadOnly;
Object.defineProperties(HTMLElement.prototype, {
  offsetWidth: {
    get(this: HTMLElement) {
      return Number.parseFloat(this.style.width) || 1;
    },
  },
  offsetHeight: {
    get(this: HTMLElement) {
      return Number.parseFloat(this.style.height) || 1;
    },
  },
});

beforeEach(() => {
  // jsdom does not implement matchMedia; tests start from a light system theme.
  vi.stubGlobal(
    'matchMedia',
    vi.fn((query: string) => ({
      matches: false,
      media: query,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    })),
  );
});

afterEach(() => {
  cleanup();
  localStorage.clear();
  delete document.documentElement.dataset.theme;
  vi.unstubAllGlobals();
});
