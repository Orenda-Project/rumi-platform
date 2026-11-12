// Run by the console's "Restart Rumi" button (bot/console/restart.js), via
// `pterm start`. Deliberately not in pinokio.js: it is not a menu item.
module.exports = {
  run: [
    {
      when: "{{running('start.js')}}",
      method: "script.stop",
      params: {
        // Absolute, as in start.js: a bare uri stops nothing.
        uri: "{{path.resolve(cwd, 'start.js')}}"
      }
    },
    {
      method: "script.start",
      params: {
        uri: "{{path.resolve(cwd, 'start.js')}}"
      }
    }
  ]
}
