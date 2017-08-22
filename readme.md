# rpc-engine
Minimalist RPC library.

## Why
Other stuff seems really intent on making serialization or transport decisions for me.

## How
[JSON-RPC](http://www.jsonrpc.org/specification) without the JSON.

## Example
``` javascript
var Rpc = require('rpc-engine')

var a = new Rpc()
a.setInterface({
  add: function (a, b, cb) {
    cb(null, a + b)
  }
})

var b = new Rpc()
b.setInterface('subinterface', {
  hello: function (cb) {
    cb(null, 'world')
  }
})

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

a.call('subinterface.hello', function (err, answer) {
  console.log(answer) // => world
})

// JSON-RPC defines a notification mechanism that can
// be used directly for primitive pub-sub systems
a.getInterface().event = function (evt) {
  console.log(evt) // => 42
}
b.call('event', 42)
```

## Test
``` bash
$ npm run test
```

## API

### `var rpc = new RpcEngine(opts)`
* `opts` An optional `Object`. All key-value pairs are copied to the instance.

## Methods

### `rpc.getInterface([path])`
Returns the interface at the specified path.
* `path` An optional `String`. If omitted, returns the default interface (e.g. whatever is set at `''`).

### `rpc.setInterface(path[, iface])`
### `rpc.setInterface(iface)`
Sets the interface at the specified path. Existing interfaces at the specified path are removed.
* `path` A `String`. If the second form is used, the path is assumed to be `''`.
* `iface` An `Object`. If omitted, the interface at the given path will be removed.

### `rpc.call(method[, param1][, param2][, ...][, cb])`
Invokes a method on the remote side.
* `method` A `String`.
* `params` Anything the transport (or [`rpc.serialize()`](#rpcserialize-message)) can handle. Optional.
* `cb` An optional callback `Function`.

### `rpc.send(message)`
Messages destined for the remote site are passed to this method after processing. Consumers of this module are responsible for providing an implementation.
* `message` Whatever format the transport likes. See [`rpc.serialize()`](#rpcserialize-message) to control this.

### `rpc.receive(message)`
Messages originating from the remote side must be passed to this method for processing. Consumers of this module are responsible for invoking this method somehow.
* `message` An `Object` or something [`rpc.deserialize()`](#rpcdeserialize-message) can handle.

### `rpc.serialize(message)`
This method is an optional hook consumers of this module may implement to convert outgoing messages into something compatible with the transport being used.
* `message` An `Object`.

### `rpc.deserialize(message)`
This method is an optional hook consumers of this module may implement to convert raw a incoming message into an `Object`.
* `message` Whatever format the transport uses.

### `rpc.close()`
This method can be invoked (for example, when the transport is closed) to immediately cancel any outstanding requests.

## Properties

### `rpc.defaultMethod`
A `Function`. If implemented, this method will be invoked for any incoming message or notification that does not match an explicit handler in `rpc.interface`. Note that incoming notifications may be passed to `rpc.emit()` regardless of whether they match an explict handler or a default method has been implemented.

### `rpc.objectMode`
A `Boolean`. `RpcEngine` defaults to passing parameters as an `Array` of positional arguments. Setting this property to `true` will pass them as key-value pairs instead. This is frequently needed for interop with other JSON-RPC implementations.

### `rpc.pathDelimiter`
A `String`. Specifies the path delimiter remotes must use to access methods on named interfaces. Defaults to `'.'`.

## Events

### `rpc.emit('interface-add', iface, path)`
Emitted when an interface is added.

### `rpc.emit('interface-remove', iface, path)`
Emitted when an interface is removed.

### `rpc.emit('error', err)`
Emitted in either of two scenarios:
* A send operation fails due to serialization or transport error and no callback was passed.
* A response (any inbound message with an `id`) is received that doesn't match any local callback _AND_ at least one listener for the `'error'` event has been registered.

## Releases
* 6.0.0
  * Require manipulation of interfaces to be done via method calls so that `interface-{add,remove}` can be emitted reliably.
  * Always emit `'error'` when send operations fail and no callback was passed.
* 5.0.0
  * Move pub-sub code out to separate module [rpc-events](https://github.com/jessetane/rpc-events)
  * Rename constructor to `RpcEngine`
  * Rename `methods` property to `interface`
  * `close()` method should cancel pending requests immediately
  * Complete API documentation
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
