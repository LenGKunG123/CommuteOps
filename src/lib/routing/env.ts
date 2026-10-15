// src/lib/env.ts
// ใช้ฝั่งเซิร์ฟเวอร์เท่านั้น ห้าม import จากไฟล์ที่มี "use client"
// ชื่อตัวแปรต้องไม่มี NEXT_PUBLIC_ นำหน้า ไม่งั้น key จะถูกฝังใน bundle ของเบราว์เซอร์
export const env = {
  tomtomKey: process.env.TOMTOM_API_KEY ?? "",
  supabaseUrl: (process.env.SUPABASE_URL ?? "").replace(/\/+$/, ""),
  supabaseAnonKey: process.env.SUPABASE_ANON_KEY ?? "",
};

export const hasTomTom = (): boolean => env.tomtomKey.length > 0;

export const hasSupabase = (): boolean =>
  env.supabaseUrl.length > 0 && env.supabaseAnonKey.length > 0;
