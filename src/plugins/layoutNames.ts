export const MAX_LAYOUT_NAME_LENGTH = 40

export const sanitizeLayoutName = (name: unknown): string => {
    if (typeof name !== 'string') return ''

    return name.replace(/\s+/g, ' ').trim().slice(0, MAX_LAYOUT_NAME_LENGTH).trim()
}

export const uniqueLayoutName = (name: string, existing: string[]): string => {
    const taken = existing.map((entry) => entry.toLowerCase())
    if (!taken.includes(name.toLowerCase())) return name

    for (let count = 2; ; count++) {
        const suffix = ` ${count}`
        const candidate = name.slice(0, MAX_LAYOUT_NAME_LENGTH - suffix.length).trim() + suffix
        if (!taken.includes(candidate.toLowerCase())) return candidate
    }
}
