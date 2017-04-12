import Test from './Test/Test.vue'
import TestBasic from './Test/TestBasic.vue'
export default [
  {
    "component": Test,
    "path": "/Test",
    "children": [
      {
        "component": TestBasic,
        "path": "basic",
        "name": "TestBasic"
      }
    ]
  }
]