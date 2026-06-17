import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  console.log("Seeding Subscription Plans...");

  const plans = [
    {
      name: "Mobile",
      slug: "mobile",
      price: 1000,
      currency: "NGN",
      durationDays: 30,
      maxScreens: 1,
      maxQuality: "480p",
      download: true,
      ads: true,
      priority: 1,
    },
    {
      name: "Standard",
      slug: "standard",
      price: 2500,
      currency: "NGN",
      durationDays: 30,
      maxScreens: 2,
      maxQuality: "1080p",
      download: true,
      ads: true,
      priority: 2,
    },
    {
      name: "Family",
      slug: "family",
      price: 4500,
      currency: "NGN",
      durationDays: 30,
      maxScreens: 4,
      maxQuality: "4k",
      download: true,
      ads: false,
      priority: 3,
    },
  ];

  for (const plan of plans) {
    await prisma.plan.upsert({
      where: { slug: plan.slug },
      update: plan,
      create: plan,
    });
    console.log(
      `  -> ${plan.name} plan: NGN ${plan.price.toLocaleString()}/mo`,
    );
  }

  console.log("Plans seeded successfully!");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
