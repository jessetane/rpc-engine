module.exports = RpcEngine

var Emitter = require('events')
var inherits = require('inherits')

inherits(RpcEngine, Emitter)

function RpcEngine (opts) {
  Emitter.call(this)
  for (var key in opts) {
    this[key] = opts[key]
  }
  this.objectMode = !!this.objectMode
  if (!this.pathDelimiter) {
    this.pathDelimiter = '.'
  }
  if (!this._interface) {
    this._interface = {}
  }
  this._callbacks = {}
  this.receive = this.receive.bind(this)
  this.close = this.close.bind(this)
}

Object.defineProperty(RpcEngine.prototype, 'interface', {
  get: function () {
    return this._interface
  },
  set: function (interface) {
    if (this._interface) {
      throw new Error('Interface cannot be directly set')
    } else {
      this._interface = interface
    }
  }
})

RpcEngine.prototype.lookupInterface = function (path) {
  return path.reduce(function (interface, pathComponent) {
    return interface && interface[pathComponent]
  }, this._interface)
}

RpcEngine.prototype.call = function (name) {
  var message = { method: name }
  var params = Array.prototype.slice.call(arguments, 1)
  var id = undefined
  var cb = params.slice(-1)[0]
  var cbIsFunction = typeof cb === 'function'
  if (cbIsFunction) {
    id = message.id = Math.random()
    this._callbacks[id] = cb
    params.pop()
  }
  if (params.length) {
    message.params = this.objectMode ? params[0] : params
  }
  if (cbIsFunction && this.timeout) {
    var self = this
    cb.timeout = setTimeout(function () {
      delete self._callbacks[id]
      var err = new Error('Call timed out')
      err.code = -32603
      cb(err)
    }, this.timeout)
  }
  this._dosend(message, id)
}

RpcEngine.prototype._dosend = function (message, cbid) {
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

RpcEngine.prototype.receive = function (message) {
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

RpcEngine.prototype._handleRequest = function (name, message) {
  var id = message.id
  var params = message.params
  if (!Array.isArray(params)) {
    if (params && typeof params === 'object') {
      params = [params]
    } else {
      params = []
    }
  }
  var path = name.split(this.pathDelimiter)
  var interface = this.lookupInterface(path.slice(0, -1))
  method = interface && interface[path[path.length - 1]]
  if (!method && this.defaultMethod) {
    params.unshift(name)
    method = this.defaultMethod
  }
  if (id === undefined) {
    if (method) {
      method.apply(interface, params)
    }
    if (this.listenerCount(name) > 0) {
      if (!method || method !== this.defaultMethod) {
        params.unshift(name)
      }
      this.emit.apply(this, params)
    }
  } else if (method) {
    var self = this
    method.apply(interface, params.concat(function (err) {
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

RpcEngine.prototype._handleResponse = function (message) {
  var error = message.error
  var err = null
  if (error) {
    err = new Error(error.message)
    err.code = error.code
    err.data = error.data
  }
  var id = message.id
  var cb = this._callbacks[id]
  if (cb) {
    delete this._callbacks[id]
    clearTimeout(cb.timeout)
    cb.apply(null, [err].concat(message.result))
  } else if (err && this.listenerCount('error') > 0) {
    this.emit('error', err)
  }
}

RpcEngine.prototype.close = function () {
  for (var id in this._callbacks) {
    var cb = this._callbacks[id]
    delete this._callbacks[id]
    clearTimeout(cb.timeout)
    cb(new Error('rpc closed'))
  }
}
