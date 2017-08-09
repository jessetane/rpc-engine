var tape = require('tape')
var Rpc = require('./')

var a = new Rpc()
var b = new Rpc()

a.send = function (message) {
  // use setTimeout here to force async sending and
  // avoid nested try/catch which could never happen irl
  setTimeout(function () {
    b.receive(message)
  })
}
a.interface.add = function (a, b, cb) {
  cb(null, a + b)
}

b.send = function (message) {
  setTimeout(function () {
    a.receive(message)
  })
}
b.interface.hello = function (cb) {
  cb(null, 'world')
}

tape('call remote method on b without params', function (t) {
  t.plan(2)
  a.call('hello', function (err, result) {
    t.error(err)
    t.equal(result, 'world')
  })
})

tape('call remote method on a with params', function (t) {
  t.plan(2)
  b.call('add', 1, 2, function (err, result) {
    t.error(err)
    t.equal(result, 3)
  })
})

tape('serialize and deserialize', function (t) {
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

tape('send a notification to b', function (t) {
  t.plan(2)
  b.interface.notify = function (notification) {
    t.equal(notification, 'alert')
  }
  b.once('notify', function (evt) {
    t.equal(evt, 'alert')
    delete b.interface.notify
  })
  a.call('notify', 'alert')
})

tape('return not found error for missing method', function (t) {
  t.plan(2)
  a.call('bogus', function (err) {
    t.equal(err.code, -32601)
    t.equal(err.message, 'Method not found')
  })
})

tape('invoke methods in the correct context', function (t) {
  t.plan(2)
  a.interface.x = {
    y: {
      z: {
        method: function (cb) {
          t.equal(this, a.interface.x.y.z)
          cb()
        }
      }
    }
  }
  b.call('x.y.z.method', function (err) {
    t.error(err)
    delete a.interface.x
  })
})

tape('invoke defaultMethod (if available) for unknown methods', function (t) {
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

tape('invoke defaultMethod (if available) for unknown notifications', function (t) {
  t.plan(2)
  b.defaultMethod = function (name, x) {
    t.equal(name, 'unknown')
    t.equal(x, 42)
    delete b.defaultMethod
  }
  a.call('unknown', 42)
})

tape('timeout calls if specified', function (t) {
  t.plan(2)
  var timeout = null
  a.timeout = 50
  b.interface.slowMethod = function (cb) {
    timeout = setTimeout(cb, 100)
  }
  a.call('slowMethod', function (err) {
    t.equal(err.code, -32603)
    t.equal(err.message, 'Call timed out')
    clearTimeout(timeout)
    delete a.timeout
    delete b.interface.slowMethod
  })
})

tape('use object-based params / result by setting objectMode', function (t) {
  t.plan(3)
  a.objectMode = b.objectMode = true
  b.interface.question = function (params, cb) {
    t.equal(params.question, 'universe')
    cb(null, { answer: 42 })
  }
  a.call('question', { question: 'universe' }, function (err, result) {
    t.error(err)
    t.equal(result.answer, 42)
    delete a.objectMode
    delete b.objectMode
    delete b.interface.question
  })
})

tape('respond to parse errors', function (t) {
  t.plan(2)
  a.deserialize = JSON.parse
  b.serialize = function () {
    return undefined
  }
  b.on('error', onerror)
  function onerror (err) {
    t.equal(err.code, -32700)
    t.equal(err.message, 'Parse error')
    delete a.deserialize
    delete b.serialize
    b.removeListener('error', onerror)
  }
  b.call('add', 1, 2, t.fail)
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

tape('catch send errors for method calls', function (t) {
  t.plan(2)
  var oldSend = b.send
  b.send = function () {
    throw new Error('Send failed')
  }
  b.call('add', 1, 2, function (err) {
    t.equal(err.code, -32603)
    t.equal(err.message, 'Send failed')
    b.send = oldSend
  })
})

tape('catch send errors for notifications when error handler is present', function (t) {
  t.plan(2)
  var oldSend = b.send
  b.send = function () {
    throw new Error('Send failed')
  }
  b.on('error', onerror)
  function onerror (err) {
    t.equal(err.code, -32603)
    t.equal(err.message, 'Send failed')
    b.send = oldSend
    b.removeListener('error', onerror)
  }
  b.call('notify')
})

tape('discard send errors for notifications when error handler is not present', function (t) {
  t.plan(1)
  var oldSend = b.send
  b.send = function () {
    throw new Error('Send failed')
  }
  b.call('notify')
  setTimeout(function () {
    b.send = oldSend
    t.pass()
  }, 50)
})

tape('discard errors from remote for which we have no matching callback and error handler is not present', function (t) {
  t.plan(1)
  a.on('error', onerror)
  function onerror (err) {
    t.equal(err.message, 'bogus error')
    a.removeListener('error', onerror)
    b.send({
      id: 999,
      error: {
        code: -2,
        message: 'another bogus error'
      }
    })
  }
  b.send({
    id: 998,
    error: {
      code: -1,
      message: 'bogus error'
    }
  })
})
