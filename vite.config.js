import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import Components from 'unplugin-vue-components/vite'
import { ElementPlusResolver } from 'unplugin-vue-components/resolvers'
import path from 'path'
import pkg from './package.json'

export default defineConfig({
    base: './',
    resolve: {
        alias: {
            '@': path.resolve(__dirname, 'src')
        }
    },
    plugins: [
        vue(),
        // Element Plus 按需引入：只打包实际使用的组件与样式
        Components({
            resolvers: [ElementPlusResolver({ importStyle: 'css' })]
        })
    ],
    define: {
        __APP_VERSION__: JSON.stringify(pkg.version)
    },
    build: {
        outDir: 'build',
        chunkSizeWarningLimit: 1500
    }
})
