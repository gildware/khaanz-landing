/** Fallback menu copy when an item has no stored description (DB or bundled defaults). */
export function defaultDescriptionForItem(item: {
  name: string;
  category: string;
}): string {
  const n = item.name;
  switch (item.category) {
    case "Chef Specials":
      if (n.toLowerCase().includes("butter")) {
        return "Rich, creamy tomato-butter gravy with tender chicken—best with naan or roti.";
      }
      if (n.toLowerCase().includes("kadai")) {
        return "Wok-tossed chicken with capsicum, onion, and bold kadai masala—served hot.";
      }
      if (n.toLowerCase().includes("tandoori")) {
        return "Juicy, smoky tandoori chicken with a punch of spices and charred edges.";
      }
      return "House special made-to-order with aromatic spices and a satisfying, homestyle taste.";
    case "Tandoor Breads":
      if (n.toLowerCase().includes("naan")) return "Soft, fluffy naan—perfect for scooping up gravies.";
      if (n.toLowerCase().includes("roti")) return "Freshly cooked roti with a light, rustic bite.";
      return "Freshly made bread, hot off the tawa/tandoor.";
    case "Rice Royale":
      if (n.toLowerCase().includes("biryani")) {
        return "Aromatic basmati rice layered with spices—pair it with raita for the perfect bite.";
      }
      if (n.toLowerCase().includes("schezwan")) {
        return "Spicy Schezwan-style rice with wok aroma and a bold chilli-garlic kick.";
      }
      return "Wok-tossed rice with balanced seasoning and classic street-style flavour.";
    case "Pizza Zone":
      if (n.toLowerCase().includes("corn")) return "Cheesy pizza topped with sweet corn—comforting and crowd-pleasing.";
      if (n.toLowerCase().includes("veggie")) return "Loaded veggie pizza with a colourful crunch and gooey cheese pull.";
      if (n.toLowerCase().includes("chicken")) return "Hearty chicken pizza with bold seasoning and generous cheese.";
      return "Oven-baked pizza with melty cheese and a crisp, satisfying crust.";
    case "Momo Mania":
      if (n.toLowerCase().includes("tandoori")) return "Tandoori-style momos—smoky, spicy, and addictive with dip.";
      if (n.toLowerCase().includes("fried")) return "Crispy fried momos with a juicy centre—perfect with chutney.";
      return "Steamed momos with juicy filling and soft wrappers—served with dip.";
    case "Noodle Hub":
      if (n.toLowerCase().includes("schezwan")) return "Schezwan noodles with a spicy chilli-garlic punch and wok-tossed flavour.";
      return "Classic chowmein-style noodles tossed with veggies and signature sauces.";
    case "Spicy Chinese":
      if (n.toLowerCase().includes("manchurian")) return "Indo-Chinese Manchurian in bold sauce—sweet, spicy, and savoury.";
      if (n.toLowerCase().includes("chilli")) return "Classic chilli-style Indo-Chinese with capsicum, onion, and a spicy glaze.";
      return "Indo-Chinese favourite made hot and fresh with our spicy sauce.";
    case "Fries & More":
      if (n.toLowerCase().includes("peri")) return "Crispy fries dusted with peri peri masala—spicy and tangy.";
      if (n.toLowerCase().includes("honey")) return "Crispy potatoes tossed in honey chilli sauce—sweet heat in every bite.";
      return "Crispy, golden snack—perfect with dips.";
    case "Parathas & Rolls":
      if (n.toLowerCase().includes("roll")) return "Wrapped and rolled for the perfect on-the-go bite—spicy, filling, satisfying.";
      return "Stuffed paratha made fresh—crispy edges, soft centre, and full of flavour.";
    case "Shakes":
      return "Thick, creamy shake blended ice-cold—smooth, sweet, and super refreshing.";
    case "Mojitos":
      return "Refreshing cooler with minty freshness and citrus zing—served chilled.";
    case "Crispy Bites":
      if (n.toLowerCase().includes("fish")) return "Crispy fried fish with bold seasoning—great with a squeeze of lemon.";
      return "Crispy, golden fried goodness—best enjoyed hot.";
    case "Soft Drinks":
      return "Ice-cold, fizzy refreshment—perfect with spicy snacks and meals.";
    case "Chole Poori/Bhature":
      if (n.toLowerCase().includes("chole poori")) {
        return "Spicy chickpea curry served with fluffy, deep-fried poori—a classic North Indian favourite.";
      }
      if (n.toLowerCase().includes("chole bhature")) {
        return "Hearty chole paired with soft, fluffy bhature—rich, tangy, and satisfying.";
      }
      if (n.toLowerCase().includes("chole paratha")) {
        return "Spiced chickpea curry with a stuffed paratha—hearty, filling, and full of flavour.";
      }
      if (n.toLowerCase().includes("chole")) {
        return "Spicy, tangy chickpea curry slow-cooked with aromatic masala.";
      }
      if (n.toLowerCase().includes("poori")) {
        return "Golden, puffed deep-fried bread—light and fluffy.";
      }
      if (n.toLowerCase().includes("bhature")) {
        return "Soft, fluffy leavened bread—perfect for scooping up chole.";
      }
      return "Classic North Indian chole served with fresh bread.";
    default:
      return "";
  }
}
