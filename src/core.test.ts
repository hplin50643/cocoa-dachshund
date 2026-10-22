import { describe, expect, it } from 'vitest';
import { ACHIEVEMENTS, advancePet, applyAction, createPet, renamePet, validateSave } from './core';

const NOW = 1_750_000_000_000;
const DAY = 86_400_000;

describe('pet care and time', () => {
  it('uses grapheme length for names and never mutates the original pet', () => {
    const original = createPet('  可可  ', NOW);
    const renamed = renamePet(original, '🐶'.repeat(16), NOW + 100);
    expect(original.name).toBe('可可');
    expect(renamed.name).toBe('🐶'.repeat(16));
    expect(renamed.revision).toBe(1);
    expect(() => renamePet(original, '🐶'.repeat(17), NOW)).toThrow('1～16');
    expect(() => createPet(' \n ', NOW)).toThrow('1～16');
    expect(() => createPet('可\n可', NOW)).toThrow('控制字元');
    expect(createPet('👨‍👩‍👧‍👦'.repeat(16), NOW).name).toBe('👨‍👩‍👧‍👦'.repeat(16));
  });

  it('keeps offline needs and active time unchanged while awarding adoption milestones', () => {
    const original = createPet('可可', NOW);
    const afterMonth = advancePet(original, 0, NOW + 30 * DAY);
    expect(afterMonth.needs).toEqual(original.needs);
    expect(afterMonth.activeMs).toBe(0);
    expect(Object.keys(afterMonth.achievements)).toEqual(['adopt-1d', 'adopt-7d', 'adopt-30d']);
    expect(afterMonth.revision).toBe(1);
    expect(original.achievements).toEqual({});
    expect(advancePet(afterMonth, 0, NOW + 31 * DAY).revision).toBe(1);
  });

  it('counts only the supplied active duration and handles a backwards wall clock', () => {
    const original = createPet('可可', NOW);
    const next = advancePet(original, 60_000, NOW - DAY);
    expect(next.activeMs).toBe(60_000);
    expect(next.savedAt).toBe(NOW);
    expect(next.needs.satiety).toBeCloseTo(84.4);
    expect(next.needs.hydration).toBeCloseTo(84.2);
    expect(next.achievements).toEqual({});
    expect(validateSave(next, NOW)).toEqual(next);
    expect(advancePet(next, -100, NOW).activeMs).toBe(60_000);
    expect(advancePet(next, Number.POSITIVE_INFINITY, NOW).activeMs).toBe(60_000);
    expect(advancePet(next, Number.NaN, NOW).revision).toBe(next.revision);
  });

  it('bounds needs and restores sleep energy gradually without extra sleep counts', () => {
    const original = createPet('可可', NOW);
    original.needs.energy = 10;
    const sleeping = applyAction(original, 'sleep', NOW);
    expect(sleeping.needs.energy).toBe(10);
    expect(sleeping.counts.sleep).toBe(1);
    const rested = advancePet(sleeping, 10_000, NOW + 10_000, true);
    expect(rested.needs.energy).toBe(25);
    expect(rested.counts.sleep).toBe(1);
    const longRest = advancePet(rested, 10 * DAY, NOW + 10 * DAY, true);
    expect(longRest.needs.energy).toBe(100);
    expect(longRest.needs.satiety).toBe(0);
    expect(Object.values(longRest.needs).every((value) => value >= 0 && value <= 100)).toBe(true);
    const bounded = advancePet(original, Number.MAX_VALUE, NOW);
    expect(Number.isFinite(bounded.activeMs)).toBe(true);
    expect(bounded.activeMs).toBeLessThan(Number.MAX_SAFE_INTEGER);
  });

  it('increments one accepted action exactly once and unlocks each milestone once', () => {
    const original = createPet('可可', NOW);
    let pet = original;
    for (let index = 0; index < 10; index += 1) pet = applyAction(pet, 'feed', NOW + index);
    expect(pet.counts.feed).toBe(10);
    expect(pet.counts.pet).toBe(0);
    expect(pet.needs.satiety).toBe(100);
    expect(pet.revision).toBe(10);
    expect(pet.achievements['feed-first']).toBe(NOW);
    expect(pet.achievements['feed-10']).toBe(NOW + 9);
    const advanced = advancePet(pet, 3_600_000, NOW + 3_600_000);
    expect(advanced.achievements['feed-first']).toBe(NOW);
    expect(advanced.achievements['active-1h']).toBe(NOW + 3_600_000);
    expect(ACHIEVEMENTS.find((item) => item.id === 'active-1h')?.progress(advanced, NOW)).toBe(60);
    expect(original.counts.feed).toBe(0);
  });

  it('does not increment revision for an unchanged name or an idle zero-time update', () => {
    const original = createPet('可可', NOW);
    const renamed = renamePet(original, '  可可 ', NOW + 10);
    expect(renamed).toEqual(original);
    expect(renamed).not.toBe(original);
    expect(advancePet(original, 0, NOW + 100)).toEqual(original);
  });
});

describe('save validation', () => {
  it('returns independent, sanitized fields rather than retaining extra imported properties', () => {
    const original = createPet('可可', NOW);
    const clean = validateSave({ ...original, unexpected: true, needs: { ...original.needs, injected: true } }, NOW);
    expect(clean).toEqual(original);
    expect(clean).not.toBe(original);
    expect(clean.needs).not.toBe(original.needs);
  });

  it.each([
    [null, '存檔'],
    [[], '存檔'],
    [{ schemaVersion: 2 }, '版本'],
    [{ ...createPet('可可', NOW), counts: { feed: -1, pet: 0, water: 0, play: 0, sleep: 0 } }, '互動次數'],
    [{ ...createPet('可可', NOW), counts: { feed: 0.5, pet: 0, water: 0, play: 0, sleep: 0 } }, '互動次數'],
    [{ ...createPet('可可', NOW), needs: { satiety: 101, mood: 50, hydration: 50, energy: 50 } }, '狀態'],
    [{ ...createPet('可可', NOW), activeMs: Number.POSITIVE_INFINITY }, '陪伴時間'],
    [{ ...createPet('可可', NOW), adoptedAt: NOW + 300_001 }, '領養時間'],
    [{ ...createPet('可可', NOW), savedAt: NOW - 1 }, '儲存時間'],
    [{ ...createPet('可可', NOW), settings: { reducedMotion: 'true' } }, '設定'],
    [{ ...createPet('可可', NOW), achievements: { unknown: NOW } }, '成就'],
  ])('rejects malformed data without coercing it: %j', (value, message) => {
    expect(() => validateSave(value, NOW)).toThrow(message as string);
  });

  it('rejects missing required fields and allows only a small future clock tolerance', () => {
    const missing = { ...createPet('可可', NOW) } as Record<string, unknown>;
    delete missing.counts;
    expect(() => validateSave(missing, NOW)).toThrow('缺少');
    expect(validateSave(createPet('可可', NOW + 300_000), NOW).adoptedAt).toBe(NOW + 300_000);
  });

  it('can preserve local clock history while still rejecting nonrepresentable dates', () => {
    const pet = applyAction(createPet('可可', NOW), 'feed', NOW);
    expect(validateSave(pet, NOW - DAY, { allowFutureDates: true })).toEqual(pet);
    expect(() => validateSave(pet, NOW - DAY)).toThrow('領養時間');
    expect(() => validateSave({ ...pet, savedAt: 8_640_000_000_000_001 }, NOW, { allowFutureDates: true })).toThrow('儲存時間');
    expect(() => validateSave({ ...pet, savedAt: NOW - 1 }, NOW, { allowFutureDates: true })).toThrow('儲存時間');
  });
});
