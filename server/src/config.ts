import { z } from 'zod'
export const config = z.object({
  PORT: z.coerce.number().default(4000),
  DATABASE_URL: z.string().min(1),
  ALLOWED_ORIGINS: z.string().default('http://localhost:3000,https://dingoo.vercel.app,https://*.vercel.app,*'),
  ROOM_TTL_HOURS: z.coerce.number().default(24),
  COUNTDOWN_SECONDS: z.coerce.number().int().min(1).max(60).default(5),
}).parse(process.env)
