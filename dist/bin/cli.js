#!/usr/bin/env node
"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const commander_1 = require("commander");
const server_1 = require("../server");
if (!process.env.NODE_ENV) {
    Object.assign(process.env, { NODE_ENV: "production" });
}
const program = new commander_1.Command();
program
    .name("wifi-file-sharer")
    .description("Robust file sharing over WiFi with a web UI")
    .version("1.0.0")
    .option("-p, --port <number>", "Port to run the server on", "3000")
    .option("-h, --host <string>", "Host to bind the server to", "0.0.0.0")
    .action((options) => {
    const port = parseInt(options.port, 10);
    const hostname = options.host;
    if (isNaN(port)) {
        console.error("Error: Port must be a number");
        process.exit(1);
    }
    (0, server_1.startServer)({ port, hostname }).catch((err) => {
        console.error("Failed to start server:", err);
        process.exit(1);
    });
});
program.parse(process.argv);
