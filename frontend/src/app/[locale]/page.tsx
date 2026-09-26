import { HowItWorks } from "@/components/home/how-it-works";
import { Hero } from "@/components/home/hero";
import { ShopTeaser } from "@/components/home/shop-teaser";
import { ValueProps } from "@/components/home/value-props";

export default function HomePage() {
  return (
    <>
      <Hero />
      <ValueProps />
      <HowItWorks />
      <ShopTeaser />
    </>
  );
}
