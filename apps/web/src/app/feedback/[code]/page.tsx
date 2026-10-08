"use client";

import { API_URL } from "@/lib/api";
import { useParams, useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";

type Survey = {
  campaignName: string;
  question: string;
  organizationName: string;
  promoterName: string;
};

const ratings = [
  { value: 1, face: "😠", label: "Muy insatisfecho", color: "border-red-300 bg-red-50 hover:bg-red-100" },
  { value: 2, face: "🙁", label: "Insatisfecho", color: "border-orange-300 bg-orange-50 hover:bg-orange-100" },
  { value: 3, face: "😐", label: "Normal", color: "border-amber-300 bg-amber-50 hover:bg-amber-100" },
  { value: 4, face: "🙂", label: "Satisfecho", color: "border-lime-300 bg-lime-50 hover:bg-lime-100" },
  { value: 5, face: "😄", label: "Muy satisfecho", color: "border-emerald-300 bg-emerald-50 hover:bg-emerald-100" },
];

export default function PublicFeedbackPage() {
  const params = useParams<{ code: string }>();
  const router = useRouter();
  const code = useMemo(() => decodeURIComponent(params.code), [params.code]);
  const [survey, setSurvey] = useState<Survey | null>(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    const storageKey = `assettrack-feedback-${code}`;
    if (window.localStorage.getItem(storageKey)) {
      router.replace("/feedback/thanks");
      return;
    }
    fetch(`${API_URL}/api/v1/feedback/public/${encodeURIComponent(code)}`, {
      cache: "no-store",
    })
      .then(async (response) => {
        if (!response.ok) {
          const body = await response.json().catch(() => ({}));
          throw new Error(body.message ?? "Esta encuesta no está disponible.");
        }
        return response.json();
      })
      .then(setSurvey)
      .catch((cause) =>
        setError(cause instanceof Error ? cause.message : "No fue posible abrir la encuesta."),
      )
      .finally(() => setLoading(false));
  }, [code, router]);

  async function vote(rating: number) {
    if (submitting || submitted) return;
    setSubmitting(true);
    setError("");
    const response = await fetch(
      `${API_URL}/api/v1/feedback/public/${encodeURIComponent(code)}/votes`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ rating }),
      },
    );
    const body = await response.json().catch(() => ({}));
    if (!response.ok) {
      setSubmitting(false);
      setError(body.message ?? "No fue posible registrar su opinión.");
      return;
    }
    window.localStorage.setItem(
      `assettrack-feedback-${code}`,
      new Date().toISOString(),
    );
    setSubmitted(true);
    window.setTimeout(() => router.replace("/feedback/thanks"), 1600);
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-gradient-to-b from-sky-50 via-white to-emerald-50 p-5 text-slate-950">
      <section className="w-full max-w-2xl rounded-3xl border border-white bg-white/95 p-6 shadow-2xl sm:p-10">
        {loading && <p className="text-center text-lg font-semibold text-slate-600">Abriendo encuesta…</p>}

        {!loading && error && !survey && (
          <div className="text-center">
            <p className="text-5xl">🔒</p>
            <h1 className="mt-4 text-2xl font-black">Encuesta no disponible</h1>
            <p className="mt-2 text-slate-600">{error}</p>
          </div>
        )}

        {survey && !submitted && (
          <>
            <div className="text-center">
              <p className="text-xs font-black uppercase tracking-[0.22em] text-sky-700">{survey.organizationName}</p>
              <h1 className="mt-2 text-3xl font-black">{survey.campaignName}</h1>
              <p className="mt-3 text-lg text-slate-600">{survey.question}</p>
            </div>
            <div className="mt-8 grid grid-cols-5 gap-2 sm:gap-3" aria-label="Opciones de valoración">
              {ratings.map((rating) => (
                <button
                  key={rating.value}
                  type="button"
                  disabled={submitting}
                  onClick={() => void vote(rating.value)}
                  aria-label={`${rating.value} de 5: ${rating.label}`}
                  className={`flex min-h-28 flex-col items-center justify-center rounded-2xl border-2 p-2 transition hover:-translate-y-1 hover:shadow-lg disabled:opacity-40 ${rating.color}`}
                >
                  <span aria-hidden="true" className="text-4xl sm:text-5xl">{rating.face}</span>
                  <span className="mt-2 hidden text-xs font-bold sm:block">{rating.label}</span>
                </button>
              ))}
            </div>
            <div className="mt-5 flex justify-between text-xs font-semibold text-slate-500">
              <span>Insatisfecho</span><span>Normal</span><span>Feliz</span>
            </div>
            {submitting && <p role="status" className="mt-5 text-center font-bold text-sky-800">Registrando su opinión…</p>}
            {error && <p role="alert" className="mt-5 rounded-xl bg-red-50 p-4 text-center font-semibold text-red-800">{error}</p>}
            <p className="mt-7 text-center text-xs text-slate-500">Su voto es secreto. No solicitamos ni almacenamos datos personales.</p>
          </>
        )}

        {submitted && (
          <div className="py-8 text-center" role="status">
            <p className="text-6xl">✓</p>
            <h1 className="mt-4 text-3xl font-black text-emerald-800">¡Gracias por su opinión!</h1>
            <p className="mt-2 text-slate-600">Su valoración fue registrada de forma anónima.</p>
          </div>
        )}
      </section>
    </main>
  );
}
