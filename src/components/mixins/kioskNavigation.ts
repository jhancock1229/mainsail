import Component from 'vue-class-component'
import { Mixins } from 'vue-property-decorator'
import KioskMixin, { KioskPage } from '@/components/mixins/kiosk'
import NavigationMixin from '@/components/mixins/navigation'
import routes, { AppRoute } from '@/routes'
import { resolveBottomBar, resolveMorePages } from '@/plugins/kiosk'

@Component
export default class KioskNavigationMixin extends Mixins(KioskMixin, NavigationMixin) {
    get kioskAvailablePages(): KioskPage[] {
        return routes
            .filter((route: AppRoute) => route.showInNavi && route.name && this.showInNavi(route))
            .map((route: AppRoute) => ({
                name: route.name ?? '',
                path: route.path,
                icon: route.icon ?? '',
                title: this.$t(`Kiosk.Pages.${route.name}`).toString(),
            }))
    }

    get kioskAvailablePageNames(): string[] {
        return this.kioskAvailablePages.map((page) => page.name)
    }

    get kioskBottomPageNames(): string[] {
        return resolveBottomBar(
            this.kioskSettings.bottomBar,
            this.kioskAvailablePageNames,
            this.kioskSettings.hiddenPages
        )
    }

    get kioskBottomPages(): KioskPage[] {
        return this.kioskPagesByName(this.kioskBottomPageNames)
    }

    get kioskMorePages(): KioskPage[] {
        return this.kioskPagesByName(
            resolveMorePages(this.kioskBottomPageNames, this.kioskAvailablePageNames, this.kioskSettings.hiddenPages)
        )
    }

    kioskPagesByName(names: string[]): KioskPage[] {
        return names
            .map((name) => this.kioskAvailablePages.find((page) => page.name === name))
            .filter((page): page is KioskPage => page !== undefined)
    }
}
