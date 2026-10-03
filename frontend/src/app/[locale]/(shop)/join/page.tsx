import { JoinView } from "@/components/join/join-view";

/**
 * Public "join the team" application page (plan 09). Anonymous — no auth
 * gate: rate limiting + the honeypot live server-side.
 */
export default function JoinPage() {
  return <JoinView />;
}
