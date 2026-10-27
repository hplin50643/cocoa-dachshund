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

describe('v1 to v2 compatibility and validation', () => {
  it('migrates a deployed v1 save without losing care, timestamps or old achievement ids', () => {
    const now=Date.now();
    const legacy={schemaVersion:1,id:'existing-pet',name:'麻糬',adoptedAt:now-30*86_400_000,savedAt:now-1000,revision:7,activeMs:3_700_000,
      needs:{satiety:68,mood:77,hydration:53,energy:82},counts:{feed:10,pet:12,play:1,water:2,sleep:3},
      achievements:{'feed-first':now-20_000,'feed-10':now-10_000,'pet-10':now-5_000,'active-1h':now-3_000,'adopt-7d':now-2_000},
      settings:{reducedMotion:true}};
    const raw=JSON.stringify(legacy);
    const storage=memoryStorage(raw);
    const result=loadSave(storage);
    expect(result.error).toBeNull();
    expect(result.raw).toBe(raw);
    expect(storage.setItem).not.toHaveBeenCalled();
    expect(result.pet).toMatchObject({schemaVersion:2,id:legacy.id,name:legacy.name,adoptedAt:legacy.adoptedAt,savedAt:legacy.savedAt,revision:7,
      activeMs:legacy.activeMs,needs:legacy.needs,counts:legacy.counts,achievements:legacy.achievements,
      settings:{reducedMotion:true,soundEnabled:false},progress:{level:1,xp:0,dailyCompleted:0,weeklyCompleted:0}});
    expect(result.pet?.missions.daily.every(mission=>mission.count===0)).toBe(true);
    expect(result.pet?.missions.weekly.every(mission=>mission.count===0)).toBe(true);
    const upgraded=result.pet!;
    expect(savePet(upgraded,storage).ok).toBe(true);
    expect(loadSave(storage).pet).toEqual(upgraded);
    expect(parseImport(raw)).toEqual(upgraded);
    expect(parseImport(serializePet(upgraded))).toEqual(upgraded);
  });

  it('rejects malformed v2 settings, mission progress, and cosmetic ownership without touching the stored save', () => {
    const pet=createPet('可可');
    const raw=serializePet(pet);
    const storage=memoryStorage(raw);
    const invalidSound={...pet,settings:{...pet.settings,soundEnabled:'yes'}};
    const invalidItem={...pet,unlocks:{...pet.unlocks,equipped:{...pet.unlocks.equipped,rug:'rug-cream'}}};
    const invalidMission={...pet,missions:{...pet.missions,daily:pet.missions.daily.map((mission,index)=>index===0?{...mission,count:1,completedAt:null}:mission)}};
    for(const invalid of [invalidSound,invalidItem,invalidMission]) {
      expect(()=>parseImport(JSON.stringify(invalid))).toThrow();
      expect(savePet(invalid as typeof pet,storage).ok).toBe(false);
    }
    expect(storage.setItem).not.toHaveBeenCalled();
    expect(storage.getItem(STORAGE_KEY)).toBe(raw);
  });

  it('upgrades early v2 previews missing additive sound and exploration fields', () => {
    const pet=applyAction(createPet('可可'),'feed',Date.now());
    const partial=JSON.parse(JSON.stringify(pet)) as Record<string,unknown>;
    delete (partial.settings as Record<string,unknown>).soundEnabled;
    delete (partial.progress as Record<string,unknown>).exploredCorners;
    const loaded=parseImport(JSON.stringify(partial));
    expect(loaded.settings.soundEnabled).toBe(false);
    expect(loaded.progress.exploredCorners).toEqual([]);
    expect(loaded.counts).toEqual(pet.counts);
    expect(loaded.achievements).toEqual(pet.achievements);
    expect(parseImport(serializePet(loaded))).toEqual(loaded);
  });
});
