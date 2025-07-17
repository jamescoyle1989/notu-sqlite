import { mapColorToInt, mapDateToNumber, mapNumberToDate } from './SQLMappings';
import { ISQLiteConnection } from './SQLiteConnection';
import { Note, NoteTag, NotuCache, Space, Tag, parseQuery } from 'notu';
import { buildNotesQuery } from './SQLiteQueryBuilder';


/**
 * Provides methods for common functionality when interacting with the DB
 */
export class NotuSQLiteClient {

    private _connectionFactory: () => Promise<ISQLiteConnection>;
    
    private _cache: NotuCache;

    constructor(connectionFactory: () => Promise<ISQLiteConnection>, cache: NotuCache) {
        this._connectionFactory = connectionFactory;
        this._cache = cache;
    }


    login(username: string, password: string): Promise<string> {
        throw Error('Not implemented.');
    }

    async setup(): Promise<void> {
        const connection = await this._connectionFactory();
        try {
            if (!(await connection.getFirst(`SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'Note';`))) {
                await connection.run(
                    `CREATE TABLE Space (
                        id INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
                        name TEXT NOT NULL,
                        version TEXT NOT NULL,
                        useCommonSpace INTEGER NOT NULL
                    )`
                );
                
                await connection.run(
                    `CREATE TABLE Note (
                        id INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
                        spaceId INTEGER NOT NULL,
                        text TEXT NOT NULL,
                        date INTEGER NOT NULL,
                        FOREIGN KEY (spaceId) REFERENCES Space(id) ON DELETE CASCADE
                    );`
                );
                await connection.run(`CREATE INDEX Note_spaceId ON Note(spaceId);`);
                await connection.run(`CREATE INDEX Note_date ON Note(date);`);
    
                await connection.run(
                    `CREATE TABLE Tag (
                        id INTEGER NOT NULL,
                        name TEXT NOT NULL,
                        color INTEGER NULL,
                        availability INTEGER NOT NULL,
                        PRIMARY KEY (id),
                        FOREIGN KEY (id) REFERENCES Note(id) ON DELETE CASCADE
                    );`
                );
                await connection.run(`CREATE INDEX Tag_id ON Tag(id);`);
    
                await connection.run(
                    `CREATE TABLE NoteTag (
                        noteId INTEGER NOT NULL,
                        tagId INTEGER NOT NULL,
                        data TEXT NULL,
                        PRIMARY KEY (noteId, tagId),
                        FOREIGN KEY (noteId) REFERENCES Note(id) ON DELETE CASCADE,
                        FOREIGN KEY (tagId) REFERENCES Tag(id) ON DELETE CASCADE
                    );`
                );
                await connection.run(`CREATE INDEX NoteTag_noteId ON NoteTag(noteId);`);
                await connection.run(`CREATE INDEX NoteTag_tagId ON NoteTag(tagId);`);
            }
        }
        finally {
            await connection.close();
        }
    }


    async saveSpace(space: Space): Promise<any> {
        if (space.isClean)
            return Promise.resolve();

        const connection = await this._connectionFactory();
        try {
            if (space.isNew) {
                space.id = (await connection.run(
                    'INSERT INTO Space (name, version, useCommonSpace) VALUES (?, ?, ?);',
                    space.name, space.version, space.useCommonSpace ? 1 : 0
                )).lastInsertRowId as number;
                space.clean();
            }
            else if (space.isDirty) {
                await connection.run(
                    'UPDATE Space SET name = ?, version = ?, useCommonSpace = ? WHERE id = ?;',
                    space.name, space.version, space.useCommonSpace ? 1 : 0, space.id
                );
                space.clean();
            }
            else if (space.isDeleted) {
                await this._enforceForeignKeys(connection);
                await connection.run(
                    'DELETE FROM Space WHERE id = ?;',
                    space.id
                );
            }
    
            return Promise.resolve(space.toJSON());
        }
        finally {
            await connection.close();
        }
    }


    async getNotes(query: string, space?: number | Space): Promise<Array<any>> {
        if (space instanceof Space)
            space = space.id;

        query = this._prepareQuery(query, space);

        return await this._getNotesFromQuery(query);
    }

    private async _getNotesFromQuery(query: string): Promise<Array<any>> {
        const connection = await this._connectionFactory();
        try {
            const notesMap = new Map<number, any>();
            const notes = (await connection.getAll(query)).map(x => {
                const note = {
                    state: 'CLEAN',
                    id: x.id,
                    date: mapNumberToDate(x.date),
                    text: x.text,
                    spaceId: x.spaceId,
                    ownTag: null,
                    tags: []
                };
                notesMap.set(note.id, note);
                return note;
            });

            if (notes.length > 0) {
                const noteTagsSQL = `SELECT noteId, tagId, data FROM NoteTag WHERE noteId IN (${notes.map(n => n.id).join(',')});`;
                (await connection.getAll(noteTagsSQL)).map(x => {
                    const nt = {
                        state: 'CLEAN',
                        tagId: x.tagId,
                        data: x.data
                    };
                    const note = notesMap.get(x.noteId);
                    note.tags.push(nt);
                });
            }

            return notes;
        }
        finally {
            await connection.close();
        }
    }

    async getNoteCount(query: string, space: number | Space): Promise<number> {
        if (space instanceof Space)
            space = space.id;

        query = 'SELECT COUNT(*) AS cnt' + this._prepareQuery(query, space).substring(query.indexOf(' FROM '));

        const connection = await this._connectionFactory();
        try {
            return (await connection.getFirst(query)).cnt;
        }
        finally {
            await connection.close();
        }
    }


    async saveNotes(notes: Array<Note>): Promise<Array<any>> {
        const connection = await this._connectionFactory();
        await this._enforceForeignKeys(connection);
        try {
            for (const note of notes) {
                if (note.isNew) {
                    note.id = (await connection.run(
                        'INSERT INTO Note (date, text, spaceId) VALUES (?, ?, ?);',
                        mapDateToNumber(note.date), note.text, note.space.id
                    )).lastInsertRowId as number;
                    note.clean();
                }
                else if (note.isDirty) {
                    await connection.run(
                        'UPDATE Note SET date = ?, text = ?, spaceId = ? WHERE id = ?;',
                        mapDateToNumber(note.date), note.text, note.space.id, note.id
                    );
                    note.clean();
                }
                else if (note.isDeleted) {
                    await connection.run(
                        'DELETE FROM Note WHERE id = ?;',
                        note.id
                    );
                }
                if (!note.isDeleted) {
                    if (!!note.ownTag)
                        this._saveTag(note.ownTag, connection);
                    this._saveNoteTags(note.id, note.tags, connection);
                    this._deleteNoteTags(note.id, note.tagsPendingDeletion, connection);
                }
            }

            return Promise.resolve(notes.map(n => n.toJSON()))
        }
        finally {
            await connection.close();
        }
    }


    private async _saveTag(tag: Tag, connection: ISQLiteConnection): Promise<void> {
        if (tag.isNew) {
            await connection.run(
                'INSERT INTO Tag (id, name, color, availability) VALUES (?, ?, ?, ?);',
                tag.id, tag.name, mapColorToInt(tag.color), tag.availability
            );
            tag.clean();
        }
        else if (tag.isDirty) {
            await connection.run(
                'UPDATE Tag SET name = ?, color = ?, isPublic = ? WHERE id = ?;',
                tag.name, mapColorToInt(tag.color), tag.availability, tag.id
            );
            tag.clean();
        }
        else if (tag.isDeleted) {
            await connection.run(
                'DELETE Tag WHERE id = ?',
                tag.id
            );
        }
    }


    private async _saveNoteTags(noteId: number, noteTags: Array<NoteTag>, connection: ISQLiteConnection): Promise<void> {
        const inserts = noteTags.filter(x => x.isNew);
        const updates = noteTags.filter(x => x.isDirty);

        if (inserts.length > 0) {
            let command = 'INSERT INTO NoteTag (noteId, tagId, data) VALUES ' + inserts.map(x => '(?, ?, ?)').join(', ');
            let args = [];
            for (const insert of inserts) {
                args.push(noteId, insert.tag.id, !!insert.data ? JSON.stringify(insert.data) : null);
                insert.clean();
            }
            await connection.run(command, ...args);
        }
        for (const update of updates) {
            await connection.run(
                'UPDATE NoteTag SET data = ? WHERE noteId = ? AND tagId = ?;',
                !!update.data ? JSON.stringify(update.data) : null, noteId, update.tag.id
            );
            update.clean();
        }
    }

    private async _deleteNoteTags(noteId: number, noteTagsPendingDeletion: Array<NoteTag>, connection: ISQLiteConnection): Promise<void> {
        if (noteTagsPendingDeletion.length > 0) {
            let command = `DELETE FROM NoteTag WHERE noteId = ? AND tagId IN (${noteTagsPendingDeletion.map(x => x.tag.id).join(', ')})`;
            let args = [noteId];
            await connection.run(command, ...args);
        }
    }


    async customJob(name: string, data: any): Promise<any> {
        if (name == 'Raw SQL') {
            const connection = await this._connectionFactory();
            try {
                if (typeof(data) == 'string')
                    return await connection.run(data);
                else if (typeof(data) == 'function')
                    return await data(connection);
            }
            finally {
                await connection.close();
            }
        }
        throw Error(`Unrecognised custom job '${name}'`);
    }



    private _prepareQuery(query: string, spaceId?: number): string {
        const parsedQuery = parseQuery(query);
        return buildNotesQuery(parsedQuery, spaceId, this._cache);
    }


    private async _enforceForeignKeys(connection: ISQLiteConnection): Promise<void> {
        await connection.run('PRAGMA foreign_keys = ON');
    }
}