import { expect, test } from 'vitest';
import { NotuSQLiteClient } from '../src/NotuSQLiteClient';
import BetterSqlite3 from 'better-sqlite3';
import { Space, Note, Tag, NotuCache } from 'notu';
import { newNote, newSpace, newTag, testCacheFetcher } from './TestHelpers';
import { ISQLiteConnection } from '../src/SQLiteConnection';


const space1 = newSpace('Space 1', 1).clean();

const tag1 = newTag('Tag 1', 1).in(space1).clean();


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
    const note = new Note('test').in(space1);
    note.addTag(tag1);

    await client.saveNotes([note]);

    expect(note.id).toBe(345);
    expect(note.isClean).toBe(true);
    expect(connection.history[0].command).toBe('PRAGMA foreign_keys = ON');
    expect(connection.history[1].command).toBe('INSERT INTO Note (date, text, spaceId) VALUES (?, ?, ?);');
    expect(connection.history[2].command).toBe('INSERT INTO NoteTag (noteId, tagId) VALUES (?, ?)');
    expect(connection.history[2].args[0]).toBe(345);
    expect(connection.history.length).toBe(3);
});


test('customJob throws error if name not implemented', async () => {
    const connection = new MockConnection();
    const client = new NotuSQLiteClient(
        () => connection as any,
        new NotuCache(testCacheFetcher() as any)
    );
    try {
        await client.customJob('abcde', null);
        throw Error('Previous line should have thrown an error');
    }
    catch (err) {
    }
});

test('customJob runs raw SQL function', async () => {
    const connection = new MockConnection();
    const client = new NotuSQLiteClient(
        () => connection as any,
        new NotuCache(testCacheFetcher() as any)
    );
    const result = await client.customJob('Raw SQL', async (cnn: ISQLiteConnection) => {
        await cnn.run('Get some data');
        return 'abcde';
    });

    expect(connection.history.length).toBe(2);
    expect(connection.history[0]).toBe('Get some data');
    expect(connection.history[1]).toBe('CLOSED');
    expect(result).toBe('abcde');
});

test('customJob runs raw SQL string', async () => {
    const connection = new MockConnection();
    const client = new NotuSQLiteClient(
        () => connection as any,
        new NotuCache(testCacheFetcher() as any)
    );
    const result = await client.customJob('Raw SQL', 'Get some data');

    expect(connection.history.length).toBe(2);
    expect(connection.history[0]).toBe('Get some data');
    expect(connection.history[1]).toBe('CLOSED');
    expect(result).toBe(1);
});