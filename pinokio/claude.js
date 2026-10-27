module.exports = {
  run: [
    // Claude Code lives in Pinokio's own npm prefix, not the system one, so a
    // teammate on a fresh machine gets it installed here rather than being told
    // to go and do it themselves.
    {
      when: "{{!which('claude')}}",
      method: "shell.run",
      params: {
        message: "npm install -g @anthropic-ai/claude-code"
      }
    },
    {
      method: "shell.run",
      params: {
        // Interactive: Claude Code is a TTY program. Without this it would stop
        // at its first prompt and wait forever with no keyboard attached.
        input: true,
        // Runs from the repository root, so the session picks up Rumi's own
        // CLAUDE.md and sees the launcher under pinokio/.
        path: "..",
        message: "claude"
      }
    }
  ]
}
