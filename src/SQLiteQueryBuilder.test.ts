import { expect, test } from 'vitest';
import { ParsedAttr, ParsedQuery, ParsedTag } from 'notu';
import buildNotesQuery from './SQLiteQueryBuilder';
import SQLiteCache from './SQLiteCache';
import { MockConnection } from './SQLiteClient.test';



function mockCache(): SQLiteCache {
    const cache = new SQLiteCache();
    const connection = new MockConnection();

    connection.nextGetAllOutput = [
        { id: 1, name: 'Space 1' },
        { id: 2, name: 'Space 2' }
    ];
    cache.getSpace('Space 1', connection as any);

    connection.nextGetAllOutput = [
        { id: 3, name: 'Tag 1', spaceId: 1 },
        { id: 4, name: 'Tag 2', spaceId: 2 }
    ];
    cache.getTag('Tag 1', 1, connection as any);

    connection.nextGetAllOutput = [
        { id: 5, name: 'Attr 1', spaceId: 1, type: 1 },
        { id: 6, name: 'Attr 2', spaceId: 2, type: 2 }
    ];
    cache.getAttr('Attr 1', 1, connection as any);

    return cache;
}



test('buildNotesQuery correctly processes empty query', () => {
    const query = new ParsedQuery();

    expect(buildNotesQuery(query, 1, mockCache(), new MockConnection() as any))
        .toBe('SELECT n.id, n.spaceId, n.text, n.date, n.archived FROM Note n;');
});

test('buildNotesQuery correctly processes query with order clause', () => {
    const query = new ParsedQuery();
    query.order = 'date';

    expect(buildNotesQuery(query, 1, mockCache(), new MockConnection() as any))
        .toBe('SELECT n.id, n.spaceId, n.text, n.date, n.archived FROM Note n ORDER BY date;');
});

test('buildNotesQuery correctly processes query with self tag filter', () => {
    const query = new ParsedQuery();
    query.where = '{tag0}';
    query.tags.push((() => {
        const tag = new ParsedTag();
        tag.name = 'Tag 1';
        tag.space = null;
        tag.searchDepth = 0;
        return tag;
    })());

    expect(buildNotesQuery(query, 1, mockCache(), new MockConnection() as any))
        .toBe(
            'SELECT n.id, n.spaceId, n.text, n.date, n.archived ' +
            'FROM Note n ' +
            'WHERE n.id = 3;'
        );
});

test('buildNotesQuery correctly processes query with child tag filter', () => {
    const query = new ParsedQuery();
    query.where = '{tag0}';
    query.tags.push((() => {
        const tag = new ParsedTag();
        tag.name = 'Tag 1';
        tag.space = null;
        tag.searchDepth = 1;
        tag.includeOwner = false;
        tag.strictSearchDepth = true;
        return tag;
    })());

    expect(buildNotesQuery(query, 1, mockCache(), new MockConnection() as any))
        .toBe(
            'SELECT n.id, n.spaceId, n.text, n.date, n.archived ' +
            'FROM Note n ' +
            'WHERE EXISTS(SELECT 1 FROM NoteTag nt WHERE nt.noteId = n.id AND nt.tagId = 3);'
        );
});

test('buildNotesQuery correctly processes query with child tag filter', () => {
    const query = new ParsedQuery();
    query.where = '{tag0}';
    query.tags.push((() => {
        const tag = new ParsedTag();
        tag.name = 'Tag 1';
        tag.space = null;
        tag.searchDepth = 1;
        tag.includeOwner = true;
        tag.strictSearchDepth = true;
        return tag;
    })());

    expect(buildNotesQuery(query, 1, mockCache(), new MockConnection() as any))
        .toBe(
            'SELECT n.id, n.spaceId, n.text, n.date, n.archived ' +
            'FROM Note n ' +
            'WHERE (n.id = 3 OR EXISTS(SELECT 1 FROM NoteTag nt WHERE nt.noteId = n.id AND nt.tagId = 3));'
        );
});

test('buildNotesQuery throws error if trying to search for tags more than 1 relation deep', () => {
    const query = new ParsedQuery();
    query.where = '{tag0}';
    query.tags.push((() => {
        const tag = new ParsedTag();
        tag.name = 'Tag 1';
        tag.space = null;
        tag.searchDepth = 2;
        tag.includeOwner = false;
        tag.strictSearchDepth = true;
        return tag;
    })());

    expect(() => buildNotesQuery(query, 1, mockCache(), new MockConnection() as any)).toThrowError();
});

test('buildNotesQuery correctly processes query with attr exists condition', () => {
    const query = new ParsedQuery();
    query.where = '{attr0}';
    query.attrs.push((() => {
        const attr = new ParsedAttr();
        attr.name = 'Attr 1';
        attr.space = null;
        attr.exists = true;
        return attr;
    })());

    expect(buildNotesQuery(query, 1, mockCache(), new MockConnection() as any))
        .toBe(
            'SELECT n.id, n.spaceId, n.text, n.date, n.archived ' +
            'FROM Note n ' +
            'WHERE EXISTS(SELECT 1 FROM NoteAttr na WHERE na.noteId = n.id AND na.attrId = 5);'
        );
});

test('buildNotesQuery correctly processes query with attr condition', () => {
    const query = new ParsedQuery();
    query.where = `{attr0} = 'hello'`;
    query.attrs.push((() => {
        const attr = new ParsedAttr();
        attr.name = 'Attr 1';
        attr.space = null;
        attr.exists = false;
        return attr;
    })());

    expect(buildNotesQuery(query, 1, mockCache(), new MockConnection() as any))
        .toBe(
            'SELECT n.id, n.spaceId, n.text, n.date, n.archived ' +
            'FROM Note n ' +
            `WHERE CAST((SELECT na.value FROM NoteAttr na WHERE na.noteId = n.id AND na.attrId = 5) AS TEXT) = 'hello';`
        );
});

test('buildNotesQuery correctly processes query with attr exists condition on specific tags', () => {
    const query = new ParsedQuery();
    query.where = '{attr0}';
    query.attrs.push((() => {
        const attr = new ParsedAttr();
        attr.name = 'Attr 1';
        attr.space = null;
        attr.exists = true;
        attr.tagNameFilters = [(() => {
            const tag = new ParsedTag();
            tag.name = 'Tag 1';
            return tag;
        })()]
        return attr;
    })());

    expect(buildNotesQuery(query, 1, mockCache(), new MockConnection() as any))
        .toBe(
            'SELECT n.id, n.spaceId, n.text, n.date, n.archived ' +
            'FROM Note n ' +
            'WHERE EXISTS(SELECT 1 FROM NoteAttr na WHERE na.noteId = n.id AND na.attrId = 5 AND na.tagId IN (3));'
        );
});

test('buildNotesQuery correctly processes query with attr condition on specific tags', () => {
    const query = new ParsedQuery();
    query.where = `{attr0} = 'hello'`;
    query.attrs.push((() => {
        const attr = new ParsedAttr();
        attr.name = 'Attr 1';
        attr.space = null;
        attr.exists = false;
        attr.tagNameFilters = [(() => {
            const tag = new ParsedTag();
            tag.name = 'Tag 1';
            return tag;
        })()]
        return attr;
    })());

    expect(buildNotesQuery(query, 1, mockCache(), new MockConnection() as any))
        .toBe(
            'SELECT n.id, n.spaceId, n.text, n.date, n.archived ' +
            'FROM Note n ' +
            `WHERE CAST((SELECT na.value FROM NoteAttr na WHERE na.noteId = n.id AND na.attrId = 5 AND na.tagId IN (3)) AS TEXT) = 'hello';`
        );
});