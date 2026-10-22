module.exports = {
  run: [{
    method: "shell.run",
    params: {
      path: "..",
      // Interactive: the QR is drawn into the terminal by qrcode-terminal.
      input: true,
      message: "node bin/rumi.js pair"
    }
  }]
}
