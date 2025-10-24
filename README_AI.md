AI feature guide
================

This repo includes a lightweight admin UI to select which AI model the running process should use. This does NOT enable or grant access to any proprietary models — you must have appropriate API access and set the corresponding API key in your environment.

How to enable GPT-5-mini for all clients (options)
------------------------------------------------

1) Deployment (recommended, persistent)
   - Rotate and store your OpenAI (or other provider) API key in your deployment (Render, Heroku, etc.) environment variables.
   - Set `AI_MODEL=gpt-5-mini` and `OPENAI_API_KEY=...` in your deployment environment variables.
   - Restart the service.

2) Runtime (temporary)
   - Log in as an admin in the app.
   - Go to Admin → AI Settings and set the model to `gpt-5-mini`. This updates `process.env.AI_MODEL` only for the running process.

Notes
-----
- If you want the app to actually call an LLM, we still need to add the integration code (a small service module that calls the provider API and uses `process.env.AI_MODEL`). I can add that if you want.
- The repository includes a minimal AI client at `services/ai-client.js` that demonstrates how to select the configured model and call an OpenAI-style completion endpoint. You must set `OPENAI_API_KEY` in your environment to use it.
- Ensure your provider account has access to `gpt-5-mini` and that you comply with terms of service.
