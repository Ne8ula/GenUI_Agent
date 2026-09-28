import { describe, expect, it } from 'vitest';
import { blendWeightedColor, mixHex, withAlpha } from '../src/visual/palette';

describe('authored canvas colors', () => {
  it('applies opacity to hex palette colors instead of drawing opaque highlights', () => {
    expect(withAlpha('#e4ded2', .25)).toBe('rgba(228, 222, 210, 0.25)');
    expect(withAlpha('#111316', 0)).toBe('rgba(17, 19, 22, 0)');
  });
  it('can mix an already-blended rgb color without incorrectly parsing it as hex', () => {
    const accent = blendWeightedColor({ pearl: 1, ice: 0, coral: 0, lavender: 0 });
    expect(mixHex(accent, '#000000', .5)).toBe('rgb(114, 111, 105)');
    expect(withAlpha(mixHex('#000000', accent, 1), .5)).toBe('rgba(228, 222, 210, 0.5)');
  });
});
