import type { FastifyPluginAsyncZod } from "fastify-type-provider-zod";
import rootRoutes from "./root.routes.js";
import authRoutes from "./auth/auth.routes.js";
import fiwareAuthRoutes from "./auth/fiware/fiware.routes.js";
import contextFileRoutes from "./fiware/context-file/context-file.routes.js";
import eventRoutes from "./fiware/event/event.routes.js";
import mqttClientRoutes from "./mqtt/client/client.routes.js";
import mqttGroupRoutes from "./mqtt/group/group.routes.js";
import mqttRoleRoutes from "./mqtt/role/role.routes.js";
import ngsiLdRoutes from "./ngsi-ld/ngsi-ld.routes.js";

const apiRoutes: FastifyPluginAsyncZod = async (fastify) => {
  await fastify.register(rootRoutes);
  await fastify.register(authRoutes, { prefix: "/auth" });
  await fastify.register(fiwareAuthRoutes, { prefix: "/auth/fiware" });
  await fastify.register(contextFileRoutes, { prefix: "/fiware/context-file" });
  await fastify.register(eventRoutes, { prefix: "/fiware/event" });
  await fastify.register(mqttClientRoutes, { prefix: "/mqtt/client" });
  await fastify.register(mqttGroupRoutes, { prefix: "/mqtt/group" });
  await fastify.register(mqttRoleRoutes, { prefix: "/mqtt/role" });
  await fastify.register(ngsiLdRoutes, { prefix: "/ngsi-ld" });
};

export default apiRoutes;
