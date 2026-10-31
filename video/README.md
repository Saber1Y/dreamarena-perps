# DreamArena Perps announcement video

A 30-second narrated motion video, rendered from code with Remotion 4.0.536.
One composition renders three formats: 1920x1080 (X, YouTube), 1080x1080 (X feed) and 1080x1920 (stories).

The script is in [SCRIPT.md](SCRIPT.md).
The voiceover is VoiceStudio's "The Neighbor", generated locally; every line was transcribed back to check it.
The look uses the app's own tokens from `frontend/src/app/globals.css`, and scene 5 shows the real block, trade and callback from the deployed arena.

## Render

```bash
npm install
```

```bash
npm run render
```

```bash
npm run render:square
```

```bash
npm run render:vertical
```

Videos land in `out/`.
If the headless Chrome download stalls, point Remotion at an existing one with `REMOTION_BROWSER_EXECUTABLE=/path/to/chrome-headless-shell` before the command.

## Change the narration

Edit `voiceover/lines.json`, start VoiceStudio, then:

```bash
npm run voiceover -- vo-03
```

That regenerates one line and rewrites `public/voiceover/manifest.json`; scene lengths follow the new durations automatically.
Names are spelled for the voice, not the screen ("Dream Dex", "Somm-nia"); the picture keeps the real spelling.

## Not included

No music bed. Drop a licensed track in `public/` and add it as `<Audio volume={0.15}>` in `src/Announcement.tsx`.
