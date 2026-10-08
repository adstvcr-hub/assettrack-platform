"use client";

import { API_URL, authenticatedFetch } from "@/lib/api";
import { getSessionValue } from "@/lib/session";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { FormEvent, useCallback, useEffect, useState } from "react";

type Promoter = { id: string; name: string; code: string; active: boolean; _count: { votes: number } };
type Campaign = {
  id: string;
  name: string;
  question: string;
  active: boolean;
  promoters: Promoter[];
  _count: { promoters: number; votes: number };
};
type Dashboard = {
  summary: { total: number; average: number; positive: number; positivePercent: number };
  distribution: Array<{ rating: number; count: number }>;
  promoters: Array<{
    id: string;
    name: string;
    active: boolean;
    campaign: { id: string; name: string };
    voteCount: number;
    average: number;
    ratings: Array<{ rating: number; count: number }>;
  }>;
  recentVotes: Array<{
    id: string;
    rating: number;
    createdAt: string;
    promoter: { id: string; name: string };
    campaign: { id: string; name: string };
  }>;
};
type QrDetails = { promoterName: string; campaignName: string; accessUrl: string; image: string };

const faces = ["", "😠", "🙁", "😐", "🙂", "😄"];

function localDate(offsetDays = 0) {
  const date = new Date();
  date.setDate(date.getDate() + offsetDays);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

export default function FeedbackAdminPage() {
  const router = useRouter();
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [dashboard, setDashboard] = useState<Dashboard | null>(null);
  const [campaignId, setCampaignId] = useState("");
  const [from, setFrom] = useState(localDate(-29));
  const [to, setTo] = useState(localDate());
  const [campaignName, setCampaignName] = useState("");
  const [question, setQuestion] = useState("¿Cómo califica el servicio recibido?");
  const [promoterName, setPromoterName] = useState("");
  const [qr, setQr] = useState<QrDetails | null>(null);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    if (!getSessionValue("assettrack_token")) {
      router.replace(`/?next=${encodeURIComponent("/feedback/admin")}`);
      return;
    }
    const query = new URLSearchParams({ from, to });
    if (campaignId) query.set("campaignId", campaignId);
    const [campaignResponse, dashboardResponse] = await Promise.all([
      authenticatedFetch(`${API_URL}/api/v1/feedback/admin/campaigns`),
      authenticatedFetch(`${API_URL}/api/v1/feedback/admin/dashboard?${query}`),
    ]);
    if (campaignResponse.status === 401 || dashboardResponse.status === 401) {
      router.replace(`/?next=${encodeURIComponent("/feedback/admin")}`);
      return;
    }
    if (!campaignResponse.ok || !dashboardResponse.ok) {
      setError("No fue posible cargar las encuestas de servicio.");
      return;
    }
    setCampaigns(await campaignResponse.json());
    setDashboard(await dashboardResponse.json());
  }, [campaignId, from, router, to]);

  useEffect(() => { void load(); }, [load]);

  async function mutation(path: string, body: object, method = "POST") {
    setBusy(true); setError(""); setMessage("");
    const response = await authenticatedFetch(`${API_URL}/api/v1/feedback/admin/${path}`, {
      method,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const data = await response.json().catch(() => ({}));
    setBusy(false);
    if (!response.ok) {
      setError(Array.isArray(data.message) ? data.message.join(", ") : data.message ?? "No fue posible completar la operación.");
      return null;
    }
    await load();
    return data;
  }

  async function createCampaign(event: FormEvent) {
    event.preventDefault();
    const created = await mutation("campaigns", { name: campaignName, question });
    if (!created) return;
    setCampaignName("");
    setCampaignId(created.id);
    setMessage("Encuesta creada. Ahora agregue los impulsadores.");
  }

  async function createPromoter(event: FormEvent) {
    event.preventDefault();
    if (!campaignId) return;
    const created = await mutation(`campaigns/${campaignId}/promoters`, { name: promoterName });
    if (!created) return;
    setPromoterName("");
    setMessage("Impulsador creado con su código QR individual.");
  }

  async function showQr(promoterId: string) {
    const response = await authenticatedFetch(`${API_URL}/api/v1/feedback/admin/promoters/${promoterId}/qr`);
    if (!response.ok) { setError("No se pudo generar el código QR."); return; }
    setQr(await response.json());
  }

  function printQr() {
    if (!qr) return;
    const popup = window.open("", "_blank", "width=700,height=800");
    if (!popup) return;
    popup.document.write(`<html><head><title>QR ${qr.promoterName}</title></head><body style="font-family:Arial;text-align:center;padding:40px"><h1>${qr.campaignName}</h1><h2>${qr.promoterName}</h2><img src="${qr.image}" style="width:500px;max-width:100%"/><p>Escanee para valorar el servicio</p></body></html>`);
    popup.document.close(); popup.focus(); popup.print();
  }

  const maxDistribution = Math.max(1, ...(dashboard?.distribution.map((row) => row.count) ?? [1]));

  return (
    <main className="min-h-screen bg-slate-100 text-slate-950">
      <header className="bg-slate-950 px-5 py-5 text-white">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-4">
          <div><p className="text-xs font-black uppercase tracking-[0.22em] text-sky-300">ASSETTRACK · OPINIÓN DE SERVICIO</p><h1 className="mt-1 text-3xl font-black">Encuestas QR</h1></div>
          <button onClick={() => router.push("/dashboard")} className="rounded-xl border border-white/40 px-5 py-3 font-bold">Dashboard principal</button>
        </div>
      </header>

      <div className="mx-auto max-w-7xl space-y-6 p-5">
        {error && <p role="alert" className="rounded-xl bg-red-100 p-4 font-semibold text-red-900">{error}</p>}
        {message && <p role="status" className="rounded-xl bg-emerald-100 p-4 font-semibold text-emerald-900">{message}</p>}

        <section className="grid gap-5 lg:grid-cols-2">
          <form onSubmit={createCampaign} className="rounded-2xl border bg-white p-6 shadow-sm">
            <h2 className="text-xl font-black">Crear encuesta de servicio</h2>
            <label className="mt-4 block font-semibold">Nombre del servicio o campaña<input required maxLength={120} value={campaignName} onChange={(event) => setCampaignName(event.target.value)} className="mt-2 w-full rounded-lg border p-3" placeholder="Ej. Atención en punto de venta" /></label>
            <label className="mt-4 block font-semibold">Pregunta<input required maxLength={240} value={question} onChange={(event) => setQuestion(event.target.value)} className="mt-2 w-full rounded-lg border p-3" /></label>
            <button disabled={busy} className="mt-4 rounded-xl bg-sky-700 px-5 py-3 font-black text-white disabled:opacity-40">Crear encuesta</button>
          </form>

          <form onSubmit={createPromoter} className="rounded-2xl border bg-white p-6 shadow-sm">
            <h2 className="text-xl font-black">Agregar impulsador</h2>
            <label className="mt-4 block font-semibold">Encuesta<select required value={campaignId} onChange={(event) => setCampaignId(event.target.value)} className="mt-2 w-full rounded-lg border p-3"><option value="">Seleccione…</option>{campaigns.map((campaign) => <option key={campaign.id} value={campaign.id}>{campaign.name}{campaign.active ? "" : " (inactiva)"}</option>)}</select></label>
            <label className="mt-4 block font-semibold">Nombre del impulsador<input required maxLength={120} value={promoterName} onChange={(event) => setPromoterName(event.target.value)} className="mt-2 w-full rounded-lg border p-3" /></label>
            <button disabled={busy || !campaignId} className="mt-4 rounded-xl bg-slate-950 px-5 py-3 font-black text-white disabled:opacity-40">Crear impulsador y QR</button>
          </form>
        </section>

        <section className="rounded-2xl border bg-white p-6 shadow-sm">
          <div className="flex flex-wrap items-end justify-between gap-4">
            <div><h2 className="text-2xl font-black">Resultados</h2><p className="text-sm text-slate-600">Los resultados son anónimos y se pueden filtrar por encuesta y fechas.</p></div>
            <div className="flex flex-wrap gap-3">
              <label className="text-sm font-bold">Desde<input type="date" value={from} onChange={(event) => setFrom(event.target.value)} className="mt-1 block rounded border p-2" /></label>
              <label className="text-sm font-bold">Hasta<input type="date" value={to} onChange={(event) => setTo(event.target.value)} className="mt-1 block rounded border p-2" /></label>
              <label className="text-sm font-bold">Encuesta<select value={campaignId} onChange={(event) => setCampaignId(event.target.value)} className="mt-1 block rounded border p-2"><option value="">Todas</option>{campaigns.map((campaign) => <option key={campaign.id} value={campaign.id}>{campaign.name}</option>)}</select></label>
            </div>
          </div>
          <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <div className="rounded-xl bg-slate-50 p-4"><p className="text-sm text-slate-500">Votos</p><p className="text-3xl font-black">{dashboard?.summary.total ?? 0}</p></div>
            <div className="rounded-xl bg-slate-50 p-4"><p className="text-sm text-slate-500">Promedio</p><p className="text-3xl font-black">{(dashboard?.summary.average ?? 0).toFixed(2)} / 5</p></div>
            <div className="rounded-xl bg-emerald-50 p-4"><p className="text-sm text-emerald-800">Valoraciones positivas</p><p className="text-3xl font-black text-emerald-900">{dashboard?.summary.positive ?? 0}</p></div>
            <div className="rounded-xl bg-emerald-50 p-4"><p className="text-sm text-emerald-800">Satisfacción</p><p className="text-3xl font-black text-emerald-900">{dashboard?.summary.positivePercent ?? 0}%</p></div>
          </div>
          <div className="mt-6 grid gap-3 sm:grid-cols-5">
            {dashboard?.distribution.map((row) => <div key={row.rating} className="rounded-xl border p-4 text-center"><p className="text-4xl">{faces[row.rating]}</p><p className="mt-2 text-2xl font-black">{row.count}</p><div className="mx-auto mt-2 h-2 max-w-24 overflow-hidden rounded bg-slate-100"><div className="h-full bg-sky-600" style={{ width: `${(row.count / maxDistribution) * 100}%` }} /></div></div>)}
          </div>
        </section>

        <section className="rounded-2xl border bg-white p-6 shadow-sm">
          <h2 className="text-xl font-black">Encuestas e impulsadores</h2>
          <div className="mt-4 space-y-4">
            {campaigns.map((campaign) => (
              <article key={campaign.id} className="rounded-xl border p-4">
                <div className="flex flex-wrap items-start justify-between gap-3"><div><h3 className="text-lg font-black">{campaign.name}</h3><p className="text-sm text-slate-600">{campaign.question}</p><p className="mt-1 text-xs font-bold text-slate-500">{campaign._count.promoters} impulsadores · {campaign._count.votes} votos</p></div><button disabled={busy} onClick={() => void mutation(`campaigns/${campaign.id}`, { active: !campaign.active }, "PATCH")} className={`rounded-full px-4 py-2 text-sm font-black ${campaign.active ? "bg-emerald-100 text-emerald-900" : "bg-slate-200 text-slate-700"}`}>{campaign.active ? "Activa" : "Inactiva"}</button></div>
                <div className="mt-4 grid gap-2 md:grid-cols-2 xl:grid-cols-3">{campaign.promoters.map((promoter) => <div key={promoter.id} className="flex items-center justify-between gap-3 rounded-lg bg-slate-50 p-3"><div><p className="font-bold">{promoter.name}</p><p className="text-xs text-slate-500">{promoter._count.votes} votos · {promoter.active ? "Activo" : "Inactivo"}</p></div><div className="flex gap-2"><button onClick={() => void showQr(promoter.id)} className="rounded bg-sky-700 px-3 py-2 text-sm font-bold text-white">Ver QR</button><button disabled={busy} onClick={() => void mutation(`promoters/${promoter.id}`, { active: !promoter.active }, "PATCH")} className="rounded border px-3 py-2 text-sm font-bold">{promoter.active ? "Pausar" : "Activar"}</button></div></div>)}</div>
              </article>
            ))}
            {campaigns.length === 0 && <p className="text-slate-500">Todavía no hay encuestas. Cree la primera campaña para comenzar.</p>}
          </div>
        </section>

        <section className="rounded-2xl border bg-white p-6 shadow-sm">
          <h2 className="text-xl font-black">Resultados por impulsador</h2>
          <div className="mt-4 overflow-x-auto"><table className="w-full min-w-[860px] text-left text-sm"><thead className="bg-slate-100"><tr><th className="p-3">Impulsador</th><th className="p-3">Encuesta</th><th className="p-3">Votos</th><th className="p-3">Promedio</th>{[1,2,3,4,5].map((rating) => <th key={rating} className="p-3 text-center">{faces[rating]}</th>)}</tr></thead><tbody>{dashboard?.promoters.map((promoter) => <tr key={promoter.id} className="border-t"><td className="p-3 font-bold">{promoter.name}</td><td className="p-3">{promoter.campaign.name}</td><td className="p-3">{promoter.voteCount}</td><td className="p-3">{promoter.average.toFixed(2)}</td>{promoter.ratings.map((row) => <td key={row.rating} className="p-3 text-center">{row.count}</td>)}</tr>)}</tbody></table></div>
        </section>

        {qr && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/70 p-4" role="dialog" aria-modal="true">
            <div className="w-full max-w-lg rounded-2xl bg-white p-6 text-center shadow-2xl"><h2 className="text-2xl font-black">{qr.promoterName}</h2><p className="text-slate-600">{qr.campaignName}</p><Image src={qr.image} alt={`QR de ${qr.promoterName}`} width={360} height={360} className="mx-auto mt-4" unoptimized /><p className="mt-2 break-all text-xs text-slate-500">{qr.accessUrl}</p><div className="mt-5 flex flex-wrap justify-center gap-3"><a href={qr.image} download={`encuesta-${qr.promoterName.replaceAll(" ", "-")}.png`} className="rounded bg-sky-700 px-4 py-3 font-bold text-white">Descargar</a><button onClick={printQr} className="rounded bg-slate-950 px-4 py-3 font-bold text-white">Imprimir</button><button onClick={() => setQr(null)} className="rounded border px-4 py-3 font-bold">Cerrar</button></div></div>
          </div>
        )}
      </div>
    </main>
  );
}
