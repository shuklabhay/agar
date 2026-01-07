#!/bin/bash
set -e

if [ "$VERCEL_ENV" = "production" ]; then
  # Production: Deploy to Convex and build
  echo "🚀 Production build: Deploying to Convex and building Next.js app..."
  npx convex deploy --cmd 'npm run build' --cmd-url-env-var-name NEXT_PUBLIC_CONVEX_URL
else
  # Preview/Development: Just build
  echo "🔧 Preview build: Building Next.js app without Convex deployment..."
  npm run build
fi
