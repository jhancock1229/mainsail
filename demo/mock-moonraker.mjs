// Mock Moonraker with a simulated printer, for trying UI changes without hardware.
//
// It answers Mainsail's startup requests from a recorded session (fixture.json) and simulates the parts that
// change: Klipper state, print jobs, temperatures, toolhead position and a webcam picture.
// Start it with `demo/demo.sh up`. Control it with `demo/demo.sh <print|pause|resume|finish|fail|error|runout|idle>`.
import fs from 'node:fs'
import http from 'node:http'
import path from 'node:path'
import process from 'node:process'
import { WebSocketServer } from 'ws'

const PORT = Number(process.env.DEMO_PORT ?? 7125)
const DIR = import.meta.dirname
// DEMO_DB_FILE=none keeps the settings in memory only (used by the automated tests)
const DB_FILE = process.env.DEMO_DB_FILE ?? path.join(DIR, '.demo-db.json')
const fixture = JSON.parse(fs.readFileSync(path.join(DIR, 'fixture.json'), 'utf8'))

const AMBIENT = 22
const RUNOUT_SENSOR = 'filament_motion_sensor runout_sensor'
const PRINT_SECONDS = 600
const TOTAL_LAYERS = 120
const DEMO_FILE = 'demo.gcode'
const clone = (value) => JSON.parse(JSON.stringify(value))
const startedAt = Date.now()
const eventtime = () => (Date.now() - startedAt) / 1000

// ---------------------------------------------------------------------------------------------------------
// simulated printer
// ---------------------------------------------------------------------------------------------------------

let status = clone(fixture.status)
let klippyState = 'ready'
let printElapsed = 0
let lastSent = {}

const resetStatus = () => {
    status = clone(fixture.status)
    status.extruder.temperature = AMBIENT
    status.heater_bed.temperature = AMBIENT
    status[RUNOUT_SENSOR].filament_detected = true
    printElapsed = 0
}
resetStatus()

const setKlippyState = (state, message) => {
    klippyState = state
    status.webhooks.state = state
    status.webhooks.state_message = message
}

const gcodeStore = []
const gcodeResponse = (message) => {
    gcodeStore.push({ message, time: Date.now() / 1000, type: 'response' })
    broadcast('notify_gcode_response', [message])
}

const startPrint = (filename = DEMO_FILE) => {
    if (klippyState !== 'ready') throw new Error('Klipper is not ready')

    printElapsed = 0
    status.toolhead.homed_axes = 'xyz'
    status.extruder.target = 210
    status.heater_bed.target = 60
    status.fan.speed = 0.8
    Object.assign(status.print_stats, {
        filename,
        state: 'printing',
        message: '',
        total_duration: 0,
        print_duration: 0,
        filament_used: 0,
        info: { total_layer: TOTAL_LAYERS, current_layer: 0 },
    })
    Object.assign(status.virtual_sdcard, {
        file_path: `/home/printer/printer_data/gcodes/${filename}`,
        is_active: true,
        progress: 0,
        file_position: 0,
        file_size: 1500000,
    })
    status.pause_resume.is_paused = false
    status.idle_timeout.state = 'Printing'
    status[RUNOUT_SENSOR].filament_detected = true
    gcodeResponse(`File opened: ${filename}`)
}

const pausePrint = () => {
    if (status.print_stats.state !== 'printing') return

    status.print_stats.state = 'paused'
    status.pause_resume.is_paused = true
    status.virtual_sdcard.is_active = false
    status.motion_report.live_velocity = 0
}

const resumePrint = () => {
    if (status.print_stats.state !== 'paused') return

    status.print_stats.state = 'printing'
    status.pause_resume.is_paused = false
    status.virtual_sdcard.is_active = true
    // resuming after a runout means new filament was loaded
    status[RUNOUT_SENSOR].filament_detected = true
}

const endPrint = (state, message = '') => {
    if (!['printing', 'paused'].includes(status.print_stats.state)) return

    status.print_stats.state = state
    status.print_stats.message = message
    status.pause_resume.is_paused = false
    status.virtual_sdcard.is_active = false
    status.extruder.target = 0
    status.heater_bed.target = 0
    status.fan.speed = 0
    status.motion_report.live_velocity = 0
    status.idle_timeout.state = 'Ready'
    if (message) gcodeResponse(`!! ${message}`)
}

const emergencyStop = () => {
    if (klippyState === 'shutdown') return

    if (['printing', 'paused'].includes(status.print_stats.state)) endPrint('error', 'Shutdown due to webhooks request')
    status.extruder.target = 0
    status.heater_bed.target = 0
    setKlippyState(
        'shutdown',
        'Shutdown due to webhooks request\nOnce the underlying issue is corrected, use the\n"FIRMWARE_RESTART" command to reset the firmware, reload the\nconfig, and restart the host software.\nPrinter is shutdown\n'
    )
    broadcast('notify_klippy_shutdown', [])
    gcodeResponse('!! Shutdown due to webhooks request')
}

// ---------------------------------------------------------------------------------------------------------
// named errors and filament runout: demo/demo.sh error <name>, demo/demo.sh fail <name>, demo/demo.sh runout
// ---------------------------------------------------------------------------------------------------------

const FIRMWARE_RESTART_HINT =
    'Once the underlying issue is corrected, use the\n"FIRMWARE_RESTART" command to reset the firmware, reload the\nconfig, and restart the host software.\n'
const RESTART_HINT =
    'Once the underlying issue is corrected, use the "RESTART"\ncommand to reload the config and restart the host software.\n'

// messages as Klipper reports them; "error" states happen while Klipper starts, "shutdown" states while it runs
const klipperErrors = {
    'timer-too-close': {
        state: 'shutdown',
        message: `MCU 'mcu' shutdown: Timer too close\nThis often indicates the host computer is overloaded. Check\nfor other processes consuming excessive CPU time, high swap\nusage, disk errors, overheating, unstable voltage, or\nsimilar system problems on the host computer.\n${FIRMWARE_RESTART_HINT}Printer is shutdown\n`,
    },
    'lost-communication': {
        state: 'shutdown',
        message: `Lost communication with MCU 'mcu'\n${FIRMWARE_RESTART_HINT}Printer is shutdown\n`,
    },
    thermistor: {
        state: 'shutdown',
        message: `MCU 'mcu' shutdown: ADC out of range\nThis generally occurs when a heater temperature exceeds\nits configured min_temp or max_temp.\n${FIRMWARE_RESTART_HINT}Printer is shutdown\n`,
    },
    heater: {
        state: 'shutdown',
        message: `Heater extruder not heating at expected rate\nSee the 'verify_heater' section in docs/Config_Reference.md\nfor the parameters that control this check.\n${FIRMWARE_RESTART_HINT}Printer is shutdown\n`,
    },
    unknown: {
        state: 'shutdown',
        message: `MCU 'mcu' shutdown: Stepper too far in past\n${FIRMWARE_RESTART_HINT}Printer is shutdown\n`,
    },
    'mcu-connect': {
        state: 'error',
        message: `mcu 'mcu': Unable to connect\n${FIRMWARE_RESTART_HINT}Error configuring printer\n`,
    },
    config: {
        state: 'error',
        message: `Option 'sensor_type' in section 'extruder' must be specified\n${RESTART_HINT}Printer is halted\n`,
    },
}

const printErrors = {
    heater: 'Heater extruder not heating at expected rate',
    'move-out-of-range': 'Move out of range: 310.000 110.000 0.200 [25.000]',
    'must-home': 'Must home axis first: 110.000 110.000 0.200 [0.000]',
    'cold-extrude': "Extrude below minimum temp\nSee the 'min_extrude_temp' config option for details",
    unknown: 'Unable to read tool 3 offsets',
}

const pick = (errors, name) => {
    if (!(name in errors)) throw new Error(`Unknown error "${name}". Known errors: ${Object.keys(errors).join(', ')}`)

    return errors[name]
}

const failPrint = (name = 'heater') => endPrint('error', pick(printErrors, name))

const klipperError = (name) => {
    const { state, message } = pick(klipperErrors, name)
    if (klippyState !== 'ready') throw new Error('Klipper is not ready')

    const firstLine = message.split('\n')[0]
    if (state === 'shutdown') {
        endPrint('error', firstLine)
        status.extruder.target = 0
        status.heater_bed.target = 0
        setKlippyState('shutdown', message)
        broadcast('notify_klippy_shutdown', [])
        gcodeResponse(`!! ${firstLine}`)
        return
    }

    // Klipper restarts and then stops with the error while it reads its config
    setKlippyState('startup', 'Printer is not ready')
    broadcast('notify_klippy_disconnected', [])
    setTimeout(() => {
        // a reset in the meantime wins
        if (klippyState !== 'startup') return

        resetStatus()
        lastSent = {}
        setKlippyState('error', message)
    }, 1500)
}

// the sensor runs empty; like Klipper, a running print gets paused
const filamentRunout = () => {
    status[RUNOUT_SENSOR].filament_detected = false
    if (status.print_stats.state !== 'printing') return

    gcodeResponse('// Filament runout detected')
    pausePrint()
}

const DEMO_PRINTER_CFG = `# printer.cfg of the simulated printer (demo/mock-moonraker.mjs)
[mcu]
serial: /dev/serial/by-id/usb-Klipper_demo

[extruder]
sensor_type: EPCOS 100K B57560G104F
min_temp: 0
max_temp: 250

[stepper_x]
position_min: 0
position_max: 220
`

const restartKlipper = () => {
    setKlippyState('startup', 'Printer is not ready')
    broadcast('notify_klippy_disconnected', [])
    setTimeout(() => {
        resetStatus()
        lastSent = {}
        setKlippyState('ready', 'Printer is ready')
        broadcast('notify_klippy_ready', [])
    }, 1500)
}

const setIdle = () => {
    if (klippyState !== 'ready') return restartKlipper()

    endPrint('cancelled')
    Object.assign(status.print_stats, { state: 'standby', filename: '', message: '' })
    status.display_status.message = null
}

const approach = (heater, seconds) => {
    const goal = heater.target > 0 ? heater.target : AMBIENT
    const rate = heater.target > 0 ? 0.12 : 0.03
    heater.temperature += (goal - heater.temperature) * (1 - Math.exp(-rate * seconds)) + (Math.random() - 0.5) * 0.2
    heater.temperature = Math.round(heater.temperature * 100) / 100
    heater.power = heater.target > 0 ? Math.min(1, Math.max(0, (heater.target - heater.temperature) / 15 + 0.3)) : 0
}

// the toolhead traces a square that shrinks and grows, one lap per layer
const toolheadPosition = (elapsed) => {
    const layerTime = PRINT_SECONDS / TOTAL_LAYERS
    const layer = Math.min(TOTAL_LAYERS, Math.floor(elapsed / layerTime) + 1)
    const lap = (elapsed % layerTime) / layerTime
    const half = 40 + 20 * Math.sin(layer / 6)
    const side = Math.floor(lap * 4)
    const along = (lap * 4 - side) * 2 * half - half
    const points = [
        [along, -half],
        [half, along],
        [-along, half],
        [-half, -along],
    ]
    const [x, y] = points[side]

    return { layer, position: [110 + x, 110 + y, layer * 0.2] }
}

const tick = (seconds) => {
    status.system_stats.cputime += seconds * 0.02
    status.toolhead.estimated_print_time += seconds
    if (klippyState !== 'ready') return

    approach(status.extruder, seconds)
    approach(status.heater_bed, seconds)
    status.extruder.can_extrude = status.extruder.temperature >= 170

    if (['printing', 'paused'].includes(status.print_stats.state)) status.print_stats.total_duration += seconds
    if (status.print_stats.state !== 'printing') return

    printElapsed += seconds
    const progress = Math.min(1, printElapsed / PRINT_SECONDS)
    const { layer, position } = toolheadPosition(printElapsed)
    const e = Math.round(printElapsed * 2.5 * 100) / 100
    const xyz = position.map((value) => Math.round(value * 1000) / 1000)

    status.print_stats.print_duration = printElapsed
    status.print_stats.filament_used = e
    status.print_stats.info.current_layer = layer
    status.virtual_sdcard.progress = progress
    status.virtual_sdcard.file_position = Math.round(progress * status.virtual_sdcard.file_size)
    status.display_status.progress = progress
    status.display_status.message = `Layer ${layer}/${TOTAL_LAYERS}`
    status.toolhead.position = [...xyz, e]
    status.gcode_move.position = [...xyz, e]
    status.gcode_move.gcode_position = [...xyz, e]
    status.gcode_move.speed = 3600
    status.motion_report.live_position = [...xyz, e]
    status.motion_report.live_velocity = 60
    status.motion_report.live_extruder_velocity = 2.5

    if (progress >= 1) {
        endPrint('complete')
        gcodeResponse('Done printing file')
    }
}

const runGcode = (script) => {
    for (const line of script.split('\n')) {
        const [command, ...args] = line.trim().split(/\s+/)
        const param = (name) => {
            const arg = args.find((entry) => entry.toUpperCase().startsWith(name))
            return arg === undefined ? undefined : arg.slice(name.length).replace(/^=/, '')
        }

        switch (command.toUpperCase()) {
            case 'M112':
                emergencyStop()
                break
            case 'FIRMWARE_RESTART':
            case 'RESTART':
                restartKlipper()
                break
            case 'PAUSE':
                pausePrint()
                break
            case 'RESUME':
                resumePrint()
                break
            case 'CANCEL_PRINT':
                endPrint('cancelled')
                break
            case 'SDCARD_PRINT_FILE':
                startPrint(param('FILENAME') ?? DEMO_FILE)
                break
            case 'M104':
            case 'M109':
                status.extruder.target = Number(param('S') ?? 0)
                break
            case 'M140':
            case 'M190':
                status.heater_bed.target = Number(param('S') ?? 0)
                break
            case 'SET_HEATER_TEMPERATURE': {
                const heater = status[param('HEATER') ?? '']
                if (heater) heater.target = Number(param('TARGET') ?? 0)
                break
            }
            case 'TURN_OFF_HEATERS':
                status.extruder.target = 0
                status.heater_bed.target = 0
                break
            case 'M106':
                status.fan.speed = Math.min(1, Number(param('S') ?? 255) / 255)
                break
            case 'M107':
                status.fan.speed = 0
                break
            case 'M117':
                status.display_status.message = args.join(' ') || null
                break
            case 'G28':
                status.toolhead.homed_axes = 'xyz'
                break
            case 'M84':
                status.toolhead.homed_axes = ''
                break
        }
    }
}

// ---------------------------------------------------------------------------------------------------------
// database (Mainsail settings), kept across restarts of the mock
// ---------------------------------------------------------------------------------------------------------

const emptyDatabase = () => ({ mainsail: { initVersion: '2.19.0' }, maintenance: {} })
let database = emptyDatabase()
try {
    if (DB_FILE !== 'none') database = JSON.parse(fs.readFileSync(DB_FILE, 'utf8'))
} catch {
    // start with an empty database
}

const dbGet = (namespace, key) => {
    let value = database[namespace]
    for (const part of key ? String(key).split('.') : []) value = value?.[part]

    return value
}

const dbSet = (namespace, key, value) => {
    const parts = String(key).split('.')
    let target = (database[namespace] ??= {})
    for (const part of parts.slice(0, -1)) {
        if (typeof target[part] !== 'object' || target[part] === null || Array.isArray(target[part])) target[part] = {}
        target = target[part]
    }
    if (value === undefined) delete target[parts.at(-1)]
    else target[parts.at(-1)] = value
    if (DB_FILE !== 'none') fs.writeFileSync(DB_FILE, JSON.stringify(database, null, 2))
}

// ---------------------------------------------------------------------------------------------------------
// JSON-RPC
// ---------------------------------------------------------------------------------------------------------

const rpcError = (code, message) => Object.assign(new Error(message), { code })

const queryObjects = (objects = {}) => {
    const result = {}
    for (const [name, fields] of Object.entries(objects)) {
        if (!(name in status)) continue

        result[name] = clone(status[name])
        if (Array.isArray(fields)) {
            result[name] = Object.fromEntries(fields.filter((f) => f in status[name]).map((f) => [f, result[name][f]]))
        }
    }

    return { eventtime: eventtime(), status: result }
}

const recorded = (method, params) => {
    const exact = fixture.responses[`${method}|${JSON.stringify(params ?? {})}`]
    if (exact !== undefined) return clone(exact)

    const sameMethod = Object.keys(fixture.responses).find((key) => key.startsWith(`${method}|`))
    if (sameMethod !== undefined && !method.startsWith('server.files.')) return clone(fixture.responses[sameMethod])

    return undefined
}

const handlers = {
    'server.connection.identify': () => ({ connection_id: 1 }),
    'server.info': () => ({
        ...recorded('server.info', {}),
        klippy_connected: klippyState !== 'startup',
        klippy_state: klippyState,
    }),
    'printer.info': () => ({
        ...recorded('printer.info', {}),
        hostname: 'demo-printer',
        state: klippyState,
        state_message: status.webhooks.state_message,
    }),
    'server.gcode_store': () => ({ gcode_store: gcodeStore.slice(-100) }),
    'printer.objects.query': (params) => queryObjects(params.objects),
    'printer.objects.subscribe': (params) => queryObjects(params.objects),
    'printer.gcode.script': (params) => {
        runGcode(params.script ?? '')
        return 'ok'
    },
    'printer.print.start': (params) => {
        startPrint(params.filename)
        return 'ok'
    },
    'printer.print.pause': () => (pausePrint(), 'ok'),
    'printer.print.resume': () => (resumePrint(), 'ok'),
    'printer.print.cancel': () => (endPrint('cancelled'), 'ok'),
    'printer.emergency_stop': () => (emergencyStop(), 'ok'),
    'printer.firmware_restart': () => (restartKlipper(), 'ok'),
    'printer.restart': () => (restartKlipper(), 'ok'),
    'server.database.get_item': (params) => {
        const value = dbGet(params.namespace, params.key)
        if (value === undefined) throw rpcError(404, `Key '${params.key}' in namespace '${params.namespace}' not found`)

        return { namespace: params.namespace, key: params.key ?? null, value: clone(value) }
    },
    'server.database.post_item': (params) => {
        dbSet(params.namespace, params.key, params.value)
        return { namespace: params.namespace, key: params.key, value: params.value }
    },
    'server.database.delete_item': (params) => {
        const value = dbGet(params.namespace, params.key)
        dbSet(params.namespace, params.key, undefined)
        return { namespace: params.namespace, key: params.key, value }
    },
    'server.webcams.list': () => ({
        webcams: [
            {
                name: 'demo',
                enabled: true,
                icon: 'mdiWebcam',
                aspect_ratio: '4:3',
                target_fps: 5,
                target_fps_idle: 2,
                location: 'printer',
                service: 'mjpegstreamer-adaptive',
                stream_url: `http://localhost:${PORT}/demo/webcam.svg`,
                snapshot_url: `http://localhost:${PORT}/demo/webcam.svg`,
                flip_horizontal: false,
                flip_vertical: false,
                rotation: 0,
                source: 'database',
                extra_data: {},
                uid: 'demo-webcam',
            },
        ],
    }),
    'server.files.metadata': (params) => ({
        filename: params.filename,
        size: 1500000,
        modified: Date.now() / 1000 - 3600,
        slicer: 'DemoSlicer',
        slicer_version: '1.0',
        layer_count: TOTAL_LAYERS,
        layer_height: 0.2,
        first_layer_height: 0.2,
        object_height: TOTAL_LAYERS * 0.2,
        filament_total: PRINT_SECONDS * 2.5,
        filament_weight_total: 4.5,
        estimated_time: PRINT_SECONDS,
        nozzle_diameter: 0.4,
        first_layer_extr_temp: 210,
        first_layer_bed_temp: 60,
        gcode_start_byte: 0,
        gcode_end_byte: 1500000,
    }),
}

const handleRpc = (request) => {
    const params = request.params ?? {}
    const handler = handlers[request.method]
    if (handler) return handler(params)

    const result = recorded(request.method, params)
    if (result !== undefined) return result

    throw rpcError(-32601, 'Method not found')
}

// ---------------------------------------------------------------------------------------------------------
// servers
// ---------------------------------------------------------------------------------------------------------

const webcamSvg = () => {
    const [x, y, z] = status.toolhead.position
    const printing = status.print_stats.state === 'printing'
    const label =
        klippyState !== 'ready'
            ? klippyState.toUpperCase()
            : `${status.print_stats.state.toUpperCase()}  Z ${z.toFixed(1)}`
    const height = Math.min(180, z * 7.5)

    return `<svg xmlns="http://www.w3.org/2000/svg" width="640" height="480" viewBox="0 0 640 480">
<rect width="640" height="480" fill="#15181c"/>
<rect x="110" y="400" width="420" height="14" rx="3" fill="#3a4048"/>
<rect x="230" y="${400 - height}" width="180" height="${height}" fill="#d9822b"/>
<rect x="${105 + x * 1.9}" y="${352 - height}" width="34" height="30" rx="4" fill="#9aa4b1"/>
<polygon points="${113 + x * 1.9},${382 - height} ${131 + x * 1.9},${382 - height} ${122 + x * 1.9},${398 - height}" fill="${printing ? '#ff7043' : '#6b7480'}"/>
<text x="20" y="34" font-family="monospace" font-size="20" fill="#cfd8dc">DEMO CAM  ${label}</text>
<text x="20" y="462" font-family="monospace" font-size="16" fill="#78909c">X ${x.toFixed(1)}  Y ${y.toFixed(1)}  ${new Date().toLocaleTimeString()}</text>
</svg>`
}

const controls = {
    print: () => startPrint(),
    pause: pausePrint,
    resume: resumePrint,
    fail: failPrint,
    error: (name) => (name === undefined ? emergencyStop() : klipperError(name)),
    runout: filamentRunout,
    finish: () => endPrint('complete'),
    idle: setIdle,
    // back to a freshly started printer with default settings
    reset: () => {
        resetStatus()
        lastSent = {}
        gcodeStore.length = 0
        setKlippyState('ready', 'Printer is ready')
        database = emptyDatabase()
        if (DB_FILE !== 'none') fs.writeFileSync(DB_FILE, JSON.stringify(database, null, 2))
    },
    status: () => {},
}

const server = http.createServer((req, res) => {
    const url = new URL(req.url, `http://localhost:${PORT}`)
    const headers = {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': '*',
        'Cache-Control': 'no-store',
    }

    if (url.pathname === '/demo/webcam.svg') {
        res.writeHead(200, { ...headers, 'Content-Type': 'image/svg+xml' })
        return res.end(webcamSvg())
    }

    if (url.pathname === '/server/files/config/printer.cfg') {
        res.writeHead(200, { ...headers, 'Content-Type': 'text/plain' })
        return res.end(DEMO_PRINTER_CFG)
    }

    if (url.pathname === '/server/database/list') {
        res.writeHead(200, { ...headers, 'Content-Type': 'application/json' })
        return res.end(JSON.stringify({ result: { namespaces: Object.keys(database), backups: [] } }))
    }

    if (url.pathname === '/server/database/item' && req.method === 'GET') {
        const namespace = url.searchParams.get('namespace')
        const key = url.searchParams.get('key')
        const value = dbGet(namespace, key)
        res.writeHead(value === undefined ? 404 : 200, { ...headers, 'Content-Type': 'application/json' })
        return res.end(
            JSON.stringify(value === undefined ? { error: { code: 404 } } : { result: { namespace, key, value } })
        )
    }

    // /demo/<command> or /demo/<command>/<name>, e.g. /demo/error/timer-too-close
    const [command, argument] = url.pathname.replace('/demo/', '').split('/')
    const control = Object.hasOwn(controls, command) ? controls[command] : undefined
    if (url.pathname.startsWith('/demo/') && control) {
        try {
            control(argument)
            res.writeHead(200, { ...headers, 'Content-Type': 'text/plain' })
            return res.end(`klipper: ${klippyState}  print: ${status.print_stats.state}\n`)
        } catch (error) {
            res.writeHead(409, { ...headers, 'Content-Type': 'text/plain' })
            return res.end(`${error.message}\n`)
        }
    }

    res.writeHead(req.method === 'OPTIONS' ? 204 : 404, headers)
    res.end()
})

const wss = new WebSocketServer({ server })

function broadcast(method, params) {
    const message = JSON.stringify({ jsonrpc: '2.0', method, params })
    wss.clients.forEach((client) => client.readyState === 1 && client.send(message))
}

wss.on('connection', (socket) => {
    socket.on('message', (data) => {
        let request
        try {
            request = JSON.parse(data.toString())
        } catch {
            return
        }

        const response = { jsonrpc: '2.0', id: request.id }
        try {
            response.result = handleRpc(request)
        } catch (error) {
            response.error = { code: error.code ?? 400, message: error.message }
        }
        if (request.id !== undefined) socket.send(JSON.stringify(response))
    })
})

// send only the fields that changed since the last update, like Moonraker does
const statusDiff = () => {
    const diff = {}
    for (const [name, object] of Object.entries(status)) {
        if (name === 'configfile') continue

        for (const [field, value] of Object.entries(object)) {
            const key = `${name}.${field}`
            const serialized = JSON.stringify(value)
            if (lastSent[key] === serialized) continue

            lastSent[key] = serialized
            ;(diff[name] ??= {})[field] = value
        }
    }

    return diff
}

statusDiff()
setInterval(() => {
    tick(0.5)
    const diff = statusDiff()
    if (Object.keys(diff).length) broadcast('notify_status_update', [clone(diff), eventtime()])
}, 500)

server.listen(PORT, () => console.log(`Mock Moonraker with simulated printer on http://localhost:${PORT}`))
