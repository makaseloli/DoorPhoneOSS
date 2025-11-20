export interface Door {
  id: number
  name: string
}

export interface DoorActionState {
  id: number
  state: boolean
  name?: string
}

export interface ReceivedRecording {
  from: Door['id']
  at: Door['id']
  fromName: string
  time: string
  cacheKey: string
}
