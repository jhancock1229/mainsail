<template>
    <div v-if="timeline" class="print-hero-timeline px-4 pt-4 pb-3">
        <div class="print-hero-timeline__bar">
            <div
                v-for="(phase, index) in phases"
                :key="'phase-' + index"
                class="print-hero-timeline__phase"
                :class="'print-hero-timeline__phase--' + phase.type"
                :style="phase.style" />
            <div
                v-for="(marker, index) in markers"
                :key="'marker-' + index"
                class="print-hero-timeline__marker"
                :class="'print-hero-timeline__marker--' + marker.type"
                :style="marker.style" />
        </div>
        <ul class="print-hero-timeline__events pl-0 mt-3 mb-0">
            <li v-if="hiddenEventsCount > 0" class="print-hero-timeline__event text--disabled">
                {{ $t('Panels.PrintHeroPanel.Timeline.Earlier', { count: hiddenEventsCount }) }}
            </li>
            <li
                v-for="(event, index) in visibleEvents"
                :key="'event-' + index"
                class="print-hero-timeline__event"
                :class="{ 'print-hero-timeline__event--latest': index === visibleEvents.length - 1 }">
                <span class="print-hero-timeline__dot" :class="'print-hero-timeline__dot--' + event.type" />
                <span v-if="event.time" class="print-hero-timeline__time text--secondary">{{ event.time }}</span>
                <span>{{ event.label }}</span>
            </li>
        </ul>
    </div>
</template>

<script lang="ts">
import Component from 'vue-class-component'
import { Mixins, Prop } from 'vue-property-decorator'
import { DateTimeFormatOptions } from 'vue-i18n'
import BaseMixin from '@/components/mixins/base'
import {
    formatPrintTimelineOffset,
    getPrintTimelinePhases,
    type PrintTimeline,
    type PrintTimelineEvent,
} from '@/plugins/printTimeline'

const MAX_VISIBLE_EVENTS = 8
const MS_PER_SECOND = 1000
const SECONDS_PER_HOUR = 3600

interface TimelineBarItem {
    type: string
    style: Record<string, string>
}

interface TimelineListItem {
    type: string
    time: string
    label: string
}

@Component
export default class PrintHeroTimeline extends Mixins(BaseMixin) {
    @Prop({ type: Object, default: null }) readonly timeline!: PrintTimeline | null
    @Prop({ type: Number, default: 0 }) readonly remaining!: number

    get elapsed(): number {
        return this.timeline?.last.totalDuration ?? 0
    }

    get scale(): number {
        return Math.max(this.elapsed + this.remaining, 1)
    }

    get showSeconds(): boolean {
        return this.scale < SECONDS_PER_HOUR
    }

    get phases(): TimelineBarItem[] {
        return getPrintTimelinePhases(this.timeline).map((phase) => ({
            type: phase.type,
            style: { left: this.percent(phase.from), width: this.percent(phase.to - phase.from) },
        }))
    }

    get markers(): TimelineBarItem[] {
        const events = this.timeline?.events ?? []

        return events
            .filter((event) => event.elapsed !== null && event.type !== 'warmup')
            .map((event) => ({ type: event.type, style: { left: this.percent(event.elapsed ?? 0) } }))
    }

    get events(): TimelineListItem[] {
        const events = this.timeline?.events ?? []

        return events.map((event) => ({
            type: event.type,
            time: this.eventTime(event),
            label: this.eventLabel(event),
        }))
    }

    get visibleEvents(): TimelineListItem[] {
        return this.events.slice(-MAX_VISIBLE_EVENTS)
    }

    get hiddenEventsCount(): number {
        return this.events.length - this.visibleEvents.length
    }

    percent(seconds: number): string {
        return `${Math.min(100, Math.max(0, (seconds / this.scale) * 100))}%`
    }

    eventTime(event: PrintTimelineEvent): string {
        if (event.elapsed === null) return ''

        const startedAt = this.timeline?.startedAt ?? null
        const time =
            startedAt === null
                ? formatPrintTimelineOffset(event.elapsed)
                : this.clockTime(startedAt + event.elapsed * MS_PER_SECOND)

        return event.approximate ? `~${time}` : time
    }

    clockTime(time: number): string {
        if (!this.showSeconds) return this.formatTime(time)

        const automatic = (this.$store.state.gui.general.timeFormat ?? null) === null
        const options: DateTimeFormatOptions = automatic ? { timeStyle: 'medium' } : this.formatTimeWithSecondsOptions

        return new Date(time).toLocaleTimeString(this.browserLocale, options)
    }

    eventLabel(event: PrintTimelineEvent): string {
        const key = 'Panels.PrintHeroPanel.Timeline.'

        switch (event.type) {
            case 'warmup':
                return this.$t(key + 'Warmup').toString()
            case 'started':
                return this.$t(key + 'Started').toString()
            case 'first-layer':
                return this.$t(key + 'FirstLayer').toString()
            case 'milestone':
                if (event.layer) {
                    return this.$t(key + 'MilestoneLayer', { percent: event.percent, layer: event.layer }).toString()
                }
                return this.$t(key + 'Milestone', { percent: event.percent }).toString()
            case 'paused':
                return this.$t(key + 'Paused').toString()
            case 'resumed':
                return this.$t(key + 'Resumed').toString()
            case 'complete':
                return this.$t(key + 'Complete').toString()
            case 'cancelled':
                return this.$t(key + 'Cancelled').toString()
            default:
                return this.$t(key + 'Error').toString()
        }
    }
}
</script>

<style scoped>
.print-hero-timeline {
    --print-hero-warmup: #ffa726;
    --print-hero-paused: #9e9e9e;
    --print-hero-track: rgba(128, 128, 128, 0.25);
}

.print-hero-timeline__bar {
    position: relative;
    height: 6px;
    border-radius: 3px;
    background: var(--print-hero-track);
}

.print-hero-timeline__phase {
    position: absolute;
    top: 0;
    bottom: 0;
    background: var(--v-primary-base);
    transition: width 0.5s linear;
}

.print-hero-timeline__phase:first-child {
    border-top-left-radius: 3px;
    border-bottom-left-radius: 3px;
}

.print-hero-timeline__phase--warmup {
    background: var(--print-hero-warmup);
}

.print-hero-timeline__phase--paused {
    background: repeating-linear-gradient(-45deg, var(--print-hero-paused) 0 4px, rgba(158, 158, 158, 0.45) 4px 8px);
}

.print-hero-timeline__marker {
    position: absolute;
    top: 50%;
    width: 10px;
    height: 10px;
    margin: -5px 0 0 -5px;
    border-radius: 50%;
    border: 2px solid var(--v-primary-base);
    background: #fff;
    box-sizing: border-box;
}

.print-hero-timeline__events {
    display: flex;
    flex-wrap: wrap;
    gap: 4px 16px;
    list-style: none;
    font-size: 0.8125rem;
    line-height: 1.5;
}

.print-hero-timeline__event {
    display: flex;
    align-items: center;
    gap: 6px;
    white-space: nowrap;
}

.print-hero-timeline__event--latest {
    font-weight: 500;
}

.print-hero-timeline__time {
    font-variant-numeric: tabular-nums;
}

.print-hero-timeline__dot {
    width: 8px;
    height: 8px;
    border-radius: 50%;
    background: var(--v-primary-base);
    flex: none;
}

.print-hero-timeline__dot--warmup {
    background: var(--print-hero-warmup);
}

.print-hero-timeline__dot--paused,
.print-hero-timeline__marker--paused {
    background: var(--print-hero-paused);
    border-color: var(--print-hero-paused);
}

.print-hero-timeline__dot--complete,
.print-hero-timeline__marker--complete {
    background: var(--v-success-base);
    border-color: var(--v-success-base);
}

.print-hero-timeline__dot--error,
.print-hero-timeline__marker--error {
    background: var(--v-error-base);
    border-color: var(--v-error-base);
}

.print-hero-timeline__dot--cancelled,
.print-hero-timeline__marker--cancelled {
    background: var(--print-hero-paused);
    border-color: var(--print-hero-paused);
}

@media (prefers-reduced-motion: reduce) {
    .print-hero-timeline__phase {
        transition: none;
    }
}
</style>
