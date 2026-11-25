// Stats + health, shared by the studio function (buttons) and the job function (daily timer).
import { admin, facebookPage, FB_GRAPH, getIntegration, instagramToken, youtubeAccessToken } from "./util.ts";

const YT = "https://www.googleapis.com/youtube/v3";
const today = () => new Date().toISOString().slice(0, 10);

/** Views / likes / comments (+ Instagram reach, saves, shares) for every posted reel, and follower counts.
 *  Writes publications.stats (latest) and stats_daily / follower_daily (one row per day, for trends). */
export async function refreshStats() {
  const { data: pubs } = await admin.from("publications").select("id,reel_id,platform,external_id").eq("state", "posted").not("external_id", "is", null);
  const out: Record<string, unknown>[] = [];
  let ytTok: string | null = null, ig: { token: string; api_base: string } | null = null, fb: { token: string; page_id: string } | null = null;
  for (const p of pubs ?? []) {
    try {
      let stats: Record<string, unknown> = {};
      if (p.platform === "youtube") {
        ytTok ??= await youtubeAccessToken();
        const it = (await (await fetch(`${YT}/videos?part=statistics,status,contentDetails&id=${p.external_id}`, { headers: { Authorization: `Bearer ${ytTok}` } })).json()).items?.[0] ?? {};
        const v = it.statistics ?? {}, st = it.status ?? {};
        stats = { views: +v.viewCount || 0, likes: +v.likeCount || 0, comments: +v.commentCount || 0,
          status: { privacy: st.privacyStatus, upload: st.uploadStatus, made_for_kids: st.madeForKids, self_declared_kids: st.selfDeclaredMadeForKids,
            age_restricted: it.contentDetails?.contentRating?.ytRating === "ytAgeRestricted", rejection: st.rejectionReason ?? null, license: st.license } };
      } else if (p.platform === "instagram") {
        if (!ig) { const t = await instagramToken(); ig = { token: t.token, api_base: t.api_base }; }
        const q = (path: string) => fetch(`${ig!.api_base}/${path}${path.includes("?") ? "&" : "?"}access_token=${encodeURIComponent(ig!.token)}`).then((r) => r.json());
        const m = await q(`${p.external_id}?fields=like_count,comments_count`);
        stats = { likes: m.like_count ?? null, comments: m.comments_count ?? null };
        const ins = await q(`${p.external_id}/insights?metric=views,reach,saved,shares`);
        for (const d of ins.data ?? []) stats[d.name] = d.values?.[0]?.value ?? d.total_value?.value ?? null;
        if (ins.error) stats.insights_error = String(ins.error.message ?? ins.error).slice(0, 200);
      } else if (p.platform === "facebook") {
        if (!fb) { const pg = await facebookPage(); fb = { token: pg.token, page_id: pg.page_id }; }
        const q = (path: string) => fetch(`${FB_GRAPH}/${path}${path.includes("?") ? "&" : "?"}access_token=${encodeURIComponent(fb!.token)}`).then((r) => r.json());
        const v = await q(`${p.external_id}?fields=likes.summary(true).limit(0),comments.summary(true).limit(0)`);
        stats = { likes: v.likes?.summary?.total_count ?? null, comments: v.comments?.summary?.total_count ?? null };
        // Meta names Reels plays differently across API versions: try each, keep the first that answers
        for (const m of ["fb_reels_total_plays", "blue_reels_play_count", "total_video_views", "post_video_views"]) {
          const ins = await q(`${p.external_id}/video_insights?metric=${m}`);
          const val = ins.data?.[0]?.values?.[0]?.value;
          if (val != null) { stats.views = typeof val === "number" ? val : Number(val) || 0; delete stats.insights_error; break; }
          if (ins.error) stats.insights_error = String(ins.error.message ?? ins.error).slice(0, 200);
        }
        const reach = await q(`${p.external_id}/video_insights?metric=post_impressions_unique`);
        if (reach.data?.[0]?.values?.[0]?.value != null) stats.reach = reach.data[0].values[0].value;
        if (v.error) throw new Error(v.error.message);
      } else continue;
      await admin.from("publications").update({ stats, stats_at: new Date().toISOString() }).eq("id", p.id);
      await admin.from("stats_daily").upsert({ reel_id: p.reel_id, platform: p.platform, day: today(), stats }, { onConflict: "reel_id,platform,day" });
      out.push({ id: p.id, platform: p.platform, ...stats });
    } catch (e) { out.push({ id: p.id, platform: p.platform, error: e instanceof Error ? e.message : String(e) }); }
  }
  const followers = await refreshFollowers();
  return { updated: out, followers };
}

async function refreshFollowers() {
  const res: Record<string, number | string | null> = {};
  const save = async (platform: string, n: number | null, extra: Record<string, unknown> = {}) => {
    res[platform] = n; if (n !== null) await admin.from("follower_daily").upsert({ platform, day: today(), followers: n, extra }, { onConflict: "platform,day" });
  };
  try {
    if (await getIntegration("youtube")) {
      const tok = await youtubeAccessToken();
      const c = (await (await fetch(`${YT}/channels?part=statistics&mine=true`, { headers: { Authorization: `Bearer ${tok}` } })).json()).items?.[0]?.statistics ?? {};
      await save("youtube", c.subscriberCount != null ? +c.subscriberCount : null, { views: +c.viewCount || 0, videos: +c.videoCount || 0 });
    }
  } catch (e) { res.youtube = `error: ${e instanceof Error ? e.message : e}`; }
  try {
    const igI = await getIntegration("instagram");
    if (igI?.user_id) {
      const t = await instagramToken();
      const a = await (await fetch(`${t.api_base}/${t.user_id}?fields=followers_count,media_count&access_token=${encodeURIComponent(t.token)}`)).json();
      await save("instagram", a.followers_count ?? null, { posts: a.media_count ?? null });
    }
  } catch (e) { res.instagram = `error: ${e instanceof Error ? e.message : e}`; }
  try {
    if (await getIntegration("facebook")) {
      const pg = await facebookPage();
      const a = await (await fetch(`${FB_GRAPH}/${pg.page_id}?fields=followers_count,fan_count&access_token=${encodeURIComponent(pg.token)}`)).json();
      await save("facebook", a.followers_count ?? a.fan_count ?? null);
    }
  } catch (e) { res.facebook = `error: ${e instanceof Error ? e.message : e}`; }
  return res;
}

export type Issue = { level: "warn" | "error"; where: string; text: string; fix?: string };

/** Everything that could make a post fail or a schedule miss: connections, token expiry, failed posts, due-but-blocked schedules. */
export async function healthCheck() {
  const issues: Issue[] = [];
  const conn = "/settings#connections";
  const need = ["github", "huggingface", "google_app", "youtube", "meta_app", "instagram"];
  for (const p of need) if (!(await getIntegration(p))) issues.push({ level: "warn", where: p, text: `${p.replace("_app", " app")} is not connected`, fix: conn });
  if (await getIntegration("youtube")) {
    try { await youtubeAccessToken(); } catch (e) { issues.push({ level: "error", where: "youtube", text: `YouTube sign-in no longer works: ${e instanceof Error ? e.message : e}. Press Connect YouTube again.`, fix: conn }); }
  }
  const app = await getIntegration("meta_app"), igI = await getIntegration("instagram");
  if (app?.app_id && app?.app_secret && igI?.access_token) {
    try {
      const d = (await (await fetch(`${FB_GRAPH}/debug_token?input_token=${encodeURIComponent(igI.access_token)}&access_token=${encodeURIComponent(`${app.app_id}|${app.app_secret}`)}`)).json()).data ?? {};
      if (d.is_valid === false) issues.push({ level: "error", where: "instagram", text: "The Meta (Instagram/Facebook) login has expired or was removed. Press Connect Instagram again.", fix: conn });
      else if (d.expires_at && d.expires_at * 1000 < Date.now() + 7 * 864e5) issues.push({ level: "warn", where: "instagram", text: `The Meta login expires on ${new Date(d.expires_at * 1000).toDateString()}. Reconnect before then.`, fix: conn });
      const granted = new Set((d.scopes ?? []) as string[]);
      for (const [perm, why] of [["pages_manage_posts", "posting to the Facebook Page"], ["instagram_manage_insights", "Instagram reach/saves/shares on the Stats page"], ["read_insights", "Facebook views on the Stats page"], ["pages_manage_metadata", "Apply brand to Facebook"]])
        if (d.scopes && !granted.has(perm)) issues.push({ level: "warn", where: "meta", text: `Meta permission ${perm} is missing (needed for ${why}). Add it to the login configuration, then press Connect Instagram again.`, fix: `https://developers.facebook.com/apps/${app.app_id}/business-login/configurations/` });
    } catch { /* Meta unreachable: skip */ }
  }
  if (await getIntegration("instagram") && !(await getIntegration("facebook"))) issues.push({ level: "warn", where: "facebook", text: "The Facebook Page isn't linked yet (Settings → Connections → step 5).", fix: conn });
  const { data: failed } = await admin.from("publications").select("reel_id,platform,last_error,reels(code)").eq("state", "failed").limit(20);
  for (const f of failed ?? []) issues.push({ level: "error", where: f.platform, text: `${(f as any).reels?.code ?? "A reel"} failed on ${f.platform}${f.last_error ? `: ${String(f.last_error).slice(0, 160)}` : ""}`, fix: `/reels/${(f as any).reels?.code ?? ""}` });
  const { data: late } = await admin.from("publications").select("platform,scheduled_for,reels(code)").eq("state", "scheduled").lt("scheduled_for", new Date(Date.now() - 15 * 60e3).toISOString());
  for (const l of late ?? []) issues.push({ level: "error", where: l.platform, text: `${(l as any).reels?.code} was due on ${l.platform} at ${l.scheduled_for} but hasn't started (is the timer running?)`, fix: `/reels/${(l as any).reels?.code ?? ""}` });
  const report = { at: new Date().toISOString(), issues };
  await admin.from("channels").update({ health: report }).eq("platform", "youtube");   // one shared copy, read by the banner
  return report;
}
