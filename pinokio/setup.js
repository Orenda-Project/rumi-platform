module.exports = {
  run: [{
    method: "shell.run",
    params: {
      path: "..",
      // An interactive shell: the wizard is readline-driven and asks questions.
      input: true,
      env: {
        "QUEUE_DRIVER": "bullmq"
      },
      message: "node bin/rumi.js setup"
    }
  }]
}
