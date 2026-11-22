const NS = 'http://www.w3.org/2000/svg'
const width = 600
const top = 8
const bottom = 124
export const color = index => `var(--series-${index % 7})`
export function element(tag, cls, text) {
  const node = document.createElement(tag)
  if (cls) node.className = cls
  if (text !== undefined) node.textContent = text
  return node
}
function svg(tag, attrs) {
  const node = document.createElementNS(NS, tag)
  for (const [name, value] of Object.entries(attrs)) node.setAttribute(name, value)
  return node
}
function legendItem(label, fill, key, value) {
  const button = element('button')
  button.type = 'button'
  button.dataset.focusKey = key
  const swatch = element('span', 'swatch')
  swatch.style.setProperty('--swatch', fill)
  button.append(swatch, document.createTextNode(label), ...(value === undefined ? [] : [element('span', 'muted', ` ${value}`)]))
  return button
}

export function donut(id, title, rows, locale, state) {
  const { integer, percent, copy } = locale
  const card = element('section', 'panel')
  card.append(element('h2', '', title))
  const ring = element('div', 'donut')
  const graph = svg('svg', { viewBox: '0 0 112 112', 'aria-hidden': 'true' })
  const circle = (stroke, more = {}) => svg('circle', { cx: 56, cy: 56, r: 45, fill: 'none', stroke, 'stroke-width': 11, pathLength: 100, ...more })
  graph.append(circle('var(--orca-muted)'))
  const center = element('div', 'donut-center')
  const value = element('span')
  const description = element('small', 'muted')
  center.append(value, description)
  ring.append(graph, center)
  card.append(ring)
  const legend = element('div', 'legend')
  const total = rows.reduce((sum, row) => sum + row.total, 0)
  let start = 0
  const slices = []
  let selected = state.donut
  for (const row of rows) {
    if (!row.total) continue
    const extent = row.total / total * 100
    const arc = circle(row.color, { 'stroke-dasharray': `${extent} ${100 - extent}`, 'stroke-dashoffset': -start })
    start += extent
    const button = legendItem(row.label, row.color, `${id}-${slices.length}`, integer(row.total))
    button.addEventListener('click', () => {
      selected = selected === row.label ? null : row.label
      state.donut = selected
      update()
    })
    slices.push({ row, arc, button })
    graph.append(arc)
    legend.append(button)
  }
  function update() {
    const current = slices.find(({ row }) => row.label === selected)?.row
    value.textContent = integer(current?.total ?? total)
    description.textContent = current ? percent(current.total / total * 100) : copy.total
    for (const { row, button, arc } of slices) {
      const active = current === row
      button.setAttribute('aria-pressed', String(active))
      arc.style.opacity = !current || active ? '1' : '.22'
    }
  }
  update()
  if (slices.length) card.append(legend)
  else card.append(element('p', 'legend muted', copy.noData))
  return card
}

function linePath(bounds, values, y) {
  let path = ''
  for (let i = 0; i < bounds.length; i++) {
    const { start, end, center } = bounds[i]
    if (values[i] === null) {
      path += `${path ? 'L' : 'M'}${start},${bottom}H${end}`
    } else {
      path += `${path ? 'L' : 'M'}${center},${y(values[i])}`
    }
  }
  return path
}

export function timeChart({ id, title, snapshot, series, style = 'line', format, axisFormat = format, ceiling, locale, state }) {
  const { copy, time, day, full } = locale
  const card = element('section', 'panel')
  const heading = element('h2', '', title)
  heading.id = `chart-${id}`
  card.setAttribute('aria-labelledby', heading.id)
  card.append(heading)
  const plot = element('div', 'plot')
  const field = element('div', 'plot-field')
  const graph = svg('svg', { viewBox: `0 0 ${width} 132`, preserveAspectRatio: 'none', 'aria-hidden': 'true' })
  const axis = element('div', 'axis y-axis')
  const ticks = element('div', 'axis x-axis')
  axis.setAttribute('aria-hidden', 'true')
  ticks.setAttribute('aria-hidden', 'true')
  const empty = element('div', 'plot-empty muted', copy.noData)
  field.append(graph, empty)
  plot.append(axis, field, ticks)
  const legend = element('div', 'legend')
  const details = element('details')
  const summary = element('summary', '', copy.details)
  summary.dataset.focusKey = `${id}-details`
  details.open = Boolean(state.open)
  details.addEventListener('toggle', () => { state.open = details.open })
  const controls = element('div', 'plot-controls')
  const slider = element('input')
  slider.type = 'range'
  slider.min = '0'
  slider.max = String(snapshot.buckets.length - 1)
  slider.setAttribute('aria-label', `${title}: ${copy.interval}`)
  slider.dataset.focusKey = `${id}-slider`
  const readout = element('output', 'readout')
  const hint = element('div', 'muted', copy.baseline)
  controls.append(readout, slider, hint)
  details.append(summary, controls)
  card.append(plot, legend, details)
  const { buckets, bucketMs, from, to } = snapshot
  const x = timestamp => (timestamp - from) / (to - from) * width
  const showDates = new Date(from).toDateString() !== new Date(to).toDateString()
  for (let i = 0; i < 5; i++) {
    const at = from + (to - from) * i / 4
    const tick = element('span', '', showDates ? day(at) : undefined)
    if (showDates) tick.append(element('br'))
    tick.append(document.createTextNode(time(at)))
    ticks.append(tick)
  }
  const bounds = buckets.map(({ at }) => {
    const start = x(Math.max(at, from)), end = x(Math.min(at + bucketMs, to))
    return { start, end, center: (start + end) / 2 }
  })
  const barWidth = bucketMs / (to - from) * width
  let index = buckets.findIndex(bucket => bucket.at === state.at)
  if (index < 0) index = buckets.length - 1
  let selected = series.some(row => row.label === state.series) ? state.series : null
  let marker
  const buttons = series.map((row, i) => {
    const button = legendItem(row.label, row.color, `${id}-series-${i}`)
    button.addEventListener('click', () => {
      selected = selected === row.label ? null : row.label
      state.series = selected
      paint()
    })
    legend.append(button)
    return button
  })
  function valueAt() {
    slider.value = String(index)
    const bucket = buckets[index]
    const visible = selected ? series.filter(row => row.label === selected) : series
    const interval = `${full(Math.max(from, bucket.at))} — ${full(Math.min(to, bucket.at + bucketMs))}`
    const values = visible.map(row => `${row.label}: ${row.values[index] === null ? copy.noData : format(row.values[index])}`)
    readout.textContent = [interval, ...values].join(' · ')
    slider.setAttribute('aria-valuetext', readout.textContent)
    marker?.setAttribute('x1', bounds[index].center)
    marker?.setAttribute('x2', bounds[index].center)
    marker?.setAttribute('visibility', state.at != null ? 'visible' : 'hidden')
  }
  function paint() {
    const visible = selected ? series.filter(row => row.label === selected) : series
    const known = visible.some(row => row.values.some(value => value !== null))
    const maximum = ceiling ?? Math.max(0, ...visible.flatMap(row => row.values))
    const y = value => bottom - (maximum > 0 ? value / maximum * (bottom - top) : 0)
    axis.replaceChildren(...[maximum, maximum / 2, 0].map(value => element('span', '', known ? axisFormat(value) : '—')))
    const nodes = []
    const rule = (x1, y1, x2, y2) => svg('line', { x1, y1, x2, y2, stroke: 'var(--grid)', 'vector-effect': 'non-scaling-stroke' })
    for (const height of [top, (bottom + top) / 2, bottom]) nodes.push(rule(0, height, width, height))
    for (let i = 0; i <= 4; i++) nodes.push(rule(width * i / 4, top, width * i / 4, bottom))
    for (let group = 0; group < visible.length; group++) {
      const row = visible[group]
      if (!row.values.some(value => value !== null)) continue
      if (style === 'line') {
        nodes.push(svg('path', { d: linePath(bounds, row.values, y), stroke: row.color, fill: 'none',
          'stroke-width': '1.6', 'stroke-linejoin': 'round', 'vector-effect': 'non-scaling-stroke' }))
      } else {
        for (let i = 0; i < bounds.length; i++) {
          const value = row.values[i]
          if (value === null) continue
          // Reserve a normal-width lane at the edges even if the window clips most of the bucket.
          const left = Math.max(0, Math.min(width - barWidth, bounds[i].center - barWidth / 2))
          const slot = barWidth * .88 / visible.length
          nodes.push(svg('rect', { x: left + barWidth * .06 + slot * group, y: y(value) - (value ? 0 : 1),
            width: slot * .91, height: Math.max(1, bottom - y(value)), fill: row.color }))
        }
      }
    }
    marker = svg('line', { y1: top, y2: bottom, stroke: 'var(--orca-muted-foreground)', 'stroke-dasharray': '3 3', 'vector-effect': 'non-scaling-stroke' })
    nodes.push(marker)
    graph.replaceChildren(...nodes)
    graph.classList.toggle('can-select', known)
    empty.hidden = known
    hint.hidden = style !== 'line' || !visible.some(row => row.values.includes(null) && row.values.some(value => value !== null))
    buttons.forEach((button, i) => button.setAttribute('aria-pressed', String(selected === series[i].label)))
    valueAt()
  }
  slider.addEventListener('input', () => { index = Number(slider.value); state.at = buckets[index].at; valueAt() })
  graph.addEventListener('click', event => {
    const box = graph.getBoundingClientRect()
    if (!box.width) return
    const timestamp = from + (to - from) * (event.clientX - box.left) / box.width
    index = Math.max(0, Math.min(buckets.length - 1, Math.floor((timestamp - buckets[0].at) / bucketMs)))
    state.at = buckets[index].at
    state.open = details.open = true
    valueAt()
  })
  paint()
  return card
}
