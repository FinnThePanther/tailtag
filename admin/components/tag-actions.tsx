'use client';

import { useState, useTransition } from 'react';

import {
  linkTagAction,
  unlinkTagAction,
  markTagLostAction,
  markTagFoundAction,
  generateQrForTagAction,
  rotateQrForTagAction,
  revokeQrForTagAction,
  createQrDownloadUrlAction,
} from '@/app/(dashboard)/tags/actions';

type Props = {
  tagId: string;
  nfcUid?: string | null;
  status: string;
  fursuitName?: string | null;
  qrToken?: string | null;
  qrAssetPath?: string | null;
};

export function TagActions({ tagId, nfcUid, status, fursuitName, qrToken, qrAssetPath }: Props) {
  const [fursuitId, setFursuitId] = useState('');
  const [message, setMessage] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const doAction = (fn: () => Promise<void>, success: string) => {
    setMessage(null);
    startTransition(async () => {
      await fn();
      setMessage(success);
    });
  };

  const handleDownload = () => {
    if (!qrAssetPath) return;
    doAction(async () => {
      const url = await createQrDownloadUrlAction({ assetPath: qrAssetPath });
      if (url) {
        window.open(url, '_blank');
      } else {
        throw new Error('Failed to create download link');
      }
    }, 'Download ready');
  };

  const nfcControlsDisabled = !nfcUid;

  return (
    <div className="flex flex-col gap-2 text-xs text-slate-200">
      <div className="text-muted">
        <p>Tag ID: <span className="font-mono">{tagId}</span></p>
        <p>NFC UID: <span className="font-mono">{nfcUid ?? '—'}</span></p>
      </div>
      <div className="flex gap-2">
        <input
          value={fursuitId}
          onChange={(e) => setFursuitId(e.target.value)}
          placeholder="Fursuit ID"
          className="w-40 rounded-lg border border-border bg-background px-2 py-1 text-xs text-slate-100 outline-none focus:border-primary"
        />
        <button
          type="button"
          disabled={isPending || !fursuitId}
          onClick={() => doAction(() => linkTagAction({ tagId, fursuitId }), 'Linked')}
          className="rounded-lg border border-border px-2 py-1 font-semibold transition hover:border-primary disabled:opacity-50"
        >
          {isPending ? 'Working…' : 'Link'}
        </button>
        <button
          type="button"
          disabled={isPending}
          onClick={() => doAction(() => unlinkTagAction({ tagId }), 'Unlinked')}
          className="rounded-lg border border-border px-2 py-1 font-semibold transition hover:border-primary disabled:opacity-50"
        >
          Unlink
        </button>
      </div>
      <div className="flex gap-2">
        <button
          type="button"
          disabled={isPending || nfcControlsDisabled}
          onClick={() => doAction(() => markTagLostAction({ tagId }), 'Marked lost')}
          className="rounded-lg border border-red-500/60 px-2 py-1 font-semibold text-red-100 transition hover:bg-red-500/10 disabled:opacity-50"
        >
          Lost
        </button>
        <button
          type="button"
          disabled={isPending || nfcControlsDisabled}
          onClick={() => doAction(() => markTagFoundAction({ tagId }), 'Marked active')}
          className="rounded-lg border border-emerald-500/60 px-2 py-1 font-semibold text-emerald-100 transition hover:bg-emerald-500/10 disabled:opacity-50"
        >
          Found
        </button>
      </div>
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          disabled={isPending || Boolean(qrToken)}
          onClick={() => doAction(() => generateQrForTagAction({ tagId }), 'QR generated')}
          className="rounded-lg border border-border px-2 py-1 font-semibold transition hover:border-primary disabled:opacity-50"
        >
          Generate QR
        </button>
        <button
          type="button"
          disabled={isPending || !qrToken}
          onClick={() => doAction(() => rotateQrForTagAction({ tagId }), 'QR rotated')}
          className="rounded-lg border border-border px-2 py-1 font-semibold transition hover:border-primary disabled:opacity-50"
        >
          Rotate QR
        </button>
        <button
          type="button"
          disabled={isPending || !qrToken}
          onClick={() => doAction(() => revokeQrForTagAction({ tagId }), 'QR revoked')}
          className="rounded-lg border border-red-500/60 px-2 py-1 font-semibold text-red-100 transition hover:bg-red-500/10 disabled:opacity-50"
        >
          Revoke QR
        </button>
        <button
          type="button"
          disabled={isPending || !qrAssetPath}
          onClick={handleDownload}
          className="rounded-lg border border-border px-2 py-1 font-semibold transition hover:border-primary disabled:opacity-50"
        >
          Download QR
        </button>
      </div>
      {fursuitName ? <p className="text-muted">Linked to: {fursuitName}</p> : null}
      {message ? <p className="text-primary">{message}</p> : null}
      {status ? <p className="text-muted">Status: {status}</p> : null}
    </div>
  );
}
