// Minimal AI client wrapper - does not call any provider until configured.
// This module centralizes which model name to use. Real provider integration (OpenAI fetch) can be added.
const fetch = require('node-fetch');

function getModel() {
  if (process.env.ENABLE_GPT5_MINI === 'true') return 'gpt-5-mini';
  return process.env.AI_MODEL || 'gpt-4o';
}

async function callProvider(prompt, opts = {}) {
  // Placeholder: if OPENAI_API_KEY is set, call OpenAI API (example). Otherwise throw.
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) throw new Error('OPENAI_API_KEY not configured');

  const model = getModel();
  // Example: call a hypothetical endpoint - this is a template and may need adapting for real provider.
  const resp = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ model, messages: [{ role: 'user', content: prompt }], max_tokens: opts.max_tokens || 512 })
  });
  if (!resp.ok) {
    const txt = await resp.text();
    throw new Error('AI provider error: ' + txt);
  }
  const j = await resp.json();
  return j;
}

module.exports = { getModel, callProvider };
