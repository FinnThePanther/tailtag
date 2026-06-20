#!/usr/bin/env node

console.log(
  '[vercel-ignore-web] Skipping Git-triggered deployment. GitHub Actions deploys prebuilt web artifacts after validation.',
);
process.exit(0);
