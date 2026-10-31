const CAPTIONS = {
  local: "Prompts stay on this machine.",
  cloud: "Prompts go to a cloud model, with passwords, codes and card numbers masked first.",
  hybrid: "Tries your local model first, and falls back to the cloud with secrets masked.",
  off: "No AI in this setup. Nothing leaves this machine.",
};

/** "local" reads better as "local model". Cloud providers keep their names. */
export function providerLabel(provider) {
  return provider === "local" ? "local model" : provider;
}

/** The user's answer to "where does my data go". Never decorative. */
export default function AiBadge({ ai }) {
  if (!ai) return null;
  const needsConfig = ai.mode !== "off" && !ai.configured_provider;

  return (
    <div className="ai-badge" data-mode={ai.mode}>
      <p className="ai-badge__label">
        <span className="ai-badge__dot" aria-hidden="true" />
        {ai.label}
      </p>
      <p className="ai-badge__caption">{CAPTIONS[ai.mode] ?? ""}</p>
      {ai.model ? <p className="ai-badge__model mono">Model: {ai.model}</p> : null}
      {needsConfig ? (
        <p className="ai-badge__warn">Not configured yet. Check your .env.</p>
      ) : null}
    </div>
  );
}