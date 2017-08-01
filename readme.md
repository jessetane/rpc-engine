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
a.methods = {
  add: function (a, b, cb) {
    cb(null, a + b)
  }
}

var b = new RPC()
b.methods = {
  hello: function (cb) {
    cb(null, 'world')
  }
}

// in real life you'll have some stream-like transport
// in between but that's outside the scope of this module
b.send = a.onmessage
a.send = b.onmessage

// not all transports require manual serialization (we should have
// structured clone in browserland), but if yours does, go nuts:
var msgpack = require('msgpack-lite')
a.serialize = JSON.stringify
a.deserialize = msgpack.decode
b.serialize = msgpack.encode
b.deserialize = JSON.parse

a.call('hello', function (err, answer) {
  console.log(answer) // => world
})

b.call('add', 1, 1336, function (err, result) {
  console.log(result) // => 1337
})

// you can also subscribe() to and unsubscribe() from remote events:
// (note the remote must of course implement handlers for these methods)
a.methods.subscribe = function (eventName, confirmSubscription) {
  this.subscribed = true
  confirmSubscription() // subscribe implementations must confirm new subscriptions
}
a.methods.unsubscribe = function (eventName) {
  this.subscribed = false
  // no need to confirm on unsubscribe
}
b.subscribe('some-event', eventHandler)
function eventHandler (evt) {
  console.log('got event', evt) // evt should be 42
  b.unsubscribe('some-event', eventHandler)
}
// dispatch events by calling the remote with the event name and no callback:
a.call(eventName, 42)
```

## Test
``` bash
$ npm run test
```

## Releases
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
