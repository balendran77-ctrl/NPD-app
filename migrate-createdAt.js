#!/usr/bin/env node
// migrate-createdAt.js
// Populate missing Product.createdAt using requiredDate - 3 days.
// Usage:
//   # dry run (default)
//   MONGO_URI="..." node migrate-createdAt.js --dry-run
//   # to apply changes
//   MONGO_URI="..." node migrate-createdAt.js

const mongoose = require('mongoose');

async function main() {
  const mongoUri = process.env.MONGO_URI;
  if (!mongoUri) {
    console.error('MONGO_URI is required in the environment');
    process.exit(1);
  }

  const dryRun = process.argv.includes('--dry-run') || process.argv.includes('-n');

  console.log(`Connecting to ${mongoUri} ...`);
  await mongoose.connect(mongoUri, { useNewUrlParser: true, useUnifiedTopology: true });

  // Use a flexible schema so we don't need to replicate full app schema
  const productSchema = new mongoose.Schema({}, { strict: false });
  const Product = mongoose.model('Product', productSchema, 'products');

  // Find products missing createdAt but with a requiredDate
  const query = { $and: [ { $or: [ { createdAt: { $exists: false } }, { createdAt: null } ] }, { requiredDate: { $exists: true, $ne: null, $ne: '' } } ] };

  console.log('Querying for products missing createdAt but with requiredDate...');
  const cursor = Product.find(query).cursor();
  let total = 0;
  let updated = 0;
  for await (const doc of cursor) {
    total++;
    const reqDateRaw = doc.requiredDate;
    let parsed = null;
    try {
      // If it's a string like YYYY-MM-DD, this will parse as UTC midnight in modern engines
      parsed = new Date(reqDateRaw);
      if (isNaN(parsed.getTime())) {
        // try parsing as other formats
        parsed = new Date(Date.parse(reqDateRaw));
      }
    } catch (err) {
      parsed = null;
    }

    if (!parsed || isNaN(parsed.getTime())) {
      console.warn(`Skipping _id=${doc._id}: requiredDate='${reqDateRaw}' could not be parsed as a date`);
      continue;
    }

    const createdAt = new Date(parsed);
    createdAt.setDate(createdAt.getDate() - 3);

    console.log(`${dryRun ? '[dry-run]' : '[apply]'} _id=${doc._id} requiredDate='${reqDateRaw}' -> createdAt='${createdAt.toISOString()}'`);
    if (!dryRun) {
      try {
        await Product.updateOne({ _id: doc._id }, { $set: { createdAt } });
        updated++;
      } catch (err) {
        console.error('Failed to update _id=', doc._id, err && err.message ? err.message : err);
      }
    }
  }

  console.log(`Done. Scanned ${total} docs. ${dryRun ? 'No changes applied (dry-run).' : `Updated ${updated} documents.`}`);
  await mongoose.disconnect();
}

main().catch(err => {
  console.error('Migration failed:', err && err.stack ? err.stack : err);
  process.exit(1);
});
