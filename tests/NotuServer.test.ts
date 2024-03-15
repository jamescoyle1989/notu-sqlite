import { expect, test } from 'vitest';
import { NotuServer } from '../src/NotuServer';
import { MockConnection } from './SQLiteClient.test';
import { SQLiteCache } from '../src/SQLiteCache';
import { SQLiteClient } from '../src/SQLiteClient';
import { Attr, Note, NoteAttr, NoteTag, Space } from 'notu';


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
    expect(connection.history[0].command).toBe(`SELECT n.id, n.spaceId, n.text, n.date, n.archived FROM Note n WHERE n.spaceId = 1 AND (EXISTS(SELECT 1 FROM NoteTag nt WHERE nt.noteId = n.id AND nt.tagId = 1));`);
    expect(connection.history[1].command).toBe(`SELECT noteId, tagId FROM NoteTag WHERE noteId IN (1);`);
    expect(connection.history[2].command).toBe(`SELECT noteId, attrId, value FROM NoteAttr WHERE noteId IN (1);`);
});


test('saveAttr invalidates the existing attr cache', () => {
    const connection = new MockConnection();
    const cache = setupMockCache(connection);
    const server = new NotuServer(
        () => connection as any,
        new SQLiteClient(),
        cache
    );
    let cacheRefetchCount = 0;
    connection.onGetAll = () => cacheRefetchCount++;
    connection.nextRunOutput = { changes: 1, lastInsertRowid: 1};

    expect(cacheRefetchCount).toBe(0);
    server.saveAttr(new Attr());
    expect(cacheRefetchCount).toBe(0);
    server.getAttrs();
    expect(cacheRefetchCount).toBe(1);
});


test('saveSpace invalidates the existing space cache', () => {
    const connection = new MockConnection();
    const cache = setupMockCache(connection);
    const server = new NotuServer(
        () => connection as any,
        new SQLiteClient(),
        cache
    );
    let cacheRefetchCount = 0;
    connection.onGetAll = () => cacheRefetchCount++;
    connection.nextRunOutput = { changes: 1, lastInsertRowid: 1};

    expect(cacheRefetchCount).toBe(0);
    server.saveSpace(new Space());
    expect(cacheRefetchCount).toBe(0);
    server.getSpaces();
    expect(cacheRefetchCount).toBe(1);
});


test('saveSpace invalidates the existing space cache', () => {
    const connection = new MockConnection();
    const cache = setupMockCache(connection);
    const server = new NotuServer(
        () => connection as any,
        new SQLiteClient(),
        cache
    );
    let cacheRefetchCount = 0;
    connection.onGetAll = () => cacheRefetchCount++;
    connection.nextRunOutput = { changes: 1, lastInsertRowid: 1};

    expect(cacheRefetchCount).toBe(0);
    server.saveSpace(new Space());
    expect(cacheRefetchCount).toBe(0);
    server.getSpaces();
    expect(cacheRefetchCount).toBe(1);
});


test('saveNote doesnt invalidate the existing tag cache if note never had its own tag', () => {
    const connection = new MockConnection();
    const cache = setupMockCache(connection);
    const server = new NotuServer(
        () => connection as any,
        new SQLiteClient(),
        cache
    );
    connection.nextRunOutput = { changes: 1, lastInsertRowid: 1};

    expect(cache['_tags'].length).toBeGreaterThan(0);
    server.saveNote(new Note('Test'));
    expect(cache['_tags'].length).toBeGreaterThan(0);
});


test('saveNote invalidates cache if note has own tag', () => {
    const connection = new MockConnection();
    const cache = setupMockCache(connection);
    const server = new NotuServer(
        () => connection as any,
        new SQLiteClient(),
        cache
    );
    connection.nextRunOutput = { changes: 1, lastInsertRowid: 1};

    expect(cache['_tags'].length).toBeGreaterThan(0);
    server.saveNote(new Note('Test').setOwnTag('My Tag'));
    expect(cache['_tags'].length).toBe(0);
});


test('saveNote invalidates cache if note used to have own tag', () => {
    const connection = new MockConnection();
    const cache = setupMockCache(connection);
    const server = new NotuServer(
        () => connection as any,
        new SQLiteClient(),
        cache
    );
    connection.nextRunOutput = { changes: 1, lastInsertRowid: 1};
    const note = new Note('Test').setOwnTag('My Tag').clean();
    note.id = 123;
    note.ownTag.clean();
    note.removeOwnTag();

    expect(cache['_tags'].length).toBeGreaterThan(0);
    server.saveNote(note);
    expect(cache['_tags'].length).toBe(0);
});


test('saveNote doesnt invalidate cache if notes own tag didnt change', () => {
    const connection = new MockConnection();
    const cache = setupMockCache(connection);
    const server = new NotuServer(
        () => connection as any,
        new SQLiteClient(),
        cache
    );
    connection.nextRunOutput = { changes: 1, lastInsertRowid: 1};
    const note = new Note('Test').setOwnTag('My Tag').clean();
    note.id = 123;
    note.ownTag.clean();

    expect(cache['_tags'].length).toBeGreaterThan(0);
    server.saveNote(note);
    expect(cache['_tags'].length).toBeGreaterThan(0);
});


test('saveNote uses cache to populate attributes before saving', () => {
    const connection = new MockConnection();
    const cache = setupMockCache(connection);
    const server = new NotuServer(
        () => connection as any,
        new SQLiteClient(),
        cache  
    );
    connection.nextRunOutput = { changes: 1, lastInsertRowid: 1};
    const note = new Note('I am a test');
    note.tags.push(new NoteTag(0, 3));
    note.attrs.push(new NoteAttr(0, 1).onTag(3));

    server.saveNote(note);

    expect(note.tags[0].tag).toBeNull();
    expect(note.attrs[0].attr.name).toBe('Live');
    expect(note.attrs[0].tag).toBeNull();
});


test('getAttrs by default returns all attrs', () => {
    const connection = new MockConnection();
    const cache = setupMockCache(connection);
    const server = new NotuServer(
        () => connection as any,
        new SQLiteClient(),
        cache  
    );

    const attrs = server.getAttrs();

    expect(attrs.length).toBe(3);
});


test('getAttrs can filter by spaceId', () => {
    const connection = new MockConnection();
    const cache = setupMockCache(connection);
    const server = new NotuServer(
        () => connection as any,
        new SQLiteClient(),
        cache  
    );

    const attrs = server.getAttrs(2);

    expect(attrs.length).toBe(1);
    expect(attrs[0].id).toBe(3);
});