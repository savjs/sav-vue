import test from 'ava'
import {expect} from 'chai'
import {resolve} from 'path'
import {existsSync, unlinkSync} from 'fs'

import {vuePlugin, vue} from '../src'
import {Router, get} from 'sav-router'
import {gen, props} from 'sav-decorator'

test('api', (ava) => {
  expect(vuePlugin).to.be.a('function')
  expect(vue).to.be.a('function')
})

test('vue.mode.app', async (ava) => {
  let {router} = createVueApp()
  {
    let ctx = {
      path: '/Test/basic',
      method: 'GET'
    }
    await router.exec(ctx)
    expect(!!~ctx.body.indexOf('TestBasic')).to.eql(true)
  }
  {
    let ctx = {
      path: '/Test/profile',
      method: 'GET'
    }
    await router.exec(ctx)
    expect(!!~ctx.body.indexOf('TestProfile')).to.eql(true)
  }
})

test('vue.mode.build', async (ava) => {
  let {router} = createVueApp()
  {
    let res = await router.getVueRenders()[0].compileVueClient()
    expect(!!~res.indexOf('#app')).to.eql(true)
  }
  {
    let dest = resolve(__dirname, './fixtures/bundle.js')
    if (existsSync(dest)) {
      unlinkSync(dest)
    }
    await router.getVueRenders()[0].compileVueClient({
      dest
    })
    expect(existsSync(dest)).to.eql(true)
  }
  {
    let dest = resolve(__dirname, './fixtures/dist/client-entry.js')
    if (existsSync(dest)) {
      unlinkSync(dest)
    }
    await router.getVueRenders()[0].compileVueClient({
      dest: true
    })
    expect(existsSync(dest)).to.eql(true)
  }
})

test('vue.mode.module', async (ava) => {
  @gen
  @props({
    vue: {
      instance: true
    }
  })
  class Test {
    @get()
    async basic (ctx) {
      return {
        title: 'Basic Title'
      }
    }
  }

  let router = new Router({
    vueRoot: resolve(__dirname, 'fixtures')
  })

  router.use(vuePlugin)
  router.declare(Test)

  let ctx = {
    path: '/Test/basic',
    method: 'GET'
  }
  await router.exec(ctx)
  expect(!!~ctx.body.indexOf('TestBasic')).to.eql(true)
})

function createVueApp (opts) {
  @gen
  @props({
    vue: true
  })
  class Test {
    @get()
    async basic (ctx) {
      return {
        title: 'Basic Title'
      }
    }
    @get()
    async profile (ctx) {
      return {
        title: 'Profile Title'
      }
    }
    @get()
    @vue(false)
    async single (ctx) {
      return {
        title: 'Single vue'
      }
    }
  }
  let router = new Router(Object.assign({
    vueRoot: resolve(__dirname, 'fixtures'),
    vueDest: resolve(__dirname, './fixtures/dist')
  }, opts))
  router.use(vuePlugin)
  router.declare(Test)
  return {router, Test}
}
