# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

**TailTag** is a React Native mobile application (Expo) for fursuit enthusiasts at conventions. Users can "catch" (scan/photograph) fursuits, unlock achievements, complete daily tasks, and manage their fursuit profiles. The app uses **Supabase** as the backend (PostgreSQL + Edge Functions + Realtime) for all data and event processing.

**Stack:** React Native 0.81.5, Expo 54, React 19, TanStack Query v5, Expo Router v6, Supabase, TypeScript.

---

## Development Commands

### Mobile App

```bash
# Start development server
npm start

# Run on specific platforms
npm run ios
npm run android
npm run web

# Type checking and linting
npm run typecheck      # TypeScript type checking
npm run lint          # ESLint with zero warnings enforced
npm run ci:validate   # Run doctor, lint, and typecheck

# Expo utilities
npm run doctor        # Diagnose Expo project issues
npm run prebuild      # Generate native project files

# EAS builds
eas build --profile development --platform ios
eas build --profile preview --platform android
eas build --profile production --platform all
```

### Supabase Edge Functions

```bash
# Deploy edge functions (deploy individually by name)
npx supabase functions deploy <function-name>
# Function names: events-ingress, process-achievements, create-catch,
#   rotate-dailys, expire-pending-catches, register-tag, lookup-tag,
#   send-push, delete-account

# View logs
npx supabase functions logs <function-name>
```

### Code Formatting

After making edits to files, **always format them before validating changes**:

```bash
npm run format <file1> <file2> ...
```

Example:
```bash
npm run format src/features/auth/api/auth.ts src/components/Button.tsx
```

Run `npm run format` with all edited file paths before running `npm run ci:validate`, `npm run lint`, or `npm run typecheck`. This ensures code follows the project's style conventions.

**Note:** There are no test runners configured currently. Tests should be added as the project matures.

---

## Architecture

### High-Level Structure

TailTag uses a **feature-based modular architecture** with clear separation:

- **Mobile app layer**: Feature modules with co-located components, hooks, and API functions
- **Backend event architecture**: Event-driven async processing via Supabase Edge Functions
- **Data layer**: Supabase as source of truth with Realtime subscriptions for live updates

### Event-Driven Achievement System

The app uses Supabase Edge Functions for all event and achievement processing. The flow is:

```
Mobile App → events-ingress Edge Function
  → Event inserted to DB (returns immediately to client)
  → process-achievements worker picks up event (background queue)
  → Achievement evaluation + notifications written to DB
  → Realtime → Mobile App (toasts)
```

**Key benefits:**
- **Non-blocking UI**: Event emission uses fire-and-forget pattern with 5-second timeout
- **Async processing**: Achievement evaluation happens in background after response
- **Realtime delivery**: Users receive achievement notifications via Supabase Realtime
- **Graceful degradation**: Event failures don't block core functionality

**Current state:** Achievement processing uses a two-stage pipeline: `events-ingress` inserts events and returns immediately, then `process-achievements` processes them asynchronously in batches. Event emission is fire-and-forget on the client. The `AchievementToastManager` subscribes to the `notifications` table for real-time delivery.

---

## Code Organization

### Feature Module Pattern

Every feature follows a consistent structure:

```
features/
├── [feature-name]/
│   ├── api/              # Data fetching functions
│   ├── components/       # Feature-specific UI components
│   ├── hooks/            # React hooks (optional)
│   ├── forms/            # Form schemas (optional)
│   ├── types.ts          # Feature-specific types
│   └── index.ts          # Public API exports
```

**Core features:**
- `achievements/` - Achievement catalog, status tracking, and toast manager
- `daily-tasks/` - Daily task tracking with countdown timer and streak system
- `suits/` - Fursuit management (my suits, caught suits, details)
- `auth/` - Authentication with `AuthProvider` for session management
- `events/` - Gameplay event emission via `emitGameplayEvent()`
- `profile/` - User profiles
- `public-profile/` - Public profile viewing with social link aggregation
- `conventions/` - Convention data
- `leaderboard/` - Leaderboard views
- `catches/` - Catch history
- `catch-confirmations/` - Pending catch approval system with toast manager
- `nfc/` - NFC tag scanning, registration, and QR code generation
- `push-notifications/` - Push notification management with PushNotificationManager
- `staff-mode/` - Staff mode functionality (feature-flag controlled via `STAFF_MODE_ENABLED`)
- `onboarding/` - User onboarding flow
- `colors/`, `species/` - Fursuit metadata

**Pattern:** Each feature exports a clean public API via `index.ts`, hiding internal implementation.

### Important Directories

- `/app/` - Expo Router file-based routing (tabs, auth, screens)
- `/src/features/` - Feature modules (see above)
- `/src/components/` - Shared/generic UI components
- `/src/lib/` - Core libraries (Supabase client, Sentry setup)
- `/src/hooks/` - Shared React hooks
- `/src/theme/` - Theme configuration and styling
- `/src/types/` - Shared TypeScript types
- `/src/utils/` - Utility functions
- `/supabase/functions/` - Supabase Edge Functions (9 functions, see below)
- `/packages/achievement-rules/` - Shared achievement evaluation logic
- `/assets/` - Static assets (images, fonts)

### Custom UI Components

The app uses a themed component library in `/src/components/ui/`:
- **TailTagButton** - Primary branded button with variants (primary, outline, ghost, destructive) and sizes
- **TailTagInput** - Styled text input with consistent theming
- **TailTagCard** - Content card with shadow and theming
- **TailTagProgressBar** - Animated progress indicator
- **KeyboardAwareFormWrapper** - Form wrapper with keyboard handling
- **ScreenHeader** - Screen header with back button and optional right slot
- **PasswordInput** - Specialized password input with visibility toggle

All components use the dark theme defined in `/src/theme/colors.ts` with Ionicons for icons.

---

## Business Rules & Limits

The app enforces several limits to maintain data quality and prevent abuse:

### Fursuit Limits
- **Maximum fursuits per user:** 3 non-tutorial fursuits (`MAX_FURSUITS_PER_USER` in `/src/constants/fursuits.ts`)
- **Maximum colors per fursuit:** 3 (`MAX_FURSUIT_COLORS` in `/src/features/colors/index.ts`)
- **Maximum social links:** 5 per fursuit (`SOCIAL_LINK_LIMIT` in `/src/features/suits/forms/socialLinks.ts`)
- **Maximum photo size:** 5MB (`MAX_IMAGE_SIZE` in `/src/constants/storage.ts`)
- **Photo aspect ratio:** 1:1 (square) enforced in image picker

### Fursuit Limit Enforcement

The 3-fursuit limit is enforced at multiple layers to prevent leaderboard manipulation:

**Client-Side:**
- Count check in Add Fursuit screen (`/app/(tabs)/suits/add-fursuit.tsx`)
- Shows limit banner with "Manage my suits" button when at limit
- Blocks form submission with error message
- My Suits screen shows count indicator (e.g., "2/3 suits")
- "Add fursuit" button disabled when at limit
- Count check in onboarding (`/src/features/onboarding/api/onboarding.ts`)

**Server-Side:**
- RLS policy on `fursuits` table prevents INSERT if user has 3+ non-tutorial fursuits
- Helper function `count_user_fursuits(user_id)` used by RLS policy
- Tutorial fursuits (`is_tutorial = true`) bypass the limit check

**API Layer:**
- `fetchMySuitsCount(userId)` - Efficient count query in `/src/features/suits/api/mySuits.ts`
- Uses `{ count: 'exact', head: true }` for performance
- Returns count of non-tutorial fursuits only

**Edge Cases Handled:**
- Deleting a fursuit decreases count, allowing new creation
- Tutorial fursuits don't count toward limit
- Onboarding restart checked for limit
- RLS policy prevents bypassing client-side validation

### Other Limits
- **Unique code generation:** 8 attempts (`UNIQUE_CODE_ATTEMPTS` in `/src/constants/codes.ts`)
- **Unique code length:** 8 characters uppercase A-Z
- **Fursuit insert attempts:** 3 retries on collision (`UNIQUE_INSERT_ATTEMPTS`)

---

## Key Architectural Patterns

### 1. React Query for Server State

All API calls return plain data (not raw Supabase responses). Query keys are exported as constants.

**Pattern:**
```typescript
// /src/features/achievements/api/achievements.ts
export const ACHIEVEMENTS_STATUS_QUERY_KEY = 'achievements-status';
export const achievementsStatusQueryKey = (userId: string) =>
  [ACHIEVEMENTS_STATUS_QUERY_KEY, userId] as const;

export async function fetchAchievementStatus(userId: string): Promise<AchievementWithStatus[]> {
  const { data, error } = await supabase
    .from('user_achievements')
    .select('*')
    .eq('user_id', userId);

  if (error) throw error;
  return data.map(mapToCleanType); // Transform to clean type
}
```

**Conventions:**
- Query keys: `FEATURE_QUERY_KEY` constant + factory function
- Helper functions create query options: `createMySuitsQueryOptions()`
- Optimistic updates and cache invalidation for mutations
- Stale time configuration varies by data volatility

### 2. Realtime Subscriptions

The app uses Supabase Realtime to receive live updates from the backend orchestrator via the `notifications` table.

"Toast Manager" components are mounted once in app root (`app/_layout.tsx`):

- **AchievementToastManager** - Listens for achievement unlocks and daily resets via `notifications` table
- **DailyTaskToastManager** - Watches user conventions for task completion
- **CatchConfirmationToastManager** - Handles pending catch approval updates
- **PushNotificationManager** - Manages Expo push notification registration and delivery

**Pattern:**
```typescript
// Subscribe to notifications table when authenticated
useEffect(() => {
  if (!session) return;

  const channel = supabase
    .channel(`notifications:user:${session.user.id}:${instanceId}`)
    .on('postgres_changes', {
      event: 'INSERT',
      schema: 'public',
      table: 'notifications',
      filter: `user_id=eq.${session.user.id}`,
    }, (payload) => {
      // Handle notification type (achievement_awarded, daily_reset, etc.)
      // Invalidate cache, show toast
    })
    .subscribe();

  return () => { supabase.removeChannel(channel); };
}, [session]);
```

**Toast state persistence:** Toast display state is persisted to AsyncStorage to prevent duplicate notifications across app restarts.

### 3. Authentication & Routing

```typescript
// app/_layout.tsx
AuthProvider (manages session lifecycle)
  ├── Sets Sentry user context
  ├── Updates Realtime auth token
  └── Exposes: { session, status, refreshSession, forceSignOut }
```

**Routing gates:**
- Not authenticated → redirect to `/auth`
- Authenticated but not onboarded → redirect to `/onboarding`
- Authenticated & onboarded → access to main app

### 4. Event Emission

When a user performs an action (e.g., catches a fursuit):

```typescript
// Fire-and-forget pattern - UI doesn't wait for response
void emitGameplayEvent({
  type: 'catch_performed',
  conventionId: 'abc123',
  payload: { catch_id: 'xyz', fursuit_id: 'def456' }
}).catch((error) => {
  captureHandledException(error, {
    scope: 'feature.action',
    conventionId: 'abc123'
  });
});

// Event flow (async):
// 1. Supabase Edge Function inserts event to DB
// 2. Edge Function returns immediately (< 100ms)
// 3. Achievement processing happens in background
// 4. Notifications written to DB
// 5. Realtime pushes notification to app
// 6. AchievementToastManager shows toast
```

**Key principles:**
- **Fire-and-forget**: All event emissions use `void` + `.catch()` pattern - never `await`
- **5-second timeout**: Requests timeout after 5 seconds to prevent hanging
- **Graceful degradation**: Event failures don't block UI, errors logged to Sentry
- **Realtime delivery**: Achievements delivered via subscriptions, not sync responses

---

## Supabase Edge Functions

### Edge Functions (9 total)

**Event & Achievement Pipeline:**
1. **events-ingress** - Accepts authenticated event requests, inserts to `events` table, returns immediately (< 100ms)
2. **process-achievements** - Background queue worker that processes unprocessed events in batches (batch size 50, with retry logic). Uses shared rules from `/packages/achievement-rules/`
3. **create-catch** - Handles catch creation with support for catch confirmation/approval mode

**Scheduled:**
4. **rotate-dailys** - Cron-triggered daily task rotation per convention timezone
5. **expire-pending-catches** - Cleanup/expiration of pending catch confirmations

**NFC & Tags:**
6. **register-tag** - NFC tag registration, linking to fursuits, and QR code generation
7. **lookup-tag** - Tag lookup for scanning

**Notifications:**
8. **send-push** - Push notification delivery using Expo Push API

**Account:**
9. **delete-account** - Authenticated account deletion with cascading data removal

**Design principle:** Edge Functions are **stateless** and **fast**. They validate requests, perform database operations, and return quickly. Achievement evaluation is handled by the background queue worker (`process-achievements`).

---

## Important Conventions

### Query Keys
```typescript
export const FEATURE_QUERY_KEY = 'feature';
export const featureQueryKey = (id: string) => [FEATURE_QUERY_KEY, id] as const;
```

### Event Types
Use `snake_case`: `catch_performed`, `profile_updated`, `onboarding_completed`

### Achievement Keys
Use `SCREAMING_SNAKE_CASE`: `FIRST_CATCH`, `DEBUT_PERFORMANCE`, `PROFILE_COMPLETE`

### Realtime Channel Naming
Include user ID and instance ID: `feature:user:${userId}:${instanceId}`

### Error Handling
Always capture errors to Sentry with context:
```typescript
captureHandledException(error, {
  scope: 'feature.action',
  additionalContext: value
});
```

Use `captureSupabaseError(error)` for Supabase-specific errors.

### Graceful Degradation
Non-critical operations (like event emission) should return `null` on error, not throw. The UI should continue working even if background operations fail.

### TypeScript Configuration
- Strict mode enabled
- Path alias: `@/*` maps to `src/*`
- Types are auto-generated from Supabase schema (see `/src/types/database.ts`)

### File-Based Routing (Expo Router)
- `(auth)` - Group for unauthenticated routes
- `(tabs)` - Main app with bottom tabs
- `[id]` - Dynamic route segments
- `_layout.tsx` - Layout/wrapper components

---

## Integration Points

### Supabase
- **Database:** PostgreSQL with typed client (types auto-generated)
- **Auth:** JWT-based authentication
- **Storage:** Image uploads for avatars/fursuits
- **Realtime:** Postgres changes for live notifications
- **Edge Functions:** 9 functions (see Supabase Edge Functions section)
- **Cron:** Daily task rotation and pending catch expiration via scheduled functions

**Key tables:** `profiles`, `fursuits`, `catches`, `events`, `achievements`, `user_achievements`, `user_awards`, `awards_log`, `notifications`, `daily_tasks`, `conventions`, `tags`, `pending_catches`

**Key RPC functions:** `grant_achievements_batch` (atomic achievement awards)

### Monitoring
- **Sentry:** Error tracking and performance monitoring
- Breadcrumbs for debugging user flows
- User context automatically set on auth
- Event emission failures captured with context
- Metro bundler wrapped via `@sentry/react-native/metro`

### Build & Deployment
- **EAS Build:** Three build profiles (development, preview, production)
  - Development: Debug builds with simulator support (iOS) and APK (Android)
  - Preview: Internal release builds (APK for Android)
  - Production: Store distribution (app-bundle for Android, release for iOS)
- **CI Pipeline:** GitHub Actions workflow (`.github/workflows/ci.yml`)
  - Runs on pushes to `dev` branch and all pull requests
  - Steps: checkout → install → doctor → lint → typecheck
  - Node.js 20 required

---

## Common Workflows

### Adding a New Feature
1. Create feature module in `/src/features/[feature-name]/`
2. Follow the standard structure: `api/`, `components/`, `hooks/`, `types.ts`, `index.ts`
3. Export query keys and API functions from `api/`
4. Create query options helpers for React Query
5. Add screen routes in `/app/` if needed
6. Update TypeScript paths if necessary

### Adding a New Achievement
1. Add achievement definition to Supabase `achievements` table
2. Implement rule evaluation in `/packages/achievement-rules/src/`
3. Add event type handling in `/supabase/functions/events-ingress/achievements.ts`
4. Test event flow: App → Edge Function → Async Processing → Realtime → App
5. Verify notification appears in `AchievementToastManager`

### Modifying Realtime Subscriptions
1. Identify the appropriate Toast Manager component
2. Update subscription logic in `useEffect` with proper cleanup
3. Ensure cache invalidation occurs on realtime events
4. Test race conditions (data loaded before subscription active)

### Deploying Changes
1. **Mobile app:** Build via EAS (`eas build --profile [profile] --platform [platform]`)
2. **OTA updates:** Pushes to `dev` auto-publish to the `staging` EAS Update channel; pushes to `main` auto-publish to `production`. Add `[skip eas]` to the merge commit to opt out (e.g. for formatting-only commits). Runtime version uses the `appVersion` policy — bump `version` in `package.json` when shipping native-breaking changes so older builds stop receiving new JS.
3. **Supabase Edge Functions:** `npx supabase functions deploy [function-name]`
4. **Database changes:** Apply migrations via Supabase CLI or dashboard
5. **Achievement rules:** Deploy edge function after updating `/packages/achievement-rules/`
6. **CI validation:** Ensure `npm run ci:validate` passes before merging to `dev`

---

## Supabase Workflow

### Environments
Unless explicitly stated, all changes, migrations, and Edge Function updates are to go to the **dev environment**:
- **Supabase Project Ref:** `rtxbvjicfxgcouufumce`
- **Project URL:** `https://rtxbvjicfxgcouufumce.supabase.co`

Only apply changes to other environments (staging, production) if explicitly instructed or after approval.

### Tools & Best Practices

**Always use the Supabase MCP tools** (prefixed with `mcp__supabase__`) for all Supabase-related operations — never the Supabase CLI. This includes:
- Running SQL and applying migrations (`mcp__supabase__execute_sql`, `mcp__supabase__apply_migration`)
- Deploying edge functions (`mcp__supabase__deploy_edge_function`)
- Listing tables, extensions, and migrations
- Managing branches
- Fetching logs, project URLs, and API keys
- Generating TypeScript types

The MCP tools operate against the linked Supabase project directly and avoid local CLI configuration issues.

**Always write a migration file before applying database changes.** Every DDL change (CREATE, ALTER, DROP) must be written to a `.sql` file in `supabase/migrations/` with a timestamp-prefixed name (e.g. `20260410120000_description.sql`) **before** applying it via `mcp__supabase__apply_migration`. This ensures changes are tracked in source control and automatically applied to other environments (staging, production) when the branch is merged to `dev`. Never apply ad-hoc SQL changes without a corresponding migration file.

---

## Important Notes

- **No test framework configured yet** - consider adding Jest or Vitest for unit tests
- **Environment variables:** Use `.env.local` with Expo public prefix for client-side vars
- **Strict TypeScript:** All code must pass `npm run typecheck` with no errors
- **Zero-warning linting:** `npm run lint` enforces max warnings = 0
- **Path aliases:** Use `@/` prefix to import from `src/` (e.g., `@/features/auth`)
- **Toast managers are mounted once** in app root layout (`app/_layout.tsx`) - don't create duplicate subscriptions (4 managers: Achievement, DailyTask, CatchConfirmation, PushNotification)
- **Event emission is fire-and-forget** - NEVER `await emitGameplayEvent()`, always use `void` + `.catch()`
- **5-second timeout on events** - prevents UI from hanging on network issues
- **Async achievement processing** - achievements delivered via Realtime, not sync responses
