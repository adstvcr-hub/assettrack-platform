'use client';

import { Suspense, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useSearchParams } from 'next/navigation';

function ScanPageContent() {
  const router = useRouter();

const scannerRef = useRef<any>(null);

  const searchParams = useSearchParams();
 const [qrCode, setQrCode] = useState('');
  const [hydrated, setHydrated] = useState(false);
  const [notes, setNotes] = useState('');
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [scanning, setScanning] = useState(false);
  const [submitting, setSubmitting] = useState(false);
 

useEffect(() => {
  const codeFromUrl = searchParams.get('code');

  if (!codeFromUrl) {
    return;
  }

  const normalizedCode = codeFromUrl.trim().toUpperCase();

  setQrCode(normalizedCode);
  setMessage(`QR detected: ${normalizedCode}`);
}, [searchParams]);

useEffect(() => {
  setHydrated(true);

  const token = sessionStorage.getItem('assettrack_token');

  if (!token) {
    const nextPath = `${window.location.pathname}${window.location.search}`;

    router.replace(
      `/?next=${encodeURIComponent(nextPath)}`
    );

    return;
  }

  return () => {
    if (scannerRef.current?.isScanning) {
      scannerRef.current.stop().catch(() => undefined);
    }
  };
}, [router]);

  function normalizeCode(decodedText: string) {
    const match = decodedText.match(/ATQR-[A-Z0-9]+/i);

    if (match) {
      return match[0].toUpperCase();
    }

    return decodedText.trim();
  }

async function startScanner() {
  setError('');
  setMessage('Starting camera...');

  try {
    if (!window.isSecureContext) {
      throw new Error(
        'Camera requires a secure HTTPS connection on iPhone Safari.',
      );
    }

    if (!navigator.mediaDevices?.getUserMedia) {
      throw new Error(
        'Camera API is not available in this browser or connection.',
      );
    }

    const permissionTest = await navigator.mediaDevices.getUserMedia({
      video: {
        facingMode: 'environment',
      },
    });

    permissionTest.getTracks().forEach((track) => track.stop());

    const { Html5Qrcode } = await import('html5-qrcode');

    const scanner = new Html5Qrcode('qr-reader');
    scannerRef.current = scanner;

    await scanner.start(
      { facingMode: 'environment' },
      {
        fps: 10,
        qrbox: {
          width: 250,
          height: 250,
        },
      },
      async (decodedText) => {
        const code = normalizeCode(decodedText);

        setQrCode(code);
        setMessage(`QR detected: ${code}`);

        if (scanner.isScanning) {
          await scanner.stop();
        }

        setScanning(false);
      },
      () => {
        // Ignore individual frames where no QR is detected.
      },
    );

    setScanning(true);
    setMessage('Camera started');
  } catch (err) {
    setScanning(false);

    const details =
      err instanceof Error
        ? `${err.name}: ${err.message}`
        : String(err);

    setMessage('');
    setError(details);
  }
}

  async function stopScanner() {
    try {
      if (scannerRef.current?.isScanning) {
        await scannerRef.current.stop();
      }
    } finally {
      setScanning(false);
    }
  }

  async function submitScan() {
    const token = sessionStorage.getItem('assettrack_token');

    if (!token) {
  router.replace('/?next=/scan');
}

    if (!qrCode) {
      setError('Scan a QR code first');
      return;
    }

    setSubmitting(true);
    setError('');
    setMessage('');

    try {
      const response = await fetch(
        `${process.env.NEXT_PUBLIC_API_URL}/api/v1/scan/${encodeURIComponent(qrCode)}`,
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            notes: notes || undefined,
          }),
        },
      );

      const data = await response.json();

      if (response.status === 401) {
        sessionStorage.clear();
        router.replace('/');
        return;
      }

      if (!response.ok) {
        throw new Error(
          Array.isArray(data.message)
            ? data.message.join(', ')
            : data.message ?? 'Unable to record scan',
        );
      }

      setMessage(
        `Scan recorded for ${data.asset?.name ?? qrCode}`,
      );

      setNotes('');
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : 'Unable to record scan',
      );
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <main className="min-h-screen bg-slate-100">
      <header className="border-b bg-white">
        <div className="mx-auto flex max-w-5xl items-center justify-between px-6 py-5">
          <div>
            <p className="text-sm font-semibold uppercase tracking-[0.2em] text-slate-500">
              AssetTrack
            </p>

            <h1 className="text-2xl font-bold text-slate-900">
              Scan QR
      <p className="mt-2 text-sm text-slate-500">
  Interactive: {hydrated ? 'YES' : 'NO'}
</p> 
            </h1>
          </div>

          <button
            onClick={() => router.push('/dashboard')}
            className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white"
          >
            Dashboard
          </button>
        </div>
      </header>

      <section className="mx-auto max-w-5xl px-6 py-10">
        <div className="grid gap-8 lg:grid-cols-2">
          <div className="rounded-xl bg-white p-6 shadow-sm">
            <h2 className="text-xl font-bold text-slate-900">
              Camera
            </h2>

            <p className="mt-2 text-sm text-slate-500">
              Point the camera at an AssetTrack QR code.
            </p>

            <div
              id="qr-reader"
              className="mt-6 overflow-hidden rounded-xl"
            />

            <div className="mt-6 flex gap-3">
              <button
                onClick={startScanner}
                disabled={scanning}
                className="rounded-lg bg-slate-900 px-4 py-3 font-semibold text-white disabled:opacity-50"
              >
                Start camera
              </button>

              <button
                onClick={stopScanner}
                disabled={!scanning}
                className="rounded-lg border border-slate-300 px-4 py-3 font-semibold text-slate-700 disabled:opacity-50"
              >
                Stop
              </button>
            </div>
          </div>

          <div className="rounded-xl bg-white p-6 shadow-sm">
            <h2 className="text-xl font-bold text-slate-900">
              Record scan
            </h2>

            <div className="mt-6">
              <label className="mb-2 block text-sm font-medium text-slate-700">
                QR code
              </label>

              <input
                value={qrCode}
                onChange={(event) =>
                  setQrCode(event.target.value.toUpperCase())
                }
                placeholder="ATQR-..."
                className="w-full rounded-lg border border-slate-300 px-4 py-3"
              />
            </div>

            <div className="mt-5">
              <label className="mb-2 block text-sm font-medium text-slate-700">
                Notes
              </label>

              <textarea
                value={notes}
                onChange={(event) => setNotes(event.target.value)}
                placeholder="Optional notes about this scan"
                className="min-h-32 w-full rounded-lg border border-slate-300 px-4 py-3"
              />
            </div>

            <button
              onClick={submitScan}
              disabled={submitting || !qrCode}
              className="mt-6 w-full rounded-lg bg-slate-900 px-4 py-3 font-semibold text-white disabled:opacity-50"
            >
              {submitting ? 'Recording...' : 'Record scan'}
            </button>

            {message && (
              <p className="mt-5 rounded-lg bg-green-50 p-4 text-green-700">
                {message}
              </p>
            )}

            {error && (
              <p className="mt-5 rounded-lg bg-red-50 p-4 text-red-700">
                {error}
              </p>
            )}
          </div>
        </div>
      </section>
    </main>
  );
}
export default function ScanPage() {
  return (
    <Suspense
      fallback={
        <main className="min-h-screen bg-slate-100 p-6">
          <p className="text-slate-600">Loading scanner...</p>
        </main>
      }
    >
      <ScanPageContent />
    </Suspense>
  );
}
