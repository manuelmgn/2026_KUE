import { z } from "zod";

export function cleanEnvString(raw: string | undefined): string | undefined {
  if (raw === undefined) {
    return undefined;
  }
  let value = raw.trim();
  if (
    value.length >= 2 &&
    ((value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'")))
  ) {
    value = value.slice(1, -1).trim();
  }
  return value.length > 0 ? value : undefined;
}

export interface BootstrapAdminEnv {
  username: string | undefined;
  email: string | undefined;
  password: string | undefined;
  partiallyConfigured: boolean;
}

export function readBootstrapAdminEnv(): BootstrapAdminEnv {
  const username = cleanEnvString(process.env.ADMIN_USERNAME);
  const email = cleanEnvString(process.env.ADMIN_EMAIL);
  const password = cleanEnvString(process.env.ADMIN_PASSWORD);
  const count = [username, email, password].filter(Boolean).length;
  return {
    username,
    email,
    password,
    partiallyConfigured: count > 0 && count < 3,
  };
}

export function isBootstrapAdminConfigured(): boolean {
  const { username, email, password } = readBootstrapAdminEnv();
  return Boolean(username && email && password);
}

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
    NODE_ENV: cleanEnvString(process.env.NODE_ENV),
    PORT: cleanEnvString(process.env.PORT),
    DATABASE_URL: cleanEnvString(process.env.DATABASE_URL),
    DATABASE_URL_POOLED: cleanEnvString(process.env.DATABASE_URL_POOLED),
    MEDIA_DIR: cleanEnvString(process.env.MEDIA_DIR),
    BLOB_READ_WRITE_TOKEN: cleanEnvString(process.env.BLOB_READ_WRITE_TOKEN),
    BLOB_STORE_ID: cleanEnvString(process.env.BLOB_STORE_ID),
    BLOB_ACCESS: cleanEnvString(process.env.BLOB_ACCESS)?.toLowerCase(),
    GEMINI_API_KEY: cleanEnvString(process.env.GEMINI_API_KEY),
    GEMINI_MODEL: cleanEnvString(process.env.GEMINI_MODEL),
    ADMIN_USERNAME: cleanEnvString(process.env.ADMIN_USERNAME),
    ADMIN_EMAIL: cleanEnvString(process.env.ADMIN_EMAIL),
    ADMIN_PASSWORD: cleanEnvString(process.env.ADMIN_PASSWORD),
    COOKIE_SECURE: cleanEnvString(process.env.COOKIE_SECURE)?.toLowerCase(),
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
