var tape = require('tape')
var RPC = require('./')

var a = new RPC()
var b = new RPC()

a.send = function (message) {
  // use setTimeout here to force async sending and
  // avoid nested try/catch which could never happen irl
  setTimeout(function () {
    b.onmessage(message)
  })
}
a.methods = {
  add: function (a, b, cb) {
    cb(null, a + b)
  }
}

b.send = function (message) {
  setTimeout(function () {
    a.onmessage(message)
  })
}
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
  var timeout = null
  a.timeout = 50
  b.methods.slowMethod = function (cb) {
    timeout = setTimeout(cb, 100)
  }
  a.call('slowMethod', function (err) {
    t.equal(err.code, -32603)
    t.equal(err.message, 'Call timed out')
    clearTimeout(timeout)
    delete a.timeout
    delete b.methods.slowMethod
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

tape('apply methods against instance by default', function (t) {
  t.plan(2)
  a.instanceMethod = function (cb) {
    t.equal(this, a)
    cb()
  }
  a.methods.instanceMethod = a.instanceMethod
  b.call('instanceMethod', function (err) {
    t.error(err)
    delete a.methods.instanceMethod
    delete a.instanceMethod
  })
})

tape('apply notifications against instance by default', function (t) {
  t.plan(1)
  a.instanceNotification = function () {
    t.equal(this, a)
    delete a.methods.instanceNotification
    delete a.instanceNotification
  }
  a.methods.instanceNotification = a.instanceNotification
  b.call('instanceNotification')
})

tape('respond to parse errors', function (t) {
  t.plan(2)
  a.deserialize = JSON.parse
  b.serialize = function () {
    return undefined
  }
  b.onerror = function (err) {
    t.equal(err.code, -32700)
    t.equal(err.message, 'Parse error')
    delete a.deserialize
    delete b.serialize
    delete b.onerror
  }
  b.call('add', 1, 2, function (err, result) {
    t.fail()
  })
})

tape('respond to parse errors via callback if possible', function (t) {
  t.plan(2)
  a.deserialize = JSON.parse
  b.call('add', 1, 2, function (err) {
    t.equal(err.code, -32700)
    t.equal(err.message, 'Parse error')
    delete a.deserialize
  })
})
