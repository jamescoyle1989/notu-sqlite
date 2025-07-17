import BetterSqlite3 from 'better-sqlite3';
import * as ExpoSQLite from 'expo-sqlite';


export class RunResult {
    changes: number;
    lastInsertRowId: number | bigint;

    constructor(changes: number, lastInsertRowId: number | bigint) {
        this.changes = changes;
        this.lastInsertRowId = lastInsertRowId;
    }
}


export interface ISQLiteConnection {
    run(command: string, ...args: Array<any>): Promise<RunResult>;

    getFirst(query: string, ...args: Array<any>): Promise<any>;

    getAll(query: string, ...args: Array<any>): Promise<Array<any>>;

    close(): Promise<void>;
}


/**
 * Provides thin wrapper around BetterSqlite3.Database
 */
export class BetterSQLiteConnection implements ISQLiteConnection {
    private _internal: BetterSqlite3.Database;
    
    constructor(db: BetterSqlite3.Database) {
        this._internal = db;
        this._internal.pragma('journal_mode = WAL');
    }

    run(command: string, ...args: Array<any>): Promise<RunResult> {
        const result = this._internal.prepare(command).run(args);
        const output = new RunResult(result.changes, result.lastInsertRowid);
        return Promise.resolve(output);
    }

    getFirst(query: string, ...args: Array<any>): Promise<any> {
        return Promise.resolve(this._internal.prepare(query).get(args));
    }

    getAll(query: string, ...args: Array<any>): Promise<Array<any>> {
        return Promise.resolve(this._internal.prepare(query).all(args));
    }

    close(): Promise<void> {
        this._internal.close();
        return Promise.resolve();
    }
}


/**
 * Provides thin wrapper around ExpoSQLite.SQLiteDatabase
 */
export class ExpoSQLiteConnection implements ISQLiteConnection {
    private _internal: ExpoSQLite.SQLiteDatabase;

    constructor(db: ExpoSQLite.SQLiteDatabase) {
        this._internal = db;
        this._internal.execSync('PRAGMA journal_mode = WAL');
    }

    async run(command: string, ...args: Array<any>): Promise<RunResult> {
        const result = await this._internal.runAsync(command, ...args);
        return new RunResult(result.changes, result.lastInsertRowId);
    }

    async getFirst(query: string, ...args: Array<any>): Promise<any> {
        return await this._internal.getFirstAsync(query, ...args);
    }

    async getAll(query: string, ...args: Array<any>): Promise<any> {
        return await this._internal.getAllAsync(query, ...args);
    }

    async close(): Promise<void> {
        await this._internal.closeAsync();
    }
}