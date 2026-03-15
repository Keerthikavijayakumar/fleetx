/**
 * One-time script: wipes all user accounts and seeds 1 admin + 2 staff users.
 * Run: node scripts/resetUsers.js
 */
require('dotenv').config();
const mongoose = require('mongoose');
const bcrypt   = require('bcryptjs');

// ─── Inline schema (avoids loading full model tree) ──────────────────────────
const userSchema = new mongoose.Schema({}, { strict: false });
const User = mongoose.model('User', userSchema, 'users');

const USERS_TO_SEED = [
    {
        username: 'divyanathan_admin',
        fullName: 'Divyanathan Arulrosaliselvakumar',
        email: 'divyanathan.admin@fleetx.com',
        phone: '9443515667',
        password: 'arm',
        role: 'admin',
    },
    {
        username: 'driver_mohan',
        fullName: 'Mohan Kumar',
        email: 'driver.mohan@fleetx.com',
        phone: '9443515601',
        password: 'arm',
        role: 'driver',
    },
    {
        username: 'assistant_selva',
        fullName: 'Selva Raj',
        email: 'assistant.selva@fleetx.com',
        phone: '9443515602',
        password: 'arm',
        role: 'assistant',
    },
];

async function main() {
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('✓ Connected to MongoDB');

    const deleted = await User.deleteMany({});
    console.log(`✓ Deleted ${deleted.deletedCount} user(s) from the database`);

    const preparedUsers = [];
    for (const user of USERS_TO_SEED) {
        const hashedPw = await bcrypt.hash(user.password, 12);
        preparedUsers.push({ ...user, password: hashedPw });
    }
    await User.insertMany(preparedUsers);

    console.log('\n✓ Seeded users:');
    USERS_TO_SEED.forEach((u) => {
        console.log(`   - ${u.role.toUpperCase()}: ${u.fullName} | ${u.username} | ${u.email} | ${u.phone} | password: ${u.password}`);
    });

    await mongoose.disconnect();
    console.log('\n✓ Done. Previous users removed and required users added.');
}

main().catch((err) => { console.error(err); process.exit(1); });
