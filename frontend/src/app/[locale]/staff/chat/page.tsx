import { StaffVisitorsView } from "@/components/staff/staff-visitors-view";

/**
 * Staff Visitors inbox (plan 06, D14): guest threads with previews —
 * claim / assign / close, or open the conversation in the shared chat
 * surface. Client-gated to the team; the server enforces every call.
 */
export default function StaffChatPage() {
  return (
    <div className="mx-auto w-full max-w-4xl px-4 sm:px-6">
      <StaffVisitorsView />
    </div>
  );
}
