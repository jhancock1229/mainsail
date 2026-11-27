import Vue from 'vue'
import axios, { InternalAxiosRequestConfig } from 'axios'
import i18n from '@/plugins/i18n'
import {
    buildKioskMacros,
    classifyHttpRequest,
    classifyRequest,
    combinedActionRule,
    KioskAction,
    KioskMacros,
    KioskSettings,
} from '@/plugins/kiosk'
import {
    grantedKioskActions,
    KioskGrantSource,
    kioskModeFor,
    KioskPinReason,
    KioskPinRefusal,
    requestKioskPin,
    setKioskGrant,
} from '@/plugins/kioskSession'

interface GuardStore {
    getters: Record<string, unknown>
    state: unknown
}

interface PrinterConfigState {
    printer?: { configfile?: { config?: unknown } }
}

interface GuardSocket {
    setRequestGuard(guard: (method: string, params: unknown) => true | Promise<boolean>): void
}

let guardStore: GuardStore | null = null
let macroSource: unknown = null
let macroCache: KioskMacros = buildKioskMacros(null)

const kioskSettings = (): KioskSettings | null => {
    return (guardStore?.getters['gui/getKioskSettings'] as KioskSettings | undefined) ?? null
}

const kioskMacros = (): KioskMacros => {
    const state = guardStore?.state as PrinterConfigState | undefined
    const config = state?.printer?.configfile?.config ?? null
    if (config !== macroSource) {
        macroSource = config
        macroCache = buildKioskMacros(config)
    }

    return macroCache
}

export const notifyKioskBlocked = (action: KioskAction): void => {
    const name = i18n.t(`Kiosk.Actions.${action}`).toString()
    Vue.$toast.error(i18n.t('Kiosk.Blocked', { action: name }).toString())
}

const notifyRefused = (why: KioskPinRefusal): void => {
    Vue.$toast.error(i18n.t(`Kiosk.Refused.${why}`).toString())
}

export const askKioskPin = (reason: KioskPinReason): Promise<boolean> => requestKioskPin(reason, notifyRefused)

export const authorizeKiosk = (actions: KioskAction[], grantAs?: KioskGrantSource): true | Promise<boolean> => {
    const settings = kioskSettings()
    if (settings === null || actions.length === 0 || !kioskModeFor(settings).active) return true

    const verdict = combinedActionRule(actions, settings, grantedKioskActions())
    if (verdict.rule === 'allow' || verdict.action === null) return true
    if (verdict.rule === 'block') {
        notifyKioskBlocked(verdict.action)
        return Promise.resolve(false)
    }

    const action = verdict.action

    return requestKioskPin(action, notifyRefused).then((allowed) => {
        if (allowed && grantAs !== undefined) setKioskGrant(grantAs, action)

        return allowed
    })
}

export const guardKioskRequest = (method: string, params: unknown): true | Promise<boolean> => {
    return authorizeKiosk(classifyRequest(method, params, kioskMacros()))
}

const requestFields = (config: InternalAxiosRequestConfig, url: URL): Record<string, unknown> => {
    const fields: Record<string, unknown> = {}
    url.searchParams.forEach((value, key) => (fields[key] = value))
    if (typeof config.params === 'object' && config.params !== null) Object.assign(fields, config.params)

    if (config.data instanceof FormData) {
        config.data.forEach((value, key) => {
            if (typeof value === 'string') fields[key] = value
        })
    } else if (typeof config.data === 'object' && config.data !== null) {
        Object.assign(fields, config.data)
    }

    return fields
}

const guardHttpRequest = async (config: InternalAxiosRequestConfig): Promise<InternalAxiosRequestConfig> => {
    const url = new URL(config.url ?? '', window.location.href)
    const actions = classifyHttpRequest(config.method ?? 'get', url.pathname, requestFields(config, url), kioskMacros())
    if (await authorizeKiosk(actions)) return config

    throw new axios.CanceledError('not permitted in touch mode')
}

export const installKioskGuards = (store: GuardStore, socket: GuardSocket): void => {
    guardStore = store
    socket.setRequestGuard(guardKioskRequest)
    axios.interceptors.request.use(guardHttpRequest)
}
