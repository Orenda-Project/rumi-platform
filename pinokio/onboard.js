module.exports = {
  // Kept alive after the run array finishes, like any server.
  daemon: true,
  run: [
    // Its own port, kept between runs, and never the bot's: started together
    // (Pinokio can reopen this tab while Start launches), the two were once
    // handed the same {{port}} and one of them died. See scripts/pick-port.js.
    {
      method: "shell.run",
      params: {
        message: "node scripts/pick-port.js wizard",
        on: [{
          "event": "/port=(\\d+)/",
          "kill": true
        }]
      }
    },
    {
      method: "local.set",
      params: {
        port: "{{input.event[1]}}"
      }
    },
    // No Redis step here, unlike start.js: the wizard opens before anyone has
    // chosen a Redis, so a local one is started only when a check first needs
    // it, and only if REDIS_URL is local by then (onboarding/local-redis.js).
    {
      method: "shell.run",
      params: {
        message: "node onboarding/server.js --port={{local.port}}",
        on: [{
          // The server prints its address on one line when it starts listening.
          "event": "/(http:\\/\\/\\S+)/",
          "done": true
        }]
      }
    },
    {
      method: "local.set",
      params: {
        // input.event is the match object from the step above; [1] is the captured URL.
        url: "{{input.event[1]}}",
        // Rumi's own console, mounted on the same server and therefore the same
        // origin -- which is the only way its API can be reached at all.
        console_url: "{{input.event[1]}}/console"
      }
    }
  ]
}
