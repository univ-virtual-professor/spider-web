import type { VercelRequest } from "@vercel/node";

const WEBHOOK_URL = process.env.DISCORD_ERROR_WEBHOOK_URL;

const COLORS = {
  error: 0xe74c3c,
  warning: 0xf39c12,
  info: 0x3498db,
  success: 0x2ecc71,
} as const;

type EmbedField = { name: string; value: string; inline?: boolean };

const DISABLED = true; // discord logging off for master_revamped, remove to re-enable

async function postEmbed(payload: object): Promise<void> {
  if (DISABLED || !WEBHOOK_URL) return;
  try {
    await fetch(WEBHOOK_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
  } catch {
    // silent — never let logging break the response
  }
}

export async function sendDiscordEmbed(
  level: keyof typeof COLORS,
  title: string,
  fields: EmbedField[]
): Promise<void> {
  await postEmbed({
    embeds: [
      {
        title: title.slice(0, 256),
        color: COLORS[level],
        fields: fields.map((f) => ({
          ...f,
          value: f.value.slice(0, 1024) || "​",
        })),
        timestamp: new Date().toISOString(),
      },
    ],
  });
}

export async function notifyDiscord(
  error: unknown,
  req?: VercelRequest,
  context?: string
): Promise<void> {
  const err = error instanceof Error ? error : new Error(String(error));
  const stack = (err.stack || err.message).slice(0, 1800);
  const route = req ? `${req.method ?? "?"} ${req.url ?? "?"}` : "unknown";
  const title = `[${context ?? route}] ${err.message}`;

  await postEmbed({
    embeds: [
      {
        title: title.slice(0, 256),
        color: COLORS.error,
        fields: [
          { name: "Route", value: route, inline: true },
          { name: "Time", value: new Date().toISOString(), inline: true },
          { name: "Stack", value: `\`\`\`\n${stack}\n\`\`\`` },
        ],
      },
    ],
  });
}
