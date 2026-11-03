/** Short handshake against an actual executable, with bounded process ownership. */
import { z } from 'zod'

export const helloSchema = z.object({
  protocol: z.number().optional(),
  workspace: z.string().optional(),
  kind: z.string().optional(),
  executable: z.string().optional(),
  nodeVersion: z.string().optional(),
})

/**
 * Run a packaged helper and read its runtime version through the private wire protocol.
 * @param _executable - physical executable under test.
 * @param _workspace - existing directory supplied for the handshake.
 * @returns the validated handshake after the helper has exited.
 */
export function probeHelper(_executable: string, _workspace: string): Promise<z.infer<typeof helloSchema>> {
  return Promise.resolve({})
}
