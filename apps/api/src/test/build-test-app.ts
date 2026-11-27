import { fastify, type FastifyInstance } from "fastify";
import fastifySensible from "@fastify/sensible";
import fastifyCookie from "@fastify/cookie";
import {
  serializerCompiler,
  validatorCompiler,
  type ZodTypeProvider,
} from "fastify-type-provider-zod";
import { vi } from "vitest";

export async function buildTestApp() {
  const app = fastify().withTypeProvider<ZodTypeProvider>();

  app.setValidatorCompiler(validatorCompiler);
  app.setSerializerCompiler(serializerCompiler);

  await app.register(fastifyCookie);
  await app.register(fastifySensible);

  return app;
}

export function buildAuthenticateMock() {
  return vi.fn<FastifyInstance["authenticate"]>(async () => {});
}

export function buildAuthenticateAdminMock() {
  return vi.fn<FastifyInstance["authenticateAdmin"]>(async () => {});
}

export function buildAuthenticateFiwareTenantAccessMock() {
  return vi.fn<FastifyInstance["authenticateFiwareTenantAccess"]>(
    async () => {},
  );
}
