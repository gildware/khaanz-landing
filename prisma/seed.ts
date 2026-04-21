import bcrypt from "bcryptjs";

import { getDefaultMenuPayload } from "../src/data/menu";
import { getPrisma } from "../src/lib/prisma";
import { writeMenuPayload } from "../src/lib/menu-repository";

async function main() {
  const prisma = getPrisma();

  const email = process.env.SEED_SUPER_ADMIN_EMAIL?.trim().toLowerCase();
  const password = process.env.SEED_SUPER_ADMIN_PASSWORD;

  if (!email || !password) {
    console.warn(
      "Skip super admin: set SEED_SUPER_ADMIN_EMAIL and SEED_SUPER_ADMIN_PASSWORD to create/update the super admin user.",
    );
  } else {
    const passwordHash = await bcrypt.hash(password, 12);
    await prisma.user.upsert({
      where: { email },
      create: {
        email,
        passwordHash,
        displayName: "Super Admin",
        role: "SUPER_ADMIN",
        active: true,
      },
      update: {
        passwordHash,
        role: "SUPER_ADMIN",
        active: true,
      },
    });
    console.log(`Super admin ready: ${email}`);
  }

  if (!(await prisma.restaurantSettings.findUnique({ where: { id: "default" } }))) {
    await prisma.restaurantSettings.create({
      data: {
        id: "default",
        whatsappPhoneE164: "919876543210",
        pickupStart: "11:00",
        pickupEnd: "23:00",
        deliveryStart: "11:00",
        deliveryEnd: "23:00",
        billHeader: "",
        billFooter: "",
        paymentMethodsJson: [
          { id: "cash", name: "Cash" },
          { id: "upi", name: "UPI" },
          { id: "mpay", name: "Mpay" },
        ],
      },
    });
    console.log("Restaurant settings row created (default).");
  }

  const hasMenu =
    (await prisma.category.count()) > 0 ||
    (await prisma.menuItem.count()) > 0;

  if (!hasMenu) {
    await writeMenuPayload(getDefaultMenuPayload());
    console.log("Menu seeded from bundled defaults (src/data/menu.ts).");
  } else {
    console.log("Menu already present — skipping menu seed.");
  }
}

main()
  .then(async () => {
    await getPrisma().$disconnect();
  })
  .catch(async (e) => {
    console.error(e);
    try {
      await getPrisma().$disconnect();
    } catch {
      /* ignore */
    }
    process.exit(1);
  });
