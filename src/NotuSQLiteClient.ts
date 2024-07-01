import { mapAttrTypeFromDb, mapAttrTypeToDb, mapColorToInt, mapDateToNumber, mapNumberToDate } from './SQLMappings';
import { SQLiteConnection } from './SQLiteConnection';
import { Attr, Note, NoteAttr, NoteTag, NotuCache, Space, Tag, parseQuery } from 'notu';
import { buildNotesQuery } from './SQLiteQueryBuilder';


/**
 * Provides methods for common functionality when interacting with the DB
 */
export class NotuSQLiteClient {

    private _connectionFactory: () => SQLiteConnection;
    
    private _cache: NotuCache;

    constructor(connectionFactory: () => SQLiteConnection, cache: NotuCache) {
        this._connectionFactory = connectionFactory;
        this._cache = cache;
    }


    login(username: string, password: string): Promise<string> {
        throw Error('Not implemented.');
    }

    setup(): Promise<void> {
        const connection = this._connectionFactory();
        try {
            if (!connection.getFirst(`SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'Note';`)) {
                connection.run(
                    `CREATE TABLE Space (
                        id INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
                        name TEXT NOT NULL,
                        version TEXT NOT NULL
                    )`
                );
                
                connection.run(
                    `CREATE TABLE Note (
                        id INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
                        spaceId INTEGER NOT NULL,
                        text TEXT NOT NULL,
                        date INTEGER NOT NULL,
                        FOREIGN KEY (spaceId) REFERENCES Space(id) ON DELETE CASCADE
                    );`
                );
                connection.run(`CREATE INDEX Note_spaceId ON Note(spaceId);`);
                connection.run(`CREATE INDEX Note_date ON Note(date);`);
    
                connection.run(
                    `CREATE TABLE Tag (
                        id INTEGER NOT NULL,
                        name TEXT NOT NULL,
                        color INTEGER NULL,
                        isPublic INTEGER NOT NULL,
                        PRIMARY KEY (id),
                        FOREIGN KEY (id) REFERENCES Note(id) ON DELETE CASCADE
                    );`
                );
                connection.run(`CREATE INDEX Tag_id ON Tag(id);`);
    
                connection.run(
                    `CREATE TABLE NoteTag (
                        noteId INTEGER NOT NULL,
                        tagId INTEGER NOT NULL,
                        PRIMARY KEY (noteId, tagId),
                        FOREIGN KEY (noteId) REFERENCES Note(id) ON DELETE CASCADE,
                        FOREIGN KEY (tagId) REFERENCES Tag(id) ON DELETE CASCADE
                    );`
                );
                connection.run(`CREATE INDEX NoteTag_noteId ON NoteTag(noteId);`);
                connection.run(`CREATE INDEX NoteTag_tagId ON NoteTag(tagId);`);
    
                connection.run(
                    `CREATE TABLE Attr (
                        id INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
                        spaceId INTEGER NOT NULL,
                        name TEXT NOT NULL,
                        description TEXT NOT NULL,
                        type INTEGER NOT NULL,
                        color INTEGER NULL,
                        FOREIGN KEY (spaceId) REFERENCES Space(id) ON DELETE CASCADE
                    );`
                );
                connection.run(`CREATE INDEX Attr_spaceId ON Attr(spaceId);`);
    
                connection.run(
                    `CREATE TABLE NoteAttr (
                        noteId INTEGER NOT NULL,
                        attrId INTEGER NOT NULL,
                        value TEXT NOT NULL,
                        tagId INTEGER NULL,
                        PRIMARY KEY (noteId, attrId, tagId),
                        FOREIGN KEY (noteId) REFERENCES Note(id) ON DELETE CASCADE,
                        FOREIGN KEY (attrId) REFERENCES Attr(id) ON DELETE CASCADE,
                        FOREIGN KEY (tagId) REFERENCES Tag(id) ON DELETE CASCADE
                    );`
                );
                connection.run(`CREATE INDEX NoteAttr_noteId ON NoteAttr(noteId);`);
                connection.run(`CREATE INDEX NoteAttr_attrId ON NoteAttr(attrId);`);
                connection.run(`CREATE INDEX NoteAttr_tagId ON NoteAttr(tagId);`);
            }
    
            return Promise.resolve();
        }
        finally {
            connection.close();
        }
    }


    saveSpace(space: Space): Promise<any> {
        if (space.isClean)
            return Promise.resolve();

        const connection = this._connectionFactory();
        try {
            if (space.isNew) {
                space.id = connection.run(
                    'INSERT INTO Space (name, version) VALUES (?, ?);',
                    space.name, space.version
                ).lastInsertRowid as number;
                space.clean();
            }
            else if (space.isDirty) {
                connection.run(
                    'UPDATE Space SET name = ?, version = ? WHERE id = ?;',
                    space.name, space.version, space.id
                );
                space.clean();
            }
            else if (space.isDeleted) {
                this._enforceForeignKeys(connection);
                connection.run(
                    'DELETE FROM Space WHERE id = ?;',
                    space.id
                );
            }
    
            return Promise.resolve(space.toJSON());
        }
        finally {
            connection.close();
        }
    }


    saveAttr(attr: Attr): Promise<any> {
        if (attr.isClean)
            return Promise.resolve();

        const connection = this._connectionFactory();
        try {
            if (attr.isNew) {
                this._enforceForeignKeys(connection);
                attr.id = connection.run(
                    'INSERT INTO Attr (spaceId, name, description, type, color) VALUES (?, ?, ?, ?, ?);',
                    attr.space.id, attr.name, attr.description, mapAttrTypeToDb(attr.type), mapColorToInt(attr.color)
                ).lastInsertRowid as number;
                attr.clean();
            }
            else if (attr.isDirty) {
                this._enforceForeignKeys(connection);
                connection.run(
                    'UPDATE Attr SET spaceId = ?, name = ?, description = ?, type = ?, color = ? WHERE id = ?;',
                    attr.space.id, attr.name, attr.description, mapAttrTypeToDb(attr.type), mapColorToInt(attr.color), attr.id
                );
                attr.clean();
            }
            else if (attr.isDeleted) {
                this._enforceForeignKeys(connection);
                connection.run(
                    'DELETE FROM Attr WHERE id = ?;',
                    attr.id
                );
            }
    
            return Promise.resolve(attr.toJSON());
        }
        finally {
            connection.close();
        }
    }


    getNotes(query: string, space: number | Space): Promise<Array<any>> {
        if (space instanceof Space)
            space = space.id;

        query = this._prepareQuery(query, space).substring(query.indexOf(' FROM '));

        return Promise.resolve(this._getNotesFromQuery(query));
    }

    getRelatedNotes(tag: Tag | Note | number): Promise<Array<any>> {
        if (tag instanceof Tag)
            tag = tag.id;
        if (tag instanceof Note)
            tag = tag.id;

        const query = `SELECT n.id, n.spaceId, n.text, n.date FROM Note n INNER JOIN NoteTag nt ON nt.noteId = n.id WHERE nt.tagId = ${tag}`;

        return Promise.resolve(this._getNotesFromQuery(query));
    }

    private _getNotesFromQuery(query: string): Array<any> {
        const connection = this._connectionFactory();
        try {
            const notesMap = new Map<number, any>();
            const notes = connection.getAll(query).map(x => {
                const note = {
                    state: 'CLEAN',
                    id: x.id,
                    date: mapNumberToDate(x.date),
                    text: x.text,
                    spaceId: x.spaceId,
                    ownTag: null,
                    tags: [],
                    attrs: []
                };
                notesMap.set(note.id, note);
                return note;
            });
                
            const noteTagsSQL = `SELECT noteId, tagId FROM NoteTag WHERE noteId IN (${notes.map(n => n.id).join(',')});`;
            connection.getAll(noteTagsSQL).map(x => {
                const nt = {
                    state: 'CLEAN',
                    tagId: x.tagId,
                    attrs: []
                };
                const note = notesMap.get(x.noteId);
                note.tags.push(nt);
            });

            const noteAttrsSQL = `SELECT na.noteId, na.attrId, na.tagId, na.value, a.type ` +
                                `FROM NoteAttr na INNER JOIN Attr a ON na.attrId = a.id ` +
                                `WHERE noteId IN (${notes.map(n => n.id).join(',')});`;
            connection.getAll(noteAttrsSQL).map(x => {
                const na = {
                    state: 'CLEAN',
                    attrId: x.attrId,
                    tagId: x.tagId,
                    value: this._convertAttrValueFromDb(mapAttrTypeFromDb(x.type), x.value)
                };
                const note = notesMap.get(x.noteId);
                if (!!na.tagId)
                    note.tags.find(x => x.tagId == na.tagId).attrs.push(na);
                else
                    note.attrs.push(na);
            });

            return notes;
        }
        finally {
            connection.close();
        }
    }

    getNoteCount(query: string, space: number | Space): Promise<number> {
        if (space instanceof Space)
            space = space.id;

        query = 'SELECT COUNT(*) AS cnt' + this._prepareQuery(query, space).substring(query.indexOf(' FROM '));

        const connection = this._connectionFactory();
        try {
            return Promise.resolve(connection.getFirst(query).cnt);
        }
        finally {
            connection.close();
        }
    }


    saveNotes(notes: Array<Note>): Promise<Array<any>> {
        const connection = this._connectionFactory();
        this._enforceForeignKeys(connection);
        try {
            for (const note of notes) {
                if (note.isNew) {
                    note.id = connection.run(
                        'INSERT INTO Note (date, text, spaceId) VALUES (?, ?, ?);',
                        mapDateToNumber(note.date), note.text, note.space.id
                    ).lastInsertRowid as number;
                    note.clean();
                }
                else if (note.isDirty) {
                    connection.run(
                        'UPDATE Note SET date = ?, text = ?, spaceId = ? WHERE id = ?;',
                        mapDateToNumber(note.date), note.text, note.space.id, note.id
                    );
                    note.clean();
                }
                else if (note.isDeleted) {
                    connection.run(
                        'DELETE FROM Note WHERE id = ?;',
                        note.id
                    );
                }
                if (!note.isDeleted) {
                    if (!!note.ownTag)
                        this._saveTag(note.ownTag, connection);
                    this._saveNoteTags(note.id, note.tags, connection);
                    this._deleteNoteTags(note.id, note.tagsPendingDeletion, connection);
                    const allActiveNas = note.attrs;
                    const allNasPendingDeletiong  = note.attrsPendingDeletion;
                    for (const nt of note.tags) {
                        allActiveNas.push(...nt.attrs);
                        allNasPendingDeletiong.push(...nt.attrsPendingDeletion);
                    }
                    this._saveNoteAttrs(note.id, allActiveNas, connection);
                    this._deleteNoteAttrs(note.id, allNasPendingDeletiong, connection);
                }
            }

            return Promise.resolve(notes.map(n => n.toJSON()))
        }
        finally {
            connection.close();
        }
    }


    private _saveTag(tag: Tag, connection: SQLiteConnection): void {
        if (tag.isNew) {
            connection.run(
                'INSERT INTO Tag (id, name, color, isPublic) VALUES (?, ?, ?, ?);',
                tag.id, tag.name, mapColorToInt(tag.color), tag.isPublic ? 1 : 0
            );
            tag.clean();
        }
        else if (tag.isDirty) {
            connection.run(
                'UPDATE Tag SET name = ?, color = ?, isPublic = ? WHERE id = ?;',
                tag.name, mapColorToInt(tag.color), tag.isPublic ? 1 : 0, tag.id
            );
            tag.clean();
        }
        else if (tag.isDeleted) {
            connection.run(
                'DELETE Tag WHERE id = ?',
                tag.id
            );
        }
    }


    private _saveNoteTags(noteId: number, noteTags: Array<NoteTag>, connection: SQLiteConnection): void {
        const inserts = noteTags.filter(x => x.isNew);

        if (inserts.length > 0) {
            let command = 'INSERT INTO NoteTag (noteId, tagId) VALUES ' + inserts.map(x => '(?, ?)').join(', ');
            let args = [];
            for (const insert of inserts) {
                args.push(noteId, insert.tag.id);
                insert.clean();
            }
            connection.run(command, ...args);
        }
    }

    private _deleteNoteTags(noteId: number, noteTagsPendingDeletion: Array<NoteTag>, connection: SQLiteConnection): void {
        if (noteTagsPendingDeletion.length > 0) {
            let command = `DELETE FROM NoteTag WHERE noteId = ? AND tagId IN (${noteTagsPendingDeletion.map(x => x.tag.id).join(', ')})`;
            let args = [noteId];
            connection.run(command, ...args);
        }
    }


    private _saveNoteAttrs(noteId: number, noteAttrs: Array<NoteAttr>, connection: SQLiteConnection): void {
        const inserts = noteAttrs.filter(x => x.isNew);
        const updates = noteAttrs.filter(x => x.isDirty);

        if (inserts.length > 0) {
            let command = 'INSERT INTO NoteAttr (noteId, attrId, value, tagId) VALUES ' + inserts.map(x => '(?, ?, ?, ?)').join(', ');
            let args = [];
            for (const insert of inserts) {
                args.push(noteId, insert.attr.id, this._convertAttrValueToDb(insert), insert.tag?.id ?? null);
                insert.clean();
            }
            connection.run(command, ...args);
        }
        for (const update of updates) {
            connection.run(
                'UPDATE NoteAttr SET value = ? WHERE noteId = ? AND attrId = ? AND COALESCE(tagId, 0) = ?;',
                this._convertAttrValueToDb(update), noteId, update.attr.id, update.tag?.id ?? 0
            );
            update.clean();
        }
    }

    private _deleteNoteAttrs(noteId: number, noteAttrsForDeletion: Array<NoteAttr>, connection: SQLiteConnection): void {
        if (noteAttrsForDeletion.length > 0) {
            let command = `DELETE FROM NoteAttr WHERE noteId = ? AND (${noteAttrsForDeletion.map(x => '(attrId = ? AND COALESCE(tagId, 0) = ?)').join(' OR ')})`;
            let args = [noteId];
            for (const del of noteAttrsForDeletion)
                args.push(del.attr.id, del.tag?.id ?? 0);
            connection.run(command, ...args);
        }
    }


    customJob(name: string, data: any): Promise<any> {
        return Promise.resolve({});
    }



    private _prepareQuery(query: string, spaceId: number): string {
        const parsedQuery = parseQuery(query);
        return buildNotesQuery(parsedQuery, spaceId, this._cache);
    }


    private _enforceForeignKeys(connection: SQLiteConnection): void {
        connection.run('PRAGMA foreign_keys = ON');
    }

    private _convertAttrValueToDb(noteAttr: NoteAttr): any {
        if (noteAttr.attr.isBoolean)
            return noteAttr.value ? 1 : 0;
        if (noteAttr.attr.isDate) {
            const dateValue = new Date(noteAttr.value);
            if (!(noteAttr.value instanceof Date))
                noteAttr.value = dateValue;
            return mapDateToNumber(dateValue);
        }
        return noteAttr.value;
    }

    private _convertAttrValueFromDb(attrType: string, value: string) {
        if (attrType == 'BOOLEAN')
            return Number(value) > 0;
        if (attrType == 'DATE')
            return mapNumberToDate(Number(value));
        if (attrType == 'NUMBER')
            return Number(value);
        return value;
    }
}