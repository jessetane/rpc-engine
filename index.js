module.exports = RPCEngine

var Emitter = require('events')
var inherits = require('inherits')

inherits(RPCEngine, Emitter)

function RPCEngine () {
  Emitter.call(this)
  this.receive = this.receive.bind(this)
  this.methods = {
    subscribe: this._onsubscribe.bind(this),
    unsubscribe: this._onunsubscribe.bind(this)
  }
  this._callbacks = {}
  this.feeds = new Emitter()
  this._subscriptions = {}
  this.pathDelimiter = '.'
}

RPCEngine.prototype.call = function (name) {
  var message = { method: name }
  var params = Array.prototype.slice.call(arguments, 1)
  var id, cb = params.slice(-1)[0]
  if (typeof cb === 'function') {
    id = message.id = Math.random()
    this._callbacks[id] = cb
    params.pop()
  }
  if (params.length) {
    message.params = this.objectMode ? params[0] : params
  }
  if (cb && this.timeout) {
    var timer = setTimeout(function () {
      if (this._callbacks[id]) {
        delete this._callbacks[id]
        var err = new Error('Call timed out')
        err.code = -32603
        cb(err)
      }
    }.bind(this), this.timeout)
    if (timer.unref) timer.unref()
  }
  this._dosend(message, id)
}

RPCEngine.prototype._dosend = function (message, cbid) {
  if (this.serialize) {
    message = this.serialize(message)
  }
  try {
    this.send(message)
  } catch (err) {
    err.code = -32603
    if (cbid !== undefined) {
      var cb = this._callbacks[cbid]
      delete this._callbacks[cbid]
      cb(err)
    } else if (this.listenerCount('error') > 0) {
      this.emit('error', err)
    }
  }
}

RPCEngine.prototype.receive = function (message) {
  if (this.deserialize) {
    try {
      message = this.deserialize(message)
    } catch (err) {
      this._dosend({
        id: message && message.id,
        error: {
          code: -32700,
          message: 'Parse error'
        }
      })
      return
    }
  }
  var name = message.method
  if (name) {
    this._handleRequest(name, message)
  } else {
    this._handleResponse(message)
  }
}

RPCEngine.prototype._handleRequest = function (name, message) {
  var id = message.id
  var params = message.params
  if (this.objectMode) {
    params = [params]
  } else if (params === undefined) {
    params = []
  }
  var path = name.split(this.pathDelimiter)
  var method = this._follow(path, this.methods)
  if (!method && this.defaultMethod) {
    params.unshift(name)
    method = this.defaultMethod
  }
  if (id === undefined) {
    if (method) {
      method.apply(this, params)
    }
    if (this.listenerCount(name) > 0) {
      if (!method || method !== this.defaultMethod) {
        params.unshift(name)
      }
      this.emit.apply(this, params)
    }
  } else if (method) {
    var self = this
    method.apply(this, params.concat(function (err) {
      if (err) {
        err = {
          message: err.message,
          code: err.code,
          data: err.data
        }
      }
      message = {
        id: id,
        error: err
      }
      if (arguments.length > 1) {
        message.result = self.objectMode ? arguments[1] : Array.prototype.slice.call(arguments, 1)
      }
      self._dosend(message)
    }))
  } else {
    this._dosend({
      id: id,
      error: {
        code: -32601,
        message: 'Method not found'
      }
    })
  }
}

RPCEngine.prototype._handleResponse = function (message) {
  var id = message.id
  var cb = this._callbacks[id]
  delete this._callbacks[id]
  var error = message.error
  var err = null
  if (error) {
    err = new Error(error.message)
    err.code = error.code
    err.data = error.data
  }
  if (cb) {
    cb.apply(null, [err].concat(message.result))
  } else if (err && this.listenerCount('error') > 0) {
    this.emit('error', err)
  }
}

RPCEngine.prototype.subscribe = function (name, fn) {
  if (this.listenerCount(name) === 0) {
    var self = this
    this.call('subscribe', name, function (err) {
      if (err) {
        self.removeListener(name, fn)
        self.emit('error', err)
      } else {
        self.removeListener(name, dummy)
        self.on(name, fn)
      }
    })
  }
  var dummy = function () {}
  this.on(name, dummy)
}

RPCEngine.prototype._onsubscribe = function (name, cb) {
  var path = name.split(this.pathDelimiter)
  var feed = this._follow(path.slice(0, -1), this.feeds)
  if (!feed) {
    cb(new Error('Feed not found'))
    return
  }
  if (!this._subscriptions[name]) {
    var self = this
    var event = path[path.length - 1]
    var handler = function () {
      var args = Array.prototype.slice.call(arguments)
      args.unshift(name)
      self.call.apply(self, args)
    }
    this._subscriptions[name] = [
      feed,
      event,
      handler
    ]
    feed.on(event, handler)
  }
  cb()
}

RPCEngine.prototype.unsubscribe = function (name, fn) {
  this.removeListener(name, fn)
  if (this.listenerCount(name) === 0) {
    this.call('unsubscribe', name)
  }
}

RPCEngine.prototype._onunsubscribe = function (name) {
  var subscription = this._subscriptions[name]
  if (subscription) {
    subscription[0].removeListener(subscription[1], subscription[2])
    delete this._subscriptions[name]
  }
}

RPCEngine.prototype._follow = function (path, object) {
  return path.reduce(function (object, property) {
    return object && object[property]
  }, object)
}
