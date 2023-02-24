# rpc-engine
Minimalist RPC library.

## Why
Other stuff seems really intent on making serialization or transport decisions for me.

## How
[JSON-RPC](http://www.jsonrpc.org/specification) without the JSON.

## Example
``` javascript
import Rpc from 'rpc-engine'

const a = new Rpc()
a.methods.add = (a, b) => {
  return a + b
}

const b = new Rpc()
b.methods.hello = async () => {
  await new Promise(s => setTimeout(s, 100))
  return 'world'
}

// in real life you'll have some transport in between
// but that's outside the scope of this module
b.send = a.receive
a.send = b.receive

// not all transports require manual serialization (e.g. we should have
// structured clone in browserland), but if yours does, go nuts:
import msgpack from 'msgpack-lite/index.js'
a.serialize = JSON.stringify
a.deserialize = msgpack.decode
b.serialize = msgpack.encode
b.deserialize = JSON.parse

console.log(await b.call('add', 1, 1336)) // => 1337
console.log(await a.call('hello')) // => world

// JSON-RPC defines a notification mechanism that can
// be used directly for primitive pub-sub systems
a.methods.event = evt => {
  console.log(evt) // => 42
}
b.notify('event', 42)
```

## Test
``` sh
$ npm run test
$ npm run test-browser # visit http://localhost:7357/test
```

## API

### `const rpc = new RpcEngine(opts)`
* `opts` An optional `Object`. All key-value pairs are copied to the instance.

### `throw new RpcEngine.Error('error message')`
Throw an instance of this error during method handler execution when the intended audience is the remote caller. Alternatively `myExistingError.insecureRpc = true` can be set before rethrowing an existing error. Note that only `{ message, code, data }` properties of errors are actually passed to the transport.

## Methods

### `await rpc.call(method[, param1][, param2][, ...])`
Invokes a method on the remote side.
* `method` A `String`.
* `params` Anything the transport (or [`rpc.serialize()`](#rpcserialize-message)) can handle. Optional.

### `await rpc.notify(method[, param1][, param2][, ...])`
Invokes a method on the remote side without sending a message id.
* `method` A `String`.
* `params` Anything the transport (or [`rpc.serialize()`](#rpcserialize-message)) can handle. Optional.

### `await rpc.send(message)`
Messages destined for the remote site are passed to this method after processing. Consumers of this module are responsible for providing an implementation.
* `message` Whatever format the transport likes. See [`rpc.serialize()`](#rpcserialize-message) to control this.

### `await rpc.receive(message)`
Messages originating from the remote side must be passed to this method for processing. Consumers of this module are responsible for invoking this method somehow.
* `message` An `Object` or something [`rpc.deserialize()`](#rpcdeserialize-message) can handle.

### `await rpc.serialize(message)`
This method is an optional hook consumers of this module may implement to convert outgoing messages into something compatible with the transport being used.
* `message` An `Object`.

### `await rpc.deserialize(message)`
This method is an optional hook consumers of this module may implement to convert raw a incoming message into an `Object`.
* `message` Whatever format the transport uses.

### `rpc.close()`
This method can be invoked (for example, when the transport is closed) to immediately cancel any outstanding requests.

## Properties

### `rpc.methods`
An `Object` representing the interface available to the remote peer. Keys are method names, values are functions.

### `rpc.defaultMethod`
A `Function`. If implemented, this method will be invoked for any incoming message or notification that does not match an explicit handler in `rpc.methods`.

### `rpc.objectMode`
A `Boolean`. `RpcEngine` defaults to passing parameters as an `Array` of positional arguments. Setting this property to `true` will pass them as key-value pairs instead. This is frequently needed for interop with other JSON-RPC implementations.

### `rpc.insecureErrors`
A `Boolean`. When true, all errors thrown during method handler execution are returned to remote callers. To opt-in to sending a specific error to remote callers, set `err.insecureRpc = true` before throwing or throw an instance of `Rpc.Error`.

## Events

### `Event('error')`
Dispatched when something goes wrong while processing an incoming message.

## Releases
* 11.0.0
  * Allow errors generated during method handler execution to be sent to peers. This is risky in a promise environment because the programmer must opt-out of sending potentially sensitive error data to peers, but the benefits probably outweigh the risks
* 10.0.0
  * Simplify, modernize
* 9.0.0
  * Add promise support
* 8.0.0
  * Convert to ES module
  * Switch from EventEmitter to EventTarget
* 7.0.0
  * Make default method invocation context the instance rather than the interface
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
