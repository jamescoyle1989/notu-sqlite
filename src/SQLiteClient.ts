import { mapAttrTypeToDb } from './SQLMappings';
import { SQLiteCache } from './SQLiteCache';
import { SQLiteConnection } from './SQLiteConnection';
import { Attr, Note, NoteAttr, NoteTag, Space, Tag } from 'notu';


/**
 * Provides methods for common functionality when interacting with the DB
 */
export class SQLiteClient {
    setupSchema(connection: SQLiteConnection): void {
        if (!connection.getFirst(`SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'Note';`)) {
            connection.run(
                `CREATE TABLE Space (
                    id INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
                    name TEXT NOT NULL
                )`
            );
            
            connection.run(
                `CREATE TABLE Note (
                    id INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
                    spaceId INTEGER NOT NULL,
                    text TEXT NOT NULL,
                    date INTEGER NOT NULL,
                    archived INTEGER NOT NULL DEFAULT 0,
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
                    type INTEGER NOT NULL,
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
    }


    saveSpace(space: Space, connection: SQLiteConnection): void {
        if (space.isNew) {
            space.id = connection.run(
                'INSERT INTO Space (name) VALUES (?);',
                space.name
            ).lastInsertRowid as number;
            space.clean();
        }
        else if (space.isDirty) {
            connection.run(
                'UPDATE Space SET name = ? WHERE id = ?;',
                space.name, space.id
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
    }


    getNotes(notesQuery: string, connection: SQLiteConnection, cache: SQLiteCache): Array<Note> {
        try {
            const notesMap = new Map<number, Note>();
            const notes = connection
                .getAll(notesQuery)
                .map(x => {
                    const note = new Note(x.text).in(x.spaceId)
                        .at(new Date(x.date * 1000));
                    note.id = x.id;
                    note.archived = x.archived > 0;
                    note.clean();
                    notesMap.set(note.id, note);
                    return note;
                });
            
            const noteTagsSQL = `SELECT noteId, tagId FROM NoteTag WHERE noteId IN (${notes.map(n => n.id).join(',')});`;
            connection.getAll(noteTagsSQL)
                .map(x => {
                    const note = notesMap.get(x.noteId);
                    const tag = cache.getTagById(x.tagId, connection);
                    return note.addTag(tag).clean();
                });

            const noteAttrsSQL = `SELECT noteId, attrId, value FROM NoteAttr WHERE noteId IN (${notes.map(n => n.id).join(',')});`;
            connection.getAll(noteAttrsSQL)
                .map(x => {
                    const note = notesMap.get(x.noteId);
                    const attr = cache.getAttrById(x.attrId, connection);
                    const tag = cache.getTagById(x.tagId, connection);
                    const noteAttr = note.addAttr(attr);
                    if (tag != null)
                        noteAttr.tag = tag;
                    noteAttr.value = this._convertAttrValueFromDb(attr, x.value);
                    noteAttr.clean();
                    return noteAttr;
                });

            return notes;
        }
        finally {
            connection.close();
        }
    }


    saveAttr(attr: Attr, connection: SQLiteConnection): void {
        if (attr.isNew) {
            this._enforceForeignKeys(connection);
            attr.id = connection.run(
                'INSERT INTO Attr (spaceId, name, type) VALUES (?, ?, ?);',
                attr.spaceId, attr.name, mapAttrTypeToDb(attr.type)
            ).lastInsertRowid as number;
            attr.clean();
        }
        else if (attr.isDirty) {
            this._enforceForeignKeys(connection);
            connection.run(
                'UPDATE Attr SET spaceId = ?, name = ?, type = ? WHERE id = ?;',
                attr.spaceId, attr.name, mapAttrTypeToDb(attr.type), attr.id
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
    }


    saveNote(note: Note, connection: SQLiteConnection): void {
        this._enforceForeignKeys(connection);
        if (note.isNew) {
            note.id = connection.run(
                'INSERT INTO Note (date, text, archived, spaceId) VALUES (?, ?, ?, ?);',
                Math.round(note.date.getTime() / 1000), note.text, note.archived ? 1 : 0, note.spaceId
            ).lastInsertRowid as number;
            note.clean();
            for (const nt of note.tags)
                nt.noteId = note.id;
            for (const na of note.attrs)
                na.noteId = note.id;
        }
        else if (note.isDirty) {
            connection.run(
                'UPDATE Note SET date = ?, text = ?, archived = ?, spaceId = ? WHERE id = ?;',
                Math.round(note.date.getTime() / 1000), note.text, note.archived ? 1 : 0, note.spaceId
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
            this._saveNoteTags(note.tags, connection);
            this._saveNoteAttrs(note.attrs, connection);
        }
    }


    private _saveTag(tag: Tag, connection: SQLiteConnection): void {
        if (tag.isNew) {
            connection.run(
                'INSERT INTO Tag (id, name, color) VALUES (?, ?, ?);',
                tag.id, tag.name, tag.getColorInt()
            );
            tag.clean();
        }
        else if (tag.isDirty) {
            connection.run(
                'UPDATE Tag SET name = ?, color = ? WHERE id = ?;',
                tag.name, tag.getColorInt(), tag.id
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


    //Important that all note tags passed in must belong to the same note
    private _saveNoteTags(noteTags: Array<NoteTag>, connection: SQLiteConnection): void {
        const inserts = noteTags.filter(x => x.isNew);
        const deletes = noteTags.filter(x => x.isDeleted);

        if (inserts.length > 0) {
            let command = 'INSERT INTO NoteTag (noteId, tagId) VALUES ' + inserts.map(x => '(?, ?)').join(', ');
            let args = [];
            for (const insert of inserts) {
                args.push(insert.noteId, insert.tagId);
                insert.clean();
            }
            connection.run(command, ...args);
        }
        if (deletes.length > 0) {
            let command = `DELETE FROM NoteTag WHERE noteId = ? AND tagId IN (${deletes.map(x => x.tagId).join(', ')})`;
            let args = [deletes[0].noteId];
            for (const del of deletes)
                args.push(del.tagId);
            connection.run(command, ...args);
        }
    }


    private _saveNoteAttrs(noteAttrs: Array<NoteAttr>, connection: SQLiteConnection): void {
        const inserts = noteAttrs.filter(x => x.isNew);
        const updates = noteAttrs.filter(x => x.isDirty);
        const deletes = noteAttrs.filter(x => x.isDeleted);

        if (inserts.length > 0) {
            let command = 'INSERT INTO NoteAttr (noteId, attrId, value, tagId) VALUES ' + inserts.map(x => '(?, ?, ?, ?)').join(', ');
            let args = [];
            for (const insert of inserts) {
                args.push(insert.noteId, insert.attrId, this._convertAttrValueToDb(insert), insert.tagId);
                insert.clean();
            }
            connection.run(command, ...args);
        }
        for (const update of updates) {
            connection.run(
                'UPDATE NoteAttr SET value = ? WHERE noteId = ? AND attrId = ? AND tagId = ?;',
                this._convertAttrValueToDb(update), update.noteId, update.attrId, update.tagId
            );
            update.clean();
        }
        if (deletes.length > 0) {
            let command = `DELETE FROM NoteAttr WHERE noteId = ? AND (${deletes.map(x => '(attrId = ? AND tagId = ?)').join(' OR ')})`;
            let args = [deletes[0].noteId];
            for (const del of deletes)
                args.push(del.attrId, del.tagId);
            connection.run(command, ...args);
        }
    }


    private _enforceForeignKeys(connection: SQLiteConnection): void {
        connection.run('PRAGMA foreign_keys = ON');
    }

    private _convertAttrValueToDb(noteAttr: NoteAttr): any {
        if (noteAttr.attr.isBoolean)
            return noteAttr.value ? 1 : 0;
        if (noteAttr.attr.isDate)
            return Math.round(noteAttr.value.getTime() / 1000);
        return noteAttr.value;
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