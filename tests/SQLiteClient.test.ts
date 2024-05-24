import { expect, test } from 'vitest';
import { NotuSQLiteClient } from '../src/NotuSQLiteClient';
import BetterSqlite3 from 'better-sqlite3';
import { Space, Attr, Note, Tag, NotuCache } from 'notu';
import { newAttr, newNote, newSpace, newTag, testCacheFetcher } from './TestHelpers';


const space1 = newSpace('Space 1', 1).clean();

const tag1 = newTag('Tag 1', 1).in(space1).clean();

const dateAttr = newAttr('Date Attr', 1).in(space1).asDate().clean();
const numberAttr = newAttr('Number Attr', 2).in(space1).asNumber().clean();
const boolAttr = newAttr('Bool Attr', 3).in(space1).asBoolean().clean();


export class MockConnection {
    history: Array<{type: string, command: string, args: Array<any>}> = [];
    isOpen: boolean = true;

    nextRunOutput: BetterSqlite3.RunResult;
    nextGetFirstOutput: any = null;
    nextGetAllOutput: Array<any>;

    onGetAll: (query: string) => void;
    
    run(command: string, ...args: Array<any>): BetterSqlite3.RunResult {
        this.history.push({type: 'run', command, args});
        return this.nextRunOutput;
    }

    getFirst(query: string, ...args: Array<any>): any {
        this.history.push({type: 'getFirst', command: query, args});
        return this.nextGetFirstOutput;
    }

    getAll(query: string, ...args: Array<any>): Array<any> {
        this.history.push({type: 'getAll', command: query, args});
        const output = this.nextGetAllOutput;
        if (!!this.onGetAll)
            this.onGetAll(query);
        return output;
    }

    close(): void {
        this.isOpen = false;
    }
}


test('setup doesnt do anything if Note table exists', async () => {
    const connection = new MockConnection();
    const client = new NotuSQLiteClient(
        () => connection as any,
        new NotuCache(testCacheFetcher() as any)
    );
    connection.nextGetFirstOutput = { name: 'Note' };

    await client.setup();

    expect(connection.history.filter(x => x.type == 'run').length).toBe(0);
});

test('setupSchema runs a bunch of commands if Note table doesnt exist', async () => {
    const connection = new MockConnection();
    const client = new NotuSQLiteClient(
        () => connection as any,
        new NotuCache(testCacheFetcher() as any)
    );
    
    await client.setup();

    const runHistory = connection.history.filter(x => x.type == 'run');
    expect(runHistory.length).toBeGreaterThan(0);
    expect(runHistory.find(x => x.command.startsWith('CREATE TABLE Note'))).toBeTruthy();
    expect(runHistory.find(x => x.command.startsWith('CREATE TABLE NoteAttr'))).toBeTruthy();
});


test('saveSpace inserts new space', async () => {
    const connection = new MockConnection();
    const client = new NotuSQLiteClient(
        () => connection as any,
        new NotuCache(testCacheFetcher() as any)
    );
    connection.nextRunOutput = { changes: 1, lastInsertRowid: 123 };
    const space = new Space('test');
    
    await client.saveSpace(space);

    expect(space.id).toBe(123);
    expect(space.isClean).toBe(true);
    expect(connection.history[0].command).toBe('INSERT INTO Space (name, version) VALUES (?, ?);');
    expect(connection.history.length).toBe(1);
});

test('saveSpace updates space if dirty', async () => {
    const connection = new MockConnection();
    const client = new NotuSQLiteClient(
        () => connection as any,
        new NotuCache(testCacheFetcher() as any)
    );
    const space = newSpace('test', 47).dirty();

    await client.saveSpace(space);

    expect(space.isClean).toBe(true);
    expect(connection.history[0].command).toBe('UPDATE Space SET name = ?, version = ? WHERE id = ?;');
    expect(connection.history.length).toBe(1);
});

test('saveSpace deletes space if flagged for deletion', async () => {
    const connection = new MockConnection();
    const client = new NotuSQLiteClient(
        () => connection as any,
        new NotuCache(testCacheFetcher() as any)
    );
    const space = newSpace('test', 87).delete();

    await client.saveSpace(space);

    expect(connection.history[0].command).toBe('PRAGMA foreign_keys = ON');
    expect(connection.history[1].command).toBe('DELETE FROM Space WHERE id = ?;');
    expect(connection.history.length).toBe(2);
});

test('saveSpace returns json representation of saved space', async () => {
    const connection = new MockConnection();
    const client = new NotuSQLiteClient(
        () => connection as any,
        new NotuCache(testCacheFetcher() as any)
    );
    const space = newSpace('test', 87).dirty();

    const spaceData = await client.saveSpace(space);

    expect(spaceData.id).toBe(87);
    expect(spaceData.name).toBe('test');
    expect(spaceData).toEqual(space.toJSON());
});


test('saveAttr inserts new attr', async () => {
    const connection = new MockConnection();
    const client = new NotuSQLiteClient(
        () => connection as any,
        new NotuCache(testCacheFetcher() as any)
    );
    connection.nextRunOutput = { changes: 1, lastInsertRowid: 234 };
    const attr = newAttr('test', 10).in(space1).asText().new();

    await client.saveAttr(attr);

    expect(attr.id).toBe(234);
    expect(attr.isClean).toBe(true);
    expect(connection.history[0].command).toBe('PRAGMA foreign_keys = ON');
    expect(connection.history[1].command).toBe('INSERT INTO Attr (spaceId, name, description, type, color) VALUES (?, ?, ?, ?, ?);');
    expect(connection.history.length).toBe(2);
});

test('saveAttr updates dirty attr', async () => {
    const connection = new MockConnection();
    const client = new NotuSQLiteClient(
        () => connection as any,
        new NotuCache(testCacheFetcher() as any)
    );
    const attr = newAttr('test', 45).in(space1).asNumber().dirty();

    await client.saveAttr(attr);

    expect(attr.isClean).toBe(true);
    expect(connection.history[0].command).toBe('PRAGMA foreign_keys = ON');
    expect(connection.history[1].command).toBe('UPDATE Attr SET spaceId = ?, name = ?, description = ?, type = ?, color = ? WHERE id = ?;');
    expect(connection.history.length).toBe(2);
});

test('saveAttr deletes attr if flagged for deletion', async () => {
    const connection = new MockConnection();
    const client = new NotuSQLiteClient(
        () => connection as any,
        new NotuCache(testCacheFetcher() as any)
    );
    const attr = newAttr('test', 45).in(space1).asNumber().delete();

    await client.saveAttr(attr);

    expect(connection.history[0].command).toBe('PRAGMA foreign_keys = ON');
    expect(connection.history[1].command).toBe('DELETE FROM Attr WHERE id = ?;');
    expect(connection.history.length).toBe(2);
});

test('saveAttr returns json representation of saved attr', async () => {
    const connection = new MockConnection();
    const client = new NotuSQLiteClient(
        () => connection as any,
        new NotuCache(testCacheFetcher() as any)
    );
    const attr = newAttr('test', 45).in(space1).asNumber().dirty();

    const attrData = await client.saveAttr(attr);

    expect(attrData.id).toBe(45);
    expect(attrData.name).toBe('test');
    expect(attrData).toEqual(attr.toJSON());
});


test('saveNote inserts new note', async () => {
    const connection = new MockConnection();
    const client = new NotuSQLiteClient(
        () => connection as any,
        new NotuCache(testCacheFetcher() as any)
    );
    connection.nextRunOutput = { changes: 1, lastInsertRowid: 345 };
    const note = new Note('test').in(space1);

    await client.saveNotes([note]);

    expect(note.id).toBe(345);
    expect(note.isClean).toBe(true);
    expect(connection.history[0].command).toBe('PRAGMA foreign_keys = ON');
    expect(connection.history[1].command).toBe('INSERT INTO Note (date, text, spaceId) VALUES (?, ?, ?);');
    expect(connection.history.length).toBe(2);
});

test('saveNote updates dirty note', async () => {
    const connection = new MockConnection();
    const client = new NotuSQLiteClient(
        () => connection as any,
        new NotuCache(testCacheFetcher() as any)
    );
    const note = newNote('test', 9).in(space1).dirty();

    await client.saveNotes([note]);

    expect(note.isClean).toBe(true);
    expect(connection.history[0].command).toBe('PRAGMA foreign_keys = ON');
    expect(connection.history[1].command).toBe('UPDATE Note SET date = ?, text = ?, spaceId = ? WHERE id = ?;');
    expect(connection.history.length).toBe(2);
});

test('saveNote deletes note if flagged for deletion', async () => {
    const connection = new MockConnection();
    const client = new NotuSQLiteClient(
        () => connection as any,
        new NotuCache(testCacheFetcher() as any)
    );
    const note = newNote('test', 9).in(space1).delete();

    await client.saveNotes([note]);

    expect(connection.history[0].command).toBe('PRAGMA foreign_keys = ON');
    expect(connection.history[1].command).toBe('DELETE FROM Note WHERE id = ?;');
    expect(connection.history.length).toBe(2);
});

test('saveNote deletes attr if flagged for deletion', async () => {
    const connection = new MockConnection();
    const client = new NotuSQLiteClient(
        () => connection as any,
        new NotuCache(testCacheFetcher() as any)
    );
    const note = newNote('test', 9).in(space1).addAttr(numberAttr, 25).clean();
    note.getAttr(numberAttr).clean();
    note.removeAttr(numberAttr);

    await client.saveNotes([note]);

    expect(connection.history[0].command).toBe('PRAGMA foreign_keys = ON');
    expect(connection.history[1].command).toBe('DELETE FROM NoteAttr WHERE noteId = ? AND ((attrId = ? AND COALESCE(tagId, 0) = ?))');
    expect(connection.history[1].args[0]).toBe(note.id);
    expect(connection.history[1].args[1]).toBe(numberAttr.id);
    expect(connection.history[1].args[2]).toBe(0);
    expect(connection.history.length).toBe(2);
});

test('saveNote correctly saves true boolean attr', async () => {
    const connection = new MockConnection();
    const client = new NotuSQLiteClient(
        () => connection as any,
        new NotuCache(testCacheFetcher() as any)
    );
    const note = newNote('test', 9).in(space1).clean().addAttr(boolAttr, false);
    const na = note.getAttr(boolAttr).clean();
    na.value = true;

    await client.saveNotes([note]);

    expect(connection.history[0].command).toBe('PRAGMA foreign_keys = ON');
    expect(connection.history[1].command).toBe('UPDATE NoteAttr SET value = ? WHERE noteId = ? AND attrId = ? AND COALESCE(tagId, 0) = ?;');
    expect(connection.history[1].args[0]).toBe(1);
    expect(connection.history[1].args[1]).toBe(note.id);
    expect(connection.history[1].args[2]).toBe(boolAttr.id);
    expect(connection.history[1].args[3]).toBe(0);
});

test('getNotes fetches notes in correct format', async () => {
    const connection = new MockConnection();
    const client = new NotuSQLiteClient(
        () => connection as any,
        new NotuCache(testCacheFetcher() as any)
    );
    connection.nextGetAllOutput = [
        {id: 5, spaceId: 1, text: 'Test test', date: 11708573979, tagId: null}
    ];
    connection.onGetAll = () => connection.nextGetAllOutput = [];

    const notes = await client.getNotes('', space1);

    expect(notes.length).toBe(1);
    expect(notes[0].id).toBe(5);
    expect(notes[0].spaceId).toBe(1);
    expect(notes[0].text).toBe('Test test');
    expect(notes[0].date.getTime()).toBe(11708573979000);
});

test('saveNotes for new note sets noteId on tags & attrs', async () => {
    const connection = new MockConnection();
    const client = new NotuSQLiteClient(
        () => connection as any,
        new NotuCache(testCacheFetcher() as any)
    );
    connection.nextRunOutput = { changes: 1, lastInsertRowid: 345 };
    const note = new Note('test').in(space1).addAttr(numberAttr, 987);
    note.addTag(tag1);

    await client.saveNotes([note]);

    expect(note.id).toBe(345);
    expect(note.isClean).toBe(true);
    expect(connection.history[0].command).toBe('PRAGMA foreign_keys = ON');
    expect(connection.history[1].command).toBe('INSERT INTO Note (date, text, spaceId) VALUES (?, ?, ?);');
    expect(connection.history[2].command).toBe('INSERT INTO NoteTag (noteId, tagId) VALUES (?, ?)');
    expect(connection.history[2].args[0]).toBe(345);
    expect(connection.history[3].command).toBe('INSERT INTO NoteAttr (noteId, attrId, value, tagId) VALUES (?, ?, ?, ?)');
    expect(connection.history[3].args[0]).toBe(345);
    expect(connection.history.length).toBe(4);
});

test('saveNote with date attr handles if the value is formatted as a string', async () => {
    const connection = new MockConnection();
    const client = new NotuSQLiteClient(
        () => connection as any,
        new NotuCache(testCacheFetcher() as any)
    );
    connection.nextRunOutput = { changes: 1, lastInsertRowid: 345 };
    const note = new Note('test').in(space1).addAttr(dateAttr, '1988-08-07T00:00:00.000Z');

    await client.saveNotes([note]);

    expect(connection.history[0].command).toBe('PRAGMA foreign_keys = ON');
    expect(connection.history[1].command).toBe('INSERT INTO Note (date, text, spaceId) VALUES (?, ?, ?);');
    expect(connection.history[2].command).toBe('INSERT INTO NoteAttr (noteId, attrId, value, tagId) VALUES (?, ?, ?, ?)');
    expect(connection.history[2].args[2]).toBe(new Date('1988-08-07T00:00:00.000Z').getTime() / 1000);
    expect(note.attrs[0].value.getTime()).toBe(new Date('1988-08-07T00:00:00.000Z').getTime());
});