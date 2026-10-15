// src/app/api/stops/route.ts
// ค้นป้ายรถเมล์และสายที่ให้บริการ จาก OpenStreetMap ผ่าน Overpass API (ฟรี ไม่ต้องมี key)
// ข้อจำกัด: ข้อมูลรถเมล์กรุงเทพฯ ใน OSM ไม่ครบและอาจเก่า ต้องยืนยันกับ ViaBus เสมอ
import { NextRequest, NextResponse } from "next/server";
import { clientIp, rateLimit } from "@/lib/routing/rateLimit";
import type { NearbyRoute, NearbyStop, StopsResponse } from "@/lib/routing/types";

const OVERPASS_URL = "https://overpass-api.de/api/interpreter";

const clamp = (v: unknown, min: number, max: number): number | null => {
  const n = Number(v);
  return Number.isFinite(n) && n >= min && n <= max ? n : null;
};

function distanceM(aLat: number, aLon: number, bLat: number, bLon: number): number {
  const R = 6371000;
  const dLat = ((bLat - aLat) * Math.PI) / 180;
  const dLon = ((bLon - aLon) * Math.PI) / 180;
  const la1 = (aLat * Math.PI) / 180;
  const la2 = (bLat * Math.PI) / 180;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(la1) * Math.cos(la2) * Math.sin(dLon / 2) ** 2;
  return Math.round(2 * R * Math.asin(Math.sqrt(h)));
}

export async function POST(req: NextRequest) {
  if (!rateLimit(`stops:${clientIp(req)}`, 10, 60_000)) {
    return NextResponse.json({ error: "เรียกถี่เกินไป รอ 1 นาที" }, { status: 429 });
  }

  try {
    const body = await req.json();
    const lat = clamp(body?.lat, -90, 90);
    const lon = clamp(body?.lon, -180, 180);
    const radius = clamp(body?.radius ?? 500, 50, 2000);

    if (lat == null || lon == null || radius == null) {
      return NextResponse.json({ error: "พิกัดไม่ถูกต้อง" }, { status: 400 });
    }

    // ตัวเลขทั้งหมด clamp แล้ว จึงไม่มีทางแทรกคำสั่ง Overpass เข้ามาได้
    const lt = lat.toFixed(5);
    const ln = lon.toFixed(5);
    const r = Math.round(radius);
    const query =
      `[out:json][timeout:25];` +
      `node(around:${r},${lt},${ln})[highway=bus_stop]->.s;` +
      `.s out body;` +
      `rel(bn.s)[type=route][route~"^(bus|minibus|share_taxi)$"]->.r;` +
      `.r out tags;`;

    const res = await fetch(OVERPASS_URL, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ data: query }).toString(),
      cache: "no-store",
    });

    if (!res.ok) {
      return NextResponse.json(
        { error: `Overpass ตอบ ${res.status} (บริการฟรี อาจคิวเต็ม ลองอีกครั้งใน 1 นาที)` },
        { status: 502 }
      );
    }

    const data = await res.json();
    const elements: unknown[] = Array.isArray(data?.elements) ? data.elements : [];

    const stops: NearbyStop[] = [];
    const routeMap = new Map<string, NearbyRoute>();

    for (const raw of elements) {
      const el = raw as Record<string, unknown>;
      const tags = (el.tags ?? {}) as Record<string, string>;

      if (el.type === "node") {
        const nLat = Number(el.lat);
        const nLon = Number(el.lon);
        if (!Number.isFinite(nLat) || !Number.isFinite(nLon)) continue;
        stops.push({
          id: Number(el.id),
          name: tags.name ?? tags["name:th"] ?? "ป้ายไม่มีชื่อใน OSM",
          lat: nLat,
          lon: nLon,
          distanceM: distanceM(lat, lon, nLat, nLon),
        });
      } else if (el.type === "relation") {
        const ref = tags.ref ?? "";
        const name = tags.name ?? tags["name:th"] ?? "";
        const key = `${ref}|${name}`;
        if (!routeMap.has(key)) {
          routeMap.set(key, {
            ref: ref || "ไม่ระบุเลขสาย",
            name: name || "ไม่ระบุชื่อ",
            ...(tags.from ? { from: tags.from } : {}),
            ...(tags.to ? { to: tags.to } : {}),
            ...(tags.operator ? { operator: tags.operator } : {}),
          });
        }
      }
    }

    stops.sort((a, b) => a.distanceM - b.distanceM);
    const routes = Array.from(routeMap.values()).sort((a, b) =>
      a.ref.localeCompare(b.ref, "th", { numeric: true })
    );

    const payload: StopsResponse = {
      stops: stops.slice(0, 25),
      routes: routes.slice(0, 60),
      note:
        "ข้อมูลจาก OpenStreetMap ซึ่งอาสาสมัครกรอก ข้อมูลรถเมล์กรุงเทพฯ ไม่ครบและอาจเก่า " +
        "ใช้เป็นตัวตั้งต้นแล้วยืนยันกับ ViaBus ก่อนใช้จริง",
    };

    // Overpass เป็นบริการฟรีที่ขอให้ใช้แบบเบา แคช 1 ชั่วโมงเพราะป้ายรถไม่ย้ายบ่อย
    return NextResponse.json(payload, {
      headers: { "Cache-Control": "public, max-age=3600, s-maxage=3600" },
    });
  } catch (error) {
    const details = error instanceof Error ? error.message : "unknown";
    return NextResponse.json({ error: "ค้นหาป้ายไม่สำเร็จ", details }, { status: 500 });
  }
}
