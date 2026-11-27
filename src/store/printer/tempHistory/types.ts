import { ThemeChartPalette } from '@/plugins/themeTokens'

export interface PrinterTempHistoryState {
    source: PrinterTempHistoryStateSourceEntry[]
    series: PrinterTempHistoryStateSerie[]
    timeLastUpdate: number | null
    updateSourceInterval: number | null
    chartPalette: { palette: ThemeChartPalette; dark: boolean } | null
}

export interface PrinterTempHistoryStateSerie {
    id: number
    color: string
    type: string
    name: string
    yAxisIndex: number
    encode: {
        x: string
        y: string
    }
    animation: boolean
    lineStyle: {
        color: string
        width: number
        opacity: number
        type?: string
    }
    areaStyle?: {
        color: string
        opacity: number
    }
    showSymbol: boolean
    emphasis: {
        lineStyle: {
            color: string
            width: number
            opacity: number
            type?: string
        }
        areaStyle?: {
            color: string
            opacity: number
        }
    }
}

export interface PrinterTempHistoryStateSourceEntry {
    date: Date
    [key: string]: Date | number | null
}
