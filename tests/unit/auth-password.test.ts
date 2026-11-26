import { describe, expect, it } from "vitest";
import { loginSchema, registerSchema } from "@/domain/schemas";
import { hashPassword, verifyPassword, verifyPasswordTimingDummy } from "@/server/auth/password";

describe("auth password hashing & schemas", () => {
  it("hashes passwords with scrypt and unique salts, verifying correctly", async () => {
    const hash1 = await hashPassword("Sup3rS3cur3!Pass");
    const hash2 = await hashPassword("Sup3rS3cur3!Pass");

    expect(hash1).toMatch(/^scrypt\$16384\$8\$1\$[0-9a-f]+\$[0-9a-f]+$/);
    expect(hash1).not.toBe(hash2);

    expect(await verifyPassword("Sup3rS3cur3!Pass", hash1)).toBe(true);
    expect(await verifyPassword("WrongPassword", hash1)).toBe(false);
    expect(await verifyPassword("Sup3rS3cur3!Pass", "invalid-format")).toBe(false);
  });

  it("executes timing dummy cleanly without throwing", async () => {
    await expect(verifyPasswordTimingDummy("anything")).resolves.toBeUndefined();
  });

  it("validates register and login schemas strictly", () => {
    expect(
      registerSchema.safeParse({
        username: "kue_admin.1",
        email: "admin@example.com",
        password: "strongpassword123",
      }).success,
    ).toBe(true);

    expect(
      registerSchema.safeParse({
        username: "ab",
        email: "admin@example.com",
        password: "strongpassword123",
      }).success,
    ).toBe(false);

    expect(
      registerSchema.safeParse({
        username: "bad user!",
        email: "admin@example.com",
        password: "strongpassword123",
      }).success,
    ).toBe(false);

    expect(
      registerSchema.safeParse({
        username: "validuser",
        email: "not-an-email",
        password: "strongpassword123",
      }).success,
    ).toBe(false);

    expect(
      registerSchema.safeParse({
        username: "validuser",
        email: "valid@example.com",
        password: "short",
      }).success,
    ).toBe(false);

    expect(loginSchema.safeParse({ username: "admin", password: "secret" }).success).toBe(true);
    expect(loginSchema.safeParse({ username: "", password: "secret" }).success).toBe(false);
  });
});
