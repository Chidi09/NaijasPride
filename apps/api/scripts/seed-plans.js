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
    name: 'Monthly',
    slug: 'monthly',
    price: 1500,        // ₦1,500/month
    currency: 'NGN',
    durationDays: 30,
    maxScreens: 1,
    maxQuality: '1080p',
    download: false,
    ads: false,
    priority: 1,
  },
  {
    name: 'Annual',
    slug: 'annual',
    price: 12000,       // ₦12,000/year
    currency: 'NGN',
    durationDays: 365,
    maxScreens: 1,
    maxQuality: '1080p',
    download: false,
    ads: false,
    priority: 2,
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
