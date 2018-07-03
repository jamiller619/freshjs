import { events, freshdomType } from 'freshdom-utils'
import deepEqual from 'deep-equal'

import domsync from './dom-sync'
import { isTemplate } from './types/is-html'
import registry from './registry'

const FreshComponent = function FreshComponent() {}

Object.defineProperties(FreshComponent.prototype, {
  /**
   * Lifecycle callbacks as defined by the Custom Element spec
   */
  connectedCallback: {
    value: async function() {
      await events.trigger(this, events.type.onBeforeRender)
      await this.renderUpdate()

      this.isAttached = true
      await events.trigger(this, events.type.onAttach)
    }
  },

  disconnectedCallback: {
    value: function() {
      this.isAttached = false
      events.trigger(this, events.type.onDetach)
    }
  },

  attributeChangedCallback: {
    value: async function() {
      await this.renderUpdate()
    }
  },

  /**
   * Public properties
   */
  $$__type: {
    value: freshdomType
  },

  isAttached: {
    writable: true,
    value: false
  },

  state: {
    get: function() {
      return this.$$__state
    },
    set: function(value) {
      Object.defineProperty(this, '$$__state', {
        configurable: true,
        value: value
      })
    }
  },

  /**
   * Public methods
   */
  setState: {
    value: async function(state) {
      const prevState = this.$$__state
      const newState = clone(prevState, state)

      Object.defineProperty(this, '$$__state', {
        configurable: true,
        value: newState
      })

      await this.renderUpdate()
    }
  },

  hasRendered: {
    writable: true,
    value: false
  },

  renderUpdate: {
    value: async function() {
      if (this.shouldRenderUpdate() === false) {
        return false
      }

      const content = await this.render()
      await renderChildren(content)

      await domsync(this, content, {
        onBeforeElUpdated(fromEl, toEl) {
          if (fromEl.$$__type) {
            return fromEl.shouldRenderUpdate(fromEl, toEl)
          }
        }
      })

      this.hasRendered = true

      await events.trigger(this, events.type.onRenderComplete)
    }
  },

  /**
   * Only render an element if its state and props haven't
   * changed since last render.
   */
  shouldRenderUpdate: {
    value: function(fromEl, toEl) {
      if (this.render && typeof this.render === 'function') {
        if (!toEl || this.hasRendered === false) {
          return true
        }

        if (
          fromEl.$$__state &&
          toEl.$$__state &&
          deepEqual(fromEl.state, toEl.state) === false
        ) {
          return true
        }

        return deepEqual(fromEl.props, toEl.props) === false
      }

      return false
    }
  }
})

const renderChildren = content => {
  if (!Array.isArray(content)) {
    content = Array.of(content)
  }

  return Promise.all(
    content.filter(c => c !== undefined).map(child => new Promise(resolve => {
      if (child.$$__type && child.isAttached === false) {
        // child.addEventListener('rendercomplete', {once: true}, () => resolve())
        // console.log(JSON.stringify(child.isRendering))
        child.renderUpdate().then(resolve)
      } else {
        resolve()
      }
    }))
    // content.map(child => new Promise(resolve => {
    //   if (child.$$__type && child.hasRendered === false) {
    //     child.renderUpdate().then(resolve)
    //   } else {
    //     resolve()
    //   }
    // })
  )
}

/**
 * Mostly truly private methods
 */
const clone = (target, ...sources) => Object.assign({}, target, ...sources)

const createStateProps = (inst, ...props) => {
  Object.defineProperties(inst, {
    props: {
      configurable: true,
      value: Object.assign({}, ...props)
    }
  })

  return inst
}

const define = (ctor, ...props) => {
  registry.define(ctor.tag, ctor)
}

const init = (ctor, ...props) => {
  define(ctor, ...props)
  return inst => createStateProps(inst, ...props)
}

/**
 * The Factory
 *
 * Returns a constructor with all prototypes in place,
 * ready to be used in a prototype chain or extend.
 *
 * Can extend any HTML Interface ala . Defaults to "HTMLElement"
 */
export const Fresh = (HTMLInterface = window.HTMLElement) => {
  class Element extends HTMLInterface {
    constructor(...props) {
      init(new.target, ...props)(super())
    }
  }

  Object.defineProperties(
    Element.prototype,
    Object.getOwnPropertyDescriptors(FreshComponent.prototype)
  )

  return Element
}

export default Fresh()
