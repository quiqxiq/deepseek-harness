/** Workspace command implementation and stable Remote failure mapping. */

import { mkdir } from 'node:fs/promises'
import type { Context } from '@deepseek-ai/cordis'
import { dshHomePath } from '@deepseek-ai/dsh-home-paths'
import {
  WorkspaceActiveSessionError,
  WorkspaceArchivedSessionPinError,
  WorkspaceId,
  WorkspaceMoveInvalidError,
  WorkspaceOrderInvalidError,
  WorkspaceUnknownSessionError,
  writeDeviceMarker,
} from '@deepseek-ai/dsh-workspace'
import type { Workspace, WorkspaceTarget } from '@deepseek-ai/dsh-workspace'
import type {} from '@deepseek-ai/dsh-api-device-controller'
import { RemoteError, remoteErrorOf } from '@deepseek-ai/dsh-typert-protocol'
import { workspaceView } from './feed.ts'
import type {
  WorkspaceArchiveSessionRequest,
  WorkspaceArchiveValue,
  WorkspaceCreateRequest,
  WorkspaceCreateValue,
  WorkspaceDeleteRequest,
  WorkspaceDeleteValue,
  WorkspaceInsertBeforeRequest,
  WorkspaceInsertSessionBeforeRequest,
  WorkspaceOrderValue,
  WorkspacePinSessionRequest,
  WorkspacePinValue,
  WorkspaceRenameRequest,
  WorkspaceUnarchiveSessionRequest,
  WorkspaceUnpinSessionRequest,
  WorkspaceValue,
} from './types.ts'

/** Implements Workspace mutations against the authoritative registry. */
export class WorkspaceCommands {
  private operationTail = Promise.resolve()

  /** @param ctx - Host context containing the Workspace registry. */
  constructor(private readonly ctx: Context) {}

  /**
   * Create or resolve one Workspace over an existing directory or an inventory
   * device. A device request stores its artifacts under the Harness home's
   * `devices/<id>` directory and records the device target on the workspace;
   * re-adopting the same device is idempotent and refreshes inventory facts.
   * @param request - directory path or device target to register.
   * @param signal - caller lifetime; cancels inventory validation.
   * @returns the Workspace and whether this call created it.
   */
  create(request: WorkspaceCreateRequest, signal?: AbortSignal): Promise<WorkspaceCreateValue> {
    return this.enqueue(async () => {
      if ((request.path === undefined) === (request.target === undefined)) {
        throw new RemoteError(
          'gateway/bad-request',
          'Workspace create requires exactly one of path or target',
          {},
        )
      }
      try {
        if (request.target !== undefined) return await this.createDevice(request.target, request.title, signal)
        const existing = await this.ctx.workspaceRegistry.resolveByPath(request.path)
        if (existing !== undefined) {
          if (request.title !== undefined && request.title !== existing.title) {
            await existing.setTitle(request.title)
          }
          return { workspace: workspaceView(existing), created: false }
        }
        const workspace = await this.ctx.workspaceRegistry.create(request.path, request.title)
        return { workspace: workspaceView(workspace), created: true }
      } catch (error) {
        if (remoteErrorOf(error) !== undefined) throw error
        const subject = request.target !== undefined ? request.target.deviceId : request.path
        throw new RemoteError(
          'workspace/invalid-path',
          `cannot create a Workspace for "${subject}": ${errorMessage(error)}`,
          { path: subject },
          { cause: error },
        )
      }
    })
  }

  /**
   * Adopt or refresh one device workspace under the Harness home.
   * @param target - inventory device facts selected by the caller.
   * @param title - optional user-facing title; omitted on an existing row keeps the stored title.
   * @param signal - caller lifetime for inventory validation.
   * @returns the device workspace and whether this call created it.
   */
  private async createDevice(
    target: WorkspaceTarget,
    title: string | undefined,
    signal?: AbortSignal,
  ): Promise<WorkspaceCreateValue> {
    const resolved = await this.resolveTarget(target, signal)
    const safeId = resolved.deviceId.replace(/[^a-zA-Z0-9_.-]/gu, '_')
    const directory = dshHomePath('devices', safeId)
    await mkdir(directory, { recursive: true })

    const existing = this.ctx.workspaceRegistry.findByDevice(resolved.deviceId)
      ?? await this.ctx.workspaceRegistry.resolveByPath(directory)
    const displayTitle = title ?? deviceTitle(resolved)
    const workspace = existing ?? await this.ctx.workspaceRegistry.create(directory, displayTitle, resolved)
    if (existing !== undefined) {
      const previousTitle = existing.target === undefined ? undefined : deviceTitle(existing.target)
      if (!sameTarget(existing.target, resolved)) await existing.setTarget(resolved)
      if (title !== undefined && title !== existing.title) await existing.setTitle(title)
      // An untouched automatic title follows inventory renames; a user title stays.
      else if (title === undefined && existing.title === previousTitle && displayTitle !== existing.title) {
        await existing.setTitle(displayTitle)
      }
    }
    await this.writeMarker(workspace, directory, resolved)
    return { workspace: workspaceView(workspace), created: existing === undefined }
  }

  /**
   * Confirm the selected device still exists in inventory and refresh its
   * display facts. A composition without the inventory Remote keeps the
   * caller-supplied target, so workspace creation never depends on that row.
   * @param target - selected device facts.
   * @param signal - caller lifetime.
   * @returns the inventory-backed target when available.
   */
  private async resolveTarget(target: WorkspaceTarget, signal?: AbortSignal): Promise<WorkspaceTarget> {
    const controller = this.ctx.get('deviceController')
    if (controller === undefined) return target
    const device = await controller.get({ deviceId: target.deviceId }, signal ?? new AbortController().signal)
    return {
      kind: 'device',
      deviceId: device.id,
      name: device.name,
      ...device.vendor === '' ? {} : { vendor: device.vendor },
      ...device.driverType === '' ? {} : { driverType: device.driverType },
      ...device.host === '' ? {} : { host: device.host },
      ...device.port === undefined ? {} : { port: device.port },
      ...device.sshPort === undefined ? {} : { sshPort: device.sshPort },
    }
  }

  /** Publish the derived device marker; a failure is warned because the workspace record is authoritative. */
  private async writeMarker(workspace: Workspace, directory: string, target: WorkspaceTarget): Promise<void> {
    try {
      await writeDeviceMarker(directory, {
        id: target.deviceId,
        title: workspace.title,
        deviceUri: `device://${target.deviceId}`,
        ...target.vendor === undefined ? {} : { vendor: target.vendor },
        ...target.driverType === undefined ? {} : { driverType: target.driverType },
        ...target.host === undefined ? {} : { host: target.host },
        ...target.port === undefined ? {} : { port: target.port },
        ...target.sshPort === undefined ? {} : { sshPort: target.sshPort },
        workspaceId: String(workspace.id),
        updatedAt: new Date().toISOString(),
      })
    } catch (error: unknown) {
      this.ctx.logger.warn(`workspace '${workspace.id}' device marker could not be written: ${String(error)}`)
    }
  }

  /**
   * Rename one Workspace after serializing title ownership checks.
   * @param request - Workspace identity and proposed title.
   * @returns the updated Workspace projection.
   */
  rename(request: WorkspaceRenameRequest): Promise<WorkspaceValue> {
    const title = request.title.trim()
    if (title === '') {
      return Promise.reject(new RemoteError('gateway/bad-request', 'Workspace rename requires a non-blank title', {}))
    }
    return this.enqueue(async () => {
      const workspace = this.requireWorkspace(request.workspaceId)
      if (title !== workspace.title) {
        if (this.ctx.workspaceRegistry.list().some(candidate =>
          candidate.id !== workspace.id && candidate.title === title)) {
          throw new RemoteError(
            'workspace/name-conflict',
            `Workspace name '${title}' is already in use`,
            { name: title },
          )
        }
        await workspace.setTitle(title)
      }
      return { workspace: workspaceView(workspace) }
    })
  }

  /**
   * Delete one Workspace registration without deleting its directory or Sessions.
   * @param request - Workspace identity to remove.
   * @returns deletion confirmation.
   */
  delete(request: WorkspaceDeleteRequest): Promise<WorkspaceDeleteValue> {
    return this.enqueue(async () => {
      if (!await this.ctx.workspaceRegistry.delete(WorkspaceId(request.workspaceId))) {
        throw workspaceNotFound(request.workspaceId)
      }
      return { deleted: true }
    })
  }

  /**
   * Move one Workspace within the durable registry order.
   * @param request - moved Workspace and optional anchor.
   * @returns the complete resulting Workspace order.
   */
  async insertBefore(request: WorkspaceInsertBeforeRequest): Promise<WorkspaceOrderValue> {
    try {
      const workspaceIds = await this.ctx.workspaceRegistry.insertBefore(
        WorkspaceId(request.workspaceId),
        request.beforeWorkspaceId === undefined
          ? undefined
          : WorkspaceId(request.beforeWorkspaceId),
      )
      return { workspaceIds: [...workspaceIds] }
    } catch (error) {
      if (!(error instanceof WorkspaceOrderInvalidError)) throw error
      throw workspaceNotFound(error.workspaceId)
    }
  }

  /**
   * Move one accounted Session within a Workspace's manual order.
   * @param request - Workspace, Session, and optional anchor identities.
   * @returns the updated Workspace projection.
   */
  async insertSessionBefore(request: WorkspaceInsertSessionBeforeRequest): Promise<WorkspaceValue> {
    const workspace = this.requireWorkspace(request.workspaceId)
    try {
      await workspace.insertSessionBefore(request.sessionId, request.beforeSessionId)
    } catch (error) {
      if (!(error instanceof WorkspaceMoveInvalidError)) throw error
      throw new RemoteError(
        'workspace/move-invalid',
        error.message,
        {
          workspaceId: request.workspaceId,
          sessionId: request.sessionId,
          ...request.beforeSessionId === undefined
            ? {}
            : { beforeSessionId: request.beforeSessionId },
        },
        { cause: error },
      )
    }
    return { workspace: workspaceView(workspace) }
  }

  /**
   * Add one known Session to the registry-global archive set. Without
   * `stopActivity` a Session with running work is refused as
   * `workspace/session-active` with the activity the registry's providers
   * reported; with it, the providers stop that work first.
   * @param request - Session identity to archive and whether to stop its work.
   * @returns the complete resulting archive set.
   */
  async archiveSession(request: WorkspaceArchiveSessionRequest): Promise<WorkspaceArchiveValue> {
    try {
      await this.ctx.workspaceRegistry.archiveSession(
        request.sessionId,
        request.stopActivity === true ? { stopActivity: true } : {},
      )
    } catch (error) {
      if (error instanceof WorkspaceUnknownSessionError) {
        throw new RemoteError('session/not-found', error.message, { sessionId: request.sessionId }, { cause: error })
      }
      if (error instanceof WorkspaceActiveSessionError) {
        throw new RemoteError(
          'workspace/session-active',
          error.message,
          { sessionId: request.sessionId, activity: error.activity },
          { cause: error },
        )
      }
      throw error
    }
    return { archivedSessionIds: [...this.ctx.workspaceRegistry.archivedSessionIds] }
  }

  /**
   * Drop one Session from the registry-global archive set. An id that is not
   * archived is not an error: the call is idempotent, so a lost race with
   * another surface resolves as a no-op.
   * @param request - Session identity to unarchive.
   * @returns the complete resulting archive set.
   */
  async unarchiveSession(request: WorkspaceUnarchiveSessionRequest): Promise<WorkspaceArchiveValue> {
    await this.ctx.workspaceRegistry.unarchiveSession(request.sessionId)
    return { archivedSessionIds: [...this.ctx.workspaceRegistry.archivedSessionIds] }
  }

  /**
   * Add one known unarchived Session to the registry-global pin set.
   * @param request - Session identity to pin.
   * @returns the complete resulting pin set, most recently pinned first.
   */
  async pinSession(request: WorkspacePinSessionRequest): Promise<WorkspacePinValue> {
    try {
      await this.ctx.workspaceRegistry.pinSession(request.sessionId)
    } catch (error) {
      if (error instanceof WorkspaceUnknownSessionError) {
        throw new RemoteError('session/not-found', error.message, { sessionId: request.sessionId }, { cause: error })
      }
      if (error instanceof WorkspaceArchivedSessionPinError) {
        throw new RemoteError('gateway/bad-request', error.message, {}, { cause: error })
      }
      throw error
    }
    return { pinnedSessionIds: [...this.ctx.workspaceRegistry.pinnedSessionIds] }
  }

  /**
   * Drop one Session from the registry-global pin set. An id that is not
   * pinned is not an error: the call is idempotent, so a lost race with
   * another surface resolves as a no-op.
   * @param request - Session identity to unpin.
   * @returns the complete resulting pin set, most recently pinned first.
   */
  async unpinSession(request: WorkspaceUnpinSessionRequest): Promise<WorkspacePinValue> {
    await this.ctx.workspaceRegistry.unpinSession(request.sessionId)
    return { pinnedSessionIds: [...this.ctx.workspaceRegistry.pinnedSessionIds] }
  }

  private requireWorkspace(workspaceId: WorkspaceId): Workspace {
    const workspace = this.ctx.workspaceRegistry.get(WorkspaceId(workspaceId))
    if (workspace === undefined) throw workspaceNotFound(workspaceId)
    return workspace
  }

  private enqueue<T>(operation: () => Promise<T>): Promise<T> {
    const result = this.operationTail.then(operation)
    this.operationTail = result.then(() => undefined, () => undefined)
    return result
  }
}

function workspaceNotFound(workspaceId: WorkspaceId): RemoteError<'workspace/not-found'> {
  return new RemoteError(
    'workspace/not-found',
    `Workspace "${workspaceId}" not found`,
    { workspaceId },
  )
}

/** Display title for a newly adopted device. */
function deviceTitle(target: WorkspaceTarget): string {
  return target.vendor === undefined || target.vendor === '' ? target.name : `${target.name} (${target.vendor})`
}

/** Whether two targets carry the same inventory facts, ignoring object identity. */
function sameTarget(left: WorkspaceTarget | undefined, right: WorkspaceTarget): boolean {
  return left !== undefined
    && left.deviceId === right.deviceId
    && left.name === right.name
    && left.vendor === right.vendor
    && left.driverType === right.driverType
    && left.host === right.host
    && left.port === right.port
    && left.sshPort === right.sshPort
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}
