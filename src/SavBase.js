import {Router} from 'sav-router'
import {Schema} from 'sav-schema'

import {bindEvent, prop, isArray, isObject, isFunction} from 'sav-util'

export class SavBase {
  constructor (opts) {
    bindEvent(this)
    this.opts = {
      name: 'sav',
      prod: true
    }
    this.router = new Router()
    this.schema = new Schema()

    this.routes = {}
    this.router.on('declareAction', (route) => {
      if (route.actionName) {
        let name = route.name
        this.routes[name] = route
      }
    })
    this.mocks = {}
    this.init()
    this.setOptions(opts)
  }
  get name () {
    return this.opts.name
  }
  setOptions (opts) {
    Object.assign(this.opts, opts)
  }
  shareOptions (target) {
    target.opts = Object.assign(this.opts, target.opts)
  }
  declare ({actions, schemas, modals, mocks}) {
    if (schemas) {
      this.schema.declare(schemas)
    }
    if (modals) {
      this.router.declare(modals)
    }
    if (mocks) {
      Object.assign(this.mocks, mocks)
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
      prop(route, 'savHandle', this)
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
