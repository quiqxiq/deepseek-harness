// @vitest-environment jsdom
/**
 * The network-device picker rendered directly with hand-built props: inventory
 * loading, filtering, the two independent status axes, selection, refresh, and
 * failure surfaces. The surrounding workspace picker and slot machinery stay
 * out; their composition is covered by the workspace-picker suite.
 */
import { afterEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import type { DeviceView } from '@deepseek-ai/dsh-api-device-controller/types'
import { makeTranslate } from '@deepseek-ai/dsh-client-test-runtime'
import { zh as commonZh } from '@deepseek-ai/dsh-client-locale/src/locales/zh.ts'
import { DevicePickerModal, type DevicePickerModalProps } from '../src/client/DevicePickerModal.tsx'
import { zh } from '../src/client/locales.ts'

afterEach(cleanup)

const t: DevicePickerModalProps['t'] = makeTranslate(zh, commonZh)

function device(overrides: Partial<DeviceView> & Pick<DeviceView, 'id' | 'name'>): DeviceView {
  return {
    vendor: 'MikroTik',
    driverType: 'mikrotik',
    host: '10.0.0.1',
    tags: [],
    enabled: true,
    ...overrides,
  }
}

function deferred<T>() {
  let resolve!: (value: T) => void
  let reject!: (reason: unknown) => void
  const promise = new Promise<T>((res, rej) => { resolve = res; reject = rej })
  return { promise, resolve, reject }
}

function renderPicker(props: Partial<DevicePickerModalProps> = {}) {
  const onClose = vi.fn()
  const onSelect = vi.fn()
  const listDevices = vi.fn(async () => [] as readonly DeviceView[])
  const element = (next: Partial<DevicePickerModalProps> = {}) => (
    <DevicePickerModal
      open
      onClose={onClose}
      onSelect={onSelect}
      listDevices={listDevices}
      t={t}
      {...props}
      {...next}
    />
  )
  const view = render(element())
  return { view, element, onClose, onSelect, listDevices }
}

const searchPlaceholder = '按名称、厂商、IP或标签搜索…'
const addLabel = '添加为工作区'

describe('DevicePickerModal', () => {
  it('shows both status axes, filters every searchable field, and adopts a device', async () => {
    const devices: readonly DeviceView[] = [
      device({
        id: 'core', name: 'Router-Core', host: '10.0.0.1', tags: ['core'],
        connectivity: 'online', latencyMs: 12,
      }),
      device({
        id: 'edge', name: 'Switch-Edge', vendor: 'Cisco', driverType: 'ios', host: '10.0.0.2',
        tags: ['backbone'], enabled: false, connectivity: 'offline',
      }),
      device({
        id: 'ap', name: 'Access-Point', vendor: 'Ubiquiti', driverType: 'unifi', host: '10.0.0.3',
      }),
      device({
        id: 'cloud', name: 'Cloud-Gateway', vendor: 'Juniper', driverType: 'junos', host: '10.0.0.4',
        connectivity: 'online',
      }),
    ]
    const { onSelect } = renderPicker({ listDevices: async () => devices })
    await waitFor(() => { expect(screen.getByText('Router-Core')).toBeTruthy() })

    expect(screen.getAllByText('活动')).toHaveLength(3)
    expect(screen.getByText('已禁用')).toBeTruthy()
    expect(screen.getAllByText('在线')).toHaveLength(2)
    expect(screen.getByText('离线')).toBeTruthy()
    expect(screen.getByText('未知')).toBeTruthy()
    expect(screen.getByText('12 毫秒')).toBeTruthy()

    const add = screen.getByRole<HTMLButtonElement>('button', { name: addLabel })
    expect(add.disabled).toBe(true)
    fireEvent.click(screen.getByText('Router-Core'))
    expect(add.disabled).toBe(false)
    fireEvent.click(add)
    expect(onSelect).toHaveBeenCalledWith(devices[0])

    fireEvent.doubleClick(screen.getByText('Switch-Edge'))
    expect(onSelect).toHaveBeenCalledWith(devices[1])

    const search = screen.getByPlaceholderText(searchPlaceholder)
    fireEvent.change(search, { target: { value: 'Router' } })
    expect(screen.getByText('Router-Core')).toBeTruthy()
    expect(screen.queryByText('Switch-Edge')).toBeNull()
    fireEvent.change(search, { target: { value: 'Cisco' } })
    expect(screen.getByText('Switch-Edge')).toBeTruthy()
    expect(screen.queryByText('Router-Core')).toBeNull()
    fireEvent.change(search, { target: { value: '10.0.0.3' } })
    expect(screen.getByText('Access-Point')).toBeTruthy()
    expect(screen.queryByText('Router-Core')).toBeNull()
    fireEvent.change(search, { target: { value: 'unifi' } })
    expect(screen.getByText('Access-Point')).toBeTruthy()
    expect(screen.queryByText('Router-Core')).toBeNull()
    fireEvent.change(search, { target: { value: 'backbone' } })
    expect(screen.getByText('Switch-Edge')).toBeTruthy()
    expect(screen.queryByText('Router-Core')).toBeNull()

    fireEvent.change(search, { target: { value: 'no-such-device' } })
    expect(screen.getByText('未找到匹配的网络设备')).toBeTruthy()
    expect(screen.queryByRole('list')).toBeNull()

    fireEvent.change(search, { target: { value: '' } })
    expect(screen.getByRole('list')).toBeTruthy()
  })

  it('keeps devices visible while refreshing and replaces them when the answer arrives', async () => {
    const first = deferred<readonly DeviceView[]>()
    const second = deferred<readonly DeviceView[]>()
    const listDevices = vi.fn()
      .mockReturnValueOnce(first.promise)
      .mockReturnValueOnce(second.promise)
    renderPicker({ listDevices })

    expect(screen.getByText('正在加载设备清单…')).toBeTruthy()
    const refresh = screen.getByRole<HTMLButtonElement>('button', { name: '刷新' })
    expect(refresh.disabled).toBe(true)

    await act(async () => { first.resolve([device({ id: 'one', name: 'Router-One' })]) })
    await waitFor(() => { expect(screen.getByText('Router-One')).toBeTruthy() })
    expect(refresh.disabled).toBe(false)

    fireEvent.click(refresh)
    expect(listDevices).toHaveBeenCalledTimes(2)
    expect(refresh.disabled).toBe(true)
    expect(screen.getByText('Router-One')).toBeTruthy()

    await act(async () => { second.resolve([device({ id: 'two', name: 'Router-Two' })]) })
    await waitFor(() => { expect(screen.getByText('Router-Two')).toBeTruthy() })
    expect(screen.queryByText('Router-One')).toBeNull()
    expect(refresh.disabled).toBe(false)
  })

  it('reports an unavailable inventory and retries on demand', () => {
    renderPicker({ listDevices: undefined })

    expect(screen.getByText(/设备清单不可用/u)).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: '重试' }))
    expect(screen.getByText(/设备清单不可用/u)).toBeTruthy()
  })

  it('surfaces Error and non-Error failures and retries with a fresh read', async () => {
    const listDevices = vi.fn(async () => { throw new Error('boom') })
    renderPicker({ listDevices })
    await waitFor(() => { expect(screen.getByText(/boom/u)).toBeTruthy() })
    fireEvent.click(screen.getByRole('button', { name: '重试' }))
    await waitFor(() => { expect(listDevices).toHaveBeenCalledTimes(2) })

    cleanup()
    const stringFailure = vi.fn(async () => { throw 'nope' })
    renderPicker({ listDevices: stringFailure })
    await waitFor(() => { expect(screen.getByText(/nope/u)).toBeTruthy() })
  })

  it('shows the empty surface when the inventory is empty', async () => {
    renderPicker({ listDevices: async () => [] })
    await waitFor(() => { expect(screen.getByText('未找到匹配的网络设备')).toBeTruthy() })
  })

  it('ignores a late answer after the modal closes', async () => {
    const pending = deferred<readonly DeviceView[]>()
    const { view } = renderPicker({ listDevices: () => pending.promise })
    view.unmount()
    await act(async () => { pending.reject(new Error('late')) })
  })

  it('resets search and selection when closed and reloads when reopened', async () => {
    const devices = [device({ id: 'one', name: 'Router-One' })]
    const { view, element } = renderPicker({ listDevices: async () => devices })
    await waitFor(() => { expect(screen.getByText('Router-One')).toBeTruthy() })

    fireEvent.change(screen.getByPlaceholderText(searchPlaceholder), { target: { value: 'Router' } })
    fireEvent.click(screen.getByText('Router-One'))
    expect(screen.getByRole<HTMLButtonElement>('button', { name: addLabel }).disabled).toBe(false)

    view.rerender(element({ open: false }))
    expect(screen.queryByRole('dialog')).toBeNull()

    view.rerender(element())
    await waitFor(() => { expect(screen.getByText('Router-One')).toBeTruthy() })
    expect(screen.getByPlaceholderText<HTMLInputElement>(searchPlaceholder).value).toBe('')
    expect(screen.getByRole<HTMLButtonElement>('button', { name: addLabel }).disabled).toBe(true)
  })

  it('closes through the footer and header controls', async () => {
    const { onClose } = renderPicker()
    fireEvent.click(screen.getByRole('button', { name: '取消' }))
    expect(onClose).toHaveBeenCalledTimes(1)
    fireEvent.click(screen.getByRole('button', { name: '关闭' }))
    expect(onClose).toHaveBeenCalledTimes(2)
  })
})
