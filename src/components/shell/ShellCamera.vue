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
    position: relative;
    min-height: 80px;
    background: var(--shell-raised);
}

.shell-camera > div,
.shell-camera ::v-deep .webcamBackground {
    position: absolute;
    inset: 0;
    width: 100%;
    height: 100%;
    max-height: none;
    background: transparent !important;
}

.shell-camera ::v-deep .webcamImage,
.shell-camera ::v-deep video,
.shell-camera ::v-deep canvas,
.shell-camera ::v-deep iframe {
    width: 100%;
    height: 100%;
    object-fit: contain;
}
</style>
