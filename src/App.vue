<template>
    <v-app :style="cssVars">
        <template v-if="socketIsConnected && guiIsReady">
            <the-shell v-if="interfaceShell === 'new'" />
            <template v-else>
                <the-sidebar />
                <the-topbar />
                <v-main id="content" :style="mainStyle">
                    <v-container id="page-container" fluid :class="containerClasses">
                        <router-view />
                    </v-container>
                </v-main>
            </template>
            <the-service-worker />
            <the-update-dialog />
            <the-editor />
            <the-timelapse-rendering-snackbar />
            <the-fullscreen-upload />
            <the-upload-snackbar />
            <the-manual-probe-dialog />
            <the-bed-screws-dialog />
            <the-screws-tilt-adjust-dialog />
            <the-macro-prompt />
            <the-event-notifier />
        </template>
        <the-select-printer-dialog v-else-if="instancesDB !== 'moonraker'" />
        <the-connecting-dialog v-else />
    </v-app>
</template>

<script lang="ts">
import Component from 'vue-class-component'
import TheSidebar from '@/components/TheSidebar.vue'
import BaseMixin from '@/components/mixins/base'
import ThemeMixin from './components/mixins/theme'
import TheTopbar from '@/components/TheTopbar.vue'
import { Mixins, Watch } from 'vue-property-decorator'
import TheUpdateDialog from '@/components/TheUpdateDialog.vue'
import TheConnectingDialog from '@/components/TheConnectingDialog.vue'
import TheSelectPrinterDialog from '@/components/TheSelectPrinterDialog.vue'
import TheEditor from '@/components/TheEditor.vue'
import { defaultPrimaryColor, topbarHeight, navigationItemHeight } from '@/store/variables'
import TheTimelapseRenderingSnackbar from '@/components/TheTimelapseRenderingSnackbar.vue'
import TheFullscreenUpload from '@/components/TheFullscreenUpload.vue'
import TheUploadSnackbar from '@/components/TheUploadSnackbar.vue'
import TheManualProbeDialog from '@/components/dialogs/TheManualProbeDialog.vue'
import TheBedScrewsDialog from '@/components/dialogs/TheBedScrewsDialog.vue'
import TheScrewsTiltAdjustDialog from '@/components/dialogs/TheScrewsTiltAdjustDialog.vue'
import { setAndLoadLocale } from './plugins/i18n'
import TheMacroPrompt from '@/components/dialogs/TheMacroPrompt.vue'
import { AppRoute } from '@/routes'
import TheEventNotifier from '@/components/TheEventNotifier.vue'
import { resolveDarkMode, systemPrefersDarkQuery } from '@/plugins/themeMode'
import {
    resolveThemeTokens,
    textColorOnAccent,
    themeCssVariables,
    themeRootAttributeNames,
    themeRootAttributes,
    ThemeTokens,
} from '@/plugins/themeTokens'
import TheShell from '@/components/shell/TheShell.vue'
import { classicPathFor, InterfaceShell, isClassicForced, resolveInterfaceShell } from '@/plugins/shellNavigation'
import { commandPaletteBus } from '@/plugins/commandPaletteBus'

@Component({
    components: {
        TheEventNotifier,
        TheMacroPrompt,
        TheTimelapseRenderingSnackbar,
        TheEditor,
        TheSelectPrinterDialog,
        TheConnectingDialog,
        TheUpdateDialog,
        TheTopbar,
        TheSidebar,
        TheFullscreenUpload,
        TheUploadSnackbar,
        TheManualProbeDialog,
        TheBedScrewsDialog,
        TheScrewsTiltAdjustDialog,
        TheShell,
    },
})
export default class App extends Mixins(BaseMixin, ThemeMixin) {
    get title(): string {
        let title = this.$store.getters['getTitle']

        if (this.isPrinterPowerOff) title = this.$t('App.Titles.PrinterOff')

        return title
    }

    get naviDrawer(): boolean {
        return this.$store.state.naviDrawer
    }

    get navigationStyle() {
        return this.$store.state.gui.uiSettings.navigationStyle
    }

    get mainStyle() {
        const style: Record<string, string> = {
            paddingLeft: '0',
        }

        if (this.mainBgImage !== null) {
            style.backgroundImage = 'url(' + this.mainBgImage + ')'
        }

        // overwrite padding left for the sidebar
        if (this.naviDrawer && !this.$vuetify.breakpoint.mdAndDown) {
            if (this.navigationStyle === 'iconsAndText') style.paddingLeft = '220px'
            if (this.navigationStyle === 'iconsOnly') style.paddingLeft = '56px'
        }

        return style
    }

    get customStylesheet() {
        return this.$store.getters['files/getCustomStylesheet']
    }

    get customFavicons(): string | null {
        return this.$store.getters['files/getCustomFavicons'] ?? null
    }

    get language(): string {
        return this.$store.state.gui.general.language
    }

    get current_file(): string {
        return this.$store.state.printer.print_stats?.filename ?? ''
    }

    systemDarkQuery: MediaQueryList | null = window.matchMedia?.(systemPrefersDarkQuery) ?? null
    systemPrefersDark = this.systemDarkQuery?.matches ?? true

    get mode(): string {
        return this.$store.state.gui.uiSettings.mode
    }

    get darkMode(): boolean {
        return resolveDarkMode(this.mode, this.systemPrefersDark)
    }

    widthAtLoad = window.innerWidth

    get interfaceReady(): boolean {
        return this.socketIsConnected && this.guiIsReady
    }

    get interfaceShell(): InterfaceShell {
        if (!this.interfaceReady) return 'classic'

        return resolveInterfaceShell(this.$store.state.gui.uiSettings.interfaceShell, this.widthAtLoad)
    }

    get classicRedirect(): string | null {
        if (!this.interfaceReady || this.interfaceShell !== 'classic') return null

        return classicPathFor(this.$route.path)
    }

    get logoColor(): string {
        return this.$store.state.gui.uiSettings.logo
    }

    get primaryColor(): string {
        return this.$store.state.gui.uiSettings.primary
    }

    get warningColor(): string {
        return this.$vuetify?.theme?.currentTheme?.warning?.toString() ?? '#ff8300'
    }

    get primaryTextColor(): string {
        return textColorOnAccent(this.primaryColor)
    }

    get themeTokens(): ThemeTokens {
        return resolveThemeTokens(
            this.primaryColor,
            this.$store.state.gui.uiSettings.tokens,
            this.theme?.colorPrimary ?? defaultPrimaryColor
        )
    }

    get themeAttributes(): Record<string, string> {
        return themeRootAttributes(this.themeTokens)
    }

    get chartPaletteState(): string {
        const series: { name: string }[] = this.$store.state.printer?.tempHistory?.series ?? []

        return [this.themeTokens.chartPalette, this.darkMode, ...series.map((serie) => serie.name)].join('|')
    }

    get cssVars(): { [key: string]: string } {
        return {
            '--v-btn-text-primary': this.primaryTextColor,
            '--color-logo': this.logoColor,
            '--color-primary': this.primaryColor,
            '--color-warning': this.warningColor,
            ...themeCssVariables(this.themeTokens, this.darkMode),
            '--topbar-icon-btn-width': topbarHeight + 'px',
            '--sidebar-menu-item-height': navigationItemHeight + 'px',
        }
    }

    get print_percent(): number {
        return Math.floor(this.$store.getters['printer/getPrintPercent'] * 100)
    }

    get containerClasses() {
        const currentRouteOptions = this.$router.options.routes?.find(
            (route) => route.name === this.$route.name
        ) as AppRoute

        return {
            'px-3': true,
            'px-sm-6': true,
            'py-sm-6': true,
            'mx-auto': true,
            fullscreen: currentRouteOptions?.fullscreen ?? false,
        }
    }

    get progressAsFavicon() {
        return this.$store.state.gui.uiSettings.progressAsFavicon
    }

    @Watch('title', { immediate: true })
    titleChanged(newVal: string): void {
        document.title = newVal
    }

    @Watch('language')
    async languageChanged(newVal: string): Promise<void> {
        await setAndLoadLocale(newVal)
    }

    @Watch('customStylesheet')
    customStylesheetChanged(newVal: string | null): void {
        const style = document.getElementById('customStylesheet')
        if (newVal !== null && style === null) {
            const newStyle = document.createElement('link')
            newStyle.id = 'customStylesheet'
            newStyle.type = 'text/css'
            newStyle.rel = 'stylesheet'
            newStyle.href = newVal
            document.head.appendChild(newStyle)
        } else if (newVal !== null && style) {
            style.setAttribute('href', newVal)
        } else if (style) style.remove()
    }

    @Watch('current_file')
    current_fileChanged(newVal: string): void {
        if (newVal === '') return

        this.$socket.emit('server.files.metadata', { filename: newVal }, { action: 'files/getMetadataCurrentFile' })
    }

    @Watch('primaryColor')
    primaryColorChanged(newVal: string): void {
        this.$nextTick(() => {
            this.$vuetify.theme.currentTheme.primary = newVal
        })
    }

    @Watch('themeAttributes', { immediate: true })
    themeAttributesChanged(attributes: Record<string, string>): void {
        const doc = document.documentElement
        themeRootAttributeNames.forEach((name) => {
            if (name in attributes) doc.setAttribute(name, attributes[name])
            else doc.removeAttribute(name)
        })
    }

    @Watch('chartPaletteState')
    chartPaletteStateChanged(): void {
        this.$store.dispatch('printer/tempHistory/applyChartPalette', {
            palette: this.themeTokens.chartPalette,
            dark: this.darkMode,
        })
    }

    @Watch('darkMode')
    darkModeChanged(dark: boolean): void {
        this.$vuetify.theme.dark = dark

        const classes = document.documentElement.classList
        classes.toggle('theme--dark', dark)
        classes.toggle('theme--light', !dark)
    }

    @Watch('interfaceShell', { immediate: true })
    interfaceShellChanged(shell: InterfaceShell): void {
        document.documentElement.classList.toggle('shell-new', shell === 'new')
        commandPaletteBus.switchableShell = isClassicForced(this.widthAtLoad) ? null : shell
    }

    @Watch('classicRedirect', { immediate: true })
    classicRedirectChanged(path: string | null): void {
        if (path !== null) this.$router.replace(path)
    }

    async drawFavicon(val: number): Promise<void> {
        const favicon16: HTMLLinkElement | null = document.querySelector("link[rel*='icon'][sizes='16x16']")
        const favicon32: HTMLLinkElement | null = document.querySelector("link[rel*='icon'][sizes='32x32']")

        // if no favicon is found, stop
        if (!favicon16 || !favicon32) return

        // if progressAsFavicon is enabled and the printer is printing, draw the progress as favicon
        if (this.progressAsFavicon && this.printerIsPrinting) {
            const faviconSize = 64

            const canvas = document.createElement('canvas')
            canvas.width = faviconSize
            canvas.height = faviconSize
            const context = canvas.getContext('2d')
            const centerX = canvas.width / 2
            const centerY = canvas.height / 2
            const radius = 32

            if (!context) return

            // draw the grey circle
            context.beginPath()
            context.moveTo(centerX, centerY)
            context.arc(centerX, centerY, radius, 0, 2 * Math.PI, false)
            context.closePath()
            context.fillStyle = '#ddd'
            context.fill()
            context.strokeStyle = 'rgba(200, 208, 218, 0.66)'
            context.stroke()

            // draw the green circle based on percentage
            const startAngle = 1.5 * Math.PI
            let endAngle = 0
            const unitValue = (Math.PI - 0.5 * Math.PI) / 25
            if (val >= 0 && val <= 25) endAngle = startAngle + val * unitValue
            else if (val > 25 && val <= 50) endAngle = startAngle + val * unitValue
            else if (val > 50 && val <= 75) endAngle = startAngle + val * unitValue
            else if (val > 75 && val <= 100) endAngle = startAngle + val * unitValue

            context.beginPath()
            context.moveTo(centerX, centerY)
            context.arc(centerX, centerY, radius, startAngle, endAngle, false)
            context.closePath()
            context.fillStyle = this.logoColor
            context.fill()

            favicon16.href = canvas.toDataURL('image/png')
            favicon32.href = canvas.toDataURL('image/png')

            return
        }

        // if custom favicons are set, use them
        if (this.customFavicons) {
            const [favicon16Path, favicon32Path] = this.customFavicons
            favicon16.href = favicon16Path
            favicon32.href = favicon32Path

            return
        }

        // if a theme sidebar logo is set, use it
        if ((this.theme?.logo?.show ?? false) && this.sidebarLogo.endsWith('.svg')) {
            const response = await fetch(this.sidebarLogo)
            if (!response.ok) return

            const text = await response.text()
            const modifiedSvg = text.replace(/fill="var\(--color-logo, #[0-9a-fA-F]{6}\)"/g, `fill="${this.logoColor}"`)

            const blob = new Blob([modifiedSvg], { type: 'image/svg+xml' })
            const reader = new FileReader()

            reader.onloadend = () => {
                const base64data = reader.result as string
                favicon16.href = base64data
                favicon32.href = base64data
            }

            reader.readAsDataURL(blob)

            return
        }

        // if no custom favicon is set, use the default one
        const favicon =
            'data:image/svg+xml;base64,' +
            window.btoa(`
            <svg xmlns="http://www.w3.org/2000/svg" x="0px" y="0px" viewBox="0 0 599.38 523.11" xml:space="preserve">
                <g>
                    <path style="fill:${this.logoColor};" d="M382.29,142.98L132.98,522.82L0,522.68L344.3,0l0,0C352.18,49.06,365.2,97.68,382.29,142.98"/>
                    <path style="fill:${this.logoColor};" d="M413.28,213.54L208.5,522.92l132.94,0.19l135.03-206.33l0,0C452.69,284.29,431.53,249.77,413.28,213.54 L413.28,213.54"/>
                    <path style="fill:${this.logoColor};" d="M599.38,447.69l-49.25,75.42L417,522.82l101.6-153.67l0,0C543.48,397.35,570.49,423.61,599.38,447.69 L599.38,447.69z"/>
                </g>
            </svg>
        `)

        favicon16.href = favicon
        favicon32.href = favicon
    }

    @Watch('customFavicons')
    customFaviconsChanged(): void {
        this.drawFavicon(this.print_percent)
    }

    @Watch('progressAsFavicon')
    progressAsFaviconChanged(): void {
        this.drawFavicon(this.print_percent)
    }

    @Watch('logoColor')
    logoColorChanged(): void {
        this.drawFavicon(this.print_percent)
    }

    @Watch('themeCss')
    themeCssChanged(newVal: string | null): void {
        // remove linked CSS file if it exists
        const style = document.getElementById('theme-css')
        if (style) style.remove()

        // if themeCss does not exist, stop here and load no CSS file
        if (newVal === null) return

        // fetch the CSS file and append it to the head
        fetch(newVal)
            .then((response) => response.text())
            .then((css) => {
                const newStyle = document.createElement('style')
                newStyle.id = 'theme-css'
                newStyle.innerHTML = css
                document.head.appendChild(newStyle)
            })
    }

    @Watch('print_percent')
    print_percentChanged(newVal: number): void {
        this.drawFavicon(newVal)
        this.refreshSpoolman()
    }

    @Watch('printerIsPrinting')
    printerIsPrintingChanged(): void {
        this.drawFavicon(this.print_percent)
    }

    refreshSpoolman(): void {
        if (this.moonrakerComponents.includes('spoolman')) {
            this.$store.dispatch('server/spoolman/refreshActiveSpool', null, { root: true })
        }
    }

    appHeight() {
        this.$nextTick(() => {
            const doc = document.documentElement
            doc.style.setProperty('--app-height', window.innerHeight + 'px')
        })
    }

    mounted(): void {
        this.drawFavicon(this.print_percent)
        this.appHeight()
        window.addEventListener('resize', this.appHeight)
        window.addEventListener('orientationchange', this.appHeight)

        // older Safari only has the deprecated addListener
        if (this.systemDarkQuery?.addEventListener)
            this.systemDarkQuery.addEventListener('change', this.systemPrefersDarkChanged)
        else this.systemDarkQuery?.addListener?.(this.systemPrefersDarkChanged)
    }

    beforeDestroy(): void {
        if (this.systemDarkQuery?.removeEventListener)
            this.systemDarkQuery.removeEventListener('change', this.systemPrefersDarkChanged)
        else this.systemDarkQuery?.removeListener?.(this.systemPrefersDarkChanged)
    }

    systemPrefersDarkChanged(event: MediaQueryListEvent): void {
        this.systemPrefersDark = event.matches
    }
}
</script>

<style>
@import './assets/styles/fonts.css';
@import './assets/styles/toastr.css';
@import './assets/styles/page.css';
@import './assets/styles/sidebar.css';
@import './assets/styles/utils.css';
@import './assets/styles/updateManager.css';
@import './assets/styles/themeTokens.css';
@import './assets/styles/shell.css';

:root {
    --app-height: 100%;
}

#content {
    background-attachment: fixed;
    background-size: cover;
    background-repeat: no-repeat;
}

/*noinspection CssUnusedSymbol*/
.v-btn:not(.v-btn--outlined).primary {
    /*noinspection CssUnresolvedCustomProperty*/
    color: var(--v-btn-text-primary);
}
</style>
