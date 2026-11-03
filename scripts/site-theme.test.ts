import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'

const css = readFileSync(new URL('../docs/.vitepress/theme/custom.css', import.meta.url), 'utf8')
const tokens = (selector: string): Record<string, string> => {
  const block = css.slice(css.indexOf(`${selector} {`)).split('}')[0]
  return Object.fromEntries([...block.matchAll(/(--[\w-]+):\s*([^;]+);/g)].map(match => [match[1], match[2].trim()]))
}
const light = tokens(':root')
const palettes = { light, dark: { ...light, ...tokens(':root.dark') } }

function luminance(hex: string): number {
  assert.match(hex, /^#[\da-f]{3}([\da-f]{3})?$/i)
  const digits = hex.length === 4 ? hex.slice(1).split('').map(digit => digit + digit).join('') : hex.slice(1)
  const [red, green, blue] = [0, 2, 4].map(index => {
    const value = Number.parseInt(digits.slice(index, index + 2), 16) / 255
    return value <= .04045 ? value / 12.92 : ((value + .055) / 1.055) ** 2.4
  })
  return red * .2126 + green * .7152 + blue * .0722
}

function contrast(foreground: string, background: string): number {
  const values = [luminance(foreground), luminance(background)].sort((a, b) => b - a)
  return (values[0] + .05) / (values[1] + .05)
}

test('notebook text and semantic accents meet 4.5:1 contrast in both themes', () => {
  for (const [name, palette] of Object.entries(palettes)) {
    for (const background of ['paper', 'surface', 'raised', 'soft']) {
      for (const foreground of ['ink', 'body', 'muted', 'faint', 'red', 'blue', 'green', 'amber']) {
        const ratio = contrast(palette[`--nb-${foreground}`], palette[`--nb-${background}`])
        assert.ok(ratio >= 4.5, `${name}: ${foreground} on ${background} is ${ratio.toFixed(2)}:1`)
      }
    }
    for (const [foreground, background] of [
      ['warning-text', 'warning-bg'], ['blue', 'info-bg'], ['green', 'success-bg'],
      ['terminal-text', 'terminal-bg'], ['terminal-muted', 'terminal-bg'],
      ['terminal-green', 'terminal-bg'], ['paper', 'ink'],
    ]) {
      assert.ok(contrast(palette[`--nb-${foreground}`], palette[`--nb-${background}`]) >= 4.5, `${name}: ${foreground} on ${background}`)
    }
  }
})

test('all notebook surfaces inherit the shared palette instead of pinning a color scheme', () => {
  for (const component of ['ProtocolHero', 'DeviceScreen', 'ChatView', 'AutomationView', 'TerminalView', 'ChannelsView']) {
    const source = readFileSync(new URL(`../docs/.vitepress/theme/components/${component}.vue`, import.meta.url), 'utf8')
    const styles = source.split('<style scoped>')[1]
    assert.ok(styles, `${component} has scoped styles`)
    assert.doesNotMatch(styles, /#[\da-f]{3,8}\b|rgba?\(/i, `${component} must use shared color tokens`)
    for (const match of styles.matchAll(/var\((--nb-[\w-]+)/g)) {
      assert.ok(light[match[1]] || ['--nb-top', '--nb-stage-h', '--nb-peek'].includes(match[1]), `${component}: undefined theme token ${match[1]}`)
    }
  }
  assert.doesNotMatch(css, /\.switchyard-home\s*\{[^}]*--vp-c-/s, 'homepage must not override the selected theme')
})
