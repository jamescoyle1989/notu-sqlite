const path = require('path');

module.exports = {
    entry: './src/index.ts',
    module: {
        rules: [
            {
                include: [path.resolve(__dirname, 'src')],
                test: /\.ts$/,
                resolve: {
                    extensions: ['.ts', '.tsx', '.js']
                },
                use: 'ts-loader'
            }
        ]
    },
    externals: {
        'better-sqlite3': 'better-sqlite3'
    },
    output: {
        filename: 'notu-sqlite.js',
        path: path.resolve(__dirname, 'dist')
    }
}