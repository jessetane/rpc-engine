module.exports = RPC

function RPC () {
  this.methods = {}
  this.onmessage = this.onmessage.bind(this)
  this._callbacks = {}
  this._callback = 0
}

RPC.prototype.call = function (name, params, cb) {
  var message = { method: name }
  if (typeof params === 'function') {
    cb = params
    params = undefined
  } else if (params) {
    message.params = params
  }
  if (cb) {
    message.id = String(this._callback++)
    this._callbacks[message.id] = cb
  }
  this.send(this.serialize ? this.serialize(message) : message)
}

RPC.prototype.onmessage = function (message) {
  message = this.deserialize ? this.deserialize(message) : message
  var id = message.id
  var error = message.error
  var method = message.method
  var params = message.params
  var result = message.result
  if (method) {
    method = this.methods[method]
    if (id) {
      if (!method) {
        message = {
          id: id,
          error: {
            code: -32601,
            message: 'Method not found'
          }
        }
        this.send(this.serialize ? this.serialize(message) : message)
        return
      }
      var self = this
      method.apply(null, formatParams(params).concat(function (err, result) {
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
          result: result
        }
        self.send(self.serialize ? self.serialize(message) : message)
      }))
    } else if (method) {
      method.apply(null, formatParams(params))
    }
  } else {
    var cb = this._callbacks[id]
    delete this._callbacks[id]
    if (cb) {
      if (error) {
        var err = new Error(error.message)
        err.code = error.code
        err.data = error.data
      }
      cb(err, result)
    }
  }
}

function formatParams (_params) {
  if (!_params) return []
  if (Array.isArray(_params)) return _params
  return [ _params ]
}
