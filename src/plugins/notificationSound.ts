import { getSoundPattern } from '@/plugins/notificationRules'
import type { PrinterEventSeverity } from '@/plugins/printerEvents'

const VOLUME = 0.12
const SILENCE = 0.0001
const ATTACK_SECONDS = 0.02
const RESUME_TIMEOUT_MS = 500

type AudioContextConstructor = typeof AudioContext

let audioContext: AudioContext | null = null

// tones scheduled on a suspended context all play at once when the browser starts it later
const isRunning = (context: AudioContext): boolean => context.state === 'running'

const ensureRunning = async (context: AudioContext): Promise<boolean> => {
    if (isRunning(context)) return true

    try {
        // resume() can stay pending until the user interacts with the page
        const timeout = new Promise<void>((resolve) => setTimeout(resolve, RESUME_TIMEOUT_MS))
        await Promise.race([context.resume(), timeout])
    } catch {
        return false
    }

    return isRunning(context)
}

export const playSoundOn = async (context: AudioContext, severity: PrinterEventSeverity): Promise<boolean> => {
    if (!(await ensureRunning(context))) return false

    getSoundPattern(severity).forEach((note) => {
        const start = context.currentTime + note.start
        const end = start + note.duration
        const oscillator = context.createOscillator()
        const gain = context.createGain()

        oscillator.type = 'sine'
        oscillator.frequency.value = note.frequency
        gain.gain.setValueAtTime(SILENCE, start)
        gain.gain.exponentialRampToValueAtTime(VOLUME, start + ATTACK_SECONDS)
        gain.gain.exponentialRampToValueAtTime(SILENCE, end)

        oscillator.connect(gain)
        gain.connect(context.destination)
        oscillator.start(start)
        oscillator.stop(end)
    })

    return true
}

export const playNotificationSound = async (severity: PrinterEventSeverity): Promise<boolean> => {
    try {
        const AudioContextClass: AudioContextConstructor | undefined =
            window.AudioContext ??
            (window as unknown as { webkitAudioContext?: AudioContextConstructor }).webkitAudioContext
        if (AudioContextClass === undefined) return false

        audioContext = audioContext ?? new AudioContextClass()

        return await playSoundOn(audioContext, severity)
    } catch {
        return false
    }
}
