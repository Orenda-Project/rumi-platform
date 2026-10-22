module.exports = {
  run: [
    // The launcher lives in pinokio/ inside Rumi's own repository, so Pinokio's
    // clone of the repo is the install -- there is nothing else to download.
    //
    // The launcher's own dependency: qrcode, which draws the WhatsApp QR as an
    // image in the setup wizard. Express comes from bot/ (see onboarding/bridge.js).
    //
    // `npm ci` rather than `npm install` everywhere, so a lockfile is never
    // rewritten -- a dirty checkout would make the `git pull` in update.js
    // refuse to run. Falls back to install if a lockfile has drifted.
    {
      method: "shell.run",
      params: {
        message: "npm ci --no-fund --no-audit || npm install --no-fund --no-audit"
      }
    },
    // Rumi's mechanical install (install.sh), minus the `npm link` -- a global
    // symlink has no place in a sandboxed launcher, and `node bin/rumi.js` is
    // documented as identical.
    {
      method: "shell.run",
      params: {
        path: "..",
        message: "npm ci --no-fund --no-audit || npm install --no-fund --no-audit"
      }
    },
    {
      method: "shell.run",
      params: {
        path: "../bot",
        message: "npm ci --no-fund --no-audit || npm install --no-fund --no-audit"
      }
    },
    // Never clobber an existing .env -- it holds every credential this
    // deployment has. install.sh takes the same care.
    {
      when: "{{!exists('../.env')}}",
      method: "fs.copy",
      params: {
        src: "../.env.template",
        dest: "../.env"
      }
    },
    // Rumi's queue and session state want a Redis. conda-forge has no Windows
    // build, so Windows users paste a hosted address into the setup wizard instead.
    {
      when: "{{platform !== 'win32'}}",
      method: "shell.run",
      params: {
        message: "conda install -y -c conda-forge redis-server"
      }
    }
  ]
}
