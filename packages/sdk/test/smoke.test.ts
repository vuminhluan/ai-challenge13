import { describe, expect, it } from 'vitest';
import { VERSION } from '../src/index.js';

describe('workspace', () => {
  it('loads the sdk module', () => {
    expect(VERSION).toBe('0.1.0');
  });
});
