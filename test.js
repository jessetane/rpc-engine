var tape = require('tape')
var RPC = require('./')
var Emitter = require('events')

var a = new RPC()
var b = new RPC()

a.send = function (message) {
  // use setTimeout here to force async sending and
  // avoid nested try/catch which could never happen irl
  setTimeout(function () {
    b.onmessage(message)
  })
}
a.methods.add = function (a, b, cb) {
  cb(null, a + b)
}

b.send = function (message) {
  setTimeout(function () {
    a.onmessage(message)
  })
}
b.methods.hello = function (cb) {
  cb(null, 'world')
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
  b.on('error', onerror)
  function onerror (err) {
    t.equal(err.code, -32700)
    t.equal(err.message, 'Parse error')
    delete a.deserialize
    delete b.serialize
    b.removeListener('error', onerror)
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

tape('should allow path delimited method access', function (t) {
  t.plan(1)
  a.methods.outer = {
    inner: {
      core: function (cb) {
        cb()
      }
    }
  }
  b.call('outer.inner.core', function (err) {
    t.error(err)
  })
})

tape('implement remote event subscription', function (t) {
  t.plan(1)
  a.feeds.outer = {
    inner: {
      core: new Emitter()
    }
  }
  b.subscribe('outer.inner.core.wow', onwow)
  function onwow (evt) {
    t.equal(evt, 42)
    b.unsubscribe('wow', onwow)
  }
  setTimeout(() => {
    a.feeds.outer.inner.core.emit('wow', 42)
  })
})

tape('emit an error if remote subscription fails', function (t) {
  t.plan(1)
  b.on('error', onerror)
  function onerror (err) {
    t.equal(err.message, 'Feed not found')
    b.removeListener('error', onerror)
  }
  b.subscribe('some.nonexistant.feed.wow', function () {
    t.fail()
  })
})
