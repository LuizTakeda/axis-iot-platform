import { HttpErrorSchema, ResponseMessageSchema } from "@repo/types/commons";
import type { FastifyPluginAsyncZod } from "fastify-type-provider-zod";

const fiwareRoutes: FastifyPluginAsyncZod = async (fastify) => {
  fastify.get(
    "/tenant-access",
    {
      onRequest: [fastify.authenticateFiwareTenantAccess],
      schema: {
        summary: "Validate FIWARE tenant access",
        description:
          "Validates the user's session cookie and verifies membership in the requested FIWARE tenants (NGSILD-Tenant or Fiware-Service).",
        tags: ["Auth"],
        response: {
          200: ResponseMessageSchema,
          401: HttpErrorSchema,
          403: HttpErrorSchema,
        },
      },
    },
    async () => {
      return {
        message: "ok",
      };
    },
  );
};

export default fiwareRoutes;
