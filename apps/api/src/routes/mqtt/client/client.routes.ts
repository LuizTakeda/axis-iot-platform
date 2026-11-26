import { HttpErrorSchema, ResponseMessageSchema } from "@repo/types/commons";
import {
  AddClientRoleBodySchema,
  AddClientRoleParamsSchema,
  CreateClientBodySchema,
  DeleteClientParamsSchema,
  DisableClientParamsSchema,
  EnableClientParamsSchema,
  GetClientNamesQuerySchema,
  GetClientNamesResponseSchema,
  GetClientParamsSchema,
  GetClientResponseSchema,
  type GetClientResponseType,
  GetClientsQuerySchema,
  GetClientsResponseSchema,
  RemoveClientRoleBodySchema,
  RemoveClientRoleParamsSchema,
  SetClientPasswordBodySchema,
  SetClientPasswordParamsSchema,
} from "@repo/types/endpoints/mqtt/client";
import { DynsecError, type ClientDetails } from "fastify-mosquitto-dynsec";
import type { FastifyPluginAsyncZod } from "fastify-type-provider-zod";

const SYSTEM_CLIENTS = ["admin"];

const INVALID_CLIENT_NAME = ["names"];

type RawClientDetails = ClientDetails & {
  connections?: Array<{ address: string }>;
};

function formatClientDetails(
  client: RawClientDetails,
): GetClientResponseType["client"] {
  return {
    username: client.username,
    clientid: client.clientid,
    textname: client.textname,
    textdescription: client.textdescription,
    disabled: client.disabled,
    roles: client.roles ?? [],
    groups: client.groups ?? [],
    connections: client.connections ?? [],
  };
}

const clientRoutes: FastifyPluginAsyncZod = async (fastify) => {
  // ==========================================
  // GET / (List Clients Verbose)
  // ==========================================
  fastify.get(
    "",
    {
      onRequest: [fastify.authenticateAdmin],
      schema: {
        tags: ["MQTT Clients", "MQTT"],
        summary: "Lists MQTT clients with details",
        description:
          "Retrieves a paginated list of all clients configured in Mosquitto's Dynamic Security. Requires administrator privileges.",
        security: [{ bearerAuth: [] }],
        querystring: GetClientsQuerySchema,
        response: {
          200: GetClientsResponseSchema,
          500: HttpErrorSchema,
        },
      },
    },
    async (request, reply) => {
      try {
        const data = await fastify.dynsec.client.list({
          count: request.query.count,
          offset: request.query.offset,
          verbose: true,
        });

        const clients = ((data.clients ?? []) as RawClientDetails[]).map(
          formatClientDetails,
        );

        return {
          totalCount: data.totalCount,
          clients,
        };
      } catch (error) {
        if (error instanceof DynsecError) {
          request.log.error(`Mosquitto Error: ${error.message}`);
          return reply.internalServerError("Failed to fetch clients");
        }

        request.log.error(error, "MQTT Broker communication failure");
        return reply.internalServerError("Service temporarily unavailable");
      }
    },
  );

  // ==========================================
  // GET /names (List Clients)
  // ==========================================
  fastify.get(
    "/names",
    {
      onRequest: [fastify.authenticateAdmin],
      schema: {
        tags: ["MQTT Clients", "MQTT"],
        summary: "Lists MQTT client usernames",
        description: "Retrieves a paginated list of client usernames.",
        security: [{ bearerAuth: [] }],
        querystring: GetClientNamesQuerySchema,
        response: {
          200: GetClientNamesResponseSchema,
          500: HttpErrorSchema,
        },
      },
    },
    async (request, reply) => {
      try {
        const data = await fastify.dynsec.client.list({
          count: request.query.count,
          offset: request.query.offset,
          verbose: false,
        });

        return {
          totalCount: data.totalCount,
          clients: (data.clients ?? []) as string[],
        };
      } catch (error) {
        if (error instanceof DynsecError) {
          request.log.error(`Mosquitto Error: ${error.message}`);
          return reply.internalServerError("Failed to fetch client names");
        }

        request.log.error(error, "MQTT Broker communication failure");
        return reply.internalServerError("Service temporarily unavailable");
      }
    },
  );

  // ==========================================
  // GET /:username (Get Client)
  // ==========================================
  fastify.get(
    "/:username",
    {
      onRequest: [fastify.authenticateAdmin],
      schema: {
        tags: ["MQTT Clients", "MQTT"],
        summary: "Retrieves a specific MQTT client",
        description:
          "Fetches detailed configuration of a specific MQTT client.",
        security: [{ bearerAuth: [] }],
        params: GetClientParamsSchema,
        response: {
          200: GetClientResponseSchema,
          404: HttpErrorSchema,
          422: HttpErrorSchema,
          500: HttpErrorSchema,
        },
      },
    },
    async (request, reply) => {
      const { params } = request;

      if (INVALID_CLIENT_NAME.includes(params.username)) {
        return reply.unprocessableEntity(
          "The word 'names' is a reserved keyword.",
        );
      }

      try {
        const client = await fastify.dynsec.client.get({
          username: params.username,
        });

        return {
          client: formatClientDetails(client as RawClientDetails),
        };
      } catch (error) {
        if (error instanceof DynsecError) {
          if (error.message === "Client not found") {
            return reply.notFound("Client not found");
          }

          request.log.error(`Mosquitto Error: ${error.message}`);
          return reply.internalServerError("Failed to fetch client");
        }

        request.log.error(error, "MQTT Broker communication failure");
        return reply.internalServerError("Service temporarily unavailable");
      }
    },
  );

  // ==========================================
  // POST / (Create Client)
  // ==========================================
  fastify.post(
    "",
    {
      onRequest: [fastify.authenticateAdmin],
      schema: {
        tags: ["MQTT Clients", "MQTT"],
        summary: "Creates a new MQTT client",
        description: "Creates a new client in Mosquitto's Dynamic Security.",
        security: [{ bearerAuth: [] }],
        body: CreateClientBodySchema,
        response: {
          200: ResponseMessageSchema,
          404: HttpErrorSchema,
          409: HttpErrorSchema,
          422: HttpErrorSchema,
          500: HttpErrorSchema,
        },
      },
    },
    async (request, reply) => {
      const { body } = request;

      if (INVALID_CLIENT_NAME.includes(body.username)) {
        return reply.unprocessableEntity(
          "The word 'names' is a reserved keyword.",
        );
      }

      if (SYSTEM_CLIENTS.includes(body.username)) {
        return reply.conflict(
          "Cannot create a client with a reserved system name.",
        );
      }

      try {
        await fastify.dynsec.client.create({
          username: body.username,
          password: body.password,
          ...(body.clientid !== undefined && { clientid: body.clientid }),
          ...(body.textname !== undefined && { textname: body.textname }),
          ...(body.textdescription !== undefined && {
            textdescription: body.textdescription,
          }),
          ...(body.groups !== undefined && {
            groups: body.groups.map((g) => ({
              groupname: g.groupname,
              ...(g.priority !== undefined && { priority: g.priority }),
            })),
          }),
          ...(body.roles !== undefined && {
            roles: body.roles.map((r) => ({
              rolename: r.rolename,
              ...(r.priority !== undefined && { priority: r.priority }),
            })),
          }),
        });

        return { message: "Client created" };
      } catch (error) {
        if (error instanceof DynsecError) {
          if (error.message === "Client already exists") {
            return reply.conflict("Client already exists");
          }

          if (error.message === "Group not found") {
            return reply.notFound("Group not found");
          }

          if (error.message === "Role not found") {
            return reply.notFound("Role not found");
          }

          request.log.error(`Mosquitto Error: ${error.message}`);
          return reply.internalServerError("Failed to create client");
        }

        request.log.error(error, "MQTT Broker communication failure");
        return reply.internalServerError("Service temporarily unavailable");
      }
    },
  );

  // ==========================================
  // DELETE /:username (Delete Client)
  // ==========================================
  fastify.delete(
    "/:username",
    {
      onRequest: [fastify.authenticateAdmin],
      schema: {
        tags: ["MQTT Clients", "MQTT"],
        summary: "Deletes a specific MQTT client",
        description:
          "Deletes a specific client in Mosquitto's Dynamic Security.",
        security: [{ bearerAuth: [] }],
        params: DeleteClientParamsSchema,
        response: {
          200: ResponseMessageSchema,
          403: HttpErrorSchema,
          404: HttpErrorSchema,
          422: HttpErrorSchema,
          500: HttpErrorSchema,
        },
      },
    },
    async (request, reply) => {
      const { params } = request;

      if (INVALID_CLIENT_NAME.includes(params.username)) {
        return reply.unprocessableEntity(
          "The word 'names' is a reserved keyword.",
        );
      }

      if (SYSTEM_CLIENTS.includes(params.username)) {
        return reply.forbidden(
          `The client '${params.username}' is a system client and cannot be deleted.`,
        );
      }

      try {
        await fastify.dynsec.client.remove({
          username: params.username,
        });

        return { message: "Client deleted" };
      } catch (error) {
        if (error instanceof DynsecError) {
          if (error.message === "Client not found") {
            return reply.notFound("Client not found");
          }

          request.log.error(`Mosquitto Error: ${error.message}`);
          return reply.internalServerError("Failed to delete client");
        }

        request.log.error(error, "MQTT Broker communication failure");
        return reply.internalServerError("Service temporarily unavailable");
      }
    },
  );

  // ==========================================
  // POST /:username/enable (Enable Client)
  // ==========================================
  fastify.post(
    "/:username/enable",
    {
      onRequest: [fastify.authenticateAdmin],
      schema: {
        tags: ["MQTT Clients", "MQTT"],
        summary: "Enables an MQTT client",
        description:
          "Enables a specific client in Mosquitto's Dynamic Security.",
        security: [{ bearerAuth: [] }],
        params: EnableClientParamsSchema,
        response: {
          200: ResponseMessageSchema,
          404: HttpErrorSchema,
          422: HttpErrorSchema,
          500: HttpErrorSchema,
        },
      },
    },
    async (request, reply) => {
      const { params } = request;

      if (INVALID_CLIENT_NAME.includes(params.username)) {
        return reply.unprocessableEntity(
          "The word 'names' is a reserved keyword.",
        );
      }

      try {
        await fastify.dynsec.client.enable({
          username: params.username,
        });

        return { message: "Client enabled" };
      } catch (error) {
        if (error instanceof DynsecError) {
          if (error.message === "Client not found") {
            return reply.notFound("Client not found");
          }

          request.log.error(`Mosquitto Error: ${error.message}`);
          return reply.internalServerError("Failed to enable client");
        }

        request.log.error(error, "MQTT Broker communication failure");
        return reply.internalServerError("Service temporarily unavailable");
      }
    },
  );

  // ==========================================
  // POST /:username/disable (Disable Client)
  // ==========================================
  fastify.post(
    "/:username/disable",
    {
      onRequest: [fastify.authenticateAdmin],
      schema: {
        tags: ["MQTT Clients", "MQTT"],
        summary: "Disables an MQTT client",
        description:
          "Disables a specific client in Mosquitto's Dynamic Security.",
        security: [{ bearerAuth: [] }],
        params: DisableClientParamsSchema,
        response: {
          200: ResponseMessageSchema,
          403: HttpErrorSchema,
          404: HttpErrorSchema,
          422: HttpErrorSchema,
          500: HttpErrorSchema,
        },
      },
    },
    async (request, reply) => {
      const { params } = request;

      if (INVALID_CLIENT_NAME.includes(params.username)) {
        return reply.unprocessableEntity(
          "The word 'names' is a reserved keyword.",
        );
      }

      if (SYSTEM_CLIENTS.includes(params.username)) {
        return reply.forbidden(
          `The client '${params.username}' is a system client and cannot be disabled.`,
        );
      }

      try {
        await fastify.dynsec.client.disable({
          username: params.username,
        });

        return { message: "Client disabled" };
      } catch (error) {
        if (error instanceof DynsecError) {
          if (error.message === "Client not found") {
            return reply.notFound("Client not found");
          }

          request.log.error(`Mosquitto Error: ${error.message}`);
          return reply.internalServerError("Failed to disable client");
        }

        request.log.error(error, "MQTT Broker communication failure");
        return reply.internalServerError("Service temporarily unavailable");
      }
    },
  );

  // ==========================================
  // PUT /:username/password (Set Client Password)
  // ==========================================
  fastify.put(
    "/:username/password",
    {
      onRequest: [fastify.authenticateAdmin],
      schema: {
        tags: ["MQTT Clients", "MQTT"],
        summary: "Updates an MQTT client's password",
        description:
          "Updates the password of a specific client in Mosquitto's Dynamic Security.",
        security: [{ bearerAuth: [] }],
        params: SetClientPasswordParamsSchema,
        body: SetClientPasswordBodySchema,
        response: {
          200: ResponseMessageSchema,
          403: HttpErrorSchema,
          404: HttpErrorSchema,
          422: HttpErrorSchema,
          500: HttpErrorSchema,
        },
      },
    },
    async (request, reply) => {
      const { params, body } = request;

      if (INVALID_CLIENT_NAME.includes(params.username)) {
        return reply.unprocessableEntity(
          "The word 'names' is a reserved keyword.",
        );
      }

      if (SYSTEM_CLIENTS.includes(params.username)) {
        return reply.forbidden(
          `The password for system client '${params.username}' cannot be modified directly.`,
        );
      }

      try {
        await fastify.dynsec.client.setPassword({
          username: params.username,
          password: body.password,
        });

        return { message: "Password updated" };
      } catch (error) {
        if (error instanceof DynsecError) {
          if (error.message === "Client not found") {
            return reply.notFound("Client not found");
          }

          request.log.error(`Mosquitto Error: ${error.message}`);
          return reply.internalServerError("Failed to set client password");
        }

        request.log.error(error, "MQTT Broker communication failure");
        return reply.internalServerError("Service temporarily unavailable");
      }
    },
  );

  // ==========================================
  // POST /:username/roles (Add Client Role)
  // ==========================================
  fastify.post(
    "/:username/roles",
    {
      onRequest: [fastify.authenticateAdmin],
      schema: {
        tags: ["MQTT Clients", "MQTT"],
        summary: "Adds a role to a client",
        description:
          "Adds a role to a specific client in Mosquitto's Dynamic Security.",
        security: [{ bearerAuth: [] }],
        params: AddClientRoleParamsSchema,
        body: AddClientRoleBodySchema,
        response: {
          200: ResponseMessageSchema,
          403: HttpErrorSchema,
          404: HttpErrorSchema,
          422: HttpErrorSchema,
          500: HttpErrorSchema,
        },
      },
    },
    async (request, reply) => {
      const { params, body } = request;

      if (INVALID_CLIENT_NAME.includes(params.username)) {
        return reply.unprocessableEntity(
          "The word 'names' is a reserved keyword.",
        );
      }

      if (SYSTEM_CLIENTS.includes(params.username)) {
        return reply.forbidden(
          `System client '${params.username}' roles cannot be modified directly.`,
        );
      }

      try {
        await fastify.dynsec.client.addRole({
          username: params.username,
          rolename: body.rolename,
          ...(body.priority !== undefined && { priority: body.priority }),
        });

        return { message: "Role added to client" };
      } catch (error) {
        if (error instanceof DynsecError) {
          if (error.message === "Client not found") {
            return reply.notFound("Client not found");
          }

          if (error.message === "Role not found") {
            return reply.notFound("Role not found");
          }

          request.log.error(`Mosquitto Error: ${error.message}`);
          return reply.internalServerError("Failed to add role to client");
        }

        request.log.error(error, "MQTT Broker communication failure");
        return reply.internalServerError("Service temporarily unavailable");
      }
    },
  );

  // ==========================================
  // DELETE /:username/roles (Remove Client Role)
  // ==========================================
  fastify.delete(
    "/:username/roles",
    {
      onRequest: [fastify.authenticateAdmin],
      schema: {
        tags: ["MQTT Clients", "MQTT"],
        summary: "Removes a role from a client",
        description:
          "Removes a role from a specific client in Mosquitto's Dynamic Security.",
        security: [{ bearerAuth: [] }],
        params: RemoveClientRoleParamsSchema,
        body: RemoveClientRoleBodySchema,
        response: {
          200: ResponseMessageSchema,
          403: HttpErrorSchema,
          404: HttpErrorSchema,
          422: HttpErrorSchema,
          500: HttpErrorSchema,
        },
      },
    },
    async (request, reply) => {
      const { params, body } = request;

      if (INVALID_CLIENT_NAME.includes(params.username)) {
        return reply.unprocessableEntity(
          "The word 'names' is a reserved keyword.",
        );
      }

      if (SYSTEM_CLIENTS.includes(params.username)) {
        return reply.forbidden(
          `System client '${params.username}' roles cannot be modified directly.`,
        );
      }

      try {
        await fastify.dynsec.client.removeRole({
          username: params.username,
          rolename: body.rolename,
        });

        return { message: "Role removed from client" };
      } catch (error) {
        if (error instanceof DynsecError) {
          if (error.message === "Client not found") {
            return reply.notFound("Client not found");
          }

          if (
            error.message === "Role not found" ||
            error.message === "Role not associated with client"
          ) {
            return reply.notFound(error.message);
          }

          request.log.error(`Mosquitto Error: ${error.message}`);
          return reply.internalServerError("Failed to remove role from client");
        }

        request.log.error(error, "MQTT Broker communication failure");
        return reply.internalServerError("Service temporarily unavailable");
      }
    },
  );
};

export default clientRoutes;
