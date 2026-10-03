This is a [Next.js](https://nextjs.org) project bootstrapped with [`create-next-app`](https://nextjs.org/docs/app/api-reference/cli/create-next-app).

## Getting Started

First, run the development server:

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
# or
bun dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

You can start editing the page by modifying `app/page.tsx`. The page auto-updates as you edit the file.

This project uses [`next/font`](https://nextjs.org/docs/app/building-your-application/optimizing/fonts) to automatically optimize and load [Geist](https://vercel.com/font), a new font family for Vercel.

## API client (OpenAPI → generated SDK)

Every API call goes through the generated per-operation SDK in
`src/lib/api/generated/` (emitted by `@hey-api/openapi-ts` from the
committed spec `src/lib/api/schema.json`, config in `openapi-ts.config.ts`).
Never edit the generated tree by hand. After changing the API (dev stack
running), regenerate with:

```bash
pnpm gen:api
```

The browser transport (auth cookies + CSRF header, one-shot 403-csrf retry)
lives in `src/lib/api/client.ts` and is installed on the generated client by
`src/lib/api/generated-client.ts`. Domain wrappers (`src/lib/orders/api.ts`,
`src/lib/chat/api.ts`, `src/lib/staff/api.ts`, …) add error mapping and
result unwrapping on top of the SDK methods. Server components use their own
plain client in `src/lib/catalog/server.ts` (no cookies, hard timeout).

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.
