import { getSoundPattern } from '@/plugins/notificationRules'
import type { PrinterEventSeverity } from '@/plugins/printerEvents'

const VOLUME = 0.12
const SILENCE = 0.0001
const ATTACK_SECONDS = 0.02

type AudioContextConstructor = typeof AudioContext

let audioContext: AudioContext | null = null

// Plays a short synthesized sound, so no audio files are needed. Returns false when the browser cannot play it.
export const playNotificationSound = (severity: PrinterEventSeverity): boolean => {
    try {
        const AudioContextClass: AudioContextConstructor | undefined =
            window.AudioContext ??
            (window as unknown as { webkitAudioContext?: AudioContextConstructor }).webkitAudioContext
        if (AudioContextClass === undefined) return false

        audioContext = audioContext ?? new AudioContextClass()
        const context = audioContext
        // browsers suspend audio until the user interacted with the page
        if (context.state === 'suspended') void context.resume()

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
    } catch {
        return false
    }
}
