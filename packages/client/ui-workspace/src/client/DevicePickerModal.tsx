/**
 * Modal dialog for selecting a network device from the Polyglot inventory.
 * The inventory arrives through the injected `listDevices` callback, so the
 * browser never reads the Host's endpoint, token, or upstream error body.
 * @module @deepseek-ai/dsh-client-ui-workspace/src/client/DevicePickerModal
 */
import { useCallback, useEffect, useMemo, useState } from 'react'
import clsx from 'clsx'
import {
  Button,
  IconGlobeOutlineRegular,
  IconSearchOutlineRegular,
  Input,
  Modal,
  StateDot,
  Tag,
} from '@deepseek-ai/dsh-client-ui-primitives'
import type { DeviceView } from '@deepseek-ai/dsh-api-device-controller/types'
import type { WorkspacePickerProps } from './contract/slots.ts'
import css from './DevicePickerModal.module.css'

/** One inventory device row. */
export type DeviceItem = DeviceView

/** Props for the DevicePickerModal component. */
export interface DevicePickerModalProps {
  /** Whether the modal is open. */
  open: boolean
  /** Callback to close the modal. */
  onClose: () => void
  /** Callback when a device is confirmed. */
  onSelect: (device: DeviceItem) => void
  /** Host-owned inventory read; absent when no device Remote is composed. */
  listDevices?: ((signal?: AbortSignal) => Promise<readonly DeviceItem[]>) | undefined
  /** Translation function. */
  t: WorkspacePickerProps['t']
}

/**
 * Render the network device picker modal.
 * @param props - component properties.
 * @returns the device picker modal element.
 */
export function DevicePickerModal({ open, onClose, onSelect, listDevices, t }: DevicePickerModalProps) {
  const [devices, setDevices] = useState<readonly DeviceItem[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [search, setSearch] = useState('')
  const [selectedId, setSelectedId] = useState<string | null>(null)

  const load = useCallback(async (signal?: AbortSignal) => {
    if (listDevices === undefined) {
      setDevices([])
      setError(t('devicePicker.unavailable'))
      return
    }
    setLoading(true)
    setError(null)
    try {
      setDevices(await listDevices(signal))
    } catch (reason: unknown) {
      if (signal?.aborted === true) return
      setError(reason instanceof Error ? reason.message : String(reason))
    } finally {
      if (signal?.aborted !== true) setLoading(false)
    }
  }, [listDevices, t])

  useEffect(() => {
    if (!open) {
      setSelectedId(null)
      setSearch('')
      return
    }
    const controller = new AbortController()
    void load(controller.signal)
    return () => { controller.abort() }
  }, [open, load])

  const filtered = useMemo(() => {
    const query = search.trim().toLowerCase()
    if (query.length === 0) return devices
    return devices.filter((device) => {
      if (device.name.toLowerCase().includes(query)) return true
      if (device.vendor.toLowerCase().includes(query)) return true
      if (device.host.toLowerCase().includes(query)) return true
      if (device.driverType.toLowerCase().includes(query)) return true
      return device.tags.some(tag => tag.toLowerCase().includes(query))
    })
  }, [devices, search])

  const selectedDevice = useMemo(
    () => devices.find(device => device.id === selectedId) ?? null,
    [devices, selectedId],
  )

  const confirm = useCallback(() => {
    if (selectedDevice !== null) onSelect(selectedDevice)
  }, [selectedDevice, onSelect])

  return (
    <Modal
      open={open}
      onClose={onClose}
      closeLabel={t('close')}
      title={t('devicePicker.title')}
      {...css.modalDialog ? { className: css.modalDialog } : {}}
      footer={(
        <>
          <Button variant="outline" onClick={onClose}>{t('cancel')}</Button>
          <Button variant="primary" disabled={selectedDevice === null} onClick={confirm}>
            {t('devicePicker.actionAdd')}
          </Button>
        </>
      )}
    >
      <div className={css.searchWrap}>
        <Input
          {...css.searchInput ? { className: css.searchInput } : {}}
          value={search}
          onChange={(event) => { setSearch(event.target.value) }}
          placeholder={t('devicePicker.searchPlaceholder')}
          icon={<IconSearchOutlineRegular size={14} />}
          data-modal-autofocus
        />
      </div>

      {loading && devices.length === 0 && (
        <div className={css.emptyStatus} role="status">
          <StateDot state="ongoing" />
          <span>{t('devicePicker.loading')}</span>
        </div>
      )}

      {error !== null && (
        <div className={css.errorStatus} role="alert">
          <span>{t('devicePicker.error')} ({error})</span>
          <Button variant="outline" onClick={() => { void load() }}>{t('retry')}</Button>
        </div>
      )}

      {!loading && error === null && filtered.length === 0 && (
        <div className={css.emptyStatus} role="status">
          <span>{t('devicePicker.empty')}</span>
        </div>
      )}

      {filtered.length > 0 && (
        <div className={css.deviceList} role="list" aria-label={t('devicePicker.title')}>
          {filtered.map((device) => {
            const isSelected = selectedId === device.id
            return (
              <button
                key={device.id}
                type="button"
                aria-pressed={isSelected}
                className={clsx(css.deviceItem, isSelected && css.selected)}
                onClick={() => { setSelectedId(device.id) }}
                onDoubleClick={() => { onSelect(device) }}
              >
                <span className={clsx(css.deviceIcon, isSelected && css.deviceIconSelected)}>
                  <IconGlobeOutlineRegular size={20} />
                </span>
                <div className={css.deviceDetails}>
                  <div className={css.deviceHeader}>
                    <span className={css.deviceName}>{device.name}</span>
                    <span className={css.deviceStatus}>
                      <StateDot state={device.enabled ? 'done' : 'idle'} />
                      <span className={css.deviceStatusText}>
                        {device.enabled ? t('devicePicker.statusEnabled') : t('devicePicker.statusDisabled')}
                      </span>
                    </span>
                  </div>
                  <div className={css.deviceSub}>
                    <span className={css.deviceVendor}>{device.vendor}</span>
                    <span className={css.dotSeparator}>•</span>
                    <span className={css.deviceDriver}>{device.driverType}</span>
                    <span className={css.dotSeparator}>•</span>
                    <span className={css.deviceHost}>{device.host}</span>
                  </div>
                  {device.tags.length > 0 && (
                    <div className={css.deviceTags}>
                      {device.tags.map(tag => (
                        <Tag key={tag} tone="neutral" className={css.tagItem}>{tag}</Tag>
                      ))}
                    </div>
                  )}
                </div>
              </button>
            )
          })}
        </div>
      )}
    </Modal>
  )
}
