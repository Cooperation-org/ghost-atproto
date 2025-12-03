import { describe, it, expect } from 'vitest';
import { generateGhostId, isValidGhostId } from '../src/utils/ghost-id';

describe('ghost-id', () => {
  it('should=((generateGhostId, 24-char hex))', () => {
    const id = generateGhostId();
    expect(id).toHaveLength(24);
    expect(id).toMatch(/^[a-f0-9]{24}$/);
  });

  it('should=((generateGhostId, unique))', () => {
    const ids = new Set([generateGhostId(), generateGhostId(), generateGhostId()]);
    expect(ids.size).toBe(3);
  });

  it('should=((isValidGhostId, valid))', () => {
    expect(isValidGhostId('507f1f77bcf86cd799439011')).toBe(true);
    expect(isValidGhostId('abcdef0123456789abcdef01')).toBe(true);
  });

  it('should=((isValidGhostId, invalid))', () => {
    expect(isValidGhostId('too-short')).toBe(false);
    expect(isValidGhostId('507f1f77bcf86cd799439011xyz')).toBe(false);
    expect(isValidGhostId('507f1f77bcf86cd79943901')).toBe(false);
    expect(isValidGhostId('gggggggggggggggggggggggg')).toBe(false);
  });
});
