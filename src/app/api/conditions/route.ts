// src/app/api/conditions/route.ts
import { NextRequest, NextResponse } from "next/server";
import { fetchConditions } from "@/lib/routing/conditions";

// endpoint นี้เปิดสาธารณะ ไม่มี auth และไม่เก็บข้อมูลผู้ใช้
// รับเฉพาะพิกัดตัวเลขที่ clamp แล้ว เพื่อไม่ให้ client กำหนด URL ปลายทางได้เอง
const coord = (v: unknown, min: number, max: number): number | null => {
  const n = Number(v);
  return Number.isFinite(n) && n >= min && n <= max ? Number(n.toFixed(5)) : null;
};

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const oLat = coord(body?.origin?.lat, -90, 90);
    const oLon = coord(body?.origin?.lon, -180, 180);
    const dLat = coord(body?.destination?.lat, -90, 90);
    const dLon = coord(body?.destination?.lon, -180, 180);

    if (oLat == null || oLon == null || dLat == null || dLon == null) {
      return NextResponse.json({ error: "พิกัดไม่ถูกต้อง" }, { status: 400 });
    }

    const rawName = typeof body?.origin?.name === "string" ? body.origin.name : "ต้นทาง";
    const name = rawName.replace(/[\r\n]/g, " ").slice(0, 120);

    const result = await fetchConditions({ lat: oLat, lon: oLon, name }, { lat: dLat, lon: dLon });
    return NextResponse.json(result, {
      headers: { "Cache-Control": "public, max-age=120, s-maxage=120" },
    });
  } catch (error) {
    const details = error instanceof Error ? error.message : "unknown";
    return NextResponse.json({ error: "ดึงข้อมูลสภาพการเดินทางไม่ได้", details }, { status: 500 });
  }
}
