import { expect, test } from 'vitest';
import SQLiteCache from '../src/SQLiteCache';
import { MockConnection } from './SQLiteClient.test';


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


test('getSpace refreshes cache if name not found', () => {
    const cache = new SQLiteCache();
    const connection = new MockConnection();
    connection.nextGetAllOutput = mockSpaceSetup();

    const result = cache.getSpace('Love', connection as any);

    expect(result.id).toBe(3);
    expect(connection.history.length).toBe(1);
    expect(connection.history[0].command).toBe('SELECT id, name FROM Space;');
});

test('getSpace makes no query if name is found', () => {
    const cache = new SQLiteCache();
    const connection1 = new MockConnection();
    connection1.nextGetAllOutput = mockSpaceSetup();
    cache.getSpace('Live', connection1 as any);
    const connection2 = new MockConnection();

    const result = cache.getSpace('Laugh', connection2 as any);

    expect(result.id).toBe(2);
    expect(connection2.history.length).toBe(0);
});

test('getSpace throws error if name doesnt exist', () => {
    const cache = new SQLiteCache();
    const connection = new MockConnection();
    connection.nextGetAllOutput = mockSpaceSetup();

    expect(() => cache.getSpace('Bloop', connection as any)).toThrowError();
});

test('getSpaces returns all fetched spaces', () => {
    const cache = new SQLiteCache();
    const connection = new MockConnection();
    connection.nextGetAllOutput = mockSpaceSetup();

    const spaces = cache.getSpaces(connection as any);

    expect(spaces.length).toBe(3);
});


test('getTag refreshes cache if name not found', () => {
    const cache = new SQLiteCache();
    const connection = new MockConnection();
    connection.nextGetAllOutput = mockTagSetup();

    const result = cache.getTag('Live', 2, connection as any);

    expect(result.id).toBe(2);
    expect(connection.history.length).toBe(1);
    expect(connection.history[0].command).toBe('SELECT n.id, t.name, n.spaceId FROM Note n INNER JOIN Tag t ON n.id = t.id;');
});

test('getTag makes no query if name is found', () => {
    const cache = new SQLiteCache();
    const connection1 = new MockConnection();
    connection1.nextGetAllOutput = mockTagSetup();
    cache.getTag('Live', 2, connection1 as any);
    const connection2 = new MockConnection();

    const result = cache.getTag('Laugh', 1, connection2 as any);

    expect(result.id).toBe(3);
    expect(connection2.history.length).toBe(0);
});

test('getTag throws error if name doesnt exist', () => {
    const cache = new SQLiteCache();
    const connection = new MockConnection();
    connection.nextGetAllOutput = mockTagSetup();

    expect(() => cache.getTag('Bloop', 3, connection as any)).toThrowError();
});

test('getTagById returns correct result', () => {
    const cache = new SQLiteCache();
    const connection = new MockConnection();
    connection.nextGetAllOutput = mockTagSetup();
    cache.getTag('Live', 2, connection as any);

    const result = cache.getTagById(4, connection as any);

    expect(result.name).toBe('Love');
});


test('getAttr refreshes cache if name not found', () => {
    const cache = new SQLiteCache();
    const connection = new MockConnection();
    connection.nextGetAllOutput = mockAttrSetup();

    const result = cache.getAttr('Live', 1, connection as any);

    expect(result.id).toBe(1);
    expect(connection.history.length).toBe(1);
    expect(connection.history[0].command).toBe('SELECT id, name, spaceId, type FROM Attr;');
});

test('getAttr makes no query if name is found', () => {
    const cache = new SQLiteCache();
    const connection1 = new MockConnection();
    connection1.nextGetAllOutput = mockAttrSetup();
    cache.getAttr('Live', 1, connection1 as any);
    const connection2 = new MockConnection();

    const result = cache.getAttr('Laugh', 1, connection2 as any);

    expect(result.id).toBe(2);
    expect(connection2.history.length).toBe(0);
});

test('getAttr throws error if name doesnt exist', () => {
    const cache = new SQLiteCache();
    const connection = new MockConnection();
    connection.nextGetAllOutput = mockAttrSetup();

    expect(() => cache.getAttr('Bloop', 3, connection as any)).toThrowError();
});

test('getAttrById returns correct result', () => {
    const cache = new SQLiteCache();
    const connection = new MockConnection();
    connection.nextGetAllOutput = mockAttrSetup();
    cache.getAttr('Live', 1, connection as any);

    const result = cache.getAttrById(3, connection as any);

    expect(result.name).toBe('Love');
});