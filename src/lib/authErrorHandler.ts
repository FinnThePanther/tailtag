/**
 * Centralized auth error handling.
 *
 * When we detect an auth error (401 Unauthorized), we should force sign out
 * to prevent the user from being stuck with stale data and failing requests.
 */

type ForceSignOutFn = () => Promise<void>;

let forceSignOutHandler: ForceSignOutFn | null = null;

/**
 * Register the force sign out handler from AuthProvider.
 * This should be called once when AuthProvider mounts.
 */
export function registerForceSignOut(handler: ForceSignOutFn) {
  forceSignOutHandler = handler;
}

/**
 * Unregister the force sign out handler.
 * This should be called when AuthProvider unmounts.
 */
export function unregisterForceSignOut() {
  forceSignOutHandler = null;
}

/**
 * Check if an error is an auth error (401 Unauthorized).
 */
export function isAuthError(error: unknown): boolean {
  if (error instanceof Error) {
    const message = error.message.toLowerCase();
    return (
      message.includes('unauthorized') ||
      message.includes('401') ||
      message.includes('jwt expired') ||
      message.includes('invalid token') ||
      message.includes('token expired')
    );
  }
  return false;
}

/**
 * Handle an auth error by forcing sign out if possible.
 * Returns true if the error was handled, false otherwise.
 */
export async function handleAuthError(error: unknown): Promise<boolean> {
  if (!isAuthError(error)) {
    return false;
  }

  if (forceSignOutHandler) {
    console.warn('[AuthErrorHandler] Detected auth error, forcing sign out');
    await forceSignOutHandler();
    return true;
  }

  console.warn('[AuthErrorHandler] Auth error detected but no handler registered');
  return false;
}

/**
 * Check if force sign out handler is registered.
 */
export function hasForceSignOutHandler(): boolean {
  return forceSignOutHandler !== null;
}
