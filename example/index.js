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
