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
  var cb = params.slice(-1)[0]
  if (typeof cb === 'function') {
    message.id = String(this._callback++)
    this._callbacks[message.id] = cb
    params.pop()
  }
  if (params.length) {
    message.params = params
  }
  this.send(this.serialize ? this.serialize(message) : message)
}

RPC.prototype.onmessage = function (message) {
  message = this.deserialize ? this.deserialize(message) : message
  var method = message.method
  if (method) {
    this._handleRequest(method, message)
  } else {
    this._handleResponse(message)
  }
}

RPC.prototype._handleRequest = function (name, message) {
  var id = message.id
  var params = message.params
  var method = this.methods[name]
  if (method) {
    if (id) {
      var self = this
      method.apply(null, (params || []).concat(function (err) {
        if (err) {
          err = {
            message: err.message,
            code: err.code,
            data: err.data
          }
        }
        message = {
          id: id,
          error: err,
          results: Array.prototype.slice.call(arguments, 1)
        }
        self.send(self.serialize ? self.serialize(message) : message)
      }))
    } else {
      method.apply(null, params)
    }
  } else if (id) {
    message = {
      id: id,
      error: {
        code: -32601,
        message: 'Method not found'
      }
    }
    this.send(this.serialize ? this.serialize(message) : message)
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
    cb.apply(null, [err].concat(message.results))
  }
}
