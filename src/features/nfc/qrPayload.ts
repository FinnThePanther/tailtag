export type ParsedQrPayload = {
  token: string;
  version: string;
};

const QR_URL_PREFIX = 'tailtag://catch';

export function parseTailTagQrPayload(payload: string | null | undefined): ParsedQrPayload | null {
  if (!payload) {
    return null;
  }

  try {
    const maybeUrl = new URL(payload);
    if (`${maybeUrl.protocol}//${maybeUrl.host}${maybeUrl.pathname}` !== `${new URL(QR_URL_PREFIX).protocol}//${new URL(QR_URL_PREFIX).host}${new URL(QR_URL_PREFIX).pathname}`) {
      return null;
    }
    const token = maybeUrl.searchParams.get('t');
    const version = maybeUrl.searchParams.get('v');
    if (!token || !version) {
      return null;
    }
    return { token, version };
  } catch {
    const fallbackMatch = payload.match(/^tailtag:\/\/catch\?v=([0-9]+)&t=([A-Za-z0-9]+)$/);
    if (!fallbackMatch) {
      return null;
    }
    return {
      version: fallbackMatch[1],
      token: fallbackMatch[2],
    };
  }
}
