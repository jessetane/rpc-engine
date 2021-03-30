import EventTarget from 'xevents/event-target.js'
import CustomEvent from 'xevents/custom-event.js'

function P (cb) {
  var res = null
  var rej = null
  var p = new Promise((a, b) => {
    res = a
    rej = b
  })
  if (typeof cb === 'function') {
    p = p.then(function () { cb(null, ...arguments) }).catch(cb)
  }
  p.resolve = res
  p.reject = rej
  return p
}

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

  call (name) {
    var id = this.generateCallId()
    var message = { id, method: name }
    var params = Array.prototype.slice.call(arguments, 1)
    var cb = params.slice(-1)[0]
    var cbIsFunction = typeof cb === 'function'
    if (cbIsFunction) {
      params.pop()
    } else {
      cb = null
    }
    var p = this._callbacks[id] = new P(cb)
    if (this.timeout) {
      p.timeout = setTimeout(() => {
        var p = this._callbacks[id]
        delete this._callbacks[id]
        if (!p) return
        var err = new Error('Call timed out')
        err.code = -32603
        p.reject(err)
      }, this.timeout)
    }
    if (params.length) {
      message.params = this.objectMode ? params[0] : params
    }
    this._dosend(message, true)
    return p
  }

  notify (name) {
    var message = { method: name }
    var params = Array.from(arguments).slice(1)
    if (params.length) {
      message.params = this.objectMode ? params[0] : params
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
      var p = this._callbacks[message.id]
      if (p && didOriginateLocally) {
        delete this._callbacks[message.id]
        p.reject(err)
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
        message = { id }
        if (err) {
          var e = message.error = { message: err.message }
          if (err.code !== undefined) e.code = err.code
          if (err.data !== undefined) e.data = err.data
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
    var err = message.error
    var e = null
    if (err) {
      e = new Error(err.message)
      if (err.code !== undefined) e.code = err.code
      if (err.data !== undefined) e.data = err.data
    }
    var id = message.id
    var p = this._callbacks[id]
    if (p) {
      delete this._callbacks[id]
      clearTimeout(p.timeout)
      if (e) {
        p.reject(e)
      } else if (!this.objectMode && Array.isArray(message.result)) {
        p.resolve(...message.result)
      } else {
        p.resolve(message.result)
      }
    } else if (e) {
      var evt = new CustomEvent('error', { detail: e })
      this.dispatchEvent(evt)
    }
  }

  close () {
    for (var id in this._callbacks) {
      var cb = this._callbacks[id]
      delete this._callbacks[id]
      clearTimeout(cb.timeout)
      p.reject(new Error('Connection closed'))
    }
  }
}

export default RpcEngine
