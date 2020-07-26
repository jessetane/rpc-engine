import EventTarget from 'xevents/event-target.js'
import CustomEvent from 'xevents/custom-event.js'

var MAX_INT = Math.pow(2, 32)

class RpcEngine extends EventTarget {
  constructor (opts) {
    super()
    for (var key in opts) {
      this[key] = opts[key]
    }
    this.objectMode = !!this.objectMode
    if (!this.pathDelimiter) {
      this.pathDelimiter = '.'
    }
    this._interfaces = { '': {} }
    this._callbacks = {}
    this.receive = this.receive.bind(this)
    this.close = this.close.bind(this)
  }

  getInterface (path) {
    if (!path) path = ''
    return this._interfaces[path]
  }

  setInterface (path, iface) {
    if (path && typeof path === 'object') {
      iface = path
      path = ''
    }
    var existing = this._interfaces[path]
    if (iface === existing) return
    if (existing) {
      delete this._interfaces[path]
      var evt = new CustomEvent('interface-remove', { detail: { iface: existing, path }})
      this.dispatchEvent(evt)
    }
    if (iface) {
      this._interfaces[path] = iface
      evt = new CustomEvent('interface-add', { detail: { iface, path }})
      this.dispatchEvent(evt)
    }
  }

  generateCallId () {
    return Math.floor(Math.random() * MAX_INT)
  }

  call (id, name) {
    var params = null
    if (typeof id === 'string') {
      params = Array.prototype.slice.call(arguments, 1)
      name = id
      id = null
    } else {
      params = Array.prototype.slice.call(arguments, 2)
    }
    var message = { method: name }
    var cb = params.slice(-1)[0]
    var cbIsFunction = typeof cb === 'function'
    if (cbIsFunction) {
      if (id === null) {
        id = this.generateCallId()
      }
      message.id = id
      this._callbacks[id] = cb
      params.pop()
    }
    if (params.length) {
      message.params = this.objectMode ? params[0] : params
    }
    if (cbIsFunction && this.timeout) {
      cb.timeout = setTimeout(() => {
        cb = this._callbacks[id]
        delete this._callbacks[id]
        if (!cb) return
        var err = new Error('Call timed out')
        err.code = -32603
        cb(err)
      }, this.timeout)
    }
    this._dosend(message, true)
  }

  _dosend (message, didOriginateLocally) {
    if (this.serialize) {
      message = this.serialize(message)
    }
    try {
      this.send(message)
    } catch (err) {
      err.code = -32603
      var cb = this._callbacks[message.id]
      if (cb && didOriginateLocally) {
        delete this._callbacks[message.id]
        cb(err)
      } else {
        var evt = new CustomEvent('error', { detail: err })
        this.dispatchEvent(evt)
      }
    }
  }

  receive (message) {
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

  _handleRequest (path, message) {
    var id = message.id
    var params = message.params
    if (!Array.isArray(params)) {
      if (params && typeof params === 'object') {
        params = [params]
      } else {
        params = []
      }
    }
    var sep = path.lastIndexOf(this.pathDelimiter)
    var ifaceName = sep > 0 ? path.slice(0, sep) : ''
    var methodName = sep > 0 ? path.slice(sep + 1) : path
    var iface = this.getInterface(ifaceName)
    var method = iface && iface[methodName]
    if (!method && this.defaultMethod) {
      params.unshift(path)
      method = this.defaultMethod
    }
    if (id === undefined) {
      if (method) {
        method.apply(this, params)
        if (method === this.defaultMethod) {
          params = params.slice(1)
        }
      }
      var evt = new CustomEvent(path, { detail: this.objectMode ? params[0] : params })
      this.dispatchEvent(evt)
    } else if (method) {
      var self = this
      var cb = function (err) {
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
      }
      cb.id = id
      method.apply(this, params.concat(cb))
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

  _handleResponse (message) {
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
    } else if (err) {
      var evt = new CustomEvent('error', { detail: err })
      this.dispatchEvent(evt)
    }
  }

  close () {
    for (var id in this._callbacks) {
      var cb = this._callbacks[id]
      delete this._callbacks[id]
      clearTimeout(cb.timeout)
      cb(new Error('Connection closed'))
    }
  }
}

export default RpcEngine
