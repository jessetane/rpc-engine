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
  b.call('add', 1, 2, function (err, result) {
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
  b.call('add', 41, 1, function (err, result) {
    t.error(err)
    t.equal(result, 42)
    delete a.serialize
    delete a.deserialize
    delete b.serialize
    delete b.deserialize
  })
})

tape('can handle unknown methods', function (t) {
  t.plan(3)
  b.defaultMethod = function (name, x, cb) {
    t.equal(name, 'unknown')
    t.equal(x, 42)
    cb()
  }
  a.call('unknown', 42, function (err) {
    t.error(err)
    delete b.defaultMethod
  })
})

tape('can handle unknown notifications', function (t) {
  t.plan(2)
  b.defaultMethod = function (name, x) {
    t.equal(name, 'unknown')
    t.equal(x, 42)
    delete b.defaultMethod
  }
  a.call('unknown', 42)
})

tape('can timeout calls', function (t) {
  t.plan(2)
  a.timeout = 50
  b.methods.slowMethod = function (cb) {
    setTimeout(cb, 100)
  }
  a.call('slowMethod', function (err) {
    t.equal(err.code, -32603)
    t.equal(err.message, 'Call timed out')
    delete a.timeout
    delete b.slowMethod
  })
})

tape('can use object-based params / result by setting objectMode', function (t) {
  t.plan(3)
  a.objectMode = b.objectMode = true
  b.methods.question = function (params, cb) {
    t.equal(params.question, 'universe')
    cb(null, { answer: 42 })
  }
  a.call('question', { question: 'universe' }, function (err, result) {
    t.error(err)
    t.equal(result.answer, 42)
    delete a.objectMode
    delete b.objectMode
    delete b.methods.question
  })
})
