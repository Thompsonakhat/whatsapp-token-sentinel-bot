export function safeErr(err) {
  return err?.response?.data?.error?.message ||
    err?.response?.data?.message ||
    err?.message ||
    String(err);
}

function write(level, event, meta = {}) {
  const payload = {
    level,
    event,
    time: new Date().toISOString(),
    ...meta
  };

  if (level === "error") {
    console.error(JSON.stringify(payload));
    return;
  }

  if (level === "warn") {
    console.warn(JSON.stringify(payload));
    return;
  }

  console.log(JSON.stringify(payload));
}

export const log = {
  info: (event, meta) => write("info", event, meta),
  warn: (event, meta) => write("warn", event, meta),
  error: (event, meta) => write("error", event, meta)
};
