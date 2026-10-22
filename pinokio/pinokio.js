const fs = require('fs')

/**
 * Values Rumi refuses to treat as set. Same shape as the app's own check
 * (bot/shared/config/feature-availability.js), so a freshly copied .env.template
 * reads as "not configured here" exactly as it does there.
 */
const PLACEHOLDER = /^CHANGEME|your-project|your_|^YOUR_|^<.*>$/i

/** The values without which the bot refuses to start (what `rumi doctor` calls required). */
const ESSENTIAL = ["SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY", "OPENROUTER_API_KEY"]

const isSet = (value) => Boolean(value) && !PLACEHOLDER.test(value)

/**
 * Has anyone actually finished setup? Decides whether the sidebar opens on the
 * wizard or on Start, so a configured deployment is one click from running and a
 * fresh one is one click from being set up.
 */
const isConfigured = (info) => {
  try {
    const env = fs.readFileSync(info.path("../.env"), "utf8")
    const values = Object.fromEntries(
      env.split("\n")
        .map((line) => line.match(/^([^#=]+)=(.*)$/))
        .filter(Boolean)
        .map((match) => [match[1].trim(), match[2].trim()])
    )
    return ESSENTIAL.every((key) => isSet(values[key]))
  } catch (e) {
    return false
  }
}

const item = (icon, text, href, extra = {}) => ({ icon, text, href, ...extra })

/** Steps that take over the sidebar while they run, in the order they are checked. */
const BUSY_STATES = [
  ["claude", "Claude Code", "claude.js"],
  ["setup", "Terminal setup", "setup.js"],
  ["pair", "Pairing WhatsApp", "pair.js"],
  ["doctor", "Checking", "doctor.js"],
  ["update", "Updating", "update.js"],
  ["reset", "Resetting", "reset.js"]
]

/**
 * While the wizard is up, its pages lead the sidebar, with Start beside them --
 * the wizard's last step tells the operator to press it. start.js stops the
 * wizard before it starts the bot.
 */
const onboardMenu = (info) => {
  const local = info.local("onboard.js")
  if (!(local && local.url)) {
    return [item("fa-solid fa-terminal", "Starting setup", "onboard.js", { default: true })]
  }
  return [
    item("fa-solid fa-wand-magic-sparkles", "Set up Rumi", local.url, { default: true }),
    item("fa-solid fa-sliders", "Settings", local.console_url),
    item("fa-solid fa-power-off", "Start", "start.js"),
    item("fa-solid fa-terminal", "Terminal", "onboard.js")
  ]
}

/**
 * While Start runs, the tab it opens on is the start screen, not the bot's
 * terminal: home.html waits for the bot and then offers a button to the console.
 * start.js saves its port before it starts the bot, which is what the page polls.
 */
const startMenu = (info) => {
  const local = info.local("start.js")
  const terminal = item("fa-solid fa-terminal", "Terminal", "start.js")
  if (!(local && local.port)) {
    return [{ ...terminal, default: true }]
  }
  const home = item("fa-solid fa-house", "Rumi", `home.html?raw=true&port=${local.port}`, { default: true })
  if (!local.url) {
    return [home, terminal]
  }
  return [
    home,
    item("fa-solid fa-rocket", "Open Console", local.url),
    terminal
  ]
}

/** Nothing running: lead with whichever step comes next for this deployment. */
const idleMenu = (info) => {
  const configured = isConfigured(info)
  const setup = item("fa-solid fa-wand-magic-sparkles", "Set up Rumi", "onboard.js")
  const start = item("fa-solid fa-power-off", "Start", "start.js")

  return [
    configured ? { ...start, default: true } : { ...setup, default: true },
    configured ? setup : start,
    item("fa-solid fa-code", "Claude Code", "claude.js"),
    item("fa-solid fa-terminal", "Terminal setup", "setup.js"),
    item("fa-brands fa-whatsapp", "Re-pair WhatsApp", "pair.js"),
    item("fa-solid fa-stethoscope", "Doctor", "doctor.js"),
    item("fa-solid fa-rotate", "Update", "update.js"),
    item("fa-solid fa-plug", "Install", "install.js"),
    item("fa-regular fa-circle-xmark", "Reset", "reset.js")
  ]
}

module.exports = {
  version: "7.0",
  title: "Rumi",
  description: "An open-source AI teaching companion that lives in WhatsApp — lesson plans, classroom coaching, reading assessments and voice in 15 languages. https://hellorumi.ai",
  icon: "icon.jpg",
  menu: async (kernel, info) => {
    if (info.running("install.js")) {
      return [item("fa-solid fa-plug", "Installing", "install.js", { default: true })]
    }
    if (!info.exists("../bot/node_modules")) {
      return [item("fa-solid fa-plug", "Install", "install.js", { default: true })]
    }
    // Start first: while the bot runs, the sidebar's default -- which is also
    // what Pinokio opens in Run mode -- must be the bot's start screen. Checked
    // the other way round, a wizard Pinokio still listed as running once made
    // the default its old address, which by then was the bot's bare root page.
    if (info.running("start.js")) return startMenu(info)
    if (info.running("onboard.js")) return onboardMenu(info)

    const busy = BUSY_STATES.find(([, , script]) => info.running(script))
    if (busy) return [item("fa-solid fa-terminal", busy[1], busy[2], { default: true })]

    return idleMenu(info)
  }
}
