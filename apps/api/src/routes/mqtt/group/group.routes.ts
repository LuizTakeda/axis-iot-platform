import { HttpErrorSchema, ResponseMessageSchema } from "@repo/types/commons";
import {
  AddGroupClientBodySchema,
  AddGroupClientParamsSchema,
  AddGroupRoleBodySchema,
  AddGroupRoleParamsSchema,
  CreateGroupBodySchema,
  DeleteGroupParamsSchema,
  GetGroupNamesQuerySchema,
  GetGroupNamesResponseSchema,
  GetGroupParamsSchema,
  GetGroupResponseSchema,
  type GetGroupResponseType,
  GetGroupsQuerySchema,
  GetGroupsResponseSchema,
  RemoveGroupClientBodySchema,
  RemoveGroupClientParamsSchema,
  RemoveGroupRoleBodySchema,
  RemoveGroupRoleParamsSchema,
} from "@repo/types/endpoints/mqtt/group";
import { DynsecError, type GroupDetails } from "fastify-mosquitto-dynsec";
import type { FastifyPluginAsyncZod } from "fastify-type-provider-zod";

const SYSTEM_GROUPS = ["admin"];

const INVALID_GROUP_NAME = ["names"];

function formatGroupDetails(
  group: GroupDetails,
): GetGroupResponseType["group"] {
  return {
    groupname: group.groupname,
    textname: group.textname,
    textdescription: group.textdescription,
    roles: group.roles ?? [],
    clients: group.clients ?? [],
  };
}

const groupRoutes: FastifyPluginAsyncZod = async (fastify) => {
  // ==========================================
  // GET / (List Groups Verbose)
  // ==========================================
  fastify.get(
    "",
    {
      onRequest: [fastify.authenticateAdmin],
      schema: {
        tags: ["MQTT Groups", "MQTT"],
        summary: "Lists MQTT groups with details",
        description:
          "Retrieves a paginated list of all groups configured in Mosquitto's Dynamic Security. Requires administrator privileges.",
        security: [{ bearerAuth: [] }],
        querystring: GetGroupsQuerySchema,
        response: {
          200: GetGroupsResponseSchema,
          500: HttpErrorSchema,
        },
      },
    },
    async (request, reply) => {
      try {
        const data = await fastify.dynsec.group.list({
          count: request.query.count,
          offset: request.query.offset,
          verbose: true,
        });

        const groups = ((data.groups ?? []) as GroupDetails[]).map(
          formatGroupDetails,
        );

        return {
          totalCount: data.totalCount,
          groups,
        };
      } catch (error) {
        if (error instanceof DynsecError) {
          request.log.error(`Mosquitto Error: ${error.message}`);
          return reply.internalServerError("Failed to fetch groups");
        }

        request.log.error(error, "MQTT Broker communication failure");
        return reply.internalServerError("Service temporarily unavailable");
      }
    },
  );

  // ==========================================
  // GET /names (List Group Names)
  // ==========================================
  fastify.get(
    "/names",
    {
      onRequest: [fastify.authenticateAdmin],
      schema: {
        tags: ["MQTT Groups", "MQTT"],
        summary: "Lists MQTT group names",
        description: "Retrieves a paginated list of group names.",
        security: [{ bearerAuth: [] }],
        querystring: GetGroupNamesQuerySchema,
        response: {
          200: GetGroupNamesResponseSchema,
          500: HttpErrorSchema,
        },
      },
    },
    async (request, reply) => {
      try {
        const data = await fastify.dynsec.group.list({
          count: request.query.count,
          offset: request.query.offset,
          verbose: false,
        });

        return {
          totalCount: data.totalCount,
          groups: (data.groups ?? []) as string[],
        };
      } catch (error) {
        if (error instanceof DynsecError) {
          request.log.error(`Mosquitto Error: ${error.message}`);
          return reply.internalServerError("Failed to fetch group names");
        }

        request.log.error(error, "MQTT Broker communication failure");
        return reply.internalServerError("Service temporarily unavailable");
      }
    },
  );

  // ==========================================
  // GET /:groupname (Get Group)
  // ==========================================
  fastify.get(
    "/:groupname",
    {
      onRequest: [fastify.authenticateAdmin],
      schema: {
        tags: ["MQTT Groups", "MQTT"],
        summary: "Retrieves a specific MQTT group",
        description: "Fetches detailed configuration of a specific MQTT group.",
        security: [{ bearerAuth: [] }],
        params: GetGroupParamsSchema,
        response: {
          200: GetGroupResponseSchema,
          404: HttpErrorSchema,
          422: HttpErrorSchema,
          500: HttpErrorSchema,
        },
      },
    },
    async (request, reply) => {
      const { params } = request;

      if (INVALID_GROUP_NAME.includes(params.groupname)) {
        return reply.unprocessableEntity(
          "The word 'names' is a reserved keyword.",
        );
      }

      try {
        const group = await fastify.dynsec.group.get({
          groupname: params.groupname,
        });

        return {
          group: formatGroupDetails(group),
        };
      } catch (error) {
        if (error instanceof DynsecError) {
          if (error.message === "Group not found") {
            return reply.notFound("Group not found");
          }

          request.log.error(`Mosquitto Error: ${error.message}`);
          return reply.internalServerError("Failed to fetch group");
        }

        request.log.error(error, "MQTT Broker communication failure");
        return reply.internalServerError("Service temporarily unavailable");
      }
    },
  );

  // ==========================================
  // POST / (Create Group)
  // ==========================================
  fastify.post(
    "",
    {
      onRequest: [fastify.authenticateAdmin],
      schema: {
        tags: ["MQTT Groups", "MQTT"],
        summary: "Creates a new MQTT group",
        description: "Creates a new group in Mosquitto's Dynamic Security.",
        security: [{ bearerAuth: [] }],
        body: CreateGroupBodySchema,
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

      if (INVALID_GROUP_NAME.includes(body.groupname)) {
        return reply.unprocessableEntity(
          "The word 'names' is a reserved keyword.",
        );
      }

      if (SYSTEM_GROUPS.includes(body.groupname)) {
        return reply.conflict(
          "Cannot create a group with a reserved system name.",
        );
      }

      try {
        await fastify.dynsec.group.create({
          groupname: body.groupname,
          ...(body.roles !== undefined && {
            roles: body.roles.map((r) => ({
              rolename: r.rolename,
              ...(r.priority !== undefined && { priority: r.priority }),
            })),
          }),
        });

        return { message: "Group created" };
      } catch (error) {
        if (error instanceof DynsecError) {
          if (error.message === "Group already exists") {
            return reply.conflict("Group already exists");
          }

          if (error.message === "Role not found") {
            return reply.notFound("Role not found");
          }

          request.log.error(`Mosquitto Error: ${error.message}`);
          return reply.internalServerError("Failed to create group");
        }

        request.log.error(error, "MQTT Broker communication failure");
        return reply.internalServerError("Service temporarily unavailable");
      }
    },
  );

  // ==========================================
  // DELETE /:groupname (Delete Group)
  // ==========================================
  fastify.delete(
    "/:groupname",
    {
      onRequest: [fastify.authenticateAdmin],
      schema: {
        tags: ["MQTT Groups", "MQTT"],
        summary: "Deletes a specific MQTT group",
        description:
          "Deletes a specific group in Mosquitto's Dynamic Security.",
        security: [{ bearerAuth: [] }],
        params: DeleteGroupParamsSchema,
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

      if (INVALID_GROUP_NAME.includes(params.groupname)) {
        return reply.unprocessableEntity(
          "The word 'names' is a reserved keyword.",
        );
      }

      if (SYSTEM_GROUPS.includes(params.groupname)) {
        return reply.forbidden(
          `The group '${params.groupname}' is a system group and cannot be deleted.`,
        );
      }

      try {
        await fastify.dynsec.group.remove({
          groupname: params.groupname,
        });

        return { message: "Group deleted" };
      } catch (error) {
        if (error instanceof DynsecError) {
          if (error.message === "Group not found") {
            return reply.notFound("Group not found");
          }

          request.log.error(`Mosquitto Error: ${error.message}`);
          return reply.internalServerError("Failed to delete group");
        }

        request.log.error(error, "MQTT Broker communication failure");
        return reply.internalServerError("Service temporarily unavailable");
      }
    },
  );

  // ==========================================
  // POST /:groupname/clients (Add Group Client)
  // ==========================================
  fastify.post(
    "/:groupname/clients",
    {
      onRequest: [fastify.authenticateAdmin],
      schema: {
        tags: ["MQTT Groups", "MQTT"],
        summary: "Adds a client to a group",
        description:
          "Adds a client to a specific group in Mosquitto's Dynamic Security.",
        security: [{ bearerAuth: [] }],
        params: AddGroupClientParamsSchema,
        body: AddGroupClientBodySchema,
        response: {
          200: ResponseMessageSchema,
          403: HttpErrorSchema,
          404: HttpErrorSchema,
          409: HttpErrorSchema,
          422: HttpErrorSchema,
          500: HttpErrorSchema,
        },
      },
    },
    async (request, reply) => {
      const { params, body } = request;

      if (INVALID_GROUP_NAME.includes(params.groupname)) {
        return reply.unprocessableEntity(
          "The word 'names' is a reserved keyword.",
        );
      }

      if (SYSTEM_GROUPS.includes(params.groupname)) {
        return reply.forbidden(
          `System group '${params.groupname}' clients cannot be modified directly.`,
        );
      }

      try {
        await fastify.dynsec.group.addClient({
          groupname: params.groupname,
          username: body.username,
          ...(body.priority !== undefined && { priority: body.priority }),
        });

        return { message: "Client added to group" };
      } catch (error) {
        if (error instanceof DynsecError) {
          if (error.message === "Group not found") {
            return reply.notFound("Group not found");
          }

          if (error.message === "Client not found") {
            return reply.notFound("Client not found");
          }

          if (
            error.message === "Client is already in this group" ||
            error.message === "Client already in group"
          ) {
            return reply.conflict("Client is already in this group");
          }

          request.log.error(`Mosquitto Error: ${error.message}`);
          return reply.internalServerError("Failed to add client to group");
        }

        request.log.error(error, "MQTT Broker communication failure");
        return reply.internalServerError("Service temporarily unavailable");
      }
    },
  );

  // ==========================================
  // DELETE /:groupname/clients (Remove Group Client)
  // ==========================================
  fastify.delete(
    "/:groupname/clients",
    {
      onRequest: [fastify.authenticateAdmin],
      schema: {
        tags: ["MQTT Groups", "MQTT"],
        summary: "Removes a client from a group",
        description:
          "Removes a client from a specific group in Mosquitto's Dynamic Security.",
        security: [{ bearerAuth: [] }],
        params: RemoveGroupClientParamsSchema,
        body: RemoveGroupClientBodySchema,
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

      if (INVALID_GROUP_NAME.includes(params.groupname)) {
        return reply.unprocessableEntity(
          "The word 'names' is a reserved keyword.",
        );
      }

      if (SYSTEM_GROUPS.includes(params.groupname)) {
        return reply.forbidden(
          `System group '${params.groupname}' clients cannot be modified directly.`,
        );
      }

      try {
        await fastify.dynsec.group.removeClient({
          groupname: params.groupname,
          username: body.username,
        });

        return { message: "Client removed from group" };
      } catch (error) {
        if (error instanceof DynsecError) {
          if (error.message === "Group not found") {
            return reply.notFound("Group not found");
          }

          if (
            error.message === "Client not found" ||
            error.message === "Client not in group" ||
            error.message === "Client is not in group"
          ) {
            return reply.notFound(error.message);
          }

          request.log.error(`Mosquitto Error: ${error.message}`);
          return reply.internalServerError(
            "Failed to remove client from group",
          );
        }

        request.log.error(error, "MQTT Broker communication failure");
        return reply.internalServerError("Service temporarily unavailable");
      }
    },
  );

  // ==========================================
  // POST /:groupname/roles (Add Group Role)
  // ==========================================
  fastify.post(
    "/:groupname/roles",
    {
      onRequest: [fastify.authenticateAdmin],
      schema: {
        tags: ["MQTT Groups", "MQTT"],
        summary: "Adds a role to a group",
        description:
          "Adds a role to a specific group in Mosquitto's Dynamic Security.",
        security: [{ bearerAuth: [] }],
        params: AddGroupRoleParamsSchema,
        body: AddGroupRoleBodySchema,
        response: {
          200: ResponseMessageSchema,
          403: HttpErrorSchema,
          404: HttpErrorSchema,
          409: HttpErrorSchema,
          422: HttpErrorSchema,
          500: HttpErrorSchema,
        },
      },
    },
    async (request, reply) => {
      const { params, body } = request;

      if (INVALID_GROUP_NAME.includes(params.groupname)) {
        return reply.unprocessableEntity(
          "The word 'names' is a reserved keyword.",
        );
      }

      if (SYSTEM_GROUPS.includes(params.groupname)) {
        return reply.forbidden(
          `System group '${params.groupname}' roles cannot be modified directly.`,
        );
      }

      try {
        await fastify.dynsec.group.addRole({
          groupname: params.groupname,
          rolename: body.rolename,
          ...(body.priority !== undefined && { priority: body.priority }),
        });

        return { message: "Role added to group" };
      } catch (error) {
        if (error instanceof DynsecError) {
          if (error.message === "Group not found") {
            return reply.notFound("Group not found");
          }

          if (error.message === "Role not found") {
            return reply.notFound("Role not found");
          }

          if (
            error.message === "Group is already in this role" ||
            error.message === "Role already in group"
          ) {
            return reply.conflict(error.message);
          }

          request.log.error(`Mosquitto Error: ${error.message}`);
          return reply.internalServerError("Failed to add role to group");
        }

        request.log.error(error, "MQTT Broker communication failure");
        return reply.internalServerError("Service temporarily unavailable");
      }
    },
  );

  // ==========================================
  // DELETE /:groupname/roles (Remove Group Role)
  // ==========================================
  fastify.delete(
    "/:groupname/roles",
    {
      onRequest: [fastify.authenticateAdmin],
      schema: {
        tags: ["MQTT Groups", "MQTT"],
        summary: "Removes a role from a group",
        description:
          "Removes a role from a specific group in Mosquitto's Dynamic Security.",
        security: [{ bearerAuth: [] }],
        params: RemoveGroupRoleParamsSchema,
        body: RemoveGroupRoleBodySchema,
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

      if (INVALID_GROUP_NAME.includes(params.groupname)) {
        return reply.unprocessableEntity(
          "The word 'names' is a reserved keyword.",
        );
      }

      if (SYSTEM_GROUPS.includes(params.groupname)) {
        return reply.forbidden(
          `System group '${params.groupname}' roles cannot be modified directly.`,
        );
      }

      try {
        await fastify.dynsec.group.removeRole({
          groupname: params.groupname,
          rolename: body.rolename,
        });

        return { message: "Role removed from group" };
      } catch (error) {
        if (error instanceof DynsecError) {
          if (error.message === "Group not found") {
            return reply.notFound("Group not found");
          }

          if (
            error.message === "Role not found" ||
            error.message === "Role not associated with group" ||
            error.message === "Role not in group"
          ) {
            return reply.notFound(error.message);
          }

          request.log.error(`Mosquitto Error: ${error.message}`);
          return reply.internalServerError("Failed to remove role from group");
        }

        request.log.error(error, "MQTT Broker communication failure");
        return reply.internalServerError("Service temporarily unavailable");
      }
    },
  );
};

export default groupRoutes;
