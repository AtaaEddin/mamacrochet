import { CustomOffer } from "@/components/home/custom-offer";
import { WorksBrowse } from "@/components/home/works-browse";

/**
 * Works list page (brand v2): full catalog + category filter, and the
 * "didn't find your liking?" custom offer closing the page — chat is
 * where custom pieces start.
 */
export default function WorksPage() {
  return (
    <div className="mx-auto w-full max-w-6xl px-4 sm:px-6">
      <WorksBrowse />
      <CustomOffer />
    </div>
  );
}
