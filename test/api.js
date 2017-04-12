import test from 'ava'
import {expect} from 'chai'
import {resolve} from 'path'

import {vuePlugin, vue} from '../src'
import {Router, get} from 'sav-router'
import {gen, props} from 'sav-decorator'

test('api', (ava) => {
  expect(vuePlugin).to.be.a('function')
  expect(vue).to.be.a('function')
})

test('vue.mode.app', async (ava) => {
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

  let router = new Router({
    vueRoot: resolve(__dirname, 'fixtures')
  })

  router.use(vuePlugin)
  router.declare(Test)
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
