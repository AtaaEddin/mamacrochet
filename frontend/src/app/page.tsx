import { ApiHealth } from "@/components/api-health";

export default function Home() {
  return (
    <main className="flex min-h-svh flex-col items-center justify-center gap-6 p-8 text-center">
      <h1 className="text-4xl font-semibold tracking-tight">mamacrochet</h1>
      <p className="max-w-md text-balance text-muted-foreground">
        Scaffold: Aspire 13 + .NET 10 API + Next.js 16 + shadcn/ui. The real shop,
        chat, and order flows arrive with the plans in <code>doc/plans/</code>.
      </p>
      <ApiHealth />
    </main>
  );
}
