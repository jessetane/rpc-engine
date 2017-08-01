# rpc-engine
Minimalist RPC library.

## Why
Other stuff seems really intent on making serialization or transport decisions for me.

## How
[JSON-RPC](http://www.jsonrpc.org/specification) without the JSON.

## Example
``` javascript
var RPC = require('rpc-engine')

var a = new RPC()
a.methods.add = function (a, b, cb) {
  cb(null, a + b)
}

var b = new RPC()
b.methods.nested = {
  hello: function (cb) {
    cb(null, 'world')
  }
}

// in real life you'll have some transport in between
// but that's outside the scope of this module
b.send = a.receive
a.send = b.receive

// not all transports require manual serialization (e.g. we should have
// structured clone in browserland), but if yours does, go nuts:
var msgpack = require('msgpack-lite')
a.serialize = JSON.stringify
a.deserialize = msgpack.decode
b.serialize = msgpack.encode
b.deserialize = JSON.parse

b.call('add', 1, 1336, function (err, result) {
  console.log(result) // => 1337
})

a.call('nested.hello', function (err, answer) {
  console.log(answer) // => world
})

// emit events from .feeds to expose them across the ether:
b.subscribe('some-event', eventHandler)
function eventHandler (evt) {
  console.log(evt) // => 42
  b.unsubscribe('some-event', eventHandler)
}
a.feeds.emit('some-event', 42)

// emitters can also be nested in .feeds:
a.feeds.subfeed = new Emitter()
b.subscribe('subfeed.some-event', eventHandler)
```

## Test
``` bash
$ npm run test
```

## Releases
* 4.0.0
  * Allow path delimited method and event names
  * Add feeds property and implement `{un}subscribe()` on the receive side
  * Change `onmessage` to `receive` (breaking change)
* 3.1.0
  * Switch license to MIT
* 3.0.0
  * Inherit from EventEmitter
  * Use `emit('error', error)` rather than the onerror property (this is a breaking change)
  * Add lightweight remote event subscription mechanism
  * Switch to `Math.random()` for generating callback ids
* 2.1.0
  * Handle parse errors as described in the spec
* 2.0.0
  * Renamed to rpc-engine
* 1.1.0
  * Bug fix (message `results` should be `result`)
  * Handle parse and send errors
  * Add timeout feature
  * Add `objectMode` property for working with remotes that pass `params`, `result` as objects instead of arrays
* 1.0
  * First release

## License
MIT
