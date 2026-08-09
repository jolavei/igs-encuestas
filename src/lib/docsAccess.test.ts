import { describe, it, expect } from "vitest";
import { canAccessDocScoped } from "@/lib/docsAccess";

describe("canAccessDocScoped (acceso a documentos por sede)", () => {
  it("el admin ve cualquier documento", () => {
    expect(canAccessDocScoped("ADMIN", [], { locationId: "sede-1" })).toBe(true);
    expect(canAccessDocScoped("ADMIN", [], { locationId: null })).toBe(true);
  });

  it("el cliente ve solo documentos de sus sedes asignadas", () => {
    expect(canAccessDocScoped("CLIENT", ["sede-1", "sede-2"], { locationId: "sede-1" })).toBe(true);
    expect(canAccessDocScoped("CLIENT", ["sede-1"], { locationId: "sede-9" })).toBe(false);
  });

  it("el cliente NO ve documentos sin sede (nivel empresa)", () => {
    expect(canAccessDocScoped("CLIENT", ["sede-1"], { locationId: null })).toBe(false);
  });

  it("el encuestador no accede a documentos", () => {
    expect(canAccessDocScoped("SURVEYOR", ["sede-1"], { locationId: "sede-1" })).toBe(false);
  });
});
