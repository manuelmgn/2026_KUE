import { describe, expect, it } from "vitest";
import manifest from "@/app/manifest";

describe("PWA manifest (iOS & Android)", () => {
  it("exposes standalone metadata, maskable + standard icons, and Android shortcuts", () => {
    const data = manifest();

    expect(data.id).toBe("/");
    expect(data.start_url).toBe("/");
    expect(data.scope).toBe("/");
    expect(data.display).toBe("standalone");
    expect(data.prefer_related_applications).toBe(false);

    const icons = data.icons ?? [];
    expect(icons.some((i) => i.sizes === "192x192" && i.purpose === "any")).toBe(true);
    expect(icons.some((i) => i.sizes === "512x512" && i.purpose === "any")).toBe(true);
    expect(icons.some((i) => i.sizes === "512x512" && i.purpose === "maskable")).toBe(true);

    const shortcuts = data.shortcuts ?? [];
    expect(shortcuts.map((s) => s.url)).toEqual(["/", "/festival-mode", "/festivals"]);
  });
});
