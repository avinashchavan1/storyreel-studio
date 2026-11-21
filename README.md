# Storyreel Studio

A complete studio for short story reels with citations: research → script → ElevenLabs voices and music → painted (gouache-style)
canvas animation → 1080p/4K masters → cover → a web app to review, plan posting days (festival-aware) and publish to Instagram and YouTube.
Built for one channel per copy: use this repo as a template for each new story channel (Mahabharata, Puranas, folk tales, history...).

## New channel in 6 steps
1. **Use this template** on GitHub → your channel repo (private).
2. `bash scripts/setup.sh` → fills `channel.json`, creates `studio/series/<id>/`, writes CLAUDE.md's blanks, prints the checklist below.
3. Create the channel's own: Supabase project (run `supabase/migrations`, deploy `supabase/functions`, set function secrets),
   Netlify site, Hugging Face masters/audio dataset repo. Put their ids in `channel.json → infra`.
4. Add network secrets on your cloud environment (never in code): ElevenLabs, Supabase, Netlify, Hugging Face.
5. Audition a narrator (4–6 ElevenLabs voices on one line), lock it in `cast/cast.json`.
6. In a Claude Code session: "next reel". The make-reel skill does the rest; you review and post from the app.

## Try it now
```bash
bash scripts/bootstrap.sh
cd studio && python3 make_reel.py check series/example/reels/X01 && python3 make_reel.py draft-timeline series/example/reels/X01 && python3 make_reel.py stills series/example/reels/X01 2s,8s,14s
npm install && npm run build      # the app
```

## What's inside
- `PLAYBOOK.md`: the rules (accuracy, quote cards, opening verse, calm narrator, never chop a voice, festival planning...).
- `studio/engine`: renderer + audio engine + shared art library (`engine/art`). `studio/make_reel.py`: the CLI.
- `src/` app, `supabase/` backend, `scripts/` pipeline, `.claude/skills/make-reel`: the step-by-step workflow.
