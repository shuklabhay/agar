#!/bin/bash
set -e

if [ "$VERCEL_ENV" = "production" ]; then
  # Production: Deploy to Convex and build
  npx convex deploy --cmd 'npm run build' --cmd-url-env-var-name NEXT_PUBLIC_CONVEX_URL
else
  # Preview/Development: Just build
  npm run build
fi
