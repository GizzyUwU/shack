import {
  App,
  LogLevel,
} from "@slack/bolt";
import fs from "fs";
import path from "path";
import * as Sentry from "@sentry/bun";
import type { WebClient } from "@slack/web-api";
import { configure, getConsoleSink, getLogger } from "@logtape/logtape";
import { getSentrySink } from "@logtape/sentry";
import { DEFAULT_REDACT_FIELDS, redactByField } from "@logtape/redaction";
import Shop from "./lib/shop";
let sentryEnabled = false;
let prefix: string;
const registeredInitModules = new Set<string>();
const sentryAdapter = redactByField(
  getSentrySink({
    enableBreadcrumbs: true,
    beforeSend(record) {
      if (
        typeof record.rawMessage === "string" &&
        record.rawMessage.includes("Request failed with status code 500")
      ) {
        return null;
      }

      const err = record.properties?.["error"] as any;
      if (
        err?.name === "AxiosError" &&
        typeof err?.status === "number" &&
        err.status >= 500
      ) {
        return null;
      }

      return record;
    },
  }),
  {
    fieldPatterns: [
      /api[-_]?key/i,
      /ft_sk_[A-Za-z0-9_-]*'/gi,
      /api_key"\s*=\s*'[^']*'/gi,
      /Bearer\s+[A-Za-z0-9\-._~+/]+=*/gi,
      ...DEFAULT_REDACT_FIELDS,
    ],
    action: () => "[REDACTED]",
  },
);

const consoleAdapter = redactByField(getConsoleSink(), {
  fieldPatterns: [
    /api[-_]?key/i,
    /ft_sk_[A-Za-z0-9_-]*'/gi,
    /api_key"\s*=\s*'[^']*'/gi,
    ...DEFAULT_REDACT_FIELDS,
  ],
  action: () => "[REDACTED]",
});

if (process.env["SENTRY_DSN"]) {
  Sentry.init({
    dsn: process.env["SENTRY_DSN"],
    release: process.env["SENTRY_NAME"] || "Shack",
    integrations: [],
    tracesSampleRate: 0,
    sendDefaultPii: true,
  });
  sentryEnabled = true;
}

await configure({
  sinks: {
    sentry: sentryAdapter,
    console: consoleAdapter,
  },
  loggers: [
    { category: ["logtape", "meta"], sinks: ["console"], lowestLevel: "error" },
    {
      category: ["shack"],
      sinks: [sentryEnabled ? "sentry" : "console"],
      lowestLevel: "warning",
    },
  ],
});

export const logger = getLogger(["Shack"]);

function checkEnvs(name: string, optional: boolean): string {
  const value = process.env[name];
  if (!value && !optional) {
    throw new Error(`Missing environment variable: ${name}`);
  } else if (!value && optional) {
    return "";
  } else if (value) {
    return value;
  } else {
    return "";
  }
}

export const shopClient = checkEnvs("SHOP_TOKEN", false)
  ? new Shop(process.env["SHOP_TOKEN"]!, logger)
  : null;

const app = new App({
  signingSecret: checkEnvs("SIGNING_SECRET", false),
  token: checkEnvs("BOT_TOKEN", false),
  appToken: checkEnvs("APP_TOKEN", true),
  socketMode: process.env["APP_TOKEN"]
    ? process.env["SOCKET_MODE"] === "true"
    : false,
  logLevel: LogLevel.ERROR,
  customRoutes: [
    {
      path: "/healthcheck",
      method: ["GET"],
      handler: (_, res) => {
        res.writeHead(200);
        res.end("I'm ogay!");
      },
    },
  ]
});

export interface RequestHandler {
  logger: typeof logger;
  client: WebClient;
  Sentry: typeof import("@sentry/bun");
  shopClient: Shop | null;
  callbackId?: string;
}

const main = {
  client: app.client,
  logger,
  Sentry,
  shopClient
};

let handlersRunning = false;

async function loadHandlers() {
  if (handlersRunning) {
    logger.warn(
      "[Shack] Skipping handler load because previous run is still active",
    );
    return;
  }

  handlersRunning = true;

  try {
    registeredInitModules.clear();
    const handlerDir = path.resolve(__dirname, "./handlers");
    const files = fs
      .readdirSync(handlerDir)
      .filter((f) => f.endsWith(".ts") || f.endsWith(".js"));

    for (const file of files) {
      try {
        const importFile = await import(path.join(handlerDir, file));
        const mod = importFile.default ?? importFile;
        if (!mod?.name || typeof mod.execute !== "function") continue;
        if (registeredInitModules.has(mod.name)) {
          throw new Error(
            `[Shack] Duplicate init handler name "${mod.name}" in ${file}`,
          );
        }
        registeredInitModules.add(mod.name);
        try {
          const ctxLogger = logger.with({
            data: {
              module: mod.name,
              file,
            },
          });
          await mod.execute({
            logger: ctxLogger,
            client: app.client,
            shopClient,
            Sentry,
          } satisfies RequestHandler);
        } catch (err) {
          const ctx = logger.with({
            data: {
              module: mod.name,
              file,
            },
          });
          ctx.error("Failed to execute handler", {
            error: err,
          });
        }
      } catch (err) {
        logger.error("Failed to execute handler", {
          data: {
            file,
          },
          error: err,
        });
      }
    }
  } finally {
    handlersRunning = false;
  }
}

(async () => {
  try {
    app.logger.setName("[Shack]");
    if (
      process.env["SOCKET_MODE"] === "true" &&
      process.env["APP_TOKEN"] &&
      !process.env["KEEP_PORT_USAGE"]
    ) {
      await app.start();
      console.info("[Shack] Running as Socket Mode");
    } else {
      const port = process.env["PORT"] ? parseInt(process.env["PORT"]) : 3000;
      await app.start({
        port,
      });
      console.info("[Shack] Running on port:", port);
    }

    async function handlerLoop() {
      await loadHandlers();
      setTimeout(handlerLoop, 120 * 1000);
    }

    handlerLoop();
  } catch (err) {
    logger.error({ error: err });
  }
})();

process.on("SIGTERM", async () => {
  await app.stop();
  process.exit(0);
});

export default main;
