type JwtPayload = Record<string, unknown>;

const textEncoder = new TextEncoder();

function decodeBase64Url(segment: string): Uint8Array | null {
  try {
    const normalized = segment.replace(/-/g, '+').replace(/_/g, '/');
    const padded = normalized.padEnd(normalized.length + ((4 - (normalized.length % 4)) % 4), '=');
    const binary = atob(padded);
    const bytes = new Uint8Array(binary.length);

    for (let index = 0; index < binary.length; index += 1) {
      bytes[index] = binary.charCodeAt(index);
    }

    return bytes;
  } catch {
    return null;
  }
}

function decodeJsonSegment(segment: string): JwtPayload | null {
  const bytes = decodeBase64Url(segment);
  if (!bytes) {
    return null;
  }

  try {
    const decoded = new TextDecoder().decode(bytes);
    const parsed = JSON.parse(decoded);
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

function timingSafeEqual(left: Uint8Array, right: Uint8Array): boolean {
  if (left.length !== right.length) {
    return false;
  }

  let diff = 0;
  for (let index = 0; index < left.length; index += 1) {
    diff |= left[index] ^ right[index];
  }

  return diff === 0;
}

function isValidTimestampClaim(value: unknown, nowSeconds: number, direction: 'before' | 'after') {
  if (value === undefined || value === null) {
    return true;
  }

  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return false;
  }

  return direction === 'before' ? nowSeconds < value : nowSeconds >= value;
}

export async function verifyHs256Jwt(token: string, secret: string): Promise<JwtPayload | null> {
  const [encodedHeader, encodedPayload, encodedSignature, extra] = token.split('.');
  if (!encodedHeader || !encodedPayload || !encodedSignature || extra !== undefined) {
    return null;
  }

  const header = decodeJsonSegment(encodedHeader);
  const payload = decodeJsonSegment(encodedPayload);
  const signature = decodeBase64Url(encodedSignature);

  if (!header || !payload || !signature || header.alg !== 'HS256') {
    return null;
  }

  const key = await crypto.subtle.importKey(
    'raw',
    textEncoder.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const expectedSignature = new Uint8Array(
    await crypto.subtle.sign('HMAC', key, textEncoder.encode(`${encodedHeader}.${encodedPayload}`)),
  );

  if (!timingSafeEqual(signature, expectedSignature)) {
    return null;
  }

  const nowSeconds = Math.floor(Date.now() / 1000);
  if (
    !isValidTimestampClaim(payload.exp, nowSeconds, 'before') ||
    !isValidTimestampClaim(payload.nbf, nowSeconds, 'after')
  ) {
    return null;
  }

  return payload;
}
