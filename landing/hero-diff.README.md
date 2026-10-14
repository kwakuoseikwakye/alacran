# The hero clip

The hero shows one real thing happening: a company file goes in, the agent
proposes a change, the diff appears, you approve it, the commit lands. About
60 seconds, no narration, no cuts.

`landing/index.html` already has the slot. Drop two files next to it and it
takes over on its own:

| File | What it is |
|---|---|
| `hero-diff.mp4` | H.264 MP4, muted, ~60s, 1600px wide or narrower |
| `hero-diff.jpg` | One frame from it, used as the poster |

Until both exist the static mock in the same frame stays on screen, so a
missing file is never a broken player - the `<video>` reveals itself on
`loadeddata`, which only fires once real frames have decoded.

## Recording it

Nothing here is scriptable end to end: the interesting part is a real agent
run, and this project's standing rule is that a real headless `claude -p`
spawn is never triggered by an automated pass. So this is a manual take.

1. Start a clean recording target, never a real company:

   ```bash
   ALACRAN_DATA_DIR=/tmp/hero-demo PORT=3210 npm start
   ```

   Then add a company at `/tmp/hero-demo-co` and run the setup wizard so it
   has an ontology worth refreshing.

2. Record the window at 1600×1000, 30fps. macOS:

   ```bash
   # Cmd-Shift-5 → Record Selected Portion, or:
   screencapture -v -R 0,0,1600,1000 hero-raw.mov
   ```

3. The take, in one shot:
   - Company card on screen, click **Refresh company info**
   - Click **Run** - let the log tail actually scroll, don't cut it
   - The diff appears. Pause on it: this is the whole point of the product
   - Click **Confirm & commit**
   - Land on the committed state

4. Trim and encode:

   ```bash
   ffmpeg -i hero-raw.mov -t 60 -vf "scale=1600:-2" -an \
     -c:v libx264 -crf 24 -preset slow -movflags +faststart \
     landing/hero-diff.mp4
   ffmpeg -i landing/hero-diff.mp4 -ss 00:00:42 -frames:v 1 -q:v 3 \
     landing/hero-diff.jpg
   ```

   `-an` matters: the clip is `muted` and autoplays, and an audio track it
   never plays is bytes every visitor downloads for nothing. `+faststart`
   moves the index to the front so it starts without buffering the whole file.

5. Check it: 4MB or under, plays on a phone, and readable at the size the
   hero actually renders it. Pick the poster frame from the diff, not from
   the loading state - it's the frame most visitors will only ever see.
