const DISABLED = true; // discord logging off for master_revamped, remove to re-enable

export function logError(error: unknown, context: string): void {
  const url = import.meta.env.VITE_DISCORD_ERROR_WEBHOOK_URL;
  if (DISABLED || !url) return;

  const err = error instanceof Error ? error : new Error(String(error));
  const stack = (err.stack || err.message).slice(0, 980);

  fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      embeds: [
        {
          title: `[${context}] ${err.message}`.slice(0, 256),
          color: 0xe74c3c,
          fields: [
            { name: "Stack", value: `\`\`\`\n${stack}\n\`\`\``.slice(0, 1024) },
            { name: "Time", value: new Date().toISOString(), inline: true },
            { name: "URL", value: window.location.href.slice(0, 1024), inline: true },
          ],
        },
      ],
    }),
  }).catch(() => {});
}
