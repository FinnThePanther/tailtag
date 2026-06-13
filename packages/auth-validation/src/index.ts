const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function isValidEmail(email: string): boolean {
  return EMAIL_REGEX.test(email.trim());
}

export type PasswordStrength = 'weak' | 'fair' | 'good' | 'strong';

export interface PasswordRequirements {
  minLength: boolean;
  hasUppercase: boolean;
  hasLowercase: boolean;
  hasNumber: boolean;
  hasSpecial: boolean;
}

export interface PasswordValidation {
  strength: PasswordStrength;
  score: number;
  requirements: PasswordRequirements;
  isAcceptable: boolean;
}

export function validatePassword(password: string): PasswordValidation {
  const requirements: PasswordRequirements = {
    minLength: password.length >= 8,
    hasUppercase: /[A-Z]/.test(password),
    hasLowercase: /[a-z]/.test(password),
    hasNumber: /[0-9]/.test(password),
    hasSpecial: /[^A-Za-z0-9]/.test(password),
  };

  const score = Object.values(requirements).filter(Boolean).length;

  const strengthMap: Record<number, PasswordStrength> = {
    0: 'weak',
    1: 'weak',
    2: 'fair',
    3: 'good',
    4: 'good',
    5: 'strong',
  };

  return {
    strength: strengthMap[score] ?? 'weak',
    score,
    requirements,
    isAcceptable: Object.values(requirements).every(Boolean),
  };
}

const SUPABASE_ERROR_MAP: Record<string, string> = {
  'Invalid login credentials': 'Incorrect email or password.',
  'Email not confirmed': 'Please check your email and confirm your account before signing in.',
  'User already registered': 'An account with this email already exists. Try signing in instead.',
  'Password should be at least 6 characters':
    'Password must be at least 8 characters with uppercase, lowercase, a number, and a special character.',
  'For security purposes, you can only request this once every 60 seconds':
    'Please wait a minute before trying again.',
  'Email rate limit exceeded': 'Too many attempts. Please wait a few minutes and try again.',
  over_email_send_rate_limit: 'Too many attempts. Please wait a few minutes and try again.',
};

const AUTH_NETWORK_ERROR_PATTERNS = [
  /network request failed/i,
  /failed to fetch/i,
  /fetch failed/i,
  /load failed/i,
  /internet connection appears to be offline/i,
  /server with the specified hostname could not be found/i,
  /network connection was lost/i,
  /\btimed out\b/i,
  /NSURLErrorDomain/i,
];

export function mapAuthError(error: unknown): string {
  if (error && typeof error === 'object') {
    const err = error as { message?: string; status?: number; code?: string };

    if (err.status === 429 || err.code === 'over_email_send_rate_limit') {
      return 'Too many attempts. Please wait a few minutes and try again.';
    }

    if (err.message) {
      const mapped = SUPABASE_ERROR_MAP[err.message];
      if (mapped) return mapped;

      if (err.message.toLowerCase().includes('rate limit')) {
        return 'Too many attempts. Please wait a few minutes and try again.';
      }

      if (AUTH_NETWORK_ERROR_PATTERNS.some((pattern) => pattern.test(err.message ?? ''))) {
        return "We couldn't reach TailTag. Check your connection and try again.";
      }

      return err.message;
    }
  }

  return 'Something went wrong. Please try again later.';
}
