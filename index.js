module.exports = RPC

function RPC () {
  this.methods = {}
  this.onmessage = this.onmessage.bind(this)
  this._callbacks = {}
  this._callback = 0
}

RPC.prototype.call = function (name) {
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

RPC.prototype._dosend = function (message, cbid) {
  if (this.serialize) {
    message = this.serialize(message)
  }
  try {
    this.send(message)
  } catch (err) {
    if (cbid !== undefined) {
      var cb = this._callbacks[cbid]
      delete this._callbacks[cbid]
      err.code = -32603
      cb(err)
    }
  }
}

RPC.prototype.onmessage = function (message) {
  if (this.deserialize) {
    try {
      message = this.deserialize(message)
    } catch (err) {
      if (message.id) {
        this._dosend({
          id: message.id,
          error: {
            code: -32700,
            message: 'Parse error'
          }
        })
      }
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

RPC.prototype._handleRequest = function (name, message) {
  var id = message.id
  var params = message.params
  if (!Array.isArray(params)) {
    params = params === undefined ? [] : [ params ]
  }
  var method = this.methods[name]
  if (!method && this.defaultMethod) {
    params.unshift(name)
    method = this.defaultMethod
  }
  if (id === undefined) {
    if (method) {
      method.apply(null, params)
    }
  } else if (method) {
    var self = this
    method.apply(null, params.concat(function (err) {
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

RPC.prototype._handleResponse = function (message) {
  var id = message.id
  var error = message.error
  var cb = this._callbacks[id]
  delete this._callbacks[id]
  if (cb) {
    var err = null
    if (error) {
      err = new Error(error.message)
      err.code = error.code
      err.data = error.data
    }
    cb.apply(null, [err].concat(message.result))
  }
}
