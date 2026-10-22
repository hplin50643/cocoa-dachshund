export type CareAction = 'feed' | 'pet' | 'play' | 'water' | 'sleep';

export interface PetSaveV1 {
  schemaVersion: 1;
  id: string;
  name: string;
  adoptedAt: number;
  savedAt: number;
  revision: number;
  activeMs: number;
  needs: { satiety: number; mood: number; hydration: number; energy: number };
  counts: Record<CareAction, number>;
  achievements: Record<string, number>;
  settings: { reducedMotion: boolean };
}

const MINUTE = 60_000;
const DAY = 86_400_000;
const FUTURE_TOLERANCE_MS = 5 * MINUTE;
const MAX_TIMESTAMP = 8_640_000_000_000_000;
const MAX_ACTIVE_MS = 100 * 365.25 * DAY;
const ACTIONS: readonly CareAction[] = ['feed', 'pet', 'play', 'water', 'sleep'];
const NEED_KEYS = ['satiety', 'mood', 'hydration', 'energy'] as const;

export interface Achievement {
  id: string;
  title: string;
  description: string;
  target: number;
  progress: (pet: PetSaveV1, now: number) => number;
}

export const ACHIEVEMENTS: readonly Achievement[] = [
  { id: 'feed-first', title: '第一口幸福', description: '完成第一次餵飯', target: 1, progress: (pet) => pet.counts.feed },
  { id: 'feed-10', title: '專屬小廚師', description: '累積餵飯 10 次', target: 10, progress: (pet) => pet.counts.feed },
  { id: 'feed-50', title: '幸福滿滿', description: '累積餵飯 50 次', target: 50, progress: (pet) => pet.counts.feed },
  { id: 'pet-10', title: '摸摸好朋友', description: '累積摸摸 10 次', target: 10, progress: (pet) => pet.counts.pet },
  { id: 'play-10', title: '最佳玩伴', description: '累積玩球 10 次', target: 10, progress: (pet) => pet.counts.play },
  { id: 'active-1h', title: '一小時的陪伴', description: '累積在頁面中陪伴 60 分鐘', target: 60, progress: (pet) => pet.activeMs / MINUTE },
  { id: 'adopt-1d', title: '一起的第一天', description: '相伴滿 1 天', target: 1, progress: (pet, now) => Math.max(0, now - pet.adoptedAt) / DAY },
  { id: 'adopt-7d', title: '一週的小日常', description: '相伴滿 7 天', target: 7, progress: (pet, now) => Math.max(0, now - pet.adoptedAt) / DAY },
  { id: 'adopt-30d', title: '滿月的約定', description: '相伴滿 30 天', target: 30, progress: (pet, now) => Math.max(0, now - pet.adoptedAt) / DAY },
];

function clampNeed(value: number): number {
  return Math.min(100, Math.max(0, value));
}

function checkedTime(now: number): number {
  if (!Number.isFinite(now) || now < 0 || now > MAX_TIMESTAMP) {
    throw new Error('時間資料無效，請確認裝置日期與時間。');
  }
  return now;
}

function normalizedName(value: unknown): string {
  if (typeof value !== 'string') throw new Error('請輸入狗狗的名字。');
  const name = value.trim().normalize('NFC');
  if (/[\u0000-\u001f\u007f]/u.test(name)) throw new Error('名字不能含有換行或控制字元。');
  const length = Array.from(new Intl.Segmenter('zh-Hant', { granularity: 'grapheme' }).segment(name)).length;
  if (length < 1 || length > 16) throw new Error('狗狗的名字需要 1～16 個字。');
  return name;
}

function copyPet(pet: PetSaveV1): PetSaveV1 {
  return {
    ...pet,
    needs: { ...pet.needs },
    counts: { ...pet.counts },
    achievements: { ...pet.achievements },
    settings: { ...pet.settings },
  };
}

function unlockAchievements(pet: PetSaveV1, now: number): boolean {
  let changed = false;
  for (const achievement of ACHIEVEMENTS) {
    if (!Object.hasOwn(pet.achievements, achievement.id) && achievement.progress(pet, now) >= achievement.target) {
      pet.achievements[achievement.id] = Math.max(pet.adoptedAt, pet.savedAt, now);
      changed = true;
    }
  }
  return changed;
}

function markChanged(pet: PetSaveV1, now: number): PetSaveV1 {
  if (pet.revision >= Number.MAX_SAFE_INTEGER) throw new Error('存檔更新次數已超出可用範圍，請先匯出備份。');
  pet.revision += 1;
  pet.savedAt = Math.max(pet.savedAt, now);
  return pet;
}

export function createPet(name: string, now = Date.now()): PetSaveV1 {
  checkedTime(now);
  return {
    schemaVersion: 1,
    id: globalThis.crypto?.randomUUID?.() ?? `pet-${now.toString(36)}-${Math.random().toString(36).slice(2, 12)}`,
    name: normalizedName(name),
    adoptedAt: now,
    savedAt: now,
    revision: 0,
    activeMs: 0,
    needs: { satiety: 85, mood: 90, hydration: 85, energy: 85 },
    counts: { feed: 0, pet: 0, play: 0, water: 0, sleep: 0 },
    achievements: {},
    settings: { reducedMotion: false },
  };
}

/** Only pass elapsed foreground time. Offline time never reduces the pet's needs. */
export function advancePet(pet: PetSaveV1, activeMs: number, now: number, sleeping = false): PetSaveV1 {
  checkedTime(now);
  const next = copyPet(pet);
  const elapsed = Number.isFinite(activeMs) ? Math.min(MAX_ACTIVE_MS, Math.max(0, activeMs)) : 0;
  if (elapsed > 0) {
    const minutes = elapsed / MINUTE;
    const restingFactor = sleeping ? 0.5 : 1;
    next.activeMs = Math.min(MAX_ACTIVE_MS, next.activeMs + elapsed);
    next.needs.satiety = clampNeed(next.needs.satiety - 0.6 * minutes * restingFactor);
    next.needs.mood = clampNeed(next.needs.mood - 0.4 * minutes * restingFactor);
    next.needs.hydration = clampNeed(next.needs.hydration - 0.8 * minutes * restingFactor);
    next.needs.energy = clampNeed(next.needs.energy + (sleeping ? 1.5 * elapsed / 1000 : -0.5 * minutes));
  }
  const unlocked = unlockAchievements(next, now);
  const changed = unlocked || next.activeMs !== pet.activeMs || NEED_KEYS.some((key) => next.needs[key] !== pet.needs[key]);
  return changed ? markChanged(next, now) : next;
}

/** Call once when an accepted interaction finishes; animation/click gating belongs to the UI. */
export function applyAction(pet: PetSaveV1, action: CareAction, now: number): PetSaveV1 {
  checkedTime(now);
  if (!ACTIONS.includes(action)) throw new Error('這個互動方式無法辨識。');
  const next = copyPet(pet);
  if (next.counts[action] >= Number.MAX_SAFE_INTEGER) throw new Error('互動次數已超出可用範圍，請先匯出備份。');
  next.counts[action] += 1;
  switch (action) {
    case 'feed':
      next.needs.satiety += 25;
      next.needs.mood += 3;
      break;
    case 'water':
      next.needs.hydration += 30;
      next.needs.mood += 2;
      break;
    case 'pet':
      next.needs.mood += 12;
      break;
    case 'play':
      next.needs.mood += 20;
      next.needs.energy -= 8;
      next.needs.satiety -= 3;
      next.needs.hydration -= 4;
      break;
    case 'sleep':
      break;
  }
  for (const key of NEED_KEYS) next.needs[key] = clampNeed(next.needs[key]);
  unlockAchievements(next, now);
  return markChanged(next, now);
}

export function renamePet(pet: PetSaveV1, name: string, now: number): PetSaveV1 {
  checkedTime(now);
  const next = copyPet(pet);
  next.name = normalizedName(name);
  const unlocked = unlockAchievements(next, now);
  return next.name !== pet.name || unlocked ? markChanged(next, now) : next;
}

function record(value: unknown, label: string): Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) throw new Error(`${label}的格式不正確。`);
  return value as Record<string, unknown>;
}

function field(object: Record<string, unknown>, key: string, label: string): unknown {
  if (!Object.hasOwn(object, key)) throw new Error(`存檔缺少${label}。`);
  return object[key];
}

function boundedNumber(value: unknown, label: string, min: number, max: number, integer = false): number {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < min || value > max || (integer && !Number.isSafeInteger(value))) {
    throw new Error(`${label}的數值無效，請選擇完整且未損壞的備份檔。`);
  }
  return value;
}

/** Validate every retained field and rebuild a clean object; never merge imported objects into live state. */
export function validateSave(value: unknown, now = Date.now(), options: { allowFutureDates?: boolean } = {}): PetSaveV1 {
  checkedTime(now);
  // Local history remains valid after a device clock correction. External imports use the tighter default.
  const maximumDate = options.allowFutureDates ? MAX_TIMESTAMP : Math.min(MAX_TIMESTAMP, now + FUTURE_TOLERANCE_MS);
  const source = record(value, '存檔');
  if (source.schemaVersion !== 1) throw new Error('不支援這個存檔版本，請使用本遊戲匯出的第 1 版備份。');
  const id = field(source, 'id', '寵物識別碼');
  if (typeof id !== 'string' || !/^[a-zA-Z0-9][a-zA-Z0-9_-]{0,79}$/u.test(id)) throw new Error('寵物識別碼無效，請選擇本遊戲匯出的備份。');
  const name = normalizedName(field(source, 'name', '名字'));
  const adoptedAt = boundedNumber(field(source, 'adoptedAt', '領養時間'), '領養時間', 0, maximumDate);
  const savedAt = boundedNumber(field(source, 'savedAt', '儲存時間'), '儲存時間', adoptedAt, maximumDate);
  const revision = boundedNumber(field(source, 'revision', '更新次數'), '更新次數', 0, Number.MAX_SAFE_INTEGER, true);
  const activeMs = boundedNumber(field(source, 'activeMs', '陪伴時間'), '陪伴時間', 0, MAX_ACTIVE_MS);
  const sourceNeeds = record(field(source, 'needs', '狀態'), '寵物狀態');
  const needs = {} as PetSaveV1['needs'];
  for (const key of NEED_KEYS) needs[key] = boundedNumber(field(sourceNeeds, key, '狀態資料'), '寵物狀態', 0, 100);
  const sourceCounts = record(field(source, 'counts', '互動次數'), '互動次數');
  const counts = {} as Record<CareAction, number>;
  for (const key of ACTIONS) counts[key] = boundedNumber(field(sourceCounts, key, '互動次數'), '互動次數', 0, Number.MAX_SAFE_INTEGER, true);
  const sourceAchievements = record(field(source, 'achievements', '成就'), '成就');
  const achievements: Record<string, number> = {};
  for (const [key, timestamp] of Object.entries(sourceAchievements)) {
    if (!ACHIEVEMENTS.some((achievement) => achievement.id === key)) throw new Error('存檔含有無法辨識的成就，請確認備份版本。');
    achievements[key] = boundedNumber(timestamp, '成就解鎖時間', adoptedAt, maximumDate);
  }
  const sourceSettings = record(field(source, 'settings', '設定'), '設定');
  const reducedMotion = field(sourceSettings, 'reducedMotion', '動畫設定');
  if (typeof reducedMotion !== 'boolean') throw new Error('動畫設定的格式不正確。');
  return { schemaVersion: 1, id, name, adoptedAt, savedAt, revision, activeMs, needs, counts, achievements, settings: { reducedMotion } };
}
