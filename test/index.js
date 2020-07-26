import Rpc from 'rpc-engine/index.js'
import tap from 'tap-esm/index.js'

var a = new Rpc()
a.setInterface({
  add: function (x, y, cb) {
    cb(null, x + y)
  }
})
a.send = function (message) {
  // use setTimeout here to force async sending and
  // avoid nested try/catch which could never happen irl
  setTimeout(function () {
    b.receive(message)
  })
}

var b = new Rpc()
b.getInterface().hello = function (cb) {
  cb(null, 'world')
}
b.send = function (message) {
  setTimeout(function () {
    a.receive(message)
  })
}

tap('get and set interfaces by path', function (t) {
  t.plan(5)
  var defaultInterface = a.getInterface()
  t.equal(a.getInterface(''), defaultInterface)
  a.addEventListener('interface-remove', handler)
  a.setInterface()
  t.equal(a.getInterface(), defaultInterface)
  a.setInterface('', defaultInterface)
  a.setInterface('')
  a.removeEventListener('interface-remove', handler)
  function handler (evt) {
    t.equal(evt.detail.iface, defaultInterface)
  }
  t.equal(a.getInterface(), undefined)
  a.setInterface(defaultInterface)
  t.equal(a.getInterface(), defaultInterface)
})

tap('call remote method on b without params', function (t) {
  t.plan(2)
  a.call('hello', function (err, result) {
    t.notOk(err)
    t.equal(result, 'world')
  })
})

tap('call remote method on a with params', function (t) {
  t.plan(2)
  b.call('add', 1, 2, function (err, result) {
    t.notOk(err)
    t.equal(result, 3)
  })
})

tap('call remote method on subinterface of b', function (t) {
  t.plan(4)
  b.setInterface('sub', {
    test: function (param, cb) {
      t.equal(param, 42)
      cb()
    }
  })
  a.call('sub.test', 42, function (err) {
    t.notOk(err)
    t.equal(typeof b.getInterface('sub').test, 'function')
    b.setInterface('sub', null)
    t.equal(b.getInterface('sub'), undefined)
  })
})

tap('serialize and deserialize', function (t) {
  t.plan(2)
  a.serialize = b.serialize = JSON.stringify
  a.deserialize = b.deserialize = JSON.parse
  b.call('add', 41, 1, function (err, result) {
    t.notOk(err)
    t.equal(result, 42)
    delete a.serialize
    delete a.deserialize
    delete b.serialize
    delete b.deserialize
  })
})

tap('send a notification to b', function (t) {
  t.plan(2)
  b.getInterface().notify = function (notification) {
    t.equal(notification, 'alert')
  }
  b.addEventListener('notify', function (evt) {
    t.equal(evt.detail[0], 'alert')
    delete b.getInterface().notify
  }, { once: true })
  a.call('notify', 'alert')
})

tap('return not found error for missing method', function (t) {
  t.plan(2)
  a.call('bogus', function (err) {
    t.equal(err.code, -32601)
    t.equal(err.message, 'Method not found')
  })
})

tap('invoke methods in the correct context', function (t) {
  t.plan(4)
  var iface = {
    unbound: function (cb) {
      cb(null, this)
    },
    bound: function (cb) {
      cb(null, this)
    },
    unboundNotification: function () {
      t.equal(this, a)
    },
    boundNotification: function () {
      t.equal(this, iface)
    }
  }
  iface.bound = iface.bound.bind(iface)
  iface.boundNotification = iface.boundNotification.bind(iface)
  a.setInterface('x.y.z', iface)
  b.call('x.y.z.unbound', function (err, ctx) {
    t.equal(ctx, a)
    b.call('x.y.z.bound', function (err, ctx) {
      t.equal(ctx, iface)
      b.call('x.y.z.unboundNotification')
      b.call('x.y.z.boundNotification')
      setTimeout(() => {
        a.setInterface('x.y.z', null)
      })
    })
  })
})

tap('invoke defaultMethod (if available) for unknown methods', function (t) {
  t.plan(3)
  b.defaultMethod = function (name, x, cb) {
    t.equal(name, 'unknown')
    t.equal(x, 42)
    cb()
  }
  a.call('unknown', 42, function (err) {
    t.notOk(err)
    delete b.defaultMethod
  })
})

tap('invoke defaultMethod (if available) for unknown notifications', function (t) {
  t.plan(2)
  b.defaultMethod = function (name, x) {
    t.equal(name, 'unknown')
    t.equal(x, 42)
    delete b.defaultMethod
  }
  a.call('unknown', 42)
})

tap('timeout calls if specified', function (t) {
  t.plan(2)
  var timeout = null
  a.timeout = 50
  b.getInterface().slowMethod = function (cb) {
    timeout = setTimeout(cb, 100)
  }
  a.call('slowMethod', function (err) {
    t.equal(err.code, -32603)
    t.equal(err.message, 'Call timed out')
    clearTimeout(timeout)
    delete a.timeout
    delete b.getInterface().slowMethod
  })
})

tap('use object-based params / result by setting objectMode', function (t) {
  t.plan(3)
  a.objectMode = b.objectMode = true
  b.getInterface().question = function (params, cb) {
    t.equal(params.question, 'universe')
    cb(null, { answer: 42 })
  }
  a.call('question', { question: 'universe' }, function (err, result) {
    t.notOk(err)
    t.equal(result.answer, 42)
    delete a.objectMode
    delete b.objectMode
    delete b.getInterface().question
  })
})

tap('respond to parse errors', function (t) {
  t.plan(2)
  a.deserialize = JSON.parse
  b.serialize = function () {
    return undefined
  }
  b.addEventListener('error', onerror)
  function onerror (evt) {
    var err = evt.detail
    t.equal(err.code, -32700)
    t.equal(err.message, 'Parse error')
    delete a.deserialize
    delete b.serialize
    b.removeEventListener('error', onerror)
  }
  b.call('add', 1, 2, t.fail)
})

tap('respond to parse errors via callback if possible', function (t) {
  t.plan(2)
  a.deserialize = JSON.parse
  b.call('add', 1, 2, function (err) {
    t.equal(err.code, -32700)
    t.equal(err.message, 'Parse error')
    delete a.deserialize
  })
})

tap('catch send errors for method calls', function (t) {
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

tap('catch send errors for notifications when error handler is present', function (t) {
  t.plan(2)
  var oldSend = b.send
  b.send = function () {
    throw new Error('Send failed')
  }
  b.addEventListener('error', onerror)
  function onerror (evt) {
    var err = evt.detail
    t.equal(err.code, -32603)
    t.equal(err.message, 'Send failed')
    b.send = oldSend
    b.removeEventListener('error', onerror)
  }
  b.call('notify')
})

tap('discard errors from remote for which we have no matching callback and error handler is not present', function (t) {
  t.plan(1)
  a.addEventListener('error', onerror)
  function onerror (evt) {
    var err = evt.detail
    t.equal(err.message, 'bogus error')
    a.removeEventListener('error', onerror)
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
