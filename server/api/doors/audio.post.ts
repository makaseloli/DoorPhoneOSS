import { createError, readMultipartFormData } from 'h3'
import { mkdir, writeFile } from 'node:fs/promises'
import { join } from 'node:path'

export default defineEventHandler(async (event) => {
    const form = await readMultipartFormData(event)

    if (!form || form.length === 0) {
        throw createError({
            statusCode: 400,
            statusMessage: 'Audio payload is required'
        })
    }

    const audioEntry = form.find((entry) => entry.name === 'audio' && entry.type === 'audio/webm;codecs=opus')

    if (!audioEntry?.data) {
        throw createError({
            statusCode: 400,
            statusMessage: 'Audio file is required'
        })
    }

    if (!audioEntry.filename) {
        throw createError({
            statusCode: 400,
            statusMessage: 'Filename is required'
        })
    }

    const recordingsDir = join(process.cwd(), 'public', 'temp')
    await mkdir(recordingsDir, { recursive: true })

    const filename = audioEntry.filename
    const filePath = join(recordingsDir, filename)
    await writeFile(filePath, audioEntry.data)

    return {
        ok: true,
        file: `/temp/${filename}`
    }
})
