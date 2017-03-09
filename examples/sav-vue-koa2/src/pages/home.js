import {get} from 'sav-router'
import {gen, impl, props} from 'sav-decorator'

class HomeInterface {
  @get('~')
  index () {}
}

@gen
@props({
  view: true
})
@impl(HomeInterface)
export class Home {
  async index (ctx) {

  }
}
