/**
 * Adds Chicken Samosa to the menu (Fries & Crispies @ ₹35).
 * Run: npx tsx scripts/add-chicken-samosa.ts
 */
import { writeMenuItem } from "../src/lib/menu-repository";

async function main() {
  await writeMenuItem({
    id: "chicken-samosa",
    name: "Chicken Samosa",
    category: "Fries & Crispies",
    description: "Crispy fried chicken samosa.",
    image: "",
    isVeg: false,
    variations: [{ id: "chicken-samosa", name: "Single", price: 35 }],
    addons: [],
    available: true,
  });
  console.log("OK: Chicken Samosa @ ₹35 in Fries & Crispies");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
