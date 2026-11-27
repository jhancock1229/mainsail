#!/usr/bin/env bash
# Simulated printer for trying UI changes without hardware.
#
#   demo/demo.sh up        start the simulated printer and Mainsail, then open http://localhost:8080
#   demo/demo.sh print     start a 10 minute demo print    -> printing state
#   demo/demo.sh quickprint  start a 90 second print with a 20 second warm-up
#   demo/demo.sh pause     pause the print                 -> printing state (paused)
#   demo/demo.sh resume    resume the print
#   demo/demo.sh finish    complete the print right away   -> idle state (print complete)
#   demo/demo.sh fail      make the print fail             -> error state (Klipper keeps running)
#   demo/demo.sh error     trigger an emergency stop       -> error state (Klipper shutdown)
#   demo/demo.sh fail <heater|move-out-of-range|must-home|cold-extrude|unknown>
#                          make the print fail with a specific message
#   demo/demo.sh error <timer-too-close|lost-communication|thermistor|heater|mcu-connect|config|unknown>
#                          stop Klipper with a specific error
#   demo/demo.sh runout    the filament sensor runs empty  -> a running print is paused
#   demo/demo.sh frame     take a timelapse frame          -> the print pauses for a moment
#   demo/demo.sh idle      cancel the print / recover      -> idle state
#   demo/demo.sh reconnect  drop the connection to Mainsail, which then reconnects
#   demo/demo.sh reset     fresh printer and default Mainsail settings
#   demo/demo.sh classic   switch Mainsail to the classic (stock) interface
#   demo/demo.sh spool     pretend a 1 kg spool of black PLA was loaded 12 days ago
#   demo/demo.sh status    show Klipper and print state
#   demo/demo.sh test      run the browser tests in cypress/demo against the simulated printer
#
# Stop "up" with Ctrl+C. Ports can be changed with DEMO_PORT (printer) and DEMO_UI_PORT (Mainsail).
set -euo pipefail

cd "$(dirname "$0")/.."

case "${1:-}" in
    up)
        export DEMO_PORT=${DEMO_PORT:-7125}
        node demo/mock-moonraker.mjs &
        trap 'kill $! 2>/dev/null' EXIT
        VUE_APP_HOSTNAME=localhost VUE_APP_PORT=${DEMO_PORT} npx vite serve --port "${DEMO_UI_PORT:-8080}"
        ;;
    print | quickprint | pause | resume | finish | frame | fail | error | runout | idle | reconnect | reset | classic | spool | status)
        curl -sS --max-time 5 "http://localhost:${DEMO_PORT:-7125}/demo/$1${2:+/$2}"
        ;;
    test)
        export DEMO_PORT=${DEMO_PORT:-7135}
        export DEMO_UI_PORT=${DEMO_UI_PORT:-4183}
        export DEMO_DB_FILE=none
        # the build writes its version file to dist/ even with another outDir
        mkdir -p dist
        VUE_APP_HOSTNAME=localhost VUE_APP_PORT=${DEMO_PORT} npx vite build --outDir dist-demo
        npx start-server-and-test \
            'node demo/mock-moonraker.mjs' "http://localhost:${DEMO_PORT}/demo/status" \
            "vite preview --outDir dist-demo --port ${DEMO_UI_PORT} --strictPort" "http://127.0.0.1:${DEMO_UI_PORT}/" \
            "cypress run --config-file cypress.demo.config.ts ${*:2}"
        ;;
    *)
        sed -n '2,26p' "$0" | sed 's/^# \{0,1\}//'
        exit 1
        ;;
esac
