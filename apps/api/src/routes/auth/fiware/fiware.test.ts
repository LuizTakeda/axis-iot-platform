import fastifySensible, { httpErrors } from "@fastify/sensible";
import { fastify, type FastifyInstance } from "fastify";
import {
  serializerCompiler,
  validatorCompiler,
  type ZodTypeProvider,
} from "fastify-type-provider-zod";
import { describe, expect, it, vi, afterEach, beforeEach } from "vitest";
import type {} from "@plugins/auth/auth.js";
import fiwareRoutes from "./fiware.routes.js";

describe("GET /api/auth/fiware/tenant-access", () => {
  let app: FastifyInstance;

  const mockAuthFiware =
    vi.fn<FastifyInstance["authenticateFiwareTenantAccess"]>();

  beforeEach(async () => {
    vi.clearAllMocks();

    app = fastify().withTypeProvider<ZodTypeProvider>();
    app.setValidatorCompiler(validatorCompiler);
    app.setSerializerCompiler(serializerCompiler);

    await app.register(fastifySensible);

    app.decorate("authenticateFiwareTenantAccess", mockAuthFiware);

    await app.register(fiwareRoutes, { prefix: "/api/auth/fiware" });

    await app.ready();
  });

  afterEach(async () => {
    await app.close();
  });

  it("calls authenticateFiwareTenantAccess and returns 200 ok when allowed", async () => {
    mockAuthFiware.mockImplementationOnce(async () => {});

    const res = await app.inject({
      method: "GET",
      url: "/api/auth/fiware/tenant-access",
    });

    expect(mockAuthFiware).toHaveBeenCalledOnce();
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ message: "ok" });
  });

  it("blocks the request when authenticateFiwareTenantAccess rejects with forbidden", async () => {
    mockAuthFiware.mockImplementationOnce(async (_req, reply) => {
      return reply.forbidden("Missing FIWARE tenant header");
    });

    const res = await app.inject({
      method: "GET",
      url: "/api/auth/fiware/tenant-access",
    });

    expect(mockAuthFiware).toHaveBeenCalledOnce();
    expect(res.statusCode).toBe(httpErrors.forbidden().statusCode);
  });
});
