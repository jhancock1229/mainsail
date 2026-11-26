import { defineConfig } from 'cypress'

// browser tests that run against the simulated printer, see demo/demo.sh test
const demoPort = process.env.DEMO_PORT ?? '7135'
const uiPort = process.env.DEMO_UI_PORT ?? '4183'

export default defineConfig({
    e2e: {
        baseUrl: `http://localhost:${uiPort}`,
        specPattern: 'cypress/demo/**/*.cy.ts',
        viewportWidth: 1500,
        viewportHeight: 1100,
        video: false,
        downloadsFolder: 'dist-demo/downloads',
        env: {
            demoUrl: `http://localhost:${demoPort}/demo`,
        },
    },
})
