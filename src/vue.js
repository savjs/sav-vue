import {compileImport, renderer, compile} from './vue-builder.js'
import {quickConf} from 'sav-decorator'
import {isObject, convertCase} from 'sav-util'

import {resolve} from 'path'
import fs from 'fs'
import {Promise} from 'bluebird'

const {readFileAsync, writeFileAsync} = Promise.promisifyAll(fs)

const {renderToStringAsync} = Promise.promisifyAll(renderer)

export const vue = quickConf('vue')

const RENDER_MODE_APP = 1
const RENDER_MODE_MODULE = 2
const RENDER_MODE_ACTION = 3

class VueRenderer {
  constructor (props) {
    this.props = props
    this.isCompiled = false
    this.modules = {}
    this.mode = RENDER_MODE_APP
    this.vueInstance = null
  }
  async render (ctx, state) {
    if (!this.isCompiled) {
      await this.compileImport()
      this.isCompiled = !this.props.vueLiveCompiled
    }
    try {
      let {vm, router, flux, Vue, vaf} = this.vueInstance
      let path = ctx.path || ctx.originalUrl
      router.push(path)
      if (flux) {
        await flux.replaceState(typeof state === 'object' ? state : {})
      }
      // console.log(router.getMatchedComponents())
      let vueHtml = await renderToStringAsync(vm)
      // 编译layout文件
      let vueLayout = this.props.vueLayout
      if (vueLayout && Vue && flux) {
        let Layout = await this.compileVueLayout()
        let layoutVm = new Vue(Object.assign({router, vaf}, Layout))
        let layoutHtml = await renderToStringAsync(layoutVm)
        let stateText = JSON.stringify(state)
        let stateScript = `
<script type="text/javascript">
  window.INIT_STATE = ${stateText}
</script>
`
        vueHtml = layoutHtml.replace('<vue-html></vue-html>', vueHtml)
                  .replace('<vue-init-state></vue-init-state>', stateScript)
      }
      ctx.end(vueHtml)
    } catch (err) {
      this.isCompiled = false
      throw err
    }
  }
  async compileImport () {
    let factory = await this.compileVueInstance()
    let routes = await this.compileVueApp()
    let ret = factory({routes})
    this.vueInstance = ret
  }
  createRoute (action) {
    let {vueFileCase, vueCase} = this.props
    let {actionName, vueProp, route, module} = action
    let moduleName = module.moduleName
    let name = convertCase(vueCase, `${moduleName}_${actionName}`)
    let actionRoute = {
      component: convertCase(vueFileCase, `${moduleName}/${moduleName}_${actionName}`),
      path: route.relative,
      name
    }
    actionRoute = vueProp ? Object.assign({}, actionRoute, vueProp) : actionRoute
    let moduleRoute
    if (!this.modules[moduleName]) {
      let {vueProp, route} = module
      moduleRoute = {
        component: convertCase(vueFileCase, `${moduleName}/${moduleName}`),
        path: route.path,
        children: []
      }
      this.modules[moduleName] = vueProp ? Object.assign({}, moduleRoute, vueProp) : moduleRoute
    }
    moduleRoute = this.modules[moduleName]
    moduleRoute.children.push(actionRoute)
  }
  generateRoute () {
    let modules = this.modules
    let comps = []
    for (let moduleName in modules) {
      if (this.mode === RENDER_MODE_APP) {
        comps.push(modules[moduleName])
      } else {
        comps.push(modules[moduleName])
        break
      }
    }
    let routes = JSON.stringify(comps, null, 2)
    let components = []
    routes = routes.replace(/"component":\s+"((\w+)\/(\w+))"/g, (_, path, dir, name) => {
      components.push(`import ${name} from './${path}.vue'`)
      let ret = `"component": ${name}`
      return ret
    })
    components.push(`export default ${routes}`)
    let content = components.join('\n')
    return {
      comps,
      content
    }
  }
  saveVueRouter () {
    let {comps, content} = this.generateRoute()
    let routeName
    switch (this.mode) {
      case RENDER_MODE_APP:
        routeName = 'Routes.js'
        break
      case RENDER_MODE_MODULE:
        routeName = comps[0].component.split('/').shift() + 'Routes.js'
        break
      case RENDER_MODE_ACTION:
        routeName = comps[0].children[0].name + 'Routes.js'
        break
    }
    let routePath = resolve(this.props.vueRoot, routeName)
    return syncFile(routePath, content).then(() => routePath)
  }
  compileVueApp () {
    let queues = [this.saveVueRouter()]
    if (this.props.vueDest) {
      queues.push(this.compileVueClient({dest: true}))
    }
    return Promise.all(queues).then(([vueRouter]) => {
      return compileImport(vueRouter)
    })
  }
  compileVueInstance () {
    let entryFile = resolve(this.props.vueRoot, this.props.vueEntry)
    return compileImport(entryFile)
  }
  compileVueLayout () {
    let layoutFile = resolve(this.props.vueRoot, this.props.vueLayout)
    return compileImport(layoutFile)
  }
  compileVueClient (opts) {
    let vueClientEntry = resolve(this.props.vueRoot, this.props.vueClientEntry)
    opts = Object.assign({
      IS_CLIENT: true
    }, opts)
    if (opts.dest === true) {
      opts.dest = resolve(this.props.vueDest, this.props.vueClientEntry)
    }
    return compile(vueClientEntry, opts)
  }
}

function syncFile (path, data) {
  return readFileAsync(path)
    .then((text) => {
      if (text.toString() !== data) {
        return writeFileAsync(path, data)
      }
    })
    .catch((err) => {
      if (err.code === 'ENOENT') {
        return writeFileAsync(path, data)
      }
      throw err
    })
}

export function vuePlugin (ctx) {
  let vueRoot = ctx.config('vueRoot', '')
  let vueDest = ctx.config('vueDest', false)
  let vueEntry = ctx.config('vueEntry', 'server-entry.js')
  let vueClientEntry = ctx.config('vueClientEntry', 'client-entry.js')
  let vueCase = ctx.config('vueCase', 'pascal')
  let vueFileCase = ctx.config('vueFileCase', 'pascal')
  let vueLiveCompiled = ctx.config('vueLiveCompiled', false)
  let vueLayout = ctx.config('vueLayout', 'Layout.vue')
  let vueOpts = {
    vueRoot,
    vueDest,
    vueCase,
    vueEntry,
    vueLiveCompiled,
    vueFileCase,
    vueClientEntry,
    vueLayout
  }

  let createRender = (opts) => {
    return new VueRenderer(Object.assign({}, vueOpts, opts))
  }

  let defaultRender

  ctx.getVueRenders = () => {
    let renders = []
    for (let moduleId in ctx.modules) {
      let module = ctx.modules[moduleId]
      if (module.vueRender) {
        if (!~renders.indexOf(module.vueRender)) {
          renders.push(module.vueRender)
        }
      }
    }
    return renders
  }

  ctx.use({
    module (module) {
      let vueProp = module.props.vue
      if (vueProp) {
        let vueRender = defaultRender || (defaultRender = createRender())
        if (isObject(vueProp)) {
          if (vueProp.instance) {
            vueRender = createRender(vueProp)
            vueRender.mode = RENDER_MODE_MODULE
          } else {
            module.vueProp = vueProp
          }
          module.vueRender = vueRender
        } else if (vueProp === true) {
          module.vueRender = vueRender
        }
      }
    },
    action (action) {
      let {module} = action
      let vueProp = action.props.vue
      let vueRender
      if (vueProp) {
        vueProp = vueProp[0]
        if (vueProp === false) {
          return
        }
        if (vueProp === true) {
          vueRender = module.vueRender
        } else if (isObject(vueProp)) {
          if (vueProp.instance) {
            vueRender = createRender(vueProp)
            vueRender.mode = RENDER_MODE_ACTION
          } else {
            action.vueProp = vueProp
          }
        }
      } else if (module.vueRender) {
        vueRender = module.vueRender
      } else {
        return
      }
      vueRender.createRoute(action)
      action.set('vue', async (context) => {
        if (context.accepts) {
          if ('html' != context.accepts('image', 'json', 'html')) {
            return
          }
        }
        await vueRender.render(context, context.data)
      })
    }
  })
}
