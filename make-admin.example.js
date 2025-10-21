// Example script to create a first admin user.
// Copy to make-admin.js, fill in the values, then run: node make-admin.js
// IMPORTANT: Never commit credentials. Keep make-admin.js out of the repo or use environment variables.

const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

const {
  MONGO_URI,
  ADMIN_EMAIL = 'admin@example.com',
  ADMIN_PASSWORD = 'changeme',
} = process.env;

if (!MONGO_URI) {
  console.error('MONGO_URI must be set in the environment. Copy .env.example to .env and set it.');
  process.exit(1);
}

async function main() {
  await mongoose.connect(MONGO_URI, { useNewUrlParser: true, useUnifiedTopology: true });

  const userSchema = new mongoose.Schema({
    email: String,
    password: String,
    role: { type: String, default: 'admin' },
  });

  const User = mongoose.model('User', userSchema);

  const existing = await User.findOne({ email: ADMIN_EMAIL });
  if (existing) {
    console.log('Admin user already exists:', ADMIN_EMAIL);
    process.exit(0);
  }

  const hash = await bcrypt.hash(ADMIN_PASSWORD, 10);
  const user = new User({ email: ADMIN_EMAIL, password: hash, role: 'admin' });
  await user.save();

  console.log('Created admin user:', ADMIN_EMAIL);
  process.exit(0);
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
