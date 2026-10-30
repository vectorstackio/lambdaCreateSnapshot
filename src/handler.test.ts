import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest'

const { send, command } = vi.hoisted(() => ({
  send: vi.fn(),
  command: vi.fn()
}))

vi.mock('@aws-sdk/client-ec2', () => ({
  EC2Client: class { send = send },
  CreateSnapshotCommand: class {
    constructor(input: unknown) { command(input) }
  }
}))

import { handler } from './handler'

describe('create snapshot handler', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.spyOn(console, 'error').mockImplementation(() => {})
  })

  afterEach(() => vi.restoreAllMocks())

  it('creates a snapshot and returns its ID and state', async () => {
    send.mockResolvedValue({ SnapshotId: 'snap-123', State: 'pending', extra: 'ignored' })
    expect(await handler({ body: JSON.stringify({ volumeId: 'vol-123', extra: true }) })).toEqual({
      statusCode: 200,
      body: JSON.stringify({ snapshotId: 'snap-123', state: 'pending' })
    })
    expect(command).toHaveBeenCalledExactlyOnceWith({
      VolumeId: 'vol-123',
      Description: 'Created by AI Cloud Operations Copilot'
    })
    expect(send).toHaveBeenCalledTimes(1)
    expect(console.error).not.toHaveBeenCalled()
  })

  it('handles an AWS response without optional fields', async () => {
    send.mockResolvedValue({})
    expect(await handler({ body: '{"volumeId":"vol-1"}' })).toEqual({ statusCode: 200, body: '{}' })
  })

  it.each([{}, { volumeId: '' }, { volumeId: null }, { volumeId: false }, { volumeId: 0 }])(
    'rejects a missing or falsy volumeId: %j', async body => {
      expect(await handler({ body: JSON.stringify(body) })).toEqual({
        statusCode: 400, body: JSON.stringify({ error: 'volumeId is required' })
      })
      expect(send).not.toHaveBeenCalled()
      expect(command).not.toHaveBeenCalled()
      expect(console.error).not.toHaveBeenCalled()
    }
  )

  it.each(['', '{bad json', 'null'])('handles invalid body %j', async body => {
    expect(await handler({ body })).toEqual({
      statusCode: 500, body: JSON.stringify({ error: 'Internal server error in createSnapshotLambda' })
    })
    expect(send).not.toHaveBeenCalled()
    expect(console.error).toHaveBeenCalledTimes(1)
  })

  it('returns a generic error when EC2 rejects the request', async () => {
    send.mockRejectedValue(new Error('EC2 unavailable'))
    expect(await handler({ body: '{"volumeId":"vol-1"}' })).toEqual({
      statusCode: 500, body: JSON.stringify({ error: 'Internal server error in createSnapshotLambda' })
    })
    expect(send).toHaveBeenCalledTimes(1)
    expect(console.error).toHaveBeenCalledTimes(1)
  })

  it('does not log sensitive request data on success', async () => {
    send.mockResolvedValue({ SnapshotId: 'snap-1', State: 'completed' })
    await handler({ body: JSON.stringify({ volumeId: 'vol-1', token: 'secret-token' }) })
    expect(console.error).not.toHaveBeenCalled()
  })

  it('does not log sensitive information contained in an AWS error', async () => {
    send.mockRejectedValue(new Error('credential=secret-token'))
    await handler({ body: '{"volumeId":"vol-1"}' })
    expect(console.error).toHaveBeenCalledExactlyOnceWith('Error in createSnapshotLambda')
  })
})
