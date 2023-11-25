import { expect, test } from 'vitest';
import SQLiteClient from './SQLiteClient';
import BetterSqlite3 from 'better-sqlite3';
import { Space, Attr, Note } from 'notu';


export class MockConnection {
    history: Array<{type: string, command: string, args: Array<any>}> = [];
    isOpen: boolean = true;

    nextRunOutput: BetterSqlite3.RunResult = null;
    nextGetFirstOutput: any = null;
    nextGetAllOutput: Array<any> = null;

    onGetAll: () => void;
    
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
            this.onGetAll();
        return output;
    }

    close(): void {
        this.isOpen = false;
    }
}


test('setupSchema doesnt do anything if Note table exists', () => {
    const client = new SQLiteClient();
    const connection = new MockConnection();
    connection.nextGetFirstOutput = { name: 'Note' };

    client.setupSchema(connection as any);

    expect(connection.history.filter(x => x.type == 'run').length).toBe(0);
});

test('setupSchema runs a bunch of commands if Note table doesnt exist', () => {
    const client = new SQLiteClient();
    const connection = new MockConnection();
    
    client.setupSchema(connection as any);

    const runHistory = connection.history.filter(x => x.type == 'run');
    expect(runHistory.length).toBeGreaterThan(0);
    expect(runHistory.find(x => x.command.startsWith('CREATE TABLE Note'))).toBeTruthy();
    expect(runHistory.find(x => x.command.startsWith('CREATE TABLE NoteAttr'))).toBeTruthy();
});


test('saveSpace inserts new space', () => {
    const client = new SQLiteClient();
    const connection = new MockConnection();
    connection.nextRunOutput = { changes: 1, lastInsertRowid: 123 };
    const space = new Space('test');
    
    client.saveSpace(space, connection as any);

    expect(space.id).toBe(123);
    expect(space.isClean).toBe(true);
    expect(connection.history[0].command).toBe('INSERT INTO Space (name) VALUES (?);');
    expect(connection.history.length).toBe(1);
});

test('saveSpace updates space if dirty', () => {
    const client = new SQLiteClient();
    const connection = new MockConnection();
    const space = new Space('test').dirty();
    space.id = 47;

    client.saveSpace(space, connection as any);

    expect(space.isClean).toBe(true);
    expect(connection.history[0].command).toBe('UPDATE Space SET name = ? WHERE id = ?;');
    expect(connection.history.length).toBe(1);
});

test('saveSpace deletes space if flagged for deletion', () => {
    const client = new SQLiteClient();
    const connection = new MockConnection();
    const space = new Space('test').delete();
    space.id = 87;

    client.saveSpace(space, connection as any);

    expect(connection.history[0].command).toBe('PRAGMA foreign_keys = ON');
    expect(connection.history[1].command).toBe('DELETE FROM Space WHERE id = ?;');
    expect(connection.history.length).toBe(2);
});


test('saveAttr inserts new attr', () => {
    const client = new SQLiteClient();
    const connection = new MockConnection();
    connection.nextRunOutput = { changes: 1, lastInsertRowid: 234 };
    const attr = new Attr().asText();
    attr.name = 'test';
    attr.spaceId = 10;
    attr.new();

    client.saveAttr(attr, connection as any);

    expect(attr.id).toBe(234);
    expect(attr.isClean).toBe(true);
    expect(connection.history[0].command).toBe('PRAGMA foreign_keys = ON');
    expect(connection.history[1].command).toBe('INSERT INTO Attr (spaceId, name, type) VALUES (?, ?, ?);');
    expect(connection.history.length).toBe(2);
});

test('saveAttr updates dirty attr', () => {
    const client = new SQLiteClient();
    const connection = new MockConnection();
    const attr = new Attr().asNumber().dirty();
    attr.id = 45;
    attr.name = 'test';
    attr.spaceId = 10;

    client.saveAttr(attr, connection as any);

    expect(attr.isClean).toBe(true);
    expect(connection.history[0].command).toBe('PRAGMA foreign_keys = ON');
    expect(connection.history[1].command).toBe('UPDATE Attr SET spaceId = ?, name = ?, type = ? WHERE id = ?;');
    expect(connection.history.length).toBe(2);
});

test('saveAttr deletes attr if flagged for deletion', () => {
    const client = new SQLiteClient();
    const connection = new MockConnection();
    const attr = new Attr('test').in(10).asNumber().delete();
    attr.id = 45;

    client.saveAttr(attr, connection as any);

    expect(connection.history[0].command).toBe('PRAGMA foreign_keys = ON');
    expect(connection.history[1].command).toBe('DELETE FROM Attr WHERE id = ?;');
    expect(connection.history.length).toBe(2);
});


test('saveNote inserts new note', () => {
    const client = new SQLiteClient();
    const connection = new MockConnection();
    connection.nextRunOutput = { changes: 1, lastInsertRowid: 345 };
    const note = new Note('test').in(78);

    client.saveNote(note, connection as any);

    expect(note.id).toBe(345);
    expect(note.isClean).toBe(true);
    expect(connection.history[0].command).toBe('PRAGMA foreign_keys = ON');
    expect(connection.history[1].command).toBe('INSERT INTO Note (date, text, archived, spaceId) VALUES (?, ?, ?, ?);');
    expect(connection.history.length).toBe(2);
});

test('saveNote updates dirty attr', () => {
    const client = new SQLiteClient();
    const connection = new MockConnection();
    const note = new Note('test').in(78).dirty();
    note.id = 9;

    client.saveNote(note, connection as any);

    expect(note.isClean).toBe(true);
    expect(connection.history[0].command).toBe('PRAGMA foreign_keys = ON');
    expect(connection.history[1].command).toBe('UPDATE Note SET date = ?, text = ?, archived = ?, spaceId = ? WHERE id = ?;');
    expect(connection.history.length).toBe(2);
});

test('saveNote deletes attr if flagged for deletion', () => {
    const client = new SQLiteClient();
    const connection = new MockConnection();
    const note = new Note('test').in(78).delete();
    note.id = 9;

    client.saveNote(note, connection as any);

    expect(connection.history[0].command).toBe('PRAGMA foreign_keys = ON');
    expect(connection.history[1].command).toBe('DELETE FROM Note WHERE id = ?;');
    expect(connection.history.length).toBe(2);
});