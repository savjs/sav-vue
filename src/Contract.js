import {Router} from 'sav-router'
import {Schema} from 'sav-schema'
import {Request} from './Request.js'
import {crc32} from './crc32.js'
import {Cache} from './Cache.js'
import {testAssign, bindEvent, prop, isArray, isObject, isFunction, pascalCase} from 'sav-util'

export class Contract {
  constructor (opts = {}) {
    this.opts = testAssign(opts, {
      mockState: false,
      strict: true
    })
    let router = this.router = new Router(this.opts)
    router.on('declareAction', (route) => {
      if (route.actionName) {
        let name = route.name
        this.routes[name] = route
      }
    })
    this.schema = new Schema(this.opts)
    this.routes = {}
    this.mocks = {}
    this.request = new Request(this.opts)
    this.cache = new Cache()
    bindEvent(this)
  }
  get projectName () {
    return this.project.name
  }
  load (data) {
    let {project, mocks} = data
    this.schema.load(data)
    this.router.load(data)
    if (mocks) {
      this.mocks = mocks
    }
    if (project) {
      this.project = project
    }
  }
  resolvePayload (route, vueRoute) {
    let savRoute = this.routes[route.name]
    let schema = this.schema.getSchema(route.name)
    if (savRoute) {
      if (route.merge) {
        route.params = Object.assign({}, vueRoute.params, route.params)
        route.query = Object.assign({}, vueRoute.query, route.query)
      }
      route.path = savRoute.compile(route.params)
      prop(route, 'route', savRoute)
      prop(route, 'contract', this)
      return route
    } else if (schema) {
      let stateName = schema.opts.stateName || route.name
      let stateData
      if (schema.schemaType === Schema.SCHEMA_ENUM) {
        stateData = JSON.parse(JSON.stringify(schema.opts.enums))
      } else {
        stateData = schema.create(Object.assign({}, schema.opts.state))
        if (route.merge) {
          Object.assign(stateData, vueRoute.params, vueRoute.query)
        }
      }
      route.state = {
        [`${stateName}`]: stateData
      }
      return route
    }
  }
  mapPayloadState (argv) {
    let {route, output} = argv
    let ret
    if (isObject(output)) {
      ret = mapping(argv, output) || mapping(route.action, output) || output
      let {resState} = route.action
      let name = resState || route.response
      if ((resState !== false) && name) {
        return {[`${name}`]: ret}
      }
    }
    return ret
  }
  injectFlux (flux, isDefault) {
    let {schema} = this
    let actions = Object.keys(this.routes).reduce((ret, routeName) => {
      route = this.routes[routeName]
      let actionName = pascalCase(route.method.toLowerCase() + '_' + (isDefault ? '' : this.projectName) + route.name)
      ret[actionName] = (flux, data, fetch) => {
        let argv = Object.assign({}, data)
        return this.invoke(flux, argv, route, fetch)
      }
      if (route.keys.length === 0) {
        ret[`${actionName}Data`] = (flux, data, fetch) => {
          let argv = {data}
          return this.invoke(flux, argv, route, fetch)
        }
      }
      let reqStruct = schema.getSchema(route.request)
      if (reqStruct) {
        let reqName = (isDefault ? '' : this.projectName) + route.request
        ret[`Check${reqName}`] = (flux, data) => {
          return reqStruct.check(data)
        }
        ret[`Extract${reqName}`] = (flux, data) => {
          return reqStruct.extractThen(data)
        }
      }
      let resStruct = schema.getSchema(route.response)
      if (resStruct) {
        let resName = (isDefault ? '' : this.projectName) + route.response
        ret[`Check${resName}`] = (flux, data) => {
          return resStruct.check(data)
        }
        ret[`Extract${resName}`] = (flux, data) => {
          return resStruct.extractThen(data)
        }
      }
      return ret
    }, {})
    flux.declare({
      actions
    })
  }
  invoke (flux, argv, route, fetch) {
    prop(argv, 'route', route)
    return this.invokePayload(argv).then(async data => {
      if (fetch) {
        return data || argv.output
      }
      if (data) {
        await flux.updateState(data)
      }
    })
  }
  async invokePayload (argv) {
    let {schema} = this
    let {route} = argv
    argv.url = route.compile(argv.params)
    argv.input = Object.assign({}, argv.params, argv.query, argv.data)
    let ttl = this.opts.noCache ? null : argv.ttl || (route.action.ttl)
    let cacheKey = ttl ? getCacheKey(argv) : null
    let cacheVal = cacheKey ? this.cache.get(cacheKey, ttl) : null
    if (!cacheVal) {
      let reqStruct = schema.getSchema(route.request)
      if (reqStruct) {
        try {
          argv.input = reqStruct.extract(argv.input)
        } catch (err) {
          err.status = 400
          throw err
        }
      }
      argv.method = route.method
      let output = await this.fetch(argv)
      let resStruct = schema.getSchema(route.response)
      let cache
      if (resStruct) {
        resStruct.check(output)
        cache = resStruct.opts.cache
        if (cache) {
          this.cache.removeByName(cache)
        }
      }
      argv.output = output
      if (cacheKey) {
        this.cache.set(cacheKey, ttl, cache || route.response, output)
      }
    } else {
      argv.output = cacheVal
    }
    return this.mapPayloadState(argv)
  }
  fetch (argv) {
    if (this.opts.mockState) {
      let mocks = this.mocks[argv.route.response]
      if (mocks && mocks.length) {
        if (this.opts.mockFlow) {
          return new Promise((resolve, reject) => {
            this.emit('mockFlow', {resolve, reject, argv, mocks})
          })
        } else {
          return mocks[0].data
        }
      } else {
        throw new Error(`mock data no found: ${argv.route.response}`)
      }
    }
    return this.request.request(argv)
  }
}

function getCacheKey (argv) {
  // 只支持query
  let uri = argv.url + JSON.stringify(argv.query)
  return crc32(uri)
}

function mapping (target, output) {
  let {mapState} = target
  if (isArray(mapState)) {
    return mapState.reduce((ret, name) => {
      ret[name] = getStatePath(output, name)
    }, {})
  } else if (isObject(mapState)) {
    let ret = {}
    for (let name in mapState) {
      ret[name] = getStatePath(output, mapState[name])
    }
    return ret
  } else if (isFunction(mapState)) {
    return mapState(output)
  }
  return output
}

function getStatePath (output, stateName) {
  let pos = stateName.indexOf('.')
  while (pos !== -1) {
    output = output[stateName.substring(0, pos)]
    if (!isObject(output)) {
      return
    }
    stateName = stateName.substr(pos + 1)
    pos = stateName.indexOf('.')
  }
  return output[stateName]
}
