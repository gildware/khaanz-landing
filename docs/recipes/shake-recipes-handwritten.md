# Shake recipes — handwritten source

**Source:** WhatsApp image (2026-07-25)  
**Status:** Extracted for review — add to inventory/DB **one recipe at a time**  
**Related menu category:** Shakes (@ ₹160 each)

---

## 1. Mango Shake

**Confirmed recipe** (user update 2026-07-25):

| # | Item | Qty | Inventory |
|---|------|-----|-----------|
| 1 | Mango Crush | **40 ml** | Mango Crush (ml) |
| 2 | Mango Ice Cream | **3 scoops × 35 g = 105 g** | Mango Gallon (g) |
| 3 | Milk | **180 ml** | Milk (ml) |

Removed from recipe: ice, mango garnish (crush garnish only — use Mango Crush line above).

**Menu match:** `Mango Blast` (`mango-blast`) — ₹160

**Scoop standard:** 1 scoop = 35 g (applies to gallon ice creams)

---

## 2. Kitkat Shake

**Confirmed so far** (user update 2026-07-25):

| # | Item | Qty | Inventory |
|---|------|-----|-----------|
| 1 | Kitkat Chocolate (₹10) | **4 pcs** | Kit Kat (pc) |
| 2 | Milk | **180 ml** | Milk (ml) |
| 3 | Chocolate Syrup | **20 ml total** | Chocolate Syrup — **20 g** in DB (1 ml ≈ 1 g) |

Removed / merged: chocolate syrup garnish is included in the **20 ml total** (not a separate line).

Still open: ice qty (or skip like Mango).

**Menu match:** `Kit Kat Milkshake` (`kit-kat-milkshake`) — ₹160

---

## 3. Oreo Shake

| # | Item | Qty | Notes |
|---|------|-----|-------|
| 1 | Oreo Biscuit | — | Qty not written |
| 2 | Milk | — | Qty not written (Kitkat uses 180 ml) |
| 3 | Ice | — | Qty not written |
| 4 | C. Syrup (Chocolate Syrup) | — | Qty not written |
| 5 | C. Syrup Garnish | — | Qty not written |

**Menu match:** `Oreo Biscuit` (`oreo-biscuit`)

---

## 4. “Same” flavors (same base as Mango Shake)

These follow the **Mango Shake** base (40 ml crush + 3 scoops × 35 g gallon + 180 ml milk); swap flavor:

| Handwritten flavor | Menu item | Crush (40 ml) | Gallon (105 g) |
|--------------------|-----------|---------------|----------------|
| Black Current | Blackcurrent Blast | Black Current Crush | Black Current Gallon |
| Pure Vanilla | True Vanilla | — | Vanilla Gallon |
| Chocolate | Classic Chocolate | — | Chocolate Gallon |
| Strawberry | Strawberry Sweetness | Strawberry Crush | Strawberry Gallon |

---

## All unique items (combined)

| Item | Used in |
|------|---------|
| Mango Crush | Mango Shake (40 ml) |
| Mango Ice Cream | Mango Shake (105 g) |
| Milk | Mango Shake (180 ml), Kitkat, Oreo |
| Ice | Kitkat, Oreo (not Mango) |
| Kitkat Chocolate (₹10) | Kitkat Shake |
| Chocolate Syrup | Kitkat, Oreo |
| Chocolate Syrup Garnish | Kitkat, Oreo |
| Oreo Biscuit | Oreo Shake |
| Black Current Crush | Same flavors |
| Vanilla (Pure Vanilla) | Same flavors |
| Chocolate (gallon / syrup) | Same flavors |
| Strawberry Crush | Same flavors |

---

## Inventory match (current DB)

| Handwritten item | In inventory? | DB name |
|------------------|-----------------|---------|
| Mango Crush | Yes | Mango Crush (ml) |
| Mango Ice Cream | Partial | Mango Gallon (g) — no separate scoop item |
| Milk | Yes | Milk (ml), Milk (Tonned) (ml) |
| Ice | **No** | Not tracked as inventory item |
| Kit Kat (₹10) | Yes | Kit Kat (pc) |
| Chocolate Syrup | Yes | Chocolate Syrup (g) |
| Oreo Biscuit | Yes | Oreo Biscuit (pc) |
| Black Current Crush | Yes | Black Current Crush (ml) |
| Vanilla | Yes | Vanilla Gallon (g) |
| Chocolate | Yes | Chocolate Gallon (g), Chocolate Syrup (g) |
| Strawberry | Yes | Strawberry Crush (g), Strawberry Gallon (g) |

---

## Open questions (fill before adding recipes)

- [x] Mango — scoop weight: **35 g**; crush: **40 ml** (garnish dropped)
- [ ] Ice — qty per shake? Add as inventory item? (Kitkat / Oreo only)
- [x] Kitkat — chocolate syrup: **20 ml total** (main + garnish combined)
- [ ] Oreo — biscuit count, milk ml, syrup qty
- [ ] “Same” flavors — confirm crush 40 ml + 3 scoops for each variant

---

## Progress (DB recipes)

| Recipe | Added to DB | Date | Notes |
|--------|-------------|------|-------|
| Mango Blast | ☑ | 2026-07-25 | 40 ml crush + 105 g gallon + 180 ml milk |
| Kit Kat Milkshake | ☑ | 2026-07-25 | 4 pc + 180 ml milk + 20 g syrup |
| Oreo Biscuit | ☐ | | |
| Blackcurrent Blast | ☐ | | |
| True Vanilla | ☐ | | |
| Classic Chocolate | ☐ | | |
| Strawberry Sweetness | ☐ | | |
