import Rpc from 'rpc-engine'
import tap from 'tap-esm'

if (typeof window !== 'undefined') {
  tap.out = function () {
    console.log.apply(console, arguments)
    const line = document.createElement('div')
    line.textContent = Array.from(arguments).join(' ')
    document.body.appendChild(line)
  }
}

var a = new Rpc()
a.addEventListener('error', evt => {
  console.warn(evt.message)
})
a.methods = {
  add: function (x, y) {
    return x + y
  }
}
a.send = function (message) {
  // use setTimeout to mock async sending
  setTimeout(() => {
    b.receive(message)
  })
}

var b = new Rpc()
b.addEventListener('error', evt => {
  console.warn(evt.message)
})
b.methods.hello = function () {
  return 'world'
}
b.send = function (message) {
  setTimeout(() => {
    a.receive(message)
  })
}

tap('call remote method on b without params', async t => {
  t.plan(1)
  const result = await a.call('hello')
  t.equal(result, 'world')
})

tap('call remote method on b without params (promise)', async t => {
  t.plan(1)
  const result = await a.call('hello')
  t.equal(result, 'world')
})

tap('call remote method on a with params', async t => {
  t.plan(1)
  const result = await b.call('add', 1, 2)
  t.equal(result, 3)
})

tap('call remote method on a with params (promise)', async t => {
  t.plan(1)
  const result = await b.call('add', 1, 2)
  t.equal(result, 3)
})

tap('serialize and deserialize', async t => {
  t.plan(1)
  a.serialize = b.serialize = JSON.stringify
  a.deserialize = b.deserialize = JSON.parse
  const result = await b.call('add', 41, 1)
  t.equal(result, 42)
  delete a.serialize
  delete a.deserialize
  delete b.serialize
  delete b.deserialize
})

tap('throw when serialize fails', async t => {
  t.plan(1)
  b.serialize = function () {
    throw new Error('serialize failed')
  }
  try {
    await b.call('add', 1, 2)
    throw new Error('serialize did not fail')
  } catch (err) {
    t.equal(err.message, 'serialize failed')
    delete b.serialize
  }
})

tap('respond with parse error when deserialize fails', t => {
  t.plan(5)
  a.deserialize = function () {
    throw new Error('deserialize failed')
  }
  a.addEventListener('error', err => {
    t.equal(err.message, 'deserialize failed')
  }, { once: true })
  b.addEventListener('error', err => {
    t.equal(err.message, 'invalid request')
    t.equal(err.code, -32600)
    // this is tricky but the only way to observe a remote parse error is via
    // the "invalid request" error data field as no message id would be known
    t.equal(err.data.error.message, 'parse error')
    t.equal(err.data.error.code, -32700)
    delete a.deserialize
  }, { once: true })
  b.call('add', 1, 2)
})

tap('send a notification to b', function (t) {
  t.plan(1)
  b.methods.notify = function () {
    const evt = new Event('notify')
    evt.detail = Array.from(arguments)
    b.dispatchEvent(evt)
  }
  b.addEventListener('notify', evt => {
    t.equal(evt.detail[0], 'alert')
    delete b.methods.notify
  }, { once: true })
  a.notify('notify', 'alert')
})

tap('return not found error for missing method', async t => {
  t.plan(2)
  try {
    await a.call('bogus')
  } catch (err) {
    t.equal(err.message, 'method not found')
    t.equal(err.code, -32601)
  }
})

tap('invoke methods in the correct context', async t => {
  t.plan(4)
  const oldMethods = a.methods
  const iface = {
    unbound: function () {
      return this
    },
    bound: function () {
      return this
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
  a.methods = iface
  let ctx = await b.call('unbound')
  t.equal(ctx, a)
  ctx = await b.call('bound')
  t.equal(ctx, iface)
  await b.call('unboundNotification')
  await b.call('boundNotification')
  a.methods = oldMethods
})

tap('invoke defaultMethod (if available) for unknown methods', t => {
  t.plan(2)
  b.defaultMethod = function (name, x) {
    delete b.defaultMethod
    t.equal(name, 'unknown')
    t.equal(x, 42)
  }
  a.call('unknown', 42)
})

tap('invoke defaultMethod (if available) for unknown notifications', t => {
  t.plan(2)
  b.defaultMethod = (name, x) => {
    delete b.defaultMethod
    t.equal(name, 'unknown')
    t.equal(x, 42)
  }
  a.notify('unknown', 42)
})

tap('timeout calls if specified', async t => {
  t.plan(2)
  let timeout = null
  a.timeout = 50
  b.methods.slowMethod = async () => {
    return new Promise(res => {
      timeout = setTimeout(() => {
        res(42)
      }, 100)
    })
  }
  try {
    const result = await a.call('slowMethod')
    if (result === 42) {
      throw new Error('call did not time out')
    }
  } catch (err) {
    clearTimeout(timeout)
    delete a.timeout
    delete b.methods.slowMethod
    t.equal(err.code, -32603)
    t.equal(err.message, 'call timed out')
  }
})

tap('use object-based params when objectMode is set', async t => {
  t.plan(2)
  a.objectMode = true
  b.methods.question = params => {
    t.equal(params.question, 'universe')
    return { answer: 42 }
  }
  const result = await a.call('question', { question: 'universe' })
  delete a.objectMode
  delete b.methods.question
  t.equal(result.answer, 42)
})

tap('catch send errors for method calls', async t => {
  t.plan(1)
  var oldSend = b.send
  b.send = function () {
    throw new Error('send failed')
  }
  try {
    await b.call('add', 1, 2)
    throw new Error('send did not fail')
  } catch (err) {
    b.send = oldSend
    t.equal(err.message, 'send failed')
  }
})

tap('catch send errors for notifications', async t => {
  t.plan(1)
  const oldSend = b.send
  b.send = function () {
    throw new Error('send failed')
  }
  try {
    await b.notify('notify')
  } catch (err) {
    b.send = oldSend
    t.equal(err.message, 'send failed')
  }
})

tap('not respond to invalid requests', t => {
  t.plan(3)
  const oldReceive = b.receive
  b.receive = t.fail
  a.addEventListener('error', err => {
    t.equal(err.message, 'invalid request')
    t.equal(err.code, -32600)
    setTimeout(() => {
      b.receive = oldReceive
      t.pass()
    }, 100)
  }, { once: true })
  b.send({
    id: 998,
    error: {
      code: -1,
      message: 'bogus error'
    }
  })
})

tap('expose potentially sensitive error data to peer', async t => {
  t.plan(3)
  b.methods.leaky = () => {
    throw new Error('secret stuff')
  }
  b.addEventListener('error', err => {
    t.equal(err.message, 'secret stuff')
  }, { once: true })
  try {
    await a.call('leaky')
  } catch (err) {
    t.equal(err.message, 'secret stuff')
    t.equal(err.code, undefined)
  }
})
