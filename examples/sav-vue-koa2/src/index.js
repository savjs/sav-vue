import Koa from 'koa'
import bodyParser from 'koa-bodyparser'
import favicon from 'koa-favicon'

import {resolve} from 'path'

import {Router} from 'sav-router'
import {viewPlugin} from 'sav-router-view'

import {Account} from './pages/account'
import {Home} from './pages/home'

let app = new Koa()
app.use(favicon(resolve(__dirname, '../favicon.ico')))
app.use(bodyParser())

let router = new Router({
  case: 'camel',
  viewRoot: resolve(__dirname, 'views'),
  viewExtension: 'vue',
  viewEngines: {
    vue: 'htmling'
  }
})

router.use(viewPlugin)

router.declare([
  Home,
  Account
])

app.use(router.route())
app.listen(3000)

console.log('server: http://localhost:3000')
