import { Attr, ParsedQuery } from 'notu';
import { SQLiteCache } from './SQLiteCache';
import { SQLiteConnection } from './SQLiteConnection';

export function buildNotesQuery(
    parsedQuery: ParsedQuery,
    spaceId: number,
    cache: SQLiteCache,
    connection: SQLiteConnection
): string {
    let output = 'SELECT n.id, n.spaceId, n.text, n.date, tag.id AS tagId FROM Note n LEFT JOIN Tag tag ON n.id = tag.id';
    
    output += ` WHERE n.spaceId = ${spaceId}`
    if (!!parsedQuery.where)
        output += ` AND (${parsedQuery.where})`;
    if (!!parsedQuery.order)
        output += ` ORDER BY ${parsedQuery.order}`;

    for (let i = 0; i < parsedQuery.tags.length; i++) {
        const parsedTag = parsedQuery.tags[i];
        const tag = cache.getTag(
            parsedTag.name,
            !!parsedTag.space ? cache.getSpace(parsedTag.space, connection).id : spaceId,
            connection
        );
        if (parsedTag.searchDepth == 0)
            output = output.replace(`{tag${i}}`, `n.id = ${tag.id}`);

        else if (parsedTag.searchDepth == 1 && parsedTag.strictSearchDepth && !parsedTag.includeOwner)
            output = output.replace(`{tag${i}}`, `EXISTS(SELECT 1 FROM NoteTag nt WHERE nt.noteId = n.id AND nt.tagId = ${tag.id})`);

        else if (parsedTag.searchDepth == 1)
            output = output.replace(`{tag${i}}`, `(n.id = ${tag.id} OR EXISTS(SELECT 1 FROM NoteTag nt WHERE nt.noteId = n.id AND nt.tagId = ${tag.id}))`);

        else if (parsedTag.searchDepth == 2 && parsedTag.strictSearchDepth && !parsedTag.includeOwner)
            output = output.replace(`{tag${i}}`, `EXISTS(SELECT 1 FROM NoteTag nt1 INNER JOIN NoteTag nt2 ON nt2.noteId = nt1.tagId WHERE nt1.noteId = n.id AND nt2.tagId = ${tag.id})`);

        else if (parsedTag.searchDepth == 2 && parsedTag.strictSearchDepth && parsedTag.includeOwner)
            output = output.replace(`tag${i}`, `(n.id = ${tag.id} OR EXISTS(SELECT 1 FROM NoteTag nt1 INNER JOIN NoteTag nt2 ON nt2.noteId = nt1.tagId WHERE nt1.noteId = n.id AND nt2.tagId = ${tag.id}))`);

        else if (parsedTag.searchDepth == 2 && !parsedTag.strictSearchDepth && !parsedTag.includeOwner)
            output = output.replace(`tag${i}`, `EXISTS(SELECT 1 FROM NoteTag nt1 LEFT JOIN NoteTag nt2 ON nt2.noteId = nt1.tagId WHERE nt1.noteId = n.id AND ${tag.id} IN (nt1.tagId, nt2.tagId))`);

        else if (parsedTag.searchDepth == 2)
            output = output.replace(`tag${i}`, `(n.id = ${tag.id} OR EXISTS(SELECT 1 FROM NoteTag nt1 LEFT JOIN NoteTag nt2 ON nt2.noteId = nt1.tagId WHERE nt1.noteId = n.id AND ${tag.id} IN (nt1.tagId, nt2.tagId)))`);

        else
            throw Error(`Sorry, that tag search feature hasn't been implemented yet.`);
    }

    for (let i = 0; i < parsedQuery.attrs.length; i++) {
        const parsedAttr = parsedQuery.attrs[i];
        const attr = cache.getAttr(parsedAttr.name, spaceId, connection);
        let tagIds = [];
        if (!!parsedAttr.tagNameFilters) {
            tagIds = parsedAttr.tagNameFilters
                .map(parsedTag => cache.getTag(
                    parsedTag.name,
                    !!parsedTag.space ? cache.getSpace(parsedTag.space, connection).id : spaceId,
                    connection
                ).id);
        }
        
        if (parsedAttr.exists) {
            if (tagIds.length == 0)
                output = output.replace(`{attr${i}}`, `EXISTS(SELECT 1 FROM NoteAttr na WHERE na.noteId = n.id AND na.attrId = ${attr.id})`);
            else
                output = output.replace(`{attr${i}}`, `EXISTS(SELECT 1 FROM NoteAttr na WHERE na.noteId = n.id AND na.attrId = ${attr.id} AND na.tagId IN (${tagIds.join(',')}))`);
        }
        else {
            if (tagIds.length == 0)
                output = output.replace(`{attr${i}}`, `CAST((SELECT na.value FROM NoteAttr na WHERE na.noteId = n.id AND na.attrId = 5) AS ${getAttrSQLType(attr)})`);
            else
                output = output.replace(`{attr${i}}`, `CAST((SELECT na.value FROM NoteAttr na WHERE na.noteId = n.id AND na.attrId = 5 AND na.tagId IN (${tagIds.join(',')})) AS ${getAttrSQLType(attr)})`);
        }
    }

    output += ';';
    return output;
}


function getAttrSQLType(attr: Attr): string {
    if (attr.type == 'TEXT')
        return 'TEXT';
    if (attr.type == 'NUMBER')
        return 'NUMERIC';
    return 'INTEGER';
}