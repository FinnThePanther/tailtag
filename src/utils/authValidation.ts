const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function isValidEmail(email: string): boolean {
  return EMAIL_REGEX.test(email.trim());
}

export type PasswordStrength = 'weak' | 'fair' | 'good' | 'strong';

export interface PasswordRequirements {
  minLength: boolean; // 8+ chars
  hasUppercase: boolean;
  hasLowercase: boolean;
  hasNumber: boolean;
  hasSpecial: boolean;
}

export interface PasswordValidation {
  strength: PasswordStrength;
  score: number; // 0–5
  requirements: PasswordRequirements;
  isAcceptable: boolean; // all 5 requirements met
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

      return err.message;
    }
  }

  return 'Something went wrong. Please try again later.';
}
