const express = require('express');
const router = express.Router();

// Simple admin-only page to show/set AI model via environment (no persistent storage)
router.get('/admin/ai-settings', (req, res) => {
  if (!req.session.user || !req.session.user.isAdmin) return res.status(403).send('Forbidden');
  const current = process.env.AI_MODEL || 'gpt-4o';
  res.render('ai-settings', { current });
});

router.post('/admin/ai-settings', (req, res) => {
  if (!req.session.user || !req.session.user.isAdmin) return res.status(403).send('Forbidden');
  // Note: Changing process.env at runtime only affects this process; update env in deployment for persistence.
  const { model, enable_gpt5 } = req.body;
  if (model) process.env.AI_MODEL = model;
  if (enable_gpt5) process.env.ENABLE_GPT5_MINI = 'true'; else process.env.ENABLE_GPT5_MINI = 'false';
  res.render('ai-settings', { current: process.env.AI_MODEL || 'gpt-4o', message: 'Updated (process only). Update your deployment env for persistence.' });
});

module.exports = router;
