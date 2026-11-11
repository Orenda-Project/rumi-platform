const redis = require('./scripts/redis.js')

module.exports = {
  daemon: true,
  run: [
    // Setup is over once Start is pressed. The wizard and the bot each run
    // Rumi's console, and a wizard left running would also own the Redis the
    // bot is about to use -- stopping the wizard later would pull it out from
    // under the bot. scripts/local-redis.js waits for that Redis to exit.
    {
      when: "{{running('onboard.js')}}",
      method: "script.stop",
      params: {
        // Absolute: script.stop passes the uri on unresolved, and a bare
        // "onboard.js" matches nothing -- it logs "Stopped" and stops nothing.
        uri: "{{path.resolve(cwd, 'onboard.js')}}"
      }
    },
    // The same port as last time, so console tabs opened before a restart --
    // which Pinokio restores -- still work. See scripts/pick-port.js for why
    // this is not {{port}}.
    {
      method: "shell.run",
      params: {
        message: "node scripts/pick-port.js bot",
        on: [{
          "event": "/port=(\\d+)/",
          "kill": true
        }]
      }
    },
    // Saved before the bot starts: two steps below need it, and so does the
    // sidebar's start screen (home.html). The sidebar re-renders as each step
    // finishes, which is what swaps the terminal for the start screen.
    {
      method: "local.set",
      params: {
        port: "{{input.event[1]}}"
      }
    },
    // Rumi's queue and session state want a local Redis (see scripts/redis.js).
    redis,
    {
      method: "shell.run",
      params: {
        path: "..",
        env: {
          "PORT": "{{local.port}}",
          // The zero-AWS queue driver: BullMQ needs only REDIS_URL. Left at the
          // template's default of `sqs`, every queued job dies with
          // "SQS Queue not configured". Injected rather than written into .env
          // because dotenv never overrides a variable that is already set.
          "QUEUE_DRIVER": "bullmq",
          // Timestamps are stored without a zone and read back by `new Date()`,
          // which assumes local time. Off UTC (e.g. PKT, +5h) every chat session
          // looked hours old and timed out on each message. Servers run in UTC.
          "TZ": "UTC",
          // Stop `rumi start` opening a system browser behind Pinokio's back.
          "RUMI_NO_OPEN": "1",
          // Together these switch on the console's Restart Rumi button (see
          // bot/console/restart.js): Pinokio is asked to run restart.js.
          "RUMI_PTERM": "{{which('pterm')}}",
          "RUMI_RESTART_SCRIPT": "{{path.resolve(cwd, 'restart.js')}}"
        },
        message: "node bin/rumi.js start",
        on: [{
          // Move on as soon as the command is underway, and leave the bot
          // running. Its own output can't be relied on to trigger anything:
          // Pinokio matches against only the last 300 characters, and Rumi
          // writes its boot logs in bursts larger than that. The next step
          // waits for the bot instead.
          "event": "/bin\\/rumi\\.js start/",
          "done": true
        }]
      }
    },
    // The background worker: lesson plans, coaching/quiz reports, video and exam
    // grading are queued by the bot but only ever processed here. Without it every
    // such job waits in Redis forever. Same env as the bot; runs from the repo root
    // so its dotenv finds .env. With a linked WhatsApp (CHANNEL_DRIVER=baileys) the
    // bot runs the worker in-process instead and this one exits at once
    // (bot/shared/config/inline-worker.js) -- only the bot can send on that session.
    {
      method: "shell.run",
      params: {
        path: "..",
        env: {
          "QUEUE_DRIVER": "bullmq",
          "TZ": "UTC"
        },
        message: "node bot/workers/sqs-worker.js",
        on: [{
          "event": "/sqs-worker\\.js/",
          "done": true
        }]
      }
    },
    {
      method: "shell.run",
      params: {
        message: "node scripts/wait-for-console.js {{local.port}}",
        on: [{
          "event": "/(http:\\/\\/[0-9.:]+\\/console)/",
          "done": true
        }]
      }
    },
    {
      method: "local.set",
      params: {
        url: "{{input.event[1]}}"
      }
    }
  ]
}
