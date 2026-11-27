import { getDefaultState } from './index'
import { DashboardLayoutSnapshot, captureSnapshot } from '@/plugins/dashboardNamedLayouts'

export const getDefaultSnapshot = (): DashboardLayoutSnapshot => captureSnapshot(getDefaultState().dashboard, null)
