#!/usr/bin/env node
"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const commander_1 = require("commander");
const server_1 = require("../server");
const package_json_1 = __importDefault(require("../package.json"));
if (!process.env.NODE_ENV) {
    Object.assign(process.env, { NODE_ENV: "production" });
}
const program = new commander_1.Command();
program
    .name("wifi-file-sharer")
    .description("Robust file sharing over WiFi with a web UI")
    .version(package_json_1.default.version)
    .option("-p, --port <number>", "Port to run the server on", "3000")
    .option("-h, --host <string>", "Host to bind the server to", "0.0.0.0")
    .option("--https", "Enable HTTPS (auto self-signed certificate if none provided)")
    .option("--tls-cert <path>", "Path to a TLS certificate (implies HTTPS)")
    .option("--tls-key <path>", "Path to a TLS private key (implies HTTPS)")
    .option("--data-dir <path>", "Directory for the database, uploads and certificates")
    .action((options) => {
    const port = parseInt(options.port, 10);
    const hostname = options.host;
    if (isNaN(port)) {
        console.error("Error: Port must be a number");
        process.exit(1);
    }
    (0, server_1.startServer)({
        port,
        hostname,
        https: options.https === true,
        tlsCert: options.tlsCert,
        tlsKey: options.tlsKey,
        dataDir: options.dataDir,
    }).catch((err) => {
        console.error("Failed to start server:", err);
        process.exit(1);
    });
});
program.parse(process.argv);
