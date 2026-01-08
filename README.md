# Agar

[![Prettier](https://github.com/shuklabhay/agar/actions/workflows/prettier.yml/badge.svg)](https://github.com/shuklabhay/agar/actions/workflows/prettier.yml)

AI-native classroom companion that grounds tutoring in the assignments and notes teachers upload, keeping students on track and teachers in the loop.

## What’s inside

- Next.js 16 + React 19 with Tailwind CSS and Radix UI.
- Convex for data, server functions, and Convex Auth.
- Gemini-powered assignment parsing and tutoring flows.
- Vercel deploys with Convex deployment baked into the build script.

## Getting started

- Requirements: Node 20+, pnpm, a Convex account (`pnpm dlx convex login` once), and a Gemini API key.
- Install deps: `pnpm install`
- Link Convex: `pnpm convex dev` (pick/create a project).
- Some other stuff I lowkey dont remmeber
- Run the stack:
  ```bash
  pnpm dev           # Next.js + Convex dev servers together
  pnpm dev:frontend  # only Next.js
  pnpm dev:backend   # only Convex (writes NEXT_PUBLIC_CONVEX_URL to .env.local)
  ```
  The first run of the Convex server will prompt you to pick/create a Convex project and will write local URLs into `.env.local`.

## Scripts

- `pnpm lint` — Run Prettier in write mode across the repo.
- `pnpm format` / `pnpm format:check` — Prettier formatting (also enforced in CI).
- `pnpm build` — Production Next.js build.
- `pnpm start` — Run the built app.

## Deployment (Vercel)

- GitHub Action: `.github/workflows/vercel.yml` runs `vercel build` + `vercel deploy --prebuilt` on pushes and PRs. Configure repo secrets: `VERCEL_TOKEN`, `VERCEL_ORG_ID`, `VERCEL_PROJECT_ID`, `CONVEX_DEPLOY_KEY`, `CONVEX_SITE_URL`, `GEMINI_API_KEY`, and `NEXT_PUBLIC_CONVEX_URL` for preview builds (prod gets this injected by `convex deploy`).
- Vercel build uses `vercel.json` + `scripts/build.sh`; in production (`VERCEL_ENV=production`) it runs `convex deploy --cmd 'npm run build'`, which deploys Convex and injects `NEXT_PUBLIC_CONVEX_URL` for the Next.js build. Previews skip the Convex deploy and only build, so ensure `NEXT_PUBLIC_CONVEX_URL` is set in preview envs.
- Manual deploy from CLI (if needed):
  ```bash
  pnpm dlx vercel pull --yes --environment=production
  pnpm dlx vercel build
  pnpm dlx vercel deploy --prebuilt --prod
  ```

## Project layout

- `app/` — Next.js routes and UI.
- `convex/` — Convex schema, functions, and auth config.
- `components/`, `hooks/`, `lib/` — shared UI and helpers.
- `scripts/build.sh` — Vercel-aware build helper.
