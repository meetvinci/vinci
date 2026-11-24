# Native PR media

Use for PR descriptions containing images or video.

## Capture

For UI changes, prefer a short recording of the actual implementation at the batch boundary, with screenshots for useful states. Use before/after views when the comparison helps.

Frame screenshots around the relevant controls, result, or interaction. Retain the full screen when navigation or surrounding context matters. Keep text readable at PR display size. Custom illustrations should explain an accurate, clearly labeled example.

Keep captures and capture tooling outside the feature diff. Preserve local media until its published copy and inline rendering are verified.

## Upload

Publish images and recordings as native GitHub attachments, preserving repository access restrictions. Check installed `gh pr create --help` or `gh pr edit --help` for `--attach` before browser upload workarounds.

Use a body file to place media intentionally:

```sh
gh pr edit <number> --body-file <body.md> \
  --attach /path/to/demo.mp4 --attach /path/to/screenshot.png
```

Put `![](/path/to/demo.mp4)` in its own paragraph and `![Meaningful description](/path/to/screenshot.png)` where each belongs. The CLI rewrites these to native attachment URLs; a standalone video URL renders as a player.

Keep stable `https://github.com/user-attachments/assets/...` URLs in Markdown during later edits. Signed URLs in rendered HTML expire; use them only for verification.

## Verify and recover

Read back the published body. Confirm embedded images load and the video renders with controls and playback advances. A downloadable file, blob/raw link, local path, or successful byte download alone does not establish inline preview.

After partial failure, preserve verified uploads. Retry only missing media or uploads that failed inline verification. If native upload remains unavailable after checking the supported CLI/documented path, use a useful inline alternative, such as a table or Mermaid diagram, and report that inline UI media is unavailable.
