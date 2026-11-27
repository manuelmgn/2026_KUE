import { z } from "zod";

const envSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  PORT: z.coerce.number().int().positive().default(5030),
  DATABASE_URL: z.string().trim().min(1, "DATABASE_URL es obligatoria"),
  DATABASE_URL_POOLED: z.string().trim().min(1).optional(),
  MEDIA_DIR: z.string().min(1).default("./data/media"),
  BLOB_READ_WRITE_TOKEN: z.string().trim().min(1).optional(),
  BLOB_STORE_ID: z.string().trim().min(1).optional(),
  BLOB_ACCESS: z.enum(["private", "public"]).default("private"),
  GEMINI_API_KEY: z.string().trim().min(1).optional(),
  GEMINI_MODEL: z.string().trim().min(1).default("gemini-3.5-flash-lite"),
  ADMIN_USERNAME: z.string().trim().min(3).max(32).optional(),
  ADMIN_EMAIL: z.email().optional(),
  ADMIN_PASSWORD: z.string().min(8).max(128).optional(),
  COOKIE_SECURE: z
    .enum(["true", "false"])
    .optional()
    .transform((value) => (value === undefined ? undefined : value === "true")),
});

export type Env = z.infer<typeof envSchema>;

let cachedEnv: Env | undefined;

export function getEnv(): Env {
  if (cachedEnv) {
    return cachedEnv;
  }

  const parsed = envSchema.safeParse({
    NODE_ENV: process.env.NODE_ENV,
    PORT: process.env.PORT,
    DATABASE_URL: process.env.DATABASE_URL,
    DATABASE_URL_POOLED: process.env.DATABASE_URL_POOLED || undefined,
    MEDIA_DIR: process.env.MEDIA_DIR,
    BLOB_READ_WRITE_TOKEN: process.env.BLOB_READ_WRITE_TOKEN || undefined,
    BLOB_STORE_ID: process.env.BLOB_STORE_ID || undefined,
    BLOB_ACCESS: process.env.BLOB_ACCESS || undefined,
    GEMINI_API_KEY: process.env.GEMINI_API_KEY || undefined,
    GEMINI_MODEL: process.env.GEMINI_MODEL || undefined,
    ADMIN_USERNAME: process.env.ADMIN_USERNAME || undefined,
    ADMIN_EMAIL: process.env.ADMIN_EMAIL || undefined,
    ADMIN_PASSWORD: process.env.ADMIN_PASSWORD || undefined,
    COOKIE_SECURE: process.env.COOKIE_SECURE || undefined,
  });

  if (!parsed.success) {
    const details = parsed.error.issues
      .map((issue) => `${issue.path.join(".")}: ${issue.message}`)
      .join("; ");
    throw new Error(`Invalid environment variables: ${details}`);
  }

  cachedEnv = parsed.data;
  return cachedEnv;
}
