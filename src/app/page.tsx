import { CategoryTabs } from "@/components/CategoryTabs";
import { FeaturedDishesCarousel } from "@/components/FeaturedDishesCarousel";
import { Header } from "@/components/Header";
import { HeroBanner } from "@/components/HeroBanner";
import { HomeMenuSection } from "@/components/HomeMenuSection";

export default function HomePage() {
  return (
    <div className="min-h-[100dvh] pb-24 md:pb-8">
      <Header />
      <main className="mx-auto max-w-6xl space-y-8 px-4 py-6">
        <HeroBanner />
        <FeaturedDishesCarousel />
        <section id="menu-section" className="space-y-4">
          <div className="px-1">
            <h2 className="font-heading text-xl font-bold tracking-tight">
              Explore menu
            </h2>
            <p className="text-muted-foreground text-sm">
              Tap a category or search for your craving
            </p>
          </div>
          <CategoryTabs />
          <HomeMenuSection />
        </section>
      </main>
    </div>
  );
}
