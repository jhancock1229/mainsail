<template>
    <div v-if="webcam" class="sh-box shell-camera">
        <webcam-wrapper-item :webcam="webcam" :show-fps="false" page="shell" />
    </div>
    <div v-else class="sh-box sh-box--dashed shell-camera--empty">
        <span>{{ $t('Shell.Camera.None') }}</span>
        <router-link to="/settings/webcams" class="sh-link">{{ $t('Shell.Camera.Add') }}</router-link>
    </div>
</template>

<script lang="ts">
import Component from 'vue-class-component'
import { Mixins } from 'vue-property-decorator'
import BaseMixin from '@/components/mixins/base'
import WebcamWrapperItem from '@/components/webcams/WebcamWrapperItem.vue'
import { GuiWebcamStateWebcam } from '@/store/gui/webcams/types'

@Component({ components: { WebcamWrapperItem } })
export default class ShellCamera extends Mixins(BaseMixin) {
    get webcam(): GuiWebcamStateWebcam | null {
        const webcams: GuiWebcamStateWebcam[] = this.$store.getters['gui/webcams/getWebcams'] ?? []
        const selected = this.$store.state.gui.view.webcam?.currentCam?.dashboard ?? 'all'

        return webcams.find((webcam) => webcam.name === selected) ?? webcams[0] ?? null
    }
}
</script>

<style scoped>
.shell-camera {
    min-height: 80px;
    display: flex;
    align-items: flex-start;
    justify-content: center;
}

.shell-camera > div,
.shell-camera ::v-deep .webcamBackground {
    width: 100%;
    height: 100%;
    max-height: 100%;
    display: flex;
    align-items: flex-start;
    justify-content: center;
    background: transparent !important;
}

.shell-camera ::v-deep .webcamImage,
.shell-camera ::v-deep video,
.shell-camera ::v-deep canvas {
    width: auto;
    height: auto;
    max-width: 100%;
    max-height: 100%;
    border-radius: 8px;
}

.shell-camera ::v-deep iframe {
    width: 100%;
    height: 100%;
    border-radius: 8px;
}
</style>
