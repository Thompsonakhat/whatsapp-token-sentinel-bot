import "dotenv/config";

function safeErr(err) {
  return err?.response?.data?.error?.message ||
    err?.response?.data?.message ||
    err?.message ||
    String(err);
}

process.on("unhandledRejection", (err) => {
  console.error("[fatal] unhandledRejection", { error: safeErr(err) });
  process.exit(1);
});

process.on("uncaughtException", (err) => {
  console.error("[fatal] uncaughtException", { error: safeErr(err) });
  process.exit(1);
});

async function boot() {
  try {
    const [{ createApp }, { cfg, logEnvSanity }, { log }, { connectDb, closeDb }] = await Promise.all([
      import("./bot.js"),
      import("./lib/config.js"),
      import("./lib/logger.js"),
      import("./lib/db.js")
    ]);

    log.info("boot.start", { platform: "whatsapp" });
    logEnvSanity();

    if (!cfg.CMB_WHATSAPP_WEBHOOK_SECRET) {
      log.error("boot.config_missing", {
        key: "CMB_WHATSAPP_WEBHOOK_SECRET",
        guidance: "Set CMB_WHATSAPP_WEBHOOK_SECRET in CookMyBots config."
      });
      process.exit(1);
    }

    await connectDb();

    const app = createApp();
    const server = app.listen(cfg.PORT, () => {
      log.info("boot.started", {
        platform: "whatsapp",
        port: cfg.PORT,
        webhook: "/webhook/cookmybots/whatsapp"
      });
    });

    const memTimer = setInterval(() => {
      const m = process.memoryUsage();
      log.info("mem", {
        rssMB: Math.round(m.rss / 1e6),
        heapUsedMB: Math.round(m.heapUsed / 1e6)
      });
    }, 60_000);

    const shutdown = async () => {
      clearInterval(memTimer);
      await closeDb();
      server.close(() => process.exit(0));
      setTimeout(() => process.exit(0), 5000).unref();
    };

    process.on("SIGTERM", shutdown);
    process.on("SIGINT", shutdown);
  } catch (err) {
    console.error("[fatal] boot.failed", {
      error: safeErr(err),
      hint: "Check that dependencies are installed and all relative imports exist. Run npm run build locally."
    });
    process.exit(1);
  }
}

boot();
