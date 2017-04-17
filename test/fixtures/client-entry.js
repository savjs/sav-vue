import bootstrap from './server-entry.js'
import routes from './Routes.js'

let app = bootstrap({
  routes
})

app.vm.$mount('#app')