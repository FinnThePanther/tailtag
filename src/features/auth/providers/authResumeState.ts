export type AuthStatus = 'loading' | 'checking_session' | 'signed_in' | 'signed_out';

export type AuthResumeState<SessionLike> = {
  session: SessionLike | null;
  status: AuthStatus;
  isRevalidatingSession: boolean;
  pendingSignedOutDuringCheck: boolean;
  intentionalSignOut: boolean;
};

export function createAuthResumeState<SessionLike>(
  session: SessionLike | null,
  status: AuthStatus,
): AuthResumeState<SessionLike> {
  return {
    session,
    status,
    isRevalidatingSession: false,
    pendingSignedOutDuringCheck: false,
    intentionalSignOut: false,
  };
}

export function beginForegroundSessionCheck<SessionLike>(
  state: AuthResumeState<SessionLike>,
): AuthResumeState<SessionLike> {
  return {
    ...state,
    status: state.session ? 'checking_session' : state.status,
    isRevalidatingSession: true,
    pendingSignedOutDuringCheck: false,
  };
}

export function setIntentionalSignOut<SessionLike>(
  state: AuthResumeState<SessionLike>,
  intentionalSignOut: boolean,
): AuthResumeState<SessionLike> {
  return {
    ...state,
    intentionalSignOut,
    pendingSignedOutDuringCheck: intentionalSignOut ? false : state.pendingSignedOutDuringCheck,
  };
}

export function applyResolvedSession<SessionLike>(
  state: AuthResumeState<SessionLike>,
  session: SessionLike | null,
): AuthResumeState<SessionLike> {
  return {
    ...state,
    session,
    status: session ? 'signed_in' : 'signed_out',
    isRevalidatingSession: false,
    pendingSignedOutDuringCheck: false,
  };
}

export function applyAuthStateChange<SessionLike>(
  state: AuthResumeState<SessionLike>,
  event: string,
  nextSession: SessionLike | null,
): { state: AuthResumeState<SessionLike>; deferred: boolean } {
  if (
    event === 'SIGNED_OUT' &&
    state.isRevalidatingSession &&
    state.session &&
    !state.intentionalSignOut
  ) {
    return {
      state: {
        ...state,
        pendingSignedOutDuringCheck: true,
      },
      deferred: true,
    };
  }

  return {
    state: applyResolvedSession(state, nextSession),
    deferred: false,
  };
}

export function completeSessionResolution<SessionLike>(
  state: AuthResumeState<SessionLike>,
  source: 'initial' | 'foreground',
  activeSession: SessionLike | null,
): { state: AuthResumeState<SessionLike>; preservedSession: boolean } {
  if (
    source === 'foreground' &&
    state.session &&
    !activeSession &&
    !state.pendingSignedOutDuringCheck
  ) {
    return {
      state: {
        ...state,
        status: 'signed_in',
        isRevalidatingSession: false,
        pendingSignedOutDuringCheck: false,
      },
      preservedSession: true,
    };
  }

  return {
    state: applyResolvedSession(state, activeSession),
    preservedSession: false,
  };
}

export function shouldRedirectToAuth(
  status: AuthStatus,
  hasSession: boolean,
  inPublicAuthFlow: boolean,
): boolean {
  return status === 'signed_out' && !hasSession && !inPublicAuthFlow;
}
