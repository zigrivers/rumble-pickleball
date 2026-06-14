# Visual Playbook

Start the local server before running visual tests:

```bash
python3 -m http.server 8765 --bind 127.0.0.1 -d .
```

Verify screenshots:

```bash
npm run test:visual
```

Update baselines after intentional UI changes:

```bash
npm run test:visual:update
```

Review every changed PNG before committing. Screenshots protect layout and readability, not tournament behavior. Time is frozen in the harness so timers/timestamps stay deterministic; baselines are platform-specific (regenerate on the same OS/CI used for verification).
