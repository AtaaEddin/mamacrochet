import { CustomOffer } from "@/components/home/custom-offer";
import { FeaturedWorks } from "@/components/home/featured-works";
import { IntroBar } from "@/components/home/intro-bar";

/**
 * Home (brand v2 — chat-first):
 * thin intro bar → works made so far (most loved, category filter,
 * "see all") → "didn't find your liking?" custom offer → chat.
 * No chat UI on the home page itself (owner 2026-09-26): chat is a page.
 */
export default function HomePage() {
  return (
    <>
      <IntroBar />
      <div className="mx-auto w-full max-w-6xl px-4 pt-4 sm:px-6">
        <FeaturedWorks />
      </div>
      <CustomOffer />
    </>
  );
}
