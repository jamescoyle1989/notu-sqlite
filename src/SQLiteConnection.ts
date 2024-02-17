import BetterSqlite3 from 'better-sqlite3';


/**
 * Provides thin wrapper around BetterSqlite3.Database
 */
export class SQLiteConnection {
    private _internal: BetterSqlite3.Database;
    
    constructor(db: BetterSqlite3.Database) {
        this._internal = db;
        this._internal.pragma('journal_mode = WAL');
    }

    run(command: string, ...args: Array<any>): BetterSqlite3.RunResult {
        return this._internal.prepare(command).run(args);
    }

    getFirst(query: string, ...args: Array<any>): any {
        return this._internal.prepare(query).get(args);
    }

    getAll(query: string, ...args: Array<any>): Array<any> {
        return this._internal.prepare(query).all(args);
    }

    close(): void {
        this._internal.close();
    }
}