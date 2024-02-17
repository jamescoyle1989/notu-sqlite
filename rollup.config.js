import resolve from '@rollup/plugin-node-resolve';
import commonjs from '@rollup/plugin-commonjs';
import typescript from '@rollup/plugin-typescript';
import dts from 'rollup-plugin-dts';

export default [
    //As far as I can tell...
    //This does the main packaging into cjs & esm versions of the library
    {
        input: 'src/index.ts',
        output: [
            {
                file: 'dist/cjs/notu-sqlite.js',
                format: 'cjs',
                sourcemap: false
            },
            {
                file: 'dist/esm/notu-sqlite.js',
                format: 'esm',
                sourcemap: false
            }
        ],
        plugins: [
            resolve(),
            commonjs(),
            typescript({
                tsconfig: './tsconfig.json',
                exclude: /\/tests\//
            })
        ],
        external: [
            'notu',
            'better-sqlite3'
        ]
    },
    //And this then takes the esm type files and just combines them down into a single file
    {
        input: 'dist/esm/types/index.d.ts',
        output: [{ file: 'dist/types/index.d.ts', format: 'esm' }],
        plugins: [dts()]
    }
];