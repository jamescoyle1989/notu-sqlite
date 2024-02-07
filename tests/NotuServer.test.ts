import { expect, test } from 'vitest';
import NotuServer from '../src/NotuServer';
import { MockConnection } from './SQLiteClient.test';
import SQLiteCache from '../src/SQLiteCache';
import SQLiteClient from '../src/SQLiteClient';


function mockSpaceSetup(): Array<any> {
    return [
        { id: 1, name: 'Live' },
        { id: 2, name: 'Laugh' },
        { id: 3, name: 'Love' }
    ];
}

function mockTagSetup(): Array<any> {
    return [
        { id: 1, name: 'Live', spaceId: 1 },
        { id: 2, name: 'Live', spaceId: 2 },
        { id: 3, name: 'Laugh', spaceId: 1 },
        { id: 4, name: 'Love', spaceId: 2 }
    ];
}

function mockAttrSetup(): Array<any> {
    return [
        { id: 1, name: 'Live', spaceId: 1, type: 1 },
        { id: 2, name: 'Laugh', spaceId: 1, type: 2 },
        { id: 3, name: 'Love', spaceId: 2, type: 3 }
    ];
}

function setupMockCache(connection: MockConnection): SQLiteCache {
    const cache = new SQLiteCache();

    connection.nextGetAllOutput = mockSpaceSetup();
    cache.getSpaces(connection as any);

    connection.nextGetAllOutput = mockTagSetup();
    cache.getTag('Live', 1, connection as any);

    connection.nextGetAllOutput = mockAttrSetup();
    cache.getAttr('Live', 1, connection as any);

    return cache;
}


test('getSpaces returns all spaces', () => {
    const server = new NotuServer(
        () => {
            const connection = new MockConnection();
            connection.nextGetAllOutput = mockSpaceSetup();
            return connection as any;
        },
        new SQLiteClient(),
        new SQLiteCache()
    );

    const spaces = server.getSpaces();

    expect(spaces.length).toBe(3);
});


test('getNotes properly queries the database', () => {
    const cache = setupMockCache(new MockConnection());
    const connection = new MockConnection();
    const server = new NotuServer(
        () => connection as any,
        new SQLiteClient(),
        cache
    );
    connection.nextGetAllOutput = [
        {id: 1, spaceId: 1, text: 'hello', date: new Date(2023, 10, 13), archived: false}
    ];
    connection.onGetAll = () => {
        connection.nextGetAllOutput = [{noteId: 1, tagId: 2}];

        connection.onGetAll = () => {
            connection.nextGetAllOutput = [{noteId: 1, attrId: 1, tagId: null, value: 'test'}]
        };
    };

    const notes = server.getNotes('#Live', 1);

    expect(notes.length).toBe(1);
    expect(notes[0].text).toBe('hello');
    expect(notes[0].tags.length).toBe(1);
    expect(notes[0].attrs.length).toBe(1);
    expect(connection.history.length).toBe(3);
    expect(connection.history[0].command).toBe(`SELECT n.id, n.spaceId, n.text, n.date, n.archived FROM Note n WHERE EXISTS(SELECT 1 FROM NoteTag nt WHERE nt.noteId = n.id AND nt.tagId = 1);`);
    expect(connection.history[1].command).toBe(`SELECT noteId, tagId FROM NoteTag WHERE noteId IN (1);`);
    expect(connection.history[2].command).toBe(`SELECT noteId, attrId, value FROM NoteAttr WHERE noteId IN (1);`);
});