module.exports = {
  // Back to a fresh clone's dependencies. Rumi's code is the repository itself,
  // so it stays; so do your .env and the linked WhatsApp session
  // (.channel-state/) -- delete those by hand to start setup over.
  run: [
    {
      method: "fs.rm",
      params: {
        path: "../bot/node_modules"
      }
    },
    {
      method: "fs.rm",
      params: {
        path: "../node_modules"
      }
    },
    {
      method: "fs.rm",
      params: {
        path: "node_modules"
      }
    }
  ]
}
