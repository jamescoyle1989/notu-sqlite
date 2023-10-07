import { defineConfig } from 'vite';

export default defineConfig({
    build: {
        lib: {
            name: 'notu-sqlite',
            entry: './src/index.ts'
        }
    }
});