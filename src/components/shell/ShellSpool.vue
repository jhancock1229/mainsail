<template>
    <div v-if="spoolSource !== 'none'" class="shell-spool" :class="'shell-spool--' + spoolSource">
        <template v-if="spoolSource === 'spoolman'">
            <div class="sh-row">
                <h2 class="sh-h2">{{ $t('Shell.Spool.Title') }}</h2>
                <div class="sh-small sh-muted text-truncate">{{ spoolmanSubtitle }}</div>
            </div>
            <template v-if="spoolmanSpool">
                <div class="shell-spool__amount">
                    <div class="shell-spool__left">{{ $t('Shell.Spool.Left', { weight: spoolmanRemaining }) }}</div>
                    <div v-if="spoolmanInitial" class="sh-small sh-muted">
                        {{ $t('Shell.Spool.Of', { size: spoolmanInitial }) }}
                    </div>
                </div>
                <div class="sh-bar"><div :style="{ width: spoolmanPercent + '%' }" /></div>
            </template>
            <div v-else class="sh-muted shell-spool__none">{{ $t('Shell.Spool.SpoolmanNone') }}</div>
            <button v-if="!printing" type="button" class="sh-btn sh-btn--44" @click="$router.push('/tune/extruder')">
                {{ $t('Shell.Spool.SpoolmanChange') }}
            </button>
        </template>
        <template v-else-if="spoolSettings.loadedAt === null">
            <h2 class="sh-h2">{{ $t('Shell.Spool.Title') }}</h2>
            <div class="sh-muted shell-spool__none">{{ $t('Shell.Spool.NotTracked') }}</div>
            <button type="button" class="sh-btn sh-btn--44 shell-spool__new" @click="showDialog = true">
                {{ $t('Shell.Spool.NewSpool') }}
            </button>
        </template>
        <template v-else>
            <div class="sh-row">
                <h2 class="sh-h2">{{ $t('Shell.Spool.Title') }}</h2>
                <button
                    v-if="printing"
                    type="button"
                    class="shell-spool__subtitle shell-spool__subtitle--button text-truncate"
                    :title="$t('Shell.Spool.NewSpool')"
                    @click="showDialog = true">
                    {{ subtitle }}
                </button>
                <div v-else class="shell-spool__subtitle text-truncate">{{ subtitle }}</div>
            </div>
            <div class="shell-spool__amount">
                <div class="shell-spool__left" :class="{ 'shell-spool__left--small': !printing }">
                    {{ $t('Shell.Spool.AboutLeft', { weight: remaining }) }}
                </div>
                <div class="sh-small sh-muted">
                    {{ $t(printing ? 'Shell.Spool.Of' : 'Shell.Spool.OfUsed', { size, used }) }}
                </div>
            </div>
            <div class="sh-bar"><div :style="{ width: remainingPercent + '%' }" /></div>
            <div v-if="printing" class="shell-spool__detail">
                <span class="sh-muted">{{ $t('Shell.Spool.UsedSinceLoading', { used }) }}</span>
                <span v-if="enough" class="shell-spool__enough" :class="{ 'shell-spool__enough--no': !enough.enough }">
                    {{ enoughText }}
                </span>
            </div>
            <button v-else type="button" class="sh-btn sh-btn--44 shell-spool__new" @click="showDialog = true">
                {{ $t('Shell.Spool.NewSpool') }}
            </button>
        </template>
        <shell-spool-dialog v-model="showDialog" />
    </div>
</template>

<script lang="ts">
import Component from 'vue-class-component'
import { Mixins, Prop } from 'vue-property-decorator'
import SpoolTrackerMixin from '@/components/mixins/spoolTracker'
import ShellSpoolDialog from '@/components/shell/ShellSpoolDialog.vue'
import { ServerSpoolmanStateSpool } from '@/store/server/spoolman/types'
import { enoughForPrint, formatSpoolWeight } from '@/plugins/spoolTracker'

const MS_PER_SECOND = 1000

@Component({ components: { ShellSpoolDialog } })
export default class ShellSpool extends Mixins(SpoolTrackerMixin) {
    @Prop({ type: Boolean, default: false }) declare readonly printing: boolean

    showDialog = false

    get remaining(): string {
        return formatSpoolWeight(this.spoolEstimate.remainingGrams)
    }

    get used(): string {
        return formatSpoolWeight(this.spoolEstimate.usedGrams)
    }

    get size(): string {
        return formatSpoolWeight(this.spoolSettings.sizeGrams)
    }

    get remainingPercent(): number {
        return Math.round(this.spoolEstimate.remainingFraction * 100)
    }

    get subtitle(): string {
        const name = this.spoolSettings.name.trim() || this.spoolSettings.material
        const date = new Date((this.spoolSettings.loadedAt ?? 0) * MS_PER_SECOND)
        const loaded = date.toLocaleDateString(this.browserLocale, { day: 'numeric', month: 'short' })

        return this.$t('Shell.Spool.Loaded', { name, date: loaded }).toString()
    }

    get enough(): { enough: boolean; neededGrams: number } | null {
        if (!this.printerIsPrinting) return null

        return enoughForPrint({
            fileFilamentTotal: this.$store.state.printer.current_file?.filament_total,
            printFilamentUsed: this.$store.state.printer.print_stats?.filament_used ?? 0,
            remainingGrams: this.spoolEstimate.remainingGrams,
            diameter: this.spoolDiameter,
            density: this.spoolDensity,
        })
    }

    get enoughText(): string {
        if (this.enough === null) return ''

        const needed = formatSpoolWeight(this.enough.neededGrams)

        return this.$t(this.enough.enough ? 'Shell.Spool.Enough' : 'Shell.Spool.NotEnough', { needed }).toString()
    }

    get spoolmanSpool(): ServerSpoolmanStateSpool | null {
        return this.$store.state.server.spoolman?.active_spool ?? null
    }

    get spoolmanSubtitle(): string {
        const filament = this.spoolmanSpool?.filament
        if (!filament) return this.$t('Panels.SpoolmanPanel.Headline').toString()

        return [filament.vendor?.name, filament.name].filter((part) => !!part).join(' ')
    }

    get spoolmanRemaining(): string {
        return formatSpoolWeight(this.spoolmanSpool?.remaining_weight ?? 0)
    }

    get spoolmanInitial(): string | null {
        const initial = this.spoolmanSpool?.initial_weight ?? this.spoolmanSpool?.filament?.weight ?? 0

        return initial > 0 ? formatSpoolWeight(initial) : null
    }

    get spoolmanPercent(): number {
        const initial = this.spoolmanSpool?.initial_weight ?? this.spoolmanSpool?.filament?.weight ?? 0
        if (initial <= 0) return 0

        return Math.round(Math.min(1, (this.spoolmanSpool?.remaining_weight ?? 0) / initial) * 100)
    }
}
</script>

<style scoped>
.shell-spool {
    display: flex;
    flex-direction: column;
    gap: 14px;
}

.shell-spool__subtitle {
    font-size: 13px;
    color: var(--shell-muted);
    min-width: 0;
}

.shell-spool__subtitle--button {
    background: none;
    border: 0;
    padding: 0;
    font-family: var(--shell-font);
    cursor: pointer;
}

.shell-spool__subtitle--button:hover {
    color: var(--shell-text);
    text-decoration: underline;
}

.shell-spool__amount {
    display: flex;
    align-items: baseline;
    gap: 10px;
    flex-wrap: wrap;
}

.shell-spool__left {
    font-size: 26px;
    line-height: 1.2;
    font-weight: 500;
    white-space: nowrap;
}

.shell-spool__left--small {
    font-size: 24px;
}

.shell-spool__detail {
    display: flex;
    flex-wrap: wrap;
    justify-content: space-between;
    gap: 2px 12px;
    font-size: 13px;
    line-height: 1.5;
}

.shell-spool__detail > span {
    white-space: nowrap;
}

.shell-spool__enough {
    color: var(--shell-good);
}

.shell-spool__enough--no {
    color: var(--shell-danger);
}

.shell-spool__none {
    font-size: 14px;
}
</style>
