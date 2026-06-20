#!/usr/bin/env node

console.log(
  '[vercel-ignore-admin] Skipping Git-triggered deployment. GitHub Actions deploys prebuilt admin artifacts after validation.',
);
process.exit(0);
