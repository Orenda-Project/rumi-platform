module.exports = {
  run: [
    // One repository: pulling it updates Rumi and this launcher together.
    {
      method: "shell.run",
      params: {
        path: "..",
        message: "git pull"
      }
    },
    {
      method: "shell.run",
      params: {
        message: "npm ci --no-fund --no-audit || npm install --no-fund --no-audit"
      }
    },
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
    }
  ]
}
