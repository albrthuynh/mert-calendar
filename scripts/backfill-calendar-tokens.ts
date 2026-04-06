import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

const adapter = new PrismaPg({
  connectionString: process.env.DATABASE_URL!,
});

const prisma = new PrismaClient({
  adapter,
});

async function main() {
  console.log("Starting backfill of calendar subscription tokens...");

  // Find all users without a calendar subscription token
  const usersWithoutToken = await prisma.user.findMany({
    where: {
      calendarSubscriptionToken: null,
    },
    select: {
      id: true,
      email: true,
    },
  });

  console.log(`Found ${usersWithoutToken.length} users without tokens`);

  if (usersWithoutToken.length === 0) {
    console.log("All users already have tokens!");
    return;
  }

  // Update each user with a new token
  let updated = 0;
  for (const user of usersWithoutToken) {
    const { randomBytes } = await import("crypto");
    const token = randomBytes(16).toString("hex");

    await prisma.user.update({
      where: { id: user.id },
      data: { calendarSubscriptionToken: token },
    });

    console.log(`✓ Generated token for user: ${user.email || user.id}`);
    updated++;
  }

  console.log(`\n✅ Successfully generated tokens for ${updated} users`);
}

main()
  .catch((e) => {
    console.error("Error:", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
