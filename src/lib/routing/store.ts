"use client";
// src/lib/routing/store.ts
// localStorage แยกตามโปรไฟล์ + export/import + กุญแจซิงก์
import {
  BUILTIN_PROFILES, DEFAULT_PROFILE_ID, normalizeFareSettings, validateProfile,
  type CommuteProfile,
} from "./catalog";
import type { FareSettings } from "./fares";
import type { ActiveTrip, CommuteLog } from "./types";

const V = "v2";

const K = {
  profiles: `commuteops:profiles:${V}`,
  active: `commuteops:activeProfile:${V}`,
  syncKey: `commuteops:syncKey:${V}`,
  logs: (pid: string) => `commuteops:logs:${V}:${pid}`,
  trip: (pid: string) => `commuteops:trip:${V}:${pid}`,
  fares: (pid: string) => `commuteops:fares:${V}:${pid}`,
  faresAt: (pid: string) => `commuteops:faresAt:${V}:${pid}`,
  tomb: (pid: string) => `commuteops:tombstones:${V}:${pid}`,
};

const LEGACY = {
  logs: "commuteops_trip_logs_v1",
  trip: "commuteops_active_trip_v1",
  fares: "commuteops_fare_settings_v1",
};

function read<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

function write(key: string, value: unknown): void {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch (e) {
    console.error("localStorage เขียนไม่ได้ (อาจเต็มหรือถูกปิด)", e);
  }
}

function remove(key: string): void {
  try {
    localStorage.removeItem(key);
  } catch {
    /* ignore */
  }
}

// ย้ายข้อมูลจาก key เดิมที่ไม่ได้แยกโปรไฟล์ มาเป็นของ "me" ครั้งเดียว
export function migrateLegacy(): void {
  try {
    const pairs: [string, string][] = [
      [LEGACY.logs, K.logs(DEFAULT_PROFILE_ID)],
      [LEGACY.trip, K.trip(DEFAULT_PROFILE_ID)],
      [LEGACY.fares, K.fares(DEFAULT_PROFILE_ID)],
    ];
    for (const [legacy, next] of pairs) {
      const raw = localStorage.getItem(legacy);
      if (!raw) continue;
      if (!localStorage.getItem(next)) localStorage.setItem(next, raw);
      localStorage.removeItem(legacy);
    }
  } catch (e) {
    console.error("migrate ล้มเหลว", e);
  }
}

// ================= โปรไฟล์ =================
// โปรไฟล์ที่ผู้ใช้สร้าง/แก้ ทับ builtin ที่ id เดียวกัน
export function listProfiles(): CommuteProfile[] {
  const user = read<unknown[]>(K.profiles, []);
  const valid: CommuteProfile[] = [];
  for (const raw of Array.isArray(user) ? user : []) {
    const r = validateProfile(raw);
    if (r.ok) valid.push(r.profile);
    else console.warn("ข้ามโปรไฟล์ที่ข้อมูลไม่ถูกต้อง", r.errors);
  }
  const byId = new Map<string, CommuteProfile>();
  for (const p of BUILTIN_PROFILES) byId.set(p.id, p);
  for (const p of valid) byId.set(p.id, p);
  return Array.from(byId.values());
}

export function isBuiltin(id: string): boolean {
  return BUILTIN_PROFILES.some((p) => p.id === id);
}

export function isCustomized(id: string): boolean {
  return read<CommuteProfile[]>(K.profiles, []).some((p) => p?.id === id);
}

export function upsertProfile(profile: CommuteProfile): void {
  const user = read<CommuteProfile[]>(K.profiles, []).filter((p) => p?.id !== profile.id);
  write(K.profiles, [...user, profile].slice(0, 20));
}

// ลบ: builtin จะกลับไปใช้ค่าตั้งต้น · ของผู้ใช้จะหายไปพร้อม log
export function deleteProfile(id: string): void {
  write(K.profiles, read<CommuteProfile[]>(K.profiles, []).filter((p) => p?.id !== id));
  if (!isBuiltin(id)) {
    remove(K.logs(id));
    remove(K.trip(id));
    remove(K.fares(id));
    remove(K.faresAt(id));
    remove(K.tomb(id));
  }
}

export function getActiveProfileId(): string {
  const id = read<string>(K.active, DEFAULT_PROFILE_ID);
  return listProfiles().some((p) => p.id === id) ? id : DEFAULT_PROFILE_ID;
}

export function setActiveProfileId(id: string): void {
  write(K.active, id);
}

// ================= log / trip / fares =================
export function loadLogs(pid: string): CommuteLog[] {
  const raw = read<CommuteLog[]>(K.logs(pid), []);
  return Array.isArray(raw) ? raw.filter((l) => l && typeof l.actualMinutes === "number") : [];
}

export function saveLogs(pid: string, logs: CommuteLog[]): void {
  write(K.logs(pid), logs.slice(0, 200));
}

export function loadTrip(pid: string): ActiveTrip | null {
  return read<ActiveTrip | null>(K.trip(pid), null);
}

export function saveTrip(pid: string, trip: ActiveTrip | null): void {
  if (trip) write(K.trip(pid), trip);
  else remove(K.trip(pid));
}

export function loadFares(profile: CommuteProfile): FareSettings {
  return normalizeFareSettings(profile, read<Partial<FareSettings> | null>(K.fares(profile.id), null));
}

export function saveFares(pid: string, settings: FareSettings): void {
  write(K.fares(pid), settings);
  write(K.faresAt(pid), Date.now());
}

export function faresUpdatedAt(pid: string): number {
  const v = read<number>(K.faresAt(pid), 0);
  return Number.isFinite(v) ? v : 0;
}

// ================= กุญแจซิงก์ และ tombstone =================
function randomUuid(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  const hex = "0123456789abcdef";
  let s = "";
  for (let i = 0; i < 36; i++) {
    if (i === 8 || i === 13 || i === 18 || i === 23) s += "-";
    else if (i === 14) s += "4";
    else s += hex[Math.floor(Math.random() * 16)] ?? "0";
  }
  return s;
}

// UUID สุ่มที่ใช้เป็นกุญแจเข้าถึงข้อมูลของเราบนคลาวด์ ถือเป็นความลับ
export function getSyncKey(): string {
  let key = read<string>(K.syncKey, "");
  if (!key || typeof key !== "string") {
    key = randomUuid();
    write(K.syncKey, key);
  }
  return key;
}

export function setSyncKey(key: string): void {
  write(K.syncKey, key);
}

// จำ id ของ log ที่ลบไปแล้ว เพื่อไม่ให้ซิงก์ดึงกลับมา
export function loadTombstones(pid: string): string[] {
  const v = read<string[]>(K.tomb(pid), []);
  return Array.isArray(v) ? v.filter((x) => typeof x === "string") : [];
}

export function addTombstone(pid: string, logId: string): void {
  const next = Array.from(new Set([...loadTombstones(pid), logId])).slice(-300);
  write(K.tomb(pid), next);
}

// ================= export / import =================
export type Bundle = {
  kind: "commuteops.profile";
  version: 2;
  exportedAt: string;
  profile: CommuteProfile;
  fareSettings?: FareSettings;
  logs?: CommuteLog[];
};

export function exportBundle(
  profile: CommuteProfile,
  opts: { includeFares: boolean; includeLogs: boolean }
): string {
  const bundle: Bundle = {
    kind: "commuteops.profile",
    version: 2,
    exportedAt: new Date().toISOString(),
    profile,
    ...(opts.includeFares ? { fareSettings: loadFares(profile) } : {}),
    ...(opts.includeLogs ? { logs: loadLogs(profile.id) } : {}),
  };
  return JSON.stringify(bundle, null, 2);
}

export type ImportResult =
  | { ok: true; profileId: string; warnings: string[] }
  | { ok: false; errors: string[] };

export function importBundle(json: string): ImportResult {
  let parsed: unknown;
  try {
    parsed = JSON.parse(json);
  } catch {
    return { ok: false, errors: ["JSON ไม่ถูกต้อง อ่านไม่ได้"] };
  }

  const b = parsed as Partial<Bundle>;
  const raw = b?.kind === "commuteops.profile" ? b.profile : parsed;   // รับทั้ง bundle และ profile เปล่า
  const result = validateProfile(raw);
  if (!result.ok) return { ok: false, errors: result.errors };

  const profile = result.profile;
  const warnings: string[] = [];

  if (isBuiltin(profile.id) && !isCustomized(profile.id)) {
    warnings.push(`ทับโปรไฟล์ตั้งต้น "${profile.id}" ถ้าอยากเก็บของเดิม ให้แก้ id ใน JSON ก่อน import`);
  }
  if (listProfiles().length >= 20 && !listProfiles().some((p) => p.id === profile.id)) {
    return { ok: false, errors: ["โปรไฟล์เต็ม 20 รายการแล้ว ลบบางอันก่อน"] };
  }

  upsertProfile(profile);
  if (b?.fareSettings) saveFares(profile.id, normalizeFareSettings(profile, b.fareSettings));
  if (Array.isArray(b?.logs)) {
    const logs = b.logs.filter((l) => l && typeof l.actualMinutes === "number");
    saveLogs(profile.id, logs);
    warnings.push(`นำเข้า log ${logs.length} รายการมาด้วย`);
  }

  return { ok: true, profileId: profile.id, warnings };
}
