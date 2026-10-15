// src/app/api/conditions/route.ts
// endpoint นี้เปิดสาธารณะ ไม่มี auth และไม่เก็บข้อมูลผู้ใช้
// รับเฉพาะพิกัดตัวเลขที่ clamp แล้ว client กำหนด URL ปลายทางเองไม่ได้
import { NextRequest, NextResponse } from "next/server";
import { fetchConditions } from "@/lib/routing/conditions";
import { clientIp, rateLimit } from "@/lib/routing/rateLimit";
import type { ConditionsResponse } from "@/lib/routing/types";

const coord = (v: unknown, min: number, max: number): number | null => {
  const n = Number(v);
  return Number.isFinite(n) && n >= min && n <= max ? Number(n.toFixed(5)) : null;
};

// แคช 5 นาทีต่อพิกัดที่ปัดแล้ว (~100 ม.) ลดการเรียก TomTom ลงมาก
const CACHE_MS = 5 * 60 * 1000;
const cache = new Map<string, { at: number; data: ConditionsResponse }>();

export async function POST(req: NextRequest) {
  if (!rateLimit(`cond:${clientIp(req)}`, 30, 60_000)) {
    return NextResponse.json({ error: "เรียกถี่เกินไป รอ 1 นาที" }, { status: 429 });
  }

  try {
    const body = await req.json();
    const oLat = coord(body?.origin?.lat, -90, 90);
    const oLon = coord(body?.origin?.lon, -180, 180);
    const dLat = coord(body?.destination?.lat, -90, 90);
    const dLon = coord(body?.destination?.lon, -180, 180);

    if (oLat == null || oLon == null || dLat == null || dLon == null) {
      return NextResponse.json({ error: "พิกัดไม่ถูกต้อง" }, { status: 400 });
    }

    const name = (typeof body?.origin?.name === "string" ? body.origin.name : "ต้นทาง")
      .replace(/[\r\n]/g, " ")
      .slice(0, 120);

    const key = [oLat, oLon, dLat, dLon].map((v) => v.toFixed(3)).join(",");
    const hit = cache.get(key);
    if (hit && Date.now() - hit.at < CACHE_MS) {
      return NextResponse.json({
        ...hit.data,
        weather: { ...hit.data.weather, locationName: name },
      });
    }

    const result = await fetchConditions({ lat: oLat, lon: oLon, name }, { lat: dLat, lon: dLon });
    cache.set(key, { at: Date.now(), data: result });

    if (cache.size > 100) {
      const oldest = cache.keys().next();
      if (!oldest.done) cache.delete(oldest.value);
    }

    return NextResponse.json(result);
  } catch (error) {
    const details = error instanceof Error ? error.message : "unknown";
    return NextResponse.json({ error: "ดึงสภาพการเดินทางไม่ได้", details }, { status: 500 });
  }
}
