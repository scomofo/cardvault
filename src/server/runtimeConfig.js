const ANTHROPIC_KEY_PLACEHOLDER = "sk-ant-your-key-here";
const PROXY_TOKEN_PLACEHOLDER = "change-me";

function normalizeOptionalValue(value) {
  return typeof value === "string" ? value.trim() : "";
}

export function normalizeAnthropicApiKey(value) {
  const key = normalizeOptionalValue(value);
  return key === ANTHROPIC_KEY_PLACEHOLDER ? "" : key;
}

export function getAnthropicApiKey(env = process.env) {
  return normalizeAnthropicApiKey(env.ANTHROPIC_API_KEY);
}

export function getProxyToken(env = process.env) {
  const token = normalizeOptionalValue(env.PROXY_TOKEN);
  return token === PROXY_TOKEN_PLACEHOLDER ? "" : token;
}
