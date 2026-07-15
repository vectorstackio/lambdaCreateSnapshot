// handler.ts

import {
  EC2Client,
  CreateSnapshotCommand
} from '@aws-sdk/client-ec2'

type Event = {
  body: string
}

const client = new EC2Client({})

export async function handler(event: Event) {

  const body = JSON.parse(event.body)

  const {
    volumeId
  } = body

  if (!volumeId) {
    return {
      statusCode: 400,
      body: JSON.stringify({
        error: 'volumeId is required'
      })
    }
  }

  const result = await client.send(
    new CreateSnapshotCommand({
      VolumeId: volumeId,
      Description:
        'Created by AI Cloud Operations Copilot'
    })
  )

  return {
    statusCode: 200,
    body: JSON.stringify({
      snapshotId: result.SnapshotId,
      state: result.State
    })
  }
}