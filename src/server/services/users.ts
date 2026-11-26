import { normalizeEmail, normalizeUsername } from "@/domain/artist-matching";
import { DomainError } from "@/domain/errors";
import {
  type AdminCreateUserInput,
  type AdminDeleteUserInput,
  type AdminResetPasswordInput,
  type AdminUpdateUserActiveInput,
  type AdminUpdateUserRoleInput,
  adminCreateUserSchema,
  adminDeleteUserSchema,
  adminResetPasswordSchema,
  adminUpdateUserActiveSchema,
  adminUpdateUserRoleSchema,
  type ChangePasswordInput,
  changePasswordSchema,
  type LoginInput,
  loginSchema,
  type RegisterInput,
  registerSchema,
} from "@/domain/schemas";
import type { Prisma, PrismaClient, UserRole } from "@/generated/prisma/client";
import { hashPassword, verifyPassword, verifyPasswordTimingDummy } from "@/server/auth/password";
import {
  getLoginRateLimiter,
  getRegisterRateLimiter,
  type SlidingWindowRateLimiter,
} from "@/server/auth/rate-limit";
import { createSessionRecord, invalidateAllUserSessions } from "@/server/auth/session";
import { getDb } from "@/server/db";
import { getEnv } from "@/server/env";
import { deleteMediaFile } from "@/server/media-storage";

const SETTING_REGISTRATION_OPEN = "registration_open";
const SETTING_LEGACY_CLAIMED = "legacy_claimed_by";

export interface PublicUserDTO {
  id: string;
  username: string;
  email: string;
  role: UserRole;
  isActive: boolean;
  lastLoginAt: string | null;
  createdAt: string;
}

export interface AdminUserRowDTO extends PublicUserDTO {
  editionsCount: number;
  ratedArtistsCount: number;
  activeSessionsCount: number;
}

export interface AdminDashboardStatsDTO {
  totalUsers: number;
  activeUsers: number;
  adminUsers: number;
  activeSessions: number;
  totalFestivals: number;
  totalEditions: number;
  totalArtists: number;
  registrationOpen: boolean;
}

async function claimLegacyDataForAdmin(
  tx: Prisma.TransactionClient,
  adminUserId: string,
): Promise<void> {
  const alreadyClaimed = await tx.appSetting.findUnique({
    where: { key: SETTING_LEGACY_CLAIMED },
  });
  if (alreadyClaimed) {
    return;
  }

  // Add all pre-existing editions to the initial admin's "Mis festivales"
  const editions = await tx.festivalEdition.findMany({ select: { id: true } });
  for (const edition of editions) {
    await tx.userFestivalEdition.upsert({
      where: { userId_editionId: { userId: adminUserId, editionId: edition.id } },
      create: { userId: adminUserId, editionId: edition.id },
      update: {},
    });
  }

  // Transfer legacy Artist, Album, and Entry personal state snapshots
  const legacyItems = await tx.legacyPersonalItem.findMany();
  for (const item of legacyItems) {
    if (item.kind === "ARTIST") {
      const exists = await tx.artist.findUnique({
        where: { id: item.targetId },
        select: { id: true },
      });
      if (!exists) continue;
      await tx.userArtistState.upsert({
        where: { userId_artistId: { userId: adminUserId, artistId: item.targetId } },
        create: {
          userId: adminUserId,
          artistId: item.targetId,
          rating: item.rating,
          status: item.status ?? "PENDING",
          notes: item.notes,
          ratedAt: item.rating !== null || item.notes.trim().length > 0 ? new Date() : null,
        },
        update: {},
      });
    } else if (item.kind === "ALBUM") {
      const exists = await tx.album.findUnique({
        where: { id: item.targetId },
        select: { id: true },
      });
      if (!exists) continue;
      await tx.userAlbumState.upsert({
        where: { userId_albumId: { userId: adminUserId, albumId: item.targetId } },
        create: {
          userId: adminUserId,
          albumId: item.targetId,
          isPinned: item.isPinned,
          customUrl: item.customUrl,
        },
        update: {},
      });
    } else if (item.kind === "ENTRY") {
      const exists = await tx.festivalEntry.findUnique({
        where: { id: item.targetId },
        select: { id: true },
      });
      if (!exists) continue;
      await tx.userEntryState.upsert({
        where: { userId_entryId: { userId: adminUserId, entryId: item.targetId } },
        create: {
          userId: adminUserId,
          entryId: item.targetId,
          liveRating: item.rating,
          liveNotes: item.notes,
        },
        update: {},
      });
    }
  }

  if (legacyItems.length > 0) {
    await tx.legacyPersonalItem.deleteMany();
  }

  await tx.appSetting.upsert({
    where: { key: SETTING_LEGACY_CLAIMED },
    create: { key: SETTING_LEGACY_CLAIMED, value: adminUserId },
    update: { value: adminUserId },
  });
}

export async function isRegistrationOpen(db: PrismaClient = getDb()): Promise<boolean> {
  const userCount = await db.user.count();
  if (userCount === 0) {
    return true;
  }
  const setting = await db.appSetting.findUnique({ where: { key: SETTING_REGISTRATION_OPEN } });
  return setting ? setting.value === "true" : true;
}

export async function hasAnyUsers(db: PrismaClient = getDb()): Promise<boolean> {
  return (await db.user.count()) > 0;
}

export async function setRegistrationOpen(
  open: boolean,
  db: PrismaClient = getDb(),
): Promise<boolean> {
  await db.appSetting.upsert({
    where: { key: SETTING_REGISTRATION_OPEN },
    create: { key: SETTING_REGISTRATION_OPEN, value: open ? "true" : "false" },
    update: { value: open ? "true" : "false" },
  });
  return open;
}

/**
 * Optionally creates the initial ADMIN user on startup when ADMIN_USERNAME, ADMIN_EMAIL,
 * and ADMIN_PASSWORD are provided in the environment and no users exist yet.
 */
export async function ensureBootstrapAdmin(db: PrismaClient = getDb()): Promise<boolean> {
  let env: ReturnType<typeof getEnv>;
  try {
    env = getEnv();
  } catch {
    return false;
  }

  if (!env.ADMIN_USERNAME || !env.ADMIN_EMAIL || !env.ADMIN_PASSWORD) {
    return false;
  }

  const existingCount = await db.user.count();
  if (existingCount > 0) {
    return false;
  }

  const parsed = registerSchema.safeParse({
    username: env.ADMIN_USERNAME,
    email: env.ADMIN_EMAIL,
    password: env.ADMIN_PASSWORD,
  });
  if (!parsed.success) {
    console.warn("[KUE] Invalid ADMIN_* bootstrap environment variables; skipping auto-seed.");
    return false;
  }

  const passwordHash = await hashPassword(parsed.data.password);
  const normalizedUsername = normalizeUsername(parsed.data.username);
  const normalizedEmail = normalizeEmail(parsed.data.email);

  await db.$transaction(async (tx) => {
    if ((await tx.user.count()) > 0) {
      return;
    }
    const admin = await tx.user.create({
      data: {
        username: parsed.data.username,
        normalizedUsername,
        email: parsed.data.email,
        normalizedEmail,
        passwordHash,
        role: "ADMIN",
        isActive: true,
      },
      select: { id: true },
    });
    await claimLegacyDataForAdmin(tx, admin.id);
  });

  return true;
}

export async function registerUser(
  rawInput: RegisterInput,
  options: {
    ipAddress?: string | null;
    userAgent?: string | null;
    db?: PrismaClient;
    rateLimiter?: SlidingWindowRateLimiter;
  } = {},
): Promise<{
  user: PublicUserDTO;
  rawToken: string;
  expiresAt: Date;
  isFirstAdmin: boolean;
}> {
  const input = registerSchema.parse(rawInput);
  const db = options.db ?? getDb();
  const limiter = options.rateLimiter ?? getRegisterRateLimiter();
  const ipKey = `reg:${options.ipAddress ?? "local"}`;

  const limit = limiter.check(ipKey);
  if (!limit.allowed) {
    throw new DomainError(
      `Demasiados intentos de registro. Inténtalo de nuevo en ${Math.ceil(limit.retryAfterSeconds / 60)} minutos.`,
    );
  }

  const normalizedUsername = normalizeUsername(input.username);
  const normalizedEmail = normalizeEmail(input.email);
  const passwordHash = await hashPassword(input.password);

  const { created, isFirstAdmin } = await db.$transaction(async (tx) => {
    const userCount = await tx.user.count();
    const firstUser = userCount === 0;

    if (!firstUser) {
      const setting = await tx.appSetting.findUnique({
        where: { key: SETTING_REGISTRATION_OPEN },
      });
      if (setting && setting.value !== "true") {
        throw new DomainError(
          "El registro público está desactivado. Contacta con el administrador.",
        );
      }
    }

    const [dupUser, dupEmail] = await Promise.all([
      tx.user.findUnique({ where: { normalizedUsername }, select: { id: true } }),
      tx.user.findUnique({ where: { normalizedEmail }, select: { id: true } }),
    ]);

    if (dupUser) {
      throw new DomainError("Ese nombre de usuario ya está en uso");
    }
    if (dupEmail) {
      throw new DomainError("Ese correo electrónico ya está registrado");
    }

    const user = await tx.user.create({
      data: {
        username: input.username,
        normalizedUsername,
        email: input.email,
        normalizedEmail,
        passwordHash,
        role: firstUser ? "ADMIN" : "USER",
        isActive: true,
        lastLoginAt: new Date(),
      },
    });

    if (firstUser) {
      await claimLegacyDataForAdmin(tx, user.id);
    }

    return { created: user, isFirstAdmin: firstUser };
  });

  limiter.record(ipKey);

  const session = await createSessionRecord(
    created.id,
    {
      ipAddress: options.ipAddress ?? null,
      userAgent: options.userAgent ?? null,
    },
    db,
  );

  return {
    user: toPublicUserDTO(created),
    rawToken: session.rawToken,
    expiresAt: session.expiresAt,
    isFirstAdmin,
  };
}

export async function authenticateUser(
  rawInput: LoginInput,
  options: {
    ipAddress?: string | null;
    userAgent?: string | null;
    db?: PrismaClient;
    rateLimiter?: SlidingWindowRateLimiter;
  } = {},
): Promise<{
  user: PublicUserDTO;
  rawToken: string;
  expiresAt: Date;
}> {
  const input = loginSchema.parse(rawInput);
  const db = options.db ?? getDb();
  const limiter = options.rateLimiter ?? getLoginRateLimiter();

  const normalizedUsername = normalizeUsername(input.username);
  const ip = options.ipAddress ?? "local";
  const ipKey = `login:ip:${ip}`;
  const acctKey = `login:acct:${ip}:${normalizedUsername}`;

  const ipCheck = limiter.check(ipKey);
  const acctCheck = limiter.check(acctKey);
  if (!ipCheck.allowed || !acctCheck.allowed) {
    const waitSec = Math.max(ipCheck.retryAfterSeconds, acctCheck.retryAfterSeconds);
    throw new DomainError(
      `Demasiados intentos fallidos. Espera ${Math.ceil(waitSec / 60)} minutos antes de volver a intentarlo.`,
    );
  }

  const user = await db.user.findUnique({ where: { normalizedUsername } });
  if (!user) {
    await verifyPasswordTimingDummy(input.password);
    limiter.record(ipKey);
    limiter.record(acctKey);
    throw new DomainError("Usuario o contraseña incorrectos");
  }

  const valid = await verifyPassword(input.password, user.passwordHash);
  if (!valid) {
    limiter.record(ipKey);
    limiter.record(acctKey);
    throw new DomainError("Usuario o contraseña incorrectos");
  }

  if (!user.isActive) {
    throw new DomainError("Esta cuenta está desactivada. Contacta con el administrador.");
  }

  limiter.reset(acctKey);

  const updated = await db.user.update({
    where: { id: user.id },
    data: { lastLoginAt: new Date() },
  });

  const session = await createSessionRecord(
    user.id,
    {
      ipAddress: options.ipAddress ?? null,
      userAgent: options.userAgent ?? null,
    },
    db,
  );

  return {
    user: toPublicUserDTO(updated),
    rawToken: session.rawToken,
    expiresAt: session.expiresAt,
  };
}

export async function changeOwnPassword(
  userId: string,
  rawInput: ChangePasswordInput,
  currentSessionId: string,
  db: PrismaClient = getDb(),
): Promise<void> {
  const input = changePasswordSchema.parse(rawInput);

  const user = await db.user.findUnique({
    where: { id: userId },
    select: { id: true, passwordHash: true },
  });
  if (!user) {
    throw new DomainError("Usuario no encontrado");
  }

  const valid = await verifyPassword(input.currentPassword, user.passwordHash);
  if (!valid) {
    throw new DomainError("La contraseña actual no es correcta");
  }

  const nextHash = await hashPassword(input.newPassword);
  await db.user.update({
    where: { id: userId },
    data: { passwordHash: nextHash },
  });

  // Revoke all other sessions on password change
  await invalidateAllUserSessions(userId, { exceptSessionId: currentSessionId, db });
}

// Admin operations

export async function getAdminDashboardData(db: PrismaClient = getDb()): Promise<{
  stats: AdminDashboardStatsDTO;
  users: AdminUserRowDTO[];
}> {
  const now = new Date();
  const [usersRaw, activeSessions, totalFestivals, totalEditions, totalArtists, registrationOpen] =
    await Promise.all([
      db.user.findMany({
        orderBy: [{ role: "desc" }, { createdAt: "asc" }],
        select: {
          id: true,
          username: true,
          email: true,
          role: true,
          isActive: true,
          lastLoginAt: true,
          createdAt: true,
          _count: {
            select: {
              editions: true,
              artistStates: { where: { rating: { not: null } } },
              sessions: { where: { expiresAt: { gt: now } } },
            },
          },
        },
      }),
      db.session.count({ where: { expiresAt: { gt: now } } }),
      db.festival.count(),
      db.festivalEdition.count(),
      db.artist.count(),
      isRegistrationOpen(db),
    ]);

  const users: AdminUserRowDTO[] = usersRaw.map((u) => ({
    id: u.id,
    username: u.username,
    email: u.email,
    role: u.role,
    isActive: u.isActive,
    lastLoginAt: u.lastLoginAt ? u.lastLoginAt.toISOString() : null,
    createdAt: u.createdAt.toISOString(),
    editionsCount: u._count.editions,
    ratedArtistsCount: u._count.artistStates,
    activeSessionsCount: u._count.sessions,
  }));

  return {
    stats: {
      totalUsers: users.length,
      activeUsers: users.filter((u) => u.isActive).length,
      adminUsers: users.filter((u) => u.role === "ADMIN" && u.isActive).length,
      activeSessions,
      totalFestivals,
      totalEditions,
      totalArtists,
      registrationOpen,
    },
    users,
  };
}

export async function adminCreateUser(
  rawInput: AdminCreateUserInput,
  db: PrismaClient = getDb(),
): Promise<PublicUserDTO> {
  const input = adminCreateUserSchema.parse(rawInput);
  const normalizedUsername = normalizeUsername(input.username);
  const normalizedEmail = normalizeEmail(input.email);

  const [dupUser, dupEmail] = await Promise.all([
    db.user.findUnique({ where: { normalizedUsername }, select: { id: true } }),
    db.user.findUnique({ where: { normalizedEmail }, select: { id: true } }),
  ]);
  if (dupUser) {
    throw new DomainError("Ese nombre de usuario ya está en uso");
  }
  if (dupEmail) {
    throw new DomainError("Ese correo electrónico ya está registrado");
  }

  const passwordHash = await hashPassword(input.password);
  const created = await db.user.create({
    data: {
      username: input.username,
      normalizedUsername,
      email: input.email,
      normalizedEmail,
      passwordHash,
      role: input.role,
      isActive: true,
    },
  });

  return toPublicUserDTO(created);
}

export async function adminSetUserRole(
  actorUserId: string,
  rawInput: AdminUpdateUserRoleInput,
  db: PrismaClient = getDb(),
): Promise<PublicUserDTO> {
  const input = adminUpdateUserRoleSchema.parse(rawInput);
  if (input.userId === actorUserId && input.role !== "ADMIN") {
    throw new DomainError("No puedes quitarte a ti mismo el rol de administrador");
  }

  const target = await db.user.findUnique({ where: { id: input.userId } });
  if (!target) {
    throw new DomainError("Usuario no encontrado");
  }

  if (target.role === "ADMIN" && input.role !== "ADMIN") {
    const otherActiveAdmins = await db.user.count({
      where: { role: "ADMIN", isActive: true, id: { not: target.id } },
    });
    if (otherActiveAdmins === 0) {
      throw new DomainError("Debe existir al menos un administrador activo en la aplicación");
    }
  }

  const updated = await db.user.update({
    where: { id: input.userId },
    data: { role: input.role },
  });

  return toPublicUserDTO(updated);
}

export async function adminSetUserActive(
  actorUserId: string,
  rawInput: AdminUpdateUserActiveInput,
  db: PrismaClient = getDb(),
): Promise<PublicUserDTO> {
  const input = adminUpdateUserActiveSchema.parse(rawInput);
  if (input.userId === actorUserId && !input.isActive) {
    throw new DomainError("No puedes desactivar tu propia cuenta");
  }

  const target = await db.user.findUnique({ where: { id: input.userId } });
  if (!target) {
    throw new DomainError("Usuario no encontrado");
  }

  if (target.role === "ADMIN" && !input.isActive) {
    const otherActiveAdmins = await db.user.count({
      where: { role: "ADMIN", isActive: true, id: { not: target.id } },
    });
    if (otherActiveAdmins === 0) {
      throw new DomainError("Debe existir al menos un administrador activo en la aplicación");
    }
  }

  const updated = await db.user.update({
    where: { id: input.userId },
    data: { isActive: input.isActive },
  });

  if (!input.isActive) {
    await invalidateAllUserSessions(input.userId, { db });
  }

  return toPublicUserDTO(updated);
}

export async function adminResetUserPassword(
  rawInput: AdminResetPasswordInput,
  db: PrismaClient = getDb(),
): Promise<void> {
  const input = adminResetPasswordSchema.parse(rawInput);
  const target = await db.user.findUnique({
    where: { id: input.userId },
    select: { id: true },
  });
  if (!target) {
    throw new DomainError("Usuario no encontrado");
  }

  const passwordHash = await hashPassword(input.newPassword);
  await db.user.update({
    where: { id: input.userId },
    data: { passwordHash },
  });
  await invalidateAllUserSessions(input.userId, { db });
}

export async function adminDeleteUser(
  actorUserId: string,
  rawInput: AdminDeleteUserInput,
  db: PrismaClient = getDb(),
): Promise<void> {
  const input = adminDeleteUserSchema.parse(rawInput);
  if (input.userId === actorUserId) {
    throw new DomainError("No puedes eliminar tu propia cuenta");
  }

  const target = await db.user.findUnique({
    where: { id: input.userId },
    select: { id: true, role: true, avatarPath: true },
  });
  if (!target) {
    throw new DomainError("Usuario no encontrado");
  }

  if (target.role === "ADMIN") {
    const otherActiveAdmins = await db.user.count({
      where: { role: "ADMIN", isActive: true, id: { not: target.id } },
    });
    if (otherActiveAdmins === 0) {
      throw new DomainError("No se puede eliminar al último administrador activo");
    }
  }

  await db.user.delete({ where: { id: input.userId } });
  if (target.avatarPath) {
    await deleteMediaFile(target.avatarPath);
  }
}

function toPublicUserDTO(user: {
  id: string;
  username: string;
  email: string;
  role: UserRole;
  isActive: boolean;
  lastLoginAt: Date | null;
  createdAt: Date;
}): PublicUserDTO {
  return {
    id: user.id,
    username: user.username,
    email: user.email,
    role: user.role,
    isActive: user.isActive,
    lastLoginAt: user.lastLoginAt ? user.lastLoginAt.toISOString() : null,
    createdAt: user.createdAt.toISOString(),
  };
}
