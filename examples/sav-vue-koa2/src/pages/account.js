import {get} from 'sav-router'
import {gen, impl, props} from 'sav-decorator'

class AccountInterface {
  @get
  profile () {}

  @get
  login() {}
}

@gen
@props({
  view: true
})
@impl(AccountInterface)
export class Account {
  async profile (ctx) {
    ctx.state = {
      name: 'jetiny'
    }
  }
  async login (ctx) {
    ctx.state = {
      message: 'login success!'
    }
  }
}
