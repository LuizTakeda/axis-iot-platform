import { type FastifyPluginAsync } from "fastify";

const rootRoutes: FastifyPluginAsync = async (fastify) => {
  fastify.get(
    "/",
    {
      schema: {
        tags: ["API Core"],
      },
    },
    async () => {
      return {
        status: "ok",
      };
    },
  );
};

export default rootRoutes;
