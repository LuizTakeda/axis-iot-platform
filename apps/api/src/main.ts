import fastify, {
  type FastifyError,
  type FastifyReply,
  type FastifyRequest,
} from "fastify";
import swaggerPlugin from "./plugins/swagger.js";
import cors from "./plugins/cors.js";
import type { ZodTypeProvider } from "fastify-type-provider-zod";
import {
  serializerCompiler,
  validatorCompiler,
} from "fastify-type-provider-zod";
import { fastifySSE } from "@fastify/sse";
import prismaPlugin from "@/plugins/prisma.js";
import fastifySensible from "@fastify/sensible";
import envPlugin from "@plugins/env.js";
import oauth2Plugin from "@plugins/oauth2.js";
import authPlugin from "@/plugins/auth/auth.js";
import ngsiLdPlugin from "@/plugins/ngsi-ld/index.js";
import apiRoutes from "@/routes/index.js";
import dynsecPlugin from "./plugins/dynsec.js";

const isDevelopment = process.env.NODE_ENV !== "production";

const app = fastify({
  disableRequestLogging: true,
  logger: {
    name: "app",
  },
}).withTypeProvider<ZodTypeProvider>();

app.setValidatorCompiler(validatorCompiler);
app.setSerializerCompiler(serializerCompiler);

// Log only Method, URL, Status Code and Execution Time on response (single line)
app.addHook("onResponse", (request, reply, done) => {
  const responseTime = `${(reply.elapsedTime || 0).toFixed(2)}ms`;
  request.log.info(
    `${request.method} ${request.url} ${reply.statusCode} - ${responseTime}`,
  );
  done();
});

//**************************************************
// Plugins
//**************************************************

await app.register(envPlugin);
await app.register(fastifySensible);
await app.register(cors);
await app.register(oauth2Plugin);
await app.register(authPlugin);
await app.register(fastifySSE);
await app.register(dynsecPlugin);
await app.register(prismaPlugin);
await app.register(ngsiLdPlugin);

if (isDevelopment) {
  await app.register(swaggerPlugin);
}

//**************************************************
// Routes
//**************************************************

app.setErrorHandler(
  (error: FastifyError, request: FastifyRequest, reply: FastifyReply) => {
    request.log.error(error);

    if (error.statusCode) {
      return reply.send(error);
    }

    return reply.status(500).send({
      statusCode: 500,
      error: "Internal Server Error",
      message: "Internal server error, contact staf",
    });
  },
);

await app.register(apiRoutes, { prefix: "/api" });

//**************************************************
// Start
//**************************************************

try {
  await app.listen({ port: 3000, host: "0.0.0.0" });
} catch (error) {
  app.log.error(error);
  process.exit(1);
}
