import { describe, expect, it } from 'vitest';
import { VERSION } from '../src/index.js';

describe('workspace', () => {
  it('nạp được module của sdk', () => {
    expect(VERSION).toBe('0.1.0');
  });
});
