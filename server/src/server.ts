import Fastify, { fastify } from "fastify";
import cors from "@fastify/cors";
import { appRoutes } from "./routes";

const app = Fastify();

// app.register(cors, {
//      origin: ['http://localhost:30000']   // Somente esse endereço pode acessar meu bd
// });

app.register(cors);
app.register(appRoutes);

app.listen({
    port: 3333,
}).then(() => {
    console.log("HTTP Server running");
});
