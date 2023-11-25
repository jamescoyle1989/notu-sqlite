import { Note, Space, Attr, parseQuery } from 'notu';
import SQLiteCache from './SQLiteCache';
import SQLiteConnection from './SQLiteConnection';
import SQLiteClient from './SQLiteClient';
import buildNotesQuery from './SQLiteQueryBuilder';


export default class NotuServer {
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
            const notesMap = new Map<number, Note>();
            const notes = connection
                .getAll(notesSQL)
                .map(x => {
                    const note = new Note(x.text).at(x.date).in(x.spaceId);
                    note.id = x.id;
                    note.archived = x.archived;
                    notesMap.set(note.id, note);
                    return note;
                });
            
            const noteTagsSQL = `SELECT noteId, tagId FROM NoteTag WHERE noteId IN (${notes.map(n => n.id).join(',')});`;
            connection.getAll(noteTagsSQL)
                .map(x => {
                    const note = notesMap.get(x.noteId);
                    const tag = this._cache.getTagById(x.tagId, connection);
                    return note.addTag(tag.ownTag);
                });

            const noteAttrsSQL = `SELECT noteId, attrId, value FROM NoteAttr WHERE noteId IN (${notes.map(n => n.id).join(',')});`;
            connection.getAll(noteAttrsSQL)
                .map(x => {
                    const note = notesMap.get(x.noteId);
                    const attr = this._cache.getAttrById(x.attrId, connection);
                    const tag = this._cache.getTagById(x.tagId, connection);
                    const noteAttr = note.addAttr(attr);
                    if (tag != null)
                        noteAttr.tag = tag.ownTag;
                    noteAttr.value = this._convertAttrValueFromDb(attr, x.value);
                    return noteAttr;
                });

            return notes;
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


    private _convertAttrValueFromDb(attr: Attr, value: string) {
        if (attr.isBoolean)
            return Number(value) > 0;
        if (attr.isDate)
            return new Date(Number(value) * 1000);
        if (attr.isNumber)
            return Number(value);
        return value;
    }
}