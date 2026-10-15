// src/lib/rateLimit.ts
// จำกัดจำนวนเรียกต่อ IP กันคนอื่นใช้โควตา API key ของเรา
// ข้อจำกัด: เก็บใน memory ของแต่ละ instance ถ้า deploy หลาย instance หรือ cold start จะรีเซ็ต
// ป้องกันการยิงถล่มแบบหยาบได้ แต่ไม่ใช่ของจริงจัง
const hits = new Map<string, number[]>();

export function rateLimit(key: string, limit: number, windowMs: number): boolean {
  const now = Date.now();
  const arr = (hits.get(key) ?? []).filter((t) => now - t < windowMs);

  if (arr.length >= limit) {
    hits.set(key, arr);
    return false;
  }

  arr.push(now);
  hits.set(key, arr);

  // กัน memory บวมเมื่อมี IP เยอะ
  if (hits.size > 500) {
    for (const [k, v] of hits) {
      if (v.every((t) => now - t >= windowMs)) hits.delete(k);
    }
  }
  return true;
}

export function clientIp(req: Request): string {
  const fwd = req.headers.get("x-forwarded-for");
  const first = fwd?.split(",")[0]?.trim();
  return first || req.headers.get("x-real-ip") || "unknown";
}
