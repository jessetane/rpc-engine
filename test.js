var tape = require('tape')
var RPC = require('./')

var a = new RPC()
var b = new RPC()

a.send = b.onmessage
a.methods = {
  add: function (a, b, cb) {
    cb(null, a + b)
  }
}

b.send = a.onmessage
b.methods = {
  hello: function (cb) {
    cb(null, 'world')
  }
}

tape('a can call remote method on b without params', function (t) {
  t.plan(2)
  a.call('hello', function (err, result) {
    t.error(err)
    t.equal(result, 'world')
  })
})

tape('b can call remote method on a with params', function (t) {
  t.plan(2)
  b.call('add', [ 1, 2 ], function (err, result) {
    t.error(err)
    t.equal(result, 3)
  })
})

tape('a can send a notification to b', function (t) {
  t.plan(1)
  b.methods.notify = function (notification) {
    t.equal(notification, 'alert')
    delete b.methods.notify
  }
  a.call('notify', 'alert')
})

tape('missing methods return not found error', function (t) {
  t.plan(2)
  a.call('bogus', function (err) {
    t.equal(err.code, -32601)
    t.equal(err.message, 'Method not found')
  })
})

tape('serialization works', function (t) {
  t.plan(2)
  a.serialize = b.serialize = JSON.stringify
  a.deserialize = b.deserialize = JSON.parse
  b.call('add', [ 41, 1 ], function (err, result) {
    t.error(err)
    t.equal(result, 42)
  })
})
