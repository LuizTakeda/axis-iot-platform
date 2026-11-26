import fp from "fastify-plugin";
import dynsecPlugin from "fastify-mosquitto-dynsec";

export default fp(async (fastify) => {
  await fastify.register(dynsecPlugin, {
    url: fastify.config.MQTT_BROKER_URL,
    adminName: fastify.config.MQTT_BROKER_USERNAME,
    adminPassword: fastify.config.MQTT_BROKER_PASSWORD,
    clientId: `api-client-${process.pid}`,
    maxQueueSize: 100,
    failFast: false,
    reconnectPeriod: 1000,
    commandResponseTimeout: 3000,
  });
});
