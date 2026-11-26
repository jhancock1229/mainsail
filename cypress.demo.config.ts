import { defineConfig } from 'cypress'

const demoPort = process.env.DEMO_PORT ?? '7135'
const uiPort = process.env.DEMO_UI_PORT ?? '4183'

export default defineConfig({
    e2e: {
        baseUrl: `http://localhost:${uiPort}`,
        specPattern: 'cypress/demo/**/*.cy.ts',
        viewportWidth: 1500,
        viewportHeight: 1100,
        video: false,
        env: {
            demoUrl: `http://localhost:${demoPort}/demo`,
        },
    },
})
