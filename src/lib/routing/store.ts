// src/lib/routing/store.ts
"use client";
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
  logs: (pid: string) => `commuteops:logs:${V}:${pid}`,
  trip: (pid: string) => `commuteops:trip:${V}:${pid}`,
  fares: (pid: string) => `commuteops:fares:${V}:${pid}`,
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
    console.error("localStorage เขียนไม่ได้ (อาจเต็มหรือปิดไว้)", e);
  }
}

// ย้ายข้อมูลจาก key เดิมที่ไม่ได้แยกโปรไฟล์ มาเป็นของ "me" ครั้งเดียว
export function migrateLegacy(): void {
  try {
    for (const [legacy, next] of [
      [LEGACY.logs, K.logs(DEFAULT_PROFILE_ID)],
      [LEGACY.trip, K.trip(DEFAULT_PROFILE_ID)],
      [LEGACY.fares, K.fares(DEFAULT_PROFILE_ID)],
    ] as const) {
      const raw = localStorage.getItem(legacy);
      if (raw && !localStorage.getItem(next)) localStorage.setItem(next, raw);
      if (raw) localStorage.removeItem(legacy);
    }
  } catch (e) {
    console.error("migrate ล้มเหลว", e);
  }
}

// โปรไฟล์ที่ผู้ใช้สร้าง/แก้ ทับ builtin ที่ id เดียวกัน
export function listProfiles(): CommuteProfile[] {
  const user = read<unknown[]>(K.profiles, []);
  const valid: CommuteProfile[] = [];
  for (const raw of user) {
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

// ลบ: ถ้าเป็น builtin จะกลับไปใช้ค่าตั้งต้น ถ้าเป็นของผู้ใช้จะหายไปเลย
export function deleteProfile(id: string): void {
  write(K.profiles, read<CommuteProfile[]>(K.profiles, []).filter((p) => p?.id !== id));
  if (!isBuiltin(id)) {
    try {
      localStorage.removeItem(K.logs(id));
      localStorage.removeItem(K.trip(id));
      localStorage.removeItem(K.fares(id));
    } catch { /* ignore */ }
  }
}

export function getActiveProfileId(): string {
  const id = read<string>(K.active, DEFAULT_PROFILE_ID);
  return listProfiles().some((p) => p.id === id) ? id : DEFAULT_PROFILE_ID;
}
export function setActiveProfileId(id: string): void {
  write(K.active, id);
}

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
  else {
    try { localStorage.removeItem(K.trip(pid)); } catch { /* ignore */ }
  }
}
export function loadFares(profile: CommuteProfile): FareSettings {
  return normalizeFareSettings(profile, read<Partial<FareSettings> | null>(K.fares(profile.id), null));
}
export function saveFares(pid: string, settings: FareSettings): void {
  write(K.fares(pid), settings);
}

// ================= export / import เพื่อแชร์ให้เพื่อน =================
export type Bundle = {
  kind: "commuteops.profile";
  version: 2;
  exportedAt: string;
  profile: CommuteProfile;
  fareSettings?: FareSettings;
  logs?: CommuteLog[];
};

export function exportBundle(profile: CommuteProfile, opts: { includeFares: boolean; includeLogs: boolean }): string {
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

export type ImportResult = { ok: true; profileId: string; warnings: string[] } | { ok: false; errors: string[] };

export function importBundle(json: string): ImportResult {
  let parsed: unknown;
  try {
    parsed = JSON.parse(json);
  } catch {
    return { ok: false, errors: ["JSON ไม่ถูกต้อง อ่านไม่ได้"] };
  }
  const b = parsed as Partial<Bundle>;
  const raw = b?.kind === "commuteops.profile" ? b.profile : parsed; // รับทั้ง bundle และ profile เปล่า
  const result = validateProfile(raw);
  if (!result.ok) return { ok: false, errors: result.errors };

  const warnings: string[] = [];
  let profile = result.profile;
  if (isBuiltin(profile.id) && !isCustomized(profile.id)) {
    warnings.push(`ทับโปรไฟล์ตั้งต้น "${profile.id}" ถ้าต้องการเก็บของเดิมไว้ ให้แก้ id ใน JSON ก่อน import`);
  }
  if (listProfiles().length >= 20) return { ok: false, errors: ["โปรไฟล์เต็ม 20 รายการแล้ว ลบบางอันก่อน"] };

  upsertProfile(profile);
  if (b?.fareSettings) saveFares(profile.id, normalizeFareSettings(profile, b.fareSettings));
  if (Array.isArray(b?.logs)) {
    saveLogs(profile.id, b.logs.filter((l) => l && typeof l.actualMinutes === "number"));
    warnings.push(`นำเข้า log ${b.logs.length} รายการมาด้วย`);
  }
  return { ok: true, profileId: profile.id, warnings };
}
