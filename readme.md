# RPC
Minimalist RPC library.

## Why
Other stuff seems really intent on making serialization or transport decisions for me.

## How
Based loosely on [JSON-RPC](http://www.jsonrpc.org/specification).

## Example
``` javascript
var RPC = require('rpc')

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

// in real life you'll probably have some stream or socket-like
// transport in between but that's outside the scope of this module
b.send = a.onmessage
a.send = b.onmessage

a.call('hello', function (err, answer) {
  console.log(answer) // => world
})

b.call('add', 1, 1336, function (err, result) {
  console.log(result) // => 1337
})
```

## Test
``` bash
$ npm run test
```

## License
Public Domain
