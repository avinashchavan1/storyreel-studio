import { useQueryClient } from "@tanstack/react-query";
import { CalendarClock, RefreshCw, TrendingUp } from "lucide-react";
import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { Button, Card, Empty, ErrorNote, SectionTitle, Spinner, fmtDate } from "../components/ui";
import { studio, useFollowers, usePublications, useReels, useStatsDaily, type FollowerDay, type StatDay } from "../lib/api";
import type { Publication, Reel } from "../lib/types";

// Stats: what's working. Numbers come from the daily timer (6:47 am IST) or "Refresh now".
// Every chart is a single series (one platform or one measure), so no colour legend is needed: the title names it.
const PLATS = [{ key: "instagram", label: "Instagram" }, { key: "youtube", label: "YouTube" }, { key: "facebook", label: "Facebook" }] as const;
const n = (v: unknown) => (typeof v === "number" && isFinite(v) ? v : 0);
const fmt = (v: number) => (v >= 1e6 ? `${(v / 1e6).toFixed(1)}M` : v >= 1e4 ? `${Math.round(v / 1e3)}k` : v >= 1e3 ? `${(v / 1e3).toFixed(1)}k` : String(v));
const dayISO = (d: Date) => d.toISOString().slice(0, 10);
const category = (r?: Reel) => r?.category ?? (r?.script as { category?: string } | null)?.category ?? "Other";

export default function Stats() {
  const reels = useReels(), pubs = usePublications(), daily = useStatsDaily(), fol = useFollowers();
  const qc = useQueryClient();
  const [st, setSt] = useState<{ busy?: boolean; err?: string }>({});
  if (reels.isLoading || pubs.isLoading) return <Spinner />;
  if (reels.error || pubs.error) return <ErrorNote error={reels.error ?? pubs.error} />;
  const posted = (pubs.data ?? []).filter((p) => p.state === "posted");
  const byId = Object.fromEntries((reels.data ?? []).map((r) => [r.id, r]));
  const last = posted.map((p) => p.stats_at).filter(Boolean).sort().pop();
  const refresh = async () => {
    setSt({ busy: true });
    try { await studio("refresh_stats"); setSt({}); } catch (e) { setSt({ err: (e as Error).message }); }
    ["pubs", "stats_daily", "follower_daily"].forEach((k) => qc.invalidateQueries({ queryKey: [k] }));
  };

  return (
    <div className="grid grid-cols-[minmax(0,1fr)] gap-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-display text-3xl font-extrabold tracking-wide">Stats</h1>
          <p className="mt-1 text-sm text-ink-soft dark:text-parchment/60">Updated every morning at 6:47 am IST{last ? ` · last ${fmtDate(last)}` : ""}.</p>
        </div>
        <Button size="sm" disabled={st.busy} onClick={refresh}><RefreshCw size={14} className={st.busy ? "animate-spin" : ""} /> {st.busy ? "Updating…" : "Refresh now"}</Button>
      </div>
      {st.err && <p className="text-sm text-vermilion">{st.err}</p>}

      <WeeklyReport reels={reels.data ?? []} pubs={pubs.data ?? []} daily={daily.data ?? []} />

      <div className="grid gap-3 sm:grid-cols-3">
        {PLATS.map((p) => <PlatformTile key={p.key} label={p.label} pubs={posted.filter((x) => x.platform === p.key)} fol={(fol.data ?? []).filter((f) => f.platform === p.key)} />)}
      </div>

      {posted.length === 0 ? <Empty>No posted reels yet. Post one and its numbers show up here the next morning (or press Refresh now).</Empty> : (
        <>
          <ReelTable posted={posted} byId={byId} />
          <CategoryBars posted={posted} byId={byId} />
        </>
      )}
      <p className="text-xs text-ink-soft dark:text-parchment/60">Views: YouTube views, Instagram plays (needs the <code>instagram_manage_insights</code> permission), Facebook Reels plays. Likes and comments come from each platform directly.</p>
    </div>
  );
}

// ---- #9 weekly report: last 7 days at a glance + what's next + what needs you
function WeeklyReport({ reels, pubs, daily }: { reels: Reel[]; pubs: Publication[]; daily: StatDay[] }) {
  const now = Date.now(), wk = now - 7 * 864e5, nextWk = now + 7 * 864e5;
  const byId = Object.fromEntries(reels.map((r) => [r.id, r]));
  const postedWk = pubs.filter((p) => p.state === "posted" && p.posted_at && new Date(p.posted_at).getTime() > wk);
  const viewsOn = (day: string) => daily.filter((d) => d.day <= day).reduce((acc, d) => { acc[`${d.reel_id}:${d.platform}`] = n(d.stats.views); return acc; }, {} as Record<string, number>);
  const sum = (o: Record<string, number>) => Object.values(o).reduce((a, b) => a + b, 0);
  const gained = sum(viewsOn(dayISO(new Date()))) - sum(viewsOn(dayISO(new Date(wk))));
  const top = [...pubs.filter((p) => p.state === "posted")].sort((a, b) => n(b.stats?.views) - n(a.stats?.views))[0];
  const upcoming = pubs.filter((p) => p.state === "scheduled" && p.scheduled_for && new Date(p.scheduled_for).getTime() < nextWk).sort((a, b) => a.scheduled_for!.localeCompare(b.scheduled_for!));
  const review = reels.filter((r) => r.stage === "review" && !r.reviewed);
  const failed = pubs.filter((p) => p.state === "failed");
  return (
    <Card>
      <SectionTitle><span className="inline-flex items-center gap-2"><TrendingUp size={18} /> This week</span></SectionTitle>
      <div className="grid gap-4 sm:grid-cols-3">
        <Hero label="Posts in the last 7 days" value={String(postedWk.length)} sub={postedWk.map((p) => `${byId[p.reel_id]?.code} ${p.platform}`).join(" · ") || "none yet"} />
        <Hero label="Views gained this week" value={fmt(Math.max(0, gained))} sub="all platforms, from the daily snapshots" />
        <Hero label="Top reel so far" value={top ? byId[top.reel_id]?.code ?? "—" : "—"} sub={top ? `${fmt(n(top.stats?.views))} views on ${top.platform}` : "post a reel to see this"} />
      </div>
      <div className="mt-4 grid gap-4 text-sm lg:grid-cols-2">
        <div>
          <p className="mb-1.5 font-semibold">Coming up (next 7 days)</p>
          {upcoming.length ? <ul className="grid gap-1">{upcoming.map((p) => <li key={p.id} className="flex gap-2"><CalendarClock size={15} className="mt-0.5 shrink-0" /><Link className="font-mono text-gold-deep dark:text-gold" to={`/reels/${byId[p.reel_id]?.code}`}>{byId[p.reel_id]?.code}</Link> {p.platform} · {new Date(p.scheduled_for!).toLocaleString("en-IN", { timeZone: "Asia/Kolkata", weekday: "short", hour: "numeric", minute: "2-digit" })} IST</li>)}</ul>
            : <p className="text-ink-soft dark:text-parchment/60">Nothing scheduled. Use <Link className="underline" to="/timeline">Timeline → Auto-fill</Link> or a reel's Post everywhere.</p>}
        </div>
        <div>
          <p className="mb-1.5 font-semibold">Needs you</p>
          <ul className="grid gap-1">
            {review.length > 0 && <li>{review.length} reel{review.length > 1 ? "s" : ""} waiting for your citation check: {review.slice(0, 6).map((r) => <Link key={r.id} className="mr-1.5 font-mono text-gold-deep dark:text-gold" to={`/reels/${r.code}`}>{r.code}</Link>)}</li>}
            {failed.map((p) => <li key={p.id} className="text-vermilion">{byId[p.reel_id]?.code} failed on {p.platform}{p.last_error ? `: ${p.last_error.slice(0, 120)}` : ""}</li>)}
            {!review.length && !failed.length && <li className="text-ink-soft dark:text-parchment/60">Nothing. 🎉</li>}
          </ul>
        </div>
      </div>
    </Card>
  );
}
const Hero = ({ label, value, sub }: { label: string; value: string; sub: string }) => (
  <div className="rounded-2xl border border-parchment-deep p-4 dark:border-night-700">
    <p className="text-xs font-semibold uppercase tracking-wider text-ink-soft dark:text-parchment/60">{label}</p>
    <p className="tabular mt-1 font-display text-3xl font-extrabold">{value}</p>
    <p className="mt-1 truncate text-xs text-ink-soft dark:text-parchment/60" title={sub}>{sub}</p>
  </div>
);

// ---- per platform: totals + follower trend (one series per chart)
function PlatformTile({ label, pubs, fol }: { label: string; pubs: Publication[]; fol: FollowerDay[] }) {
  const views = pubs.reduce((a, p) => a + n(p.stats?.views), 0), likes = pubs.reduce((a, p) => a + n(p.stats?.likes), 0), comments = pubs.reduce((a, p) => a + n(p.stats?.comments), 0);
  const series = fol.map((f) => ({ x: f.day, y: n(f.followers) }));
  const nowF = series.at(-1)?.y ?? null, weekAgo = series.find((s) => s.x >= dayISO(new Date(Date.now() - 7 * 864e5)))?.y ?? null;
  return (
    <Card className="!p-4">
      <p className="font-bold">{label}</p>
      <p className="mt-1 text-sm"><span className="tabular font-display text-2xl font-extrabold">{nowF ?? "—"}</span> followers
        {nowF !== null && weekAgo !== null && <span className="ml-2 text-xs text-ink-soft dark:text-parchment/60">{nowF - weekAgo >= 0 ? "+" : ""}{nowF - weekAgo} this week</span>}</p>
      <Spark data={series} label={`${label} followers`} />
      <p className="mt-2 text-xs text-ink-soft dark:text-parchment/60"><span className="tabular">{fmt(views)}</span> views · <span className="tabular">{fmt(likes)}</span> likes · <span className="tabular">{fmt(comments)}</span> comments · {pubs.length} posts</p>
    </Card>
  );
}

function Spark({ data, label }: { data: { x: string; y: number }[]; label: string }) {
  const [hi, setHi] = useState<number | null>(null);
  if (data.length < 2) return <p className="mt-2 h-14 text-xs text-ink-soft dark:text-parchment/60">The trend line appears after two days of data.</p>;
  const W = 300, H = 56, max = Math.max(1, ...data.map((d) => d.y)), min = Math.min(...data.map((d) => d.y));
  const X = (i: number) => 4 + (i * (W - 8)) / (data.length - 1), Y = (v: number) => H - 6 - ((v - min) / Math.max(1, max - min)) * (H - 12);
  const path = data.map((d, i) => `${i ? "L" : "M"}${X(i).toFixed(1)},${Y(d.y).toFixed(1)}`).join("");
  return (
    <div className="relative mt-2">
      <svg viewBox={`0 0 ${W} ${H}`} className="h-14 w-full text-ink dark:text-gold" role="img" aria-label={`${label}: ${data.map((d) => `${d.x} ${d.y}`).join(", ")}`}
        onMouseLeave={() => setHi(null)} onMouseMove={(e) => { const r = (e.currentTarget as SVGSVGElement).getBoundingClientRect(); setHi(Math.round(((e.clientX - r.left) / r.width) * (data.length - 1))); }}>
        <path d={path} fill="none" stroke="currentColor" strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" vectorEffect="non-scaling-stroke" />
        {hi !== null && <><line x1={X(hi)} x2={X(hi)} y1={0} y2={H} stroke="currentColor" strokeOpacity={0.25} vectorEffect="non-scaling-stroke" /><circle cx={X(hi)} cy={Y(data[hi].y)} r={4} fill="currentColor" stroke="white" strokeWidth={2} /></>}
      </svg>
      {hi !== null && <div className="pointer-events-none absolute -top-7 rounded-md bg-night-900 px-2 py-0.5 text-xs font-semibold text-parchment" style={{ left: `${(X(hi) / W) * 100}%`, transform: "translateX(-50%)" }}>{data[hi].x.slice(5)}: {data[hi].y}</div>}
    </div>
  );
}

// ---- every posted reel, best first
function ReelTable({ posted, byId }: { posted: Publication[]; byId: Record<string, Reel> }) {
  const rows = useMemo(() => {
    const m: Record<string, { r: Reel; p: Record<string, Publication> }> = {};
    for (const p of posted) { const r = byId[p.reel_id]; if (!r) continue; (m[r.id] ??= { r, p: {} }).p[p.platform] = p; }
    return Object.values(m).map((x) => ({ ...x, total: Object.values(x.p).reduce((a, p) => a + n(p.stats?.views), 0), eng: Object.values(x.p).reduce((a, p) => a + n(p.stats?.likes) + n(p.stats?.comments) + n(p.stats?.shares) + n(p.stats?.saved), 0) }))
      .sort((a, b) => b.total - a.total);
  }, [posted, byId]);
  return (
    <Card>
      <SectionTitle>Every reel, best first</SectionTitle>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[640px] text-sm">
          <thead><tr className="text-left text-xs uppercase tracking-wider text-ink-soft dark:text-parchment/60">
            <th className="py-2 pr-3">Reel</th><th className="pr-3">Category</th>{PLATS.map((p) => <th key={p.key} className="pr-3 text-right">{p.label}</th>)}<th className="pr-3 text-right">Total views</th><th className="text-right">Likes+comments+shares+saves</th>
          </tr></thead>
          <tbody>{rows.map(({ r, p, total, eng }) => (
            <tr key={r.id} className="border-t border-parchment-deep dark:border-night-700">
              <td className="py-2 pr-3"><Link to={`/reels/${r.code}`} className="font-mono text-xs text-gold-deep dark:text-gold">{r.code}</Link> <span className="ml-1">{r.title.slice(0, 42)}</span></td>
              <td className="pr-3 text-xs">{category(r)}</td>
              {PLATS.map((pl) => { const s = p[pl.key]?.stats; return <td key={pl.key} className="tabular pr-3 text-right">{s ? <a href={p[pl.key].post_url ?? "#"} target="_blank" rel="noreferrer" title={`${n(s.likes)} likes · ${n(s.comments)} comments`}>{fmt(n(s.views))}</a> : "—"}</td>; })}
              <td className="tabular pr-3 text-right font-semibold">{fmt(total)}</td><td className="tabular text-right">{fmt(eng)}</td>
            </tr>))}</tbody>
        </table>
      </div>
    </Card>
  );
}

// ---- average views per reel, by category (one measure → one colour)
function CategoryBars({ posted, byId }: { posted: Publication[]; byId: Record<string, Reel> }) {
  const [hi, setHi] = useState<string | null>(null);
  const agg: Record<string, { views: number; reels: Set<string> }> = {};
  for (const p of posted) { const c = category(byId[p.reel_id]); (agg[c] ??= { views: 0, reels: new Set() }); agg[c].views += n(p.stats?.views); agg[c].reels.add(p.reel_id); }
  const rows = Object.entries(agg).map(([c, a]) => ({ c, avg: Math.round(a.views / a.reels.size), count: a.reels.size })).sort((a, b) => b.avg - a.avg);
  const max = Math.max(1, ...rows.map((r) => r.avg));
  return (
    <Card>
      <SectionTitle>Average views per reel, by category</SectionTitle>
      <div className="grid gap-2">
        {rows.map((r) => (
          <div key={r.c} className="grid grid-cols-[minmax(0,10rem)_1fr_auto] items-center gap-3 text-sm" onMouseEnter={() => setHi(r.c)} onMouseLeave={() => setHi(null)}>
            <span className="truncate">{r.c}</span>
            <span className="relative h-5 rounded bg-black/[.04] dark:bg-white/5">
              <span className="absolute inset-y-0 left-0 rounded-r bg-ink dark:bg-gold" style={{ width: `${Math.max(1.5, (r.avg / max) * 100)}%` }} />
              {hi === r.c && <span className="absolute -top-7 left-0 rounded-md bg-night-900 px-2 py-0.5 text-xs font-semibold text-parchment">{r.avg} avg views · {r.count} reel{r.count > 1 ? "s" : ""}</span>}
            </span>
            <span className="tabular w-12 text-right font-semibold">{fmt(r.avg)}</span>
          </div>
        ))}
      </div>
    </Card>
  );
}
