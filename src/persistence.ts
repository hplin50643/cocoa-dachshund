import { validateSave, type PetSaveV1 } from './core';

export const STORAGE_KEY = 'cocoa-dachshund:save:v1';
const MAX_IMPORT_BYTES = 1024 * 1024;

/** Optional storage injection keeps browser storage failures independently testable. */
export type PetStorage = Pick<Storage, 'getItem' | 'setItem'>;

function storageOrDefault(storage?: PetStorage): PetStorage {
  const result = storage ?? globalThis.localStorage;
  if (!result) throw new Error('這個環境無法使用本機儲存。');
  return result;
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : '發生無法辨識的錯誤。';
}

export function serializePet(pet: PetSaveV1): string {
  return JSON.stringify(validateSave(pet, Date.now(), { allowFutureDates: true }), null, 2);
}

function parseSaveText(text: string, allowFutureDates: boolean): PetSaveV1 {
  if (typeof text !== 'string' || !text.trim()) throw new Error('備份檔是空的，請選擇本遊戲匯出的 JSON 檔案。');
  if (text.length > MAX_IMPORT_BYTES || new TextEncoder().encode(text).byteLength > MAX_IMPORT_BYTES) {
    throw new Error('備份檔超過 1 MiB，請選擇本遊戲匯出的 JSON 檔案。');
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new Error('無法讀取 JSON，備份檔可能已損壞。原有紀錄不會被覆蓋。');
  }
  return validateSave(parsed, Date.now(), { allowFutureDates });
}

export function parseImport(text: string): PetSaveV1 {
  return parseSaveText(text, false);
}

export function loadSave(storage?: PetStorage): { pet: PetSaveV1 | null; error: string | null; raw: string | null } {
  let raw: string | null = null;
  try {
    raw = storageOrDefault(storage).getItem(STORAGE_KEY);
    if (raw === null) return { pet: null, error: null, raw: null };
    return { pet: parseSaveText(raw, true), error: null, raw };
  } catch (error) {
    const prefix = raw === null ? '無法讀取本機紀錄，請檢查瀏覽器的網站儲存設定。' : '本機存檔無法載入，原始資料已保留。';
    return { pet: null, error: `${prefix} ${errorMessage(error)}`, raw };
  }
}

export function savePet(pet: PetSaveV1, storage?: PetStorage): { ok: boolean; error: string | null } {
  let serialized: string;
  try {
    serialized = serializePet(pet);
  } catch (error) {
    return { ok: false, error: `紀錄未儲存：${errorMessage(error)}` };
  }
  try {
    storageOrDefault(storage).setItem(STORAGE_KEY, serialized);
    return { ok: true, error: null };
  } catch {
    return { ok: false, error: '紀錄尚未儲存：瀏覽器可能禁止儲存或空間不足。請先在設定匯出備份，再檢查網站儲存設定。' };
  }
}
