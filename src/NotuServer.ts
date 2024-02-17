import { Note, Space, Attr, parseQuery } from 'notu';
import { SQLiteCache } from './SQLiteCache';
import { SQLiteConnection } from './SQLiteConnection';
import { SQLiteClient } from './SQLiteClient';
import { buildNotesQuery } from './SQLiteQueryBuilder';


export class NotuServer {
    private _connectionFactory: () => SQLiteConnection;
    private _client: SQLiteClient;
    private _cache: SQLiteCache;

    constructor(
        connectionFactory: () => SQLiteConnection,
        client: SQLiteClient,
        cache: SQLiteCache
    ) {
        this._connectionFactory = connectionFactory;
        this._client = client;
        this._cache = cache;
    }

    setupSchema(): void {
        const connection = this._connectionFactory();
        try {
            this._client.setupSchema(connection);
        }
        finally {
            connection.close();
        }
    }

    getSpaces(): Array<Space> {
        const connection = this._connectionFactory();
        try {
            return this._cache.getSpaces(connection);
        }
        finally {
            connection.close();
        }
    }

    saveSpace(space: Space): void {
        const connection = this._connectionFactory();
        try {
            this._client.saveSpace(space, connection);
        }
        finally {
            connection.close();
        }
    }

    getAttrs(): Array<Attr> {
        const connection = this._connectionFactory();
        try {
            return this._cache.getAttrs(connection);
        }
        finally {
            connection.close();
        }
    }

    saveAttr(attr: Attr): void {
        const connection = this._connectionFactory();
        try {
            this._client.saveAttr(attr, connection);
        }
        finally {
            connection.close();
        }
    }

    getNotes(query: string, spaceId: number): Array<Note> {
        const parsedQuery = parseQuery(query);
        const connection = this._connectionFactory();
        try {
            const notesSQL = buildNotesQuery(parsedQuery, spaceId, this._cache, connection);
            return this._client.getNotes(notesSQL, connection, this._cache);
        }
        finally {
            connection.close();
        }
    }

    saveNote(note: Note): void {
        const connection = this._connectionFactory();
        try {
            this._client.saveNote(note, connection);
        }
        finally {
            connection.close();
        }
    }
}