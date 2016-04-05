module.exports = RPCEngine

function RPCEngine () {
  this.methods = {}
  this.onmessage = this.onmessage.bind(this)
  this._callbacks = {}
  this._callback = 0
}

RPCEngine.prototype.call = function (name) {
  var message = { method: name }
  var params = Array.prototype.slice.call(arguments, 1)
  var id, cb = params.slice(-1)[0]
  if (typeof cb === 'function') {
    id = message.id = this._callback++
    this._callbacks[id] = cb
    params.pop()
  }
  if (params.length) {
    message.params = this.objectMode ? params[0] : params
  }
  if (cb && this.timeout) {
    setTimeout(function () {
      if (this._callbacks[id]) {
        delete this._callbacks[id]
        var err = new Error('Call timed out')
        err.code = -32603
        cb(err)
      }
    }.bind(this), this.timeout)
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
    } else if (this.onerror) {
      this.onerror(err)
    }
  }
}

RPCEngine.prototype.onmessage = function (message) {
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
    params = [ params ]
  } else if (params === undefined) {
    params = []
  }
  var method = this.methods[name]
  if (!method && this.defaultMethod) {
    params.unshift(name)
    method = this.defaultMethod
  }
  if (id === undefined) {
    if (method) {
      method.apply(this, params)
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
  } else if (err) {
    if (this.onerror) {
      this.onerror(err)
    } else {
      throw err
    }
  }
}
