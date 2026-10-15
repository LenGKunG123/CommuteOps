"use client";
// src/lib/routing/sync.ts
// ซิงก์แบบ offline-first: localStorage เป็นหลัก คลาวด์เป็นสำเนา
// log รวมด้วย id (เคารพรายการที่ลบแล้ว) · โปรไฟล์/ค่าโดยสารใช้ last-write-wins
import { validateProfile, type CommuteProfile } from "./catalog";
import type { FareSettings } from "./fares";
import type { CommuteLog } from "./types";
import * as store from "./store";

type RemoteItem = {
  kind: string;
  itemId: string;
  payload: unknown;
  deleted: boolean;
  updatedAt: string;
};

export type SyncResult = {
  pushed: number;
  logsAdded: number;
  profilesUpdated: number;
  faresUpdated: number;
  warnings: string[];
};

export async function syncAll(profiles: CommuteProfile[]): Promise<SyncResult> {
  const syncKey = store.getSyncKey();
  const push: { kind: string; itemId: string; payload: unknown; deleted?: boolean }[] = [];

  // รวบรวมของในเครื่องที่จะส่งขึ้น
  for (const p of profiles) {
    if (store.isCustomized(p.id) || !store.isBuiltin(p.id)) {
      push.push({ kind: "profile", itemId: p.id, payload: p });
    }
    const at = store.faresUpdatedAt(p.id);
    if (at > 0) {
      push.push({ kind: "fares", itemId: p.id, payload: { settings: store.loadFares(p), at } });
    }
    for (const log of store.loadLogs(p.id)) {
      push.push({ kind: "log", itemId: `${p.id}::${log.id}`, payload: log });
    }
    for (const dead of store.loadTombstones(p.id)) {
      push.push({ kind: "log", itemId: `${p.id}::${dead}`, payload: null, deleted: true });
    }
  }

  const res = await fetch("/api/sync", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ syncKey, push: push.slice(0, 400) }),
  });

  const json = await res.json();
  if (!res.ok) throw new Error(String(json?.error ?? `HTTP ${res.status}`));

  const items: RemoteItem[] = Array.isArray(json?.items) ? json.items : [];
  const warnings: string[] = [];
  let logsAdded = 0;
  let profilesUpdated = 0;
  let faresUpdated = 0;

  // โปรไฟล์: เอาของคลาวด์มาใช้ถ้า validate ผ่าน
  for (const it of items) {
    if (it.kind !== "profile" || it.deleted) continue;
    const r = validateProfile(it.payload);
    if (!r.ok) {
      warnings.push(`ข้ามโปรไฟล์ ${it.itemId} จากคลาวด์: ${r.errors[0] ?? "ข้อมูลไม่ถูกต้อง"}`);
      continue;
    }
    store.upsertProfile(r.profile);
    profilesUpdated++;
  }

  // ค่าโดยสาร: ใครใหม่กว่าชนะ
  for (const it of items) {
    if (it.kind !== "fares" || it.deleted) continue;
    const p = it.payload as { settings?: FareSettings; at?: number } | null;
    const remoteAt = Number(p?.at ?? 0);
    if (!p?.settings || !Number.isFinite(remoteAt)) continue;
    if (remoteAt > store.faresUpdatedAt(it.itemId)) {
      const target = store.listProfiles().find((x) => x.id === it.itemId);
      if (target) {
        store.saveFares(target.id, p.settings);
        faresUpdated++;
      }
    }
  }

  // log: รวมด้วย id ข้ามรายการที่ฝั่งใดฝั่งหนึ่งลบแล้ว
  const byProfile = new Map<string, CommuteLog[]>();
  const deletedKeys = new Set<string>();

  for (const it of items) {
    if (it.kind !== "log") continue;
    const parts = it.itemId.split("::");
    const pid = parts[0];
    const logId = parts[1];
    if (!pid || !logId) continue;

    if (it.deleted) {
      deletedKeys.add(it.itemId);
      store.addTombstone(pid, logId);
      continue;
    }

    const log = it.payload as CommuteLog | null;
    if (!log || typeof log.actualMinutes !== "number") continue;
    const arr = byProfile.get(pid);
    if (arr) arr.push(log);
    else byProfile.set(pid, [log]);
  }

  for (const [pid, remoteLogs] of byProfile) {
    const dead = new Set(store.loadTombstones(pid));
    const local = store.loadLogs(pid);
    const seen = new Set(local.map((l) => l.id));
    const merged = [...local];

    for (const log of remoteLogs) {
      if (seen.has(log.id) || dead.has(log.id) || deletedKeys.has(`${pid}::${log.id}`)) continue;
      merged.push(log);
      seen.add(log.id);
      logsAdded++;
    }

    merged.sort((a, b) => b.endedAtIso.localeCompare(a.endedAtIso));
    store.saveLogs(pid, merged);
  }

  return {
    pushed: Number(json?.pushed ?? 0),
    logsAdded,
    profilesUpdated,
    faresUpdated,
    warnings,
  };
}
