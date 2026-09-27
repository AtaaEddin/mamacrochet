import { ChatPanel } from "@/components/chat-panel";
import { SAMPLE_WORKS } from "@/lib/sample-works";

/**
 * The chat page (brand v2) — the main conversation surface: a full-width
 * ChatGPT-style thread + a product rail on the side (pick a work into the
 * chat by tap or drag-and-drop). Full height on desktop; on mobile the
 * rail stacks below the conversation.
 *
 * `?work=<id>` brings a piece from the works list into the chat.
 */
export default async function ChatPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { work } = await searchParams;
  const initialProduct = SAMPLE_WORKS.find((w) => w.id === work);

  return (
    <div className="w-full px-4 sm:px-6">
      <div className="min-h-[calc(100dvh-6.5rem)] lg:h-[calc(100dvh-6rem)]">
        <ChatPanel withProductRail initialProduct={initialProduct} />
      </div>
    </div>
  );
}
