import express from "express";
import { cfg } from "./lib/config.js";
import { log, safeErr } from "./lib/logger.js";
import { handleWhatsAppMessage } from "./handlers/messages.js";

export function createApp() {
  const app = express();
  app.use(express.json({ limit: "2mb" }));

  app.get("/", (_req, res) => {
    res.status(200).send("Token Sentinel Bot OK");
  });

  app.get("/health", (_req, res) => {
    res.status(200).json({
      ok: true,
      platform: "whatsapp",
      aiConfigured: Boolean(cfg.COOKMYBOTS_AI_ENDPOINT && cfg.COOKMYBOTS_AI_KEY),
      mongoConfigured: Boolean(cfg.MONGODB_URI)
    });
  });

  app.post("/webhook/cookmybots/whatsapp", async (req, res) => {
    try {
      const expected = String(cfg.CMB_WHATSAPP_WEBHOOK_SECRET || "").trim();
      const got = String(req.headers["x-cookmybots-webhook-secret"] || "").trim();

      if (!expected || got !== expected) {
        log.warn("webhook.unauthorized", {
          platform: "whatsapp",
          secretSet: Boolean(expected),
          headerSet: Boolean(got)
        });
        return res.status(401).json({ ok: false, error: "unauthorized" });
      }

      const reply = await handleWhatsAppMessage(req.body || {});
      return res.status(200).json({
        ok: true,
        reply: String(reply || "").slice(0, 3900)
      });
    } catch (err) {
      log.error("webhook.failure", {
        platform: "whatsapp",
        error: safeErr(err)
      });
      return res.status(500).json({
        ok: true,
        reply: "I had trouble reading that message. Please try again."
      });
    }
  });

  app.post("/test", async (req, res) => {
    try {
      const reply = await handleWhatsAppMessage({
        from: "local-user@s.whatsapp.net",
        chatId: "local-user@s.whatsapp.net",
        text: String(req.body?.text || ""),
        messageId: "local-test",
        platform: "whatsapp",
        source: "local"
      });
      return res.json({ ok: true, reply });
    } catch (err) {
      return res.status(500).json({ ok: false, error: safeErr(err) });
    }
  });

  return app;
}
