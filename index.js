class RpcEngine extends EventTarget {
  constructor (opts) {
    super()
    for (let key in opts) {
      this[key] = opts[key]
    }
    this.objectMode = !!this.objectMode
    this.methods = {}
    this.callbacks = {}
    this.receive = this.receive.bind(this)
    this.close = this.close.bind(this)
  }

  async _send (message) {
    if (this.serialize) {
      message = await this.serialize(message)
    }
    await this.send(message)
  }

  async _sendError (error, id) {
    const message = {}
    if (id !== undefined) message.id = id
    const err = { message: error.message }
    if (error.code !== undefined) err.code = error.code
    if (error.data !== undefined) err.data = error.data
    message.error = err
    return this._send(message)
  }

  async call (name) {
    const id = Math.random().toString().slice(2)
    const params = Array.from(arguments).slice(1)
    let message = { id, method: name }
    if (params.length) {
      message.params = this.objectMode ? params[0] : params
    }
    let resolve = null
    let reject = null
    const p = this.callbacks[id] = new Promise((res, rej) => {
      resolve = res
      reject = rej
    })
    p.resolve = resolve
    p.reject = reject
    if (this.timeout) {
      p.timeout = setTimeout(() => {
        delete this.callbacks[id]
        const err = new Error('call timed out')
        err.code = -32603
        p.reject(err)
      }, this.timeout)
    }
    try {
      await this._send(message)
    } catch (err) {
      delete this.callbacks[id]
      clearTimeout(p.timeout)
      p.reject(err)
    }
    return p
  }

  async notify (name) {
    let message = { method: name }
    const params = Array.from(arguments).slice(1)
    if (params.length) {
      message.params = this.objectMode ? params[0] : params
    }
    return this._send(message)
  }

  async receive (rawMessage) {
    let message = rawMessage
    try {
      if (this.deserialize) {
        try {
          message = await this.deserialize(rawMessage)
        } catch (err) {
          await this._sendError({
            message: 'parse error',
            code: -32700,
            data: rawMessage
          })
          throw err
        }
      }
      const name = message.method
      if (message.method) {
        await this.handleRequest(message.method, message)
      } else {
        this.handleResponse(message)
      }
    } catch (err) {
      const evt = new Event('error')
      evt.message = err.message
      evt.code = err.code
      evt.data = err.data
      this.dispatchEvent(evt)
    }
  }

  async handleRequest (name, message) {
    const id = message.id
    let params = message.params
    if (!Array.isArray(params)) {
      if (params && typeof params === 'object') {
        params = [params]
      } else {
        params = []
      }
    }
    let method = this.methods[name]
    if (!method && this.defaultMethod) {
      params.unshift(name)
      method = this.defaultMethod
    }
    message = {}
    if (id === undefined) {
      if (method) {
        return method.apply(this, params)
      }
    } else {
      message.id = id
    }
    if (method) {
      try {
        message.result = await method.apply(this, params)
        await this._send(message)
      } catch (err) {
        await this._sendError(err, id)
        throw err
      }
    } else {
      const err = new Error('method not found')
      err.code = -32601
      err.data = name
      await this._sendError(err, id)
      throw err
    }
  }

  handleResponse (message) {
    let err = null
    const id = message.id
    const p = id === undefined ? null : this.callbacks[id]
    if (p) {
      delete this.callbacks[id]
      clearTimeout(p.timeout)
      const error = message.error
      if (error) {
        err = new Error(error.message)
        if (error.code !== undefined) err.code = error.code
        if (error.data !== undefined) err.data = error.data
      }
      if (err) {
        p.reject(err)
      } else {
        p.resolve(message.result)
      }
    } else {
      err = new Error('invalid request')
      err.code = -32600
      err.data = message
      throw err
    }
  }

  close (err) {
    err = err || new Error('connection closed')
    for (let id in this.callbacks) {
      let p = this.callbacks[id]
      delete this.callbacks[id]
      clearTimeout(p.timeout)
      p.reject(err)
    }
  }
}

export default RpcEngine
