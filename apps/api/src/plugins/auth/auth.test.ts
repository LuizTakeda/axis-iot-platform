import { beforeEach, describe, vi, afterEach, expect, it } from "vitest";
import type { KeycloakUserPayload } from "./auth.js";
import { fastify, type FastifyInstance } from "fastify";
import fastifyCookie from "@fastify/cookie";
import fastifySensible, { httpErrors } from "@fastify/sensible";
import authPlugin from "@plugins/auth/auth.js";
import { jwtVerify } from "jose";

vi.mock("jose", () => ({
  createRemoteJWKSet: vi.fn(() => vi.fn()),
  jwtVerify: vi.fn(),
}));

function createMockPayload(
  overrides: Partial<KeycloakUserPayload> = {},
): KeycloakUserPayload {
  return {
    sub: "user-123",
    name: "Test User",
    preferred_username: "Test",
    email: "test@test.com",
    realm_access: { roles: [] },
    groups: ["greenhouse"],
    ...overrides,
  };
}

describe("authPlugin", () => {
  let app: FastifyInstance;

  beforeEach(async () => {
    vi.clearAllMocks();

    app = fastify();

    await app.register(fastifyCookie);
    await app.register(fastifySensible);

    app.decorate("config", {
      KEYCLOAK_REALM: "master",
    } as FastifyInstance["config"]);

    await app.register(authPlugin);

    app.get("/auth", { onRequest: [app.authenticate] }, async (req) => ({
      user: req.user,
    }));

    app.get("/admin", { onRequest: [app.authenticateAdmin] }, async () => ({
      ok: true,
    }));

    app.get(
      "/fiware",
      { onRequest: [app.authenticateFiwareTenantAccess] },
      async () => ({ ok: true }),
    );

    await app.ready();
  });

  afterEach(async () => {
    await app.close();
  });

  describe("authenticate", () => {
    it("returns unauthorized when access_token cookie is missing", async () => {
      const res = await app.inject({
        method: "GET",
        url: "/auth",
      });

      expect(res.statusCode).toBe(httpErrors.unauthorized().statusCode);
      expect(jwtVerify).not.toHaveBeenCalled();
    });

    it("returns unauthorized when jwtVerify rejects the token", async () => {
      vi.mocked(jwtVerify).mockRejectedValueOnce(new Error("Expired token"));

      const res = await app.inject({
        method: "GET",
        url: "/auth",
        cookies: { access_token: "invalid_token" },
      });

      expect(res.statusCode).toBe(httpErrors.unauthorized().statusCode);
      expect(jwtVerify).toHaveBeenCalledOnce();
    });

    it("returns 200 and populates request.user when token is valid", async () => {
      const payload = createMockPayload();

      vi.mocked(jwtVerify).mockResolvedValueOnce({
        payload,
        protectedHeader: { alg: "RS256" },
      });

      const res = await app.inject({
        method: "GET",
        url: "/auth",
        cookies: { access_token: "valid_token" },
      });

      expect(res.statusCode).toBe(200);
      expect(res.json()).toEqual({ user: payload });
    });
  });

  describe("authenticateAdmin", () => {
    it("returns unauthorized when access_token cookie is missing", async () => {
      const res = await app.inject({
        method: "GET",
        url: "/admin",
      });

      expect(res.statusCode).toBe(httpErrors.unauthorized().statusCode);
    });

    it("returns forbidden when user lacks 'system-admin' role", async () => {
      vi.mocked(jwtVerify).mockResolvedValueOnce({
        payload: createMockPayload({ realm_access: { roles: ["member"] } }),
        protectedHeader: { alg: "RS256" },
      });

      const res = await app.inject({
        method: "GET",
        url: "/admin",
        cookies: { access_token: "valid_token" },
      });

      expect(res.statusCode).toBe(httpErrors.forbidden().statusCode);
    });

    it("returns forbidden when realm_access claim is omitted from token", async () => {
      const payload = createMockPayload();
      delete payload.realm_access;

      vi.mocked(jwtVerify).mockResolvedValueOnce({
        payload,
        protectedHeader: { alg: "RS256" },
      });

      const res = await app.inject({
        method: "GET",
        url: "/admin",
        cookies: { access_token: "valid_token" },
      });

      expect(res.statusCode).toBe(httpErrors.forbidden().statusCode);
    });

    it("returns 200 when user has 'system-admin' role", async () => {
      vi.mocked(jwtVerify).mockResolvedValueOnce({
        payload: createMockPayload({
          realm_access: { roles: ["system-admin"] },
        }),
        protectedHeader: { alg: "RS256" },
      });

      const res = await app.inject({
        method: "GET",
        url: "/admin",
        cookies: { access_token: "valid_token" },
      });

      expect(res.statusCode).toBe(200);
    });
  });

  describe("authenticateFiwareTenantAccess", () => {
    it("returns unauthorized when access_token cookie is missing", async () => {
      const res = await app.inject({
        method: "GET",
        url: "/fiware",
        headers: { "ngsild-tenant": "alpha" },
      });

      expect(res.statusCode).toBe(httpErrors.unauthorized().statusCode);
    });

    it("returns forbidden when multiple tenant headers are sent as an array", async () => {
      vi.mocked(jwtVerify).mockResolvedValueOnce({
        payload: createMockPayload({ groups: ["alpha"] }),
        protectedHeader: { alg: "RS256" },
      });

      const res = await app.inject({
        method: "GET",
        url: "/fiware",
        cookies: { access_token: "valid_token" },
        headers: { "ngsild-tenant": ["alpha", "beta"] },
      });

      expect(res.statusCode).toBe(httpErrors.forbidden().statusCode);
      expect(res.json().message).toContain("Multiple tenant headers");
    });

    it("returns forbidden when tenant headers are missing", async () => {
      vi.mocked(jwtVerify).mockResolvedValueOnce({
        payload: createMockPayload(),
        protectedHeader: { alg: "RS256" },
      });

      const res = await app.inject({
        method: "GET",
        url: "/fiware",
        cookies: { access_token: "valid_token" },
      });

      expect(res.statusCode).toBe(httpErrors.forbidden().statusCode);
      expect(res.json().message).toContain("Missing FIWARE tenant header");
    });

    it("returns forbidden when NGSILD-Tenant and Fiware-Service do not match", async () => {
      vi.mocked(jwtVerify).mockResolvedValueOnce({
        payload: createMockPayload({ groups: ["alpha"] }),
        protectedHeader: { alg: "RS256" },
      });

      const res = await app.inject({
        method: "GET",
        url: "/fiware",
        cookies: { access_token: "valid_token" },
        headers: {
          "ngsild-tenant": "alpha",
          "fiware-service": "beta",
        },
      });

      expect(res.statusCode).toBe(httpErrors.forbidden().statusCode);
      expect(res.json().message).toContain("Mismatched");
    });

    it("returns forbidden when user is not a member of the requested tenant", async () => {
      vi.mocked(jwtVerify).mockResolvedValueOnce({
        payload: createMockPayload({ groups: ["alpha"] }),
        protectedHeader: { alg: "RS256" },
      });

      const res = await app.inject({
        method: "GET",
        url: "/fiware",
        cookies: { access_token: "valid_token" },
        headers: { "ngsild-tenant": "beta" },
      });

      expect(res.statusCode).toBe(httpErrors.forbidden().statusCode);
      expect(res.json().message).toContain(
        "You do not have access to the 'beta' tenant.",
      );
    });

    it("returns forbidden when groups claim is omitted from token", async () => {
      const payload = createMockPayload();
      delete payload.groups;

      vi.mocked(jwtVerify).mockResolvedValueOnce({
        payload,
        protectedHeader: { alg: "RS256" },
      });

      const res = await app.inject({
        method: "GET",
        url: "/fiware",
        cookies: { access_token: "valid_token" },
        headers: { "ngsild-tenant": "alpha" },
      });

      expect(res.statusCode).toBe(httpErrors.forbidden().statusCode);
    });

    it("returns 200 when NGSILD-Tenant matches a group in user.groups", async () => {
      vi.mocked(jwtVerify).mockResolvedValueOnce({
        payload: createMockPayload({ groups: ["alpha"] }),
        protectedHeader: { alg: "RS256" },
      });

      const res = await app.inject({
        method: "GET",
        url: "/fiware",
        cookies: { access_token: "valid_token" },
        headers: { "ngsild-tenant": "alpha" },
      });

      expect(res.statusCode).toBe(200);
    });

    it("returns 200 when Fiware-Service matches a group in user.groups", async () => {
      vi.mocked(jwtVerify).mockResolvedValueOnce({
        payload: createMockPayload({ groups: ["alpha"] }),
        protectedHeader: { alg: "RS256" },
      });

      const res = await app.inject({
        method: "GET",
        url: "/fiware",
        cookies: { access_token: "valid_token" },
        headers: { "fiware-service": "alpha" },
      });

      expect(res.statusCode).toBe(200);
    });

    it("returns 200 when both NGSILD-Tenant and Fiware-Service match the same allowed group", async () => {
      vi.mocked(jwtVerify).mockResolvedValueOnce({
        payload: createMockPayload({ groups: ["alpha"] }),
        protectedHeader: { alg: "RS256" },
      });

      const res = await app.inject({
        method: "GET",
        url: "/fiware",
        cookies: { access_token: "valid_token" },
        headers: {
          "ngsild-tenant": "alpha",
          "fiware-service": "alpha",
        },
      });

      expect(res.statusCode).toBe(200);
    });
  });
});
