#!/usr/bin/env node
/**
 * Seed subscription plans into the database.
 * Run on the production server:
 *   cd /opt/naijaspride && node apps/api/scripts/seed-plans.js
 */

require('dotenv').config({ path: require('path').join(__dirname, '../.env') });
const { PrismaClient } = require('@prisma/client');

const plans = [
  {
    name: 'Mobile',
    slug: 'mobile',
    price: 1500,        // ₦1,500/mo
    currency: 'NGN',
    durationDays: 30,
    maxScreens: 1,
    maxQuality: '480p',
    download: false,
    ads: true,
    priority: 1,
  },
  {
    name: 'Standard',
    slug: 'standard',
    price: 2500,        // ₦2,500/mo
    currency: 'NGN',
    durationDays: 30,
    maxScreens: 2,
    maxQuality: '1080p',
    download: true,
    ads: false,
    priority: 2,
  },
  {
    name: 'Family',
    slug: 'family',
    price: 4000,        // ₦4,000/mo
    currency: 'NGN',
    durationDays: 30,
    maxScreens: 4,
    maxQuality: '4K',
    download: true,
    ads: false,
    priority: 3,
  },
];

async function main() {
  const prisma = new PrismaClient();
  try {
    for (const plan of plans) {
      const result = await prisma.plan.upsert({
        where: { slug: plan.slug },
        update: plan,
        create: plan,
      });
      console.log(`  ✓ ${result.name} (${result.slug}) — ₦${result.price.toLocaleString()}/mo`);
    }
    console.log('\nDone. All plans seeded.');
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((e) => { console.error(e.message); process.exit(1); });
