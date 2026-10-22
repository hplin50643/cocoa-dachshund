import { afterEach, describe, expect, it, vi } from 'vitest';
import { applyAction, createPet } from './core';
import { STORAGE_KEY, loadSave, parseImport, savePet, serializePet, type PetStorage } from './persistence';

function memoryStorage(initial?: string) {
  const data = new Map<string, string>(initial === undefined ? [] : [[STORAGE_KEY, initial]]);
  return {
    getItem: vi.fn((key: string) => data.get(key) ?? null),
    setItem: vi.fn((key: string, value: string) => { data.set(key, value); }),
  } satisfies PetStorage;
}

afterEach(() => vi.unstubAllGlobals());

describe('local persistence', () => {
  it('distinguishes a fresh browser from a corrupt existing save', () => {
    expect(loadSave(memoryStorage())).toEqual({ pet: null, error: null, raw: null });
    const storage = memoryStorage('{broken');
    const result = loadSave(storage);
    expect(result.pet).toBeNull();
    expect(result.raw).toBe('{broken');
    expect(result.error).toContain('原始資料已保留');
    expect(storage.setItem).not.toHaveBeenCalled();
    expect(storage.getItem(STORAGE_KEY)).toBe('{broken');
  });

  it('preserves all data across save/load and export/import', () => {
    const now = Date.now();
    const pet = applyAction(createPet('可可 👨‍👩‍👧‍👦', now), 'feed', now);
    const storage = memoryStorage();
    expect(savePet(pet, storage)).toEqual({ ok: true, error: null });
    expect(storage.setItem).toHaveBeenCalledOnce();
    expect(loadSave(storage).pet).toEqual(pet);
    expect(parseImport(serializePet(pet))).toEqual(pet);
  });

  it('reports read access errors and write quota errors without claiming success', () => {
    const storage: PetStorage = {
      getItem: () => { throw new DOMException('Denied', 'SecurityError'); },
      setItem: () => { throw new DOMException('Full', 'QuotaExceededError'); },
    };
    expect(loadSave(storage)).toMatchObject({ pet: null, raw: null });
    expect(loadSave(storage).error).toContain('網站儲存設定');
    const result = savePet(createPet('可可'), storage);
    expect(result.ok).toBe(false);
    expect(result.error).toContain('匯出備份');
  });

  it('handles missing browser storage', () => {
    vi.stubGlobal('localStorage', undefined);
    expect(loadSave().error).toContain('無法讀取');
    expect(savePet(createPet('可可')).ok).toBe(false);
  });

  it('catches a SecurityError raised by the browser storage getter itself', () => {
    const previous = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');
    Object.defineProperty(globalThis, 'localStorage', {
      configurable: true,
      get() { throw new DOMException('Denied', 'SecurityError'); },
    });
    try {
      expect(loadSave().error).toContain('無法讀取');
      expect(savePet(createPet('可可')).error).toContain('匯出備份');
    } finally {
      if (previous) Object.defineProperty(globalThis, 'localStorage', previous);
      else Reflect.deleteProperty(globalThis, 'localStorage');
    }
  });

  it('does not write invalid data over a healthy existing save', () => {
    const pet = createPet('可可');
    const healthy = serializePet(pet);
    const storage = memoryStorage(healthy);
    const invalid = { ...pet, activeMs: -1 };
    expect(savePet(invalid, storage).ok).toBe(false);
    expect(storage.setItem).not.toHaveBeenCalled();
    expect(storage.getItem(STORAGE_KEY)).toBe(healthy);
  });

  it('can save, load, and export valid local history after a device clock rollback', () => {
    const originalTime = Date.now();
    const pet = applyAction(createPet('可可', originalTime), 'feed', originalTime);
    const storage = memoryStorage();
    expect(savePet(pet, storage).ok).toBe(true);
    const clock = vi.spyOn(Date, 'now').mockReturnValue(originalTime - 3_600_000);
    try {
      expect(loadSave(storage)).toMatchObject({ pet, error: null });
      expect(savePet(pet, storage).ok).toBe(true);
      expect(JSON.parse(serializePet(pet))).toEqual(pet);
      expect(() => parseImport(serializePet(pet))).toThrow('領養時間');
    } finally {
      clock.mockRestore();
    }
  });
});

describe('backup validation', () => {
  it('rejects empty, malformed, oversized, and structurally invalid files', () => {
    expect(() => parseImport('  ')).toThrow('空的');
    expect(() => parseImport('{')).toThrow('JSON');
    expect(() => parseImport('x'.repeat(1024 * 1024 + 1))).toThrow('1 MiB');
    expect(() => parseImport('可'.repeat(400_000))).toThrow('1 MiB');
    expect(() => parseImport('[]')).toThrow('格式');
    expect(() => parseImport('{"schemaVersion":9}')).toThrow('版本');
  });

  it('retains a name as inert text and removes unexpected imported object fields', () => {
    const pet = createPet('<b>可可</b>');
    const text = JSON.stringify({ ...pet, __unexpected: '<script />' });
    const result = parseImport(text);
    expect(result.name).toBe('<b>可可</b>');
    expect(result).not.toHaveProperty('__unexpected');
  });
});
