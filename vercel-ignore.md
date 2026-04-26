# Vercel "Ignored Build Step" config

We deploy three Vercel projects from this repo — admin, portal, and the
marketing site — but every push currently rebuilds all three. Pasting
the snippets below into each project's Ignored Build Step makes Vercel
skip a rebuild when nothing in that project's directory changed.

## Where to paste

Vercel dashboard → pick the project → **Settings** → **Git** →
scroll to **Ignored Build Step** → choose "Custom" → paste the script.

Vercel runs the script in the repo root; exit `0` means *skip build*,
exit `1` means *build*.

## Per-project scripts

### Admin (`ravello-admin`)

```bash
git diff HEAD^ HEAD --quiet -- admin/ supabase/ ; test $? -ne 0
```

Rebuilds when files in `admin/` or `supabase/` changed (DB migrations
affect both apps).

### Portal (`ravello-portal`)

```bash
git diff HEAD^ HEAD --quiet -- portal/ supabase/ ; test $? -ne 0
```

Rebuilds when files in `portal/` or `supabase/` changed.

### Marketing (root site)

```bash
git diff HEAD^ HEAD --quiet -- ':!admin/' ':!portal/' ':!supabase/' ':!scripts/' ':!.github/' ; test $? -ne 0
```

Rebuilds when anything outside `admin/`, `portal/`, `supabase/`,
`scripts/`, or `.github/` changed.

## Effect

A portal-only PR previously rebuilt admin + portal + marketing.
Now it rebuilds portal only. Saves ~2/3 of build minutes and makes
preview links land faster.

## Note on the initial deploy after enabling

The first push *after* enabling these scripts may behave oddly because
`HEAD^` on Vercel's shallow clone may not always exist. Push a small
no-op commit or trigger a manual redeploy if the first run misbehaves —
subsequent runs are stable.
