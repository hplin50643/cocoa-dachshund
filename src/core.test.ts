import { describe, expect, it } from 'vitest';
import { ACHIEVEMENTS, COSMETICS, advancePet, applyAction, createPet, equipCosmetic, exploreCorner, localDayKey, renamePet, validateSave, weekKeyForDay } from './core';

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
    expect(Object.keys(afterMonth.achievements)).toEqual(['adopted-name', 'adopt-1d', 'adopt-7d', 'adopt-30d']);
    expect(afterMonth.revision).toBe(1);
    expect(original.achievements).toEqual({'adopted-name':NOW});
    const nextDay = advancePet(afterMonth, 0, NOW + 31 * DAY);
    expect(nextDay.revision).toBe(2); // Daily missions rotate even when the pet was offline.
    expect(nextDay.needs).toEqual(afterMonth.needs);
  });

  it('counts only the supplied active duration and handles a backwards wall clock', () => {
    const original = createPet('可可', NOW);
    const next = advancePet(original, 60_000, NOW - DAY);
    expect(next.activeMs).toBe(60_000);
    expect(next.savedAt).toBe(NOW);
    expect(next.needs.satiety).toBeCloseTo(84.4);
    expect(next.needs.hydration).toBeCloseTo(84.2);
    expect(next.achievements).toEqual({'adopted-name':NOW});
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
    [{ schemaVersion: 3 }, '版本'],
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

describe('long-term daily care', () => {
  const monday = new Date(2026, 0, 5, 12).getTime();
  const localNoon = (day:number) => new Date(2026, 0, day, 12).getTime();

  it('awards daily and weekly tasks once and caps repeated action XP', () => {
    let pet=createPet('可可',monday);
    pet=applyAction(pet,'feed',monday);
    expect(pet.missions.daily.find(m=>m.id==='daily-feed')).toMatchObject({count:1,completedAt:monday});
    expect(pet.progress).toMatchObject({xp:30,level:1,bond:7,dailyCompleted:1,weeklyCompleted:0});
    expect(pet.streak).toMatchObject({current:1,best:1,lastActiveDay:'2026-01-05'});
    for(let i=0;i<4;i++) pet=applyAction(pet,'feed',monday+i+1);
    expect(pet.progress.xp).toBe(50);
    for(let i=0;i<4;i++) pet=applyAction(pet,'feed',monday+i+10);
    expect(pet.progress.xp).toBe(50);
    expect(pet.progress.dailyActionCounts.feed).toBe(5);
    pet=applyAction(pet,'feed',monday+20);
    expect(pet.missions.weekly.find(m=>m.id==='weekly-feed')).toMatchObject({count:10,completedAt:monday+20});
    expect(pet.progress).toMatchObject({level:2,xp:50,dailyCompleted:1,weeklyCompleted:1});
    expect(pet.unlocks.unlocked).toContain('rug-cream');
    const again=applyAction(pet,'feed',monday+21);
    expect(again.progress).toEqual(pet.progress);
    expect(again.streak).toEqual(pet.streak);
    expect(again.achievements['feed-first']).toBe(monday);
    expect(again.achievements['feed-10']).toBe(monday+20);
    expect(validateSave(again,monday+21)).toEqual(again);
  });

  it('rotates daily and weekly on local calendar boundaries without offline completion', () => {
    const sunday=new Date(2026,0,11,23,59).getTime();
    const mondayMorning=new Date(2026,0,12,0,1).getTime();
    let pet=applyAction(createPet('可可',sunday),'feed',sunday);
    const beforeNeeds={...pet.needs};
    pet=advancePet(pet,0,mondayMorning);
    expect(pet.needs).toEqual(beforeNeeds);
    expect(pet.missions.dailyKey).toBe('2026-01-12');
    expect(pet.missions.weeklyKey).toBe('2026-01-12');
    expect(pet.missions.daily.every(m=>m.count===0&&m.completedAt===null)).toBe(true);
    expect(pet.missions.weekly.every(m=>m.count===0&&m.completedAt===null)).toBe(true);
    expect(pet.missions.history).toEqual([
      {period:'daily',key:'2026-01-11',completedIds:['daily-feed']},
      {period:'weekly',key:'2026-01-05',completedIds:[]},
    ]);
    const savedRevision=pet.revision;
    expect(advancePet(pet,0,mondayMorning).revision).toBe(savedRevision);
    expect(validateSave(pet,mondayMorning)).toEqual(pet);
  });

  it('allows one missed-day grace per streak, then restarts after another gap', () => {
    let pet=applyAction(createPet('可可',localNoon(5)),'feed',localNoon(5));
    pet=applyAction(pet,'feed',localNoon(7));
    expect(pet.streak).toMatchObject({current:2,best:2,graceUsed:true});
    pet=applyAction(pet,'feed',localNoon(9));
    expect(pet.streak).toMatchObject({current:1,best:2,graceUsed:false});
    pet=applyAction(pet,'pet',localNoon(9)+1);
    pet=applyAction(pet,'pet',localNoon(9)+2);
    expect(pet.streak.current).toBe(1);
    expect(pet.progress.daysCared).toBe(3);
  });

  it('clears an expired streak on refresh before any new daily mission is completed', () => {
    let pet=applyAction(createPet('可可',localNoon(5)),'feed',localNoon(5));
    // A single missed day is still eligible for the unused grace.
    pet=advancePet(pet,0,localNoon(7));
    expect(pet.streak).toMatchObject({current:1,best:1,lastActiveDay:'2026-01-05',graceUsed:false});
    pet=applyAction(pet,'feed',localNoon(7));
    expect(pet.streak).toMatchObject({current:2,best:2,lastActiveDay:'2026-01-07',graceUsed:true});
    pet=advancePet(pet,0,localNoon(8));
    expect(pet.streak).toMatchObject({current:2,best:2,lastActiveDay:'2026-01-07',graceUsed:true});
    const caredDays=pet.progress.daysCared;
    pet=advancePet(pet,0,localNoon(9));
    expect(pet.streak).toEqual({current:0,best:2,lastActiveDay:null,graceUsed:false});
    expect(pet.progress.daysCared).toBe(caredDays);
    expect(pet.missions.daily.every(mission=>mission.completedAt===null)).toBe(true);
    expect(validateSave(pet,localNoon(9))).toEqual(pet);
    pet=applyAction(pet,'feed',localNoon(9));
    expect(pet.streak).toMatchObject({current:1,best:2,lastActiveDay:'2026-01-09',graceUsed:false});
    expect(pet.progress.daysCared).toBe(caredDays+1);
  });

  it('expires a streak after a longer absence and never clears it on a clock rollback', () => {
    let pet=applyAction(createPet('可可',localNoon(5)),'feed',localNoon(5));
    const previous=structuredClone(pet.streak);
    pet=advancePet(pet,0,localNoon(4));
    expect(pet.streak).toEqual(previous);
    pet=advancePet(pet,0,localNoon(8));
    expect(pet.streak).toEqual({current:0,best:1,lastActiveDay:null,graceUsed:false});
    expect(pet.progress.daysCared).toBe(1);
  });

  it('keeps care history on clock rollback while freezing earlier task and XP awards', () => {
    let pet=applyAction(createPet('可可',localNoon(5)),'feed',localNoon(5));
    pet=advancePet(pet,0,localNoon(6));
    const missions=structuredClone(pet.missions);
    const progression=structuredClone(pet.progress);
    pet=applyAction(pet,'feed',localNoon(5));
    expect(pet.counts.feed).toBe(2);
    expect(pet.missions).toEqual(missions);
    expect(pet.progress).toEqual(progression);
    expect(pet.journal.at(-1)?.action).toBe('feed');
    expect(validateSave(pet,localNoon(5),{allowFutureDates:true})).toEqual(pet);
  });

  it('uses date-based weekly arithmetic at a daylight-saving transition', () => {
    const testProcess=(globalThis as unknown as {process:{env:Record<string,string|undefined>}}).process;
    const oldTz=testProcess.env.TZ;
    testProcess.env.TZ='America/New_York';
    try {
      const before=new Date(2026,2,7,12).getTime();
      const after=new Date(2026,2,8,12).getTime();
      const nextMonday=new Date(2026,2,9,12).getTime();
      expect(localDayKey(before)).toBe('2026-03-07');
      expect(localDayKey(after)).toBe('2026-03-08');
      expect(weekKeyForDay(localDayKey(after))).toBe('2026-03-02');
      expect(weekKeyForDay(localDayKey(nextMonday))).toBe('2026-03-09');
      let pet=applyAction(createPet('可可',before),'feed',before);
      pet=applyAction(pet,'feed',after);
      expect(pet.streak.current).toBe(2);
      expect(pet.missions.weekly.find(m=>m.id==='weekly-feed')?.count).toBe(2);
      pet=advancePet(pet,0,nextMonday);
      expect(pet.missions.weeklyKey).toBe('2026-03-09');
      expect(pet.missions.weekly.find(m=>m.id==='weekly-feed')?.count).toBe(0);
    } finally {
      if(oldTz===undefined) delete testProcess.env.TZ; else testProcess.env.TZ=oldTz;
    }
  });

  it('equips unlocked items, rejects locked items, and keeps journal bounded', () => {
    let pet=createPet('可可',monday);
    expect(()=>equipCosmetic(pet,'rug-cream',monday)).toThrow('還沒有解鎖');
    for(let i=0;i<10;i++) pet=applyAction(pet,'feed',monday+i);
    pet=equipCosmetic(pet,'rug-cream',monday+20);
    expect(pet.unlocks.equipped.rug).toBe('rug-cream');
    expect(pet.progress.cosmeticChanges).toBe(1);
    expect(pet.achievements['first-dress']).toBe(monday+20);
    const revision=pet.revision;
    expect(equipCosmetic(pet,'rug-cream',monday+21).revision).toBe(revision);
    for(let i=0;i<105;i++) pet=applyAction(pet,'pet',monday+30+i);
    expect(pet.journal).toHaveLength(100);
    expect(pet.journal.at(-1)?.action).toBe('pet');
    expect(validateSave(pet,monday+200)).toEqual(pet);
  });

  it('caps level at 30 and retains extra bond as memories', () => {
    let pet=createPet('可可',monday);
    pet.progress.level=29;
    pet.progress.xp=799; // Level 29 requires 800 XP.
    pet.progress.bond=899;
    pet.progress.bondLevel=9;
    pet=applyAction(pet,'feed',monday);
    expect(pet.progress).toMatchObject({level:30,xp:0,bond:900,bondLevel:10,bondMemories:6});
    expect(pet.unlocks.unlocked).toHaveLength(COSMETICS.length);
    expect(validateSave(pet,monday)).toEqual(pet);
  });

  it('contains expanded milestones while preserving all published ids', () => {
    expect(ACHIEVEMENTS.length).toBeGreaterThanOrEqual(45);
    const ids=ACHIEVEMENTS.map(item=>item.id);
    expect(new Set(ids).size).toBe(ids.length);
    for(const id of ['feed-first','feed-10','feed-50','pet-10','play-10','active-1h','adopt-1d','adopt-7d','adopt-30d']) expect(ids).toContain(id);
  });

  it('rewards each explored corner only once and unlocks the full-home milestone', () => {
    const original=createPet('可可',monday);
    expect(original.achievements['adopted-name']).toBe(monday);
    let pet=exploreCorner(original,'window',monday+1);
    expect(original.progress.exploredCorners).toEqual([]);
    expect(pet.progress).toMatchObject({xp:10,bond:3,exploredCorners:['window']});
    expect(pet.achievements['corner-window']).toBe(monday+1);
    expect(exploreCorner(pet,'window',monday+2)).toEqual(pet);
    pet=exploreCorner(pet,'plant',monday+3);
    pet=exploreCorner(pet,'bed',monday+4);
    expect(pet.progress).toMatchObject({xp:30,bond:9,exploredCorners:['window','plant','bed']});
    expect(pet.achievements['corner-all']).toBe(monday+4);
    expect(validateSave(pet,monday+4)).toEqual(pet);
    expect(()=>validateSave({...pet,progress:{...pet.progress,exploredCorners:['window','window']}},monday+4)).toThrow('探索');
  });
});
