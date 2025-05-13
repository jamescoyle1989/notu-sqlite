import { ParsedQuery, NotuCache, ParsedTag, Tag } from 'notu';
import { mapDateToNumber } from './SQLMappings';

export function buildNotesQuery(
    parsedQuery: ParsedQuery,
    spaceId: number,
    cache: NotuCache
): string {
    let output = 'SELECT n.id, n.spaceId, n.text, n.date FROM Note n LEFT JOIN Tag t ON n.id = t.id';

    if (!!parsedQuery.where || !!spaceId) {
        let whereClauses: Array<string> = [];
        if (!!spaceId)
            whereClauses.push(`n.spaceId = ${spaceId}`);
        if (!!parsedQuery.where)
            whereClauses.push(`(${buildNewNotesQueryPortion(parsedQuery, spaceId, cache, 'where')})`);
        output += ` WHERE ${whereClauses.join(` AND `)}`;
    }
    if (!!parsedQuery.order)
        output += ` ORDER BY ${buildNewNotesQueryPortion(parsedQuery, spaceId, cache, 'order')}`;

    output = processLiterals(output);
    output += ';';
    return output;
}


/**
 * Builds up a portion of the query, either the where section or the order section
 * Will go through each tag it can find in that section, swapping it out for a proper SQL expression
 */
function buildNewNotesQueryPortion(
    parsedQuery: ParsedQuery,
    spaceId: number,
    cache: NotuCache,
    portion: string
): string {
    let output: string = null;
    let tagBuilder: (parsedTag: ParsedTag, tag: Tag) => string;
    if (portion == 'where') {
        output = parsedQuery.where;
        tagBuilder = buildTagFilterCondition;
    }
    else if (portion == 'order') {
        output = parsedQuery.order;
        tagBuilder = buildTagOrderClause;
    }
    else
        throw Error('Invalid portion');

    for (let i = 0; i < parsedQuery.tags.length; i++) {
        if (!output.includes(`{tag${i}}`))
            continue;
        const parsedTag = parsedQuery.tags[i];
        let tag: Tag = null;
        if (!!parsedTag.space) {
            tag = cache.getTagByName(
                parsedTag.name,
                !!parsedTag.space ? cache.getSpaceByName(parsedTag.space).id : spaceId
            );
        }
        else if (!!spaceId)
            tag = cache.getTagByName(parsedTag.name, spaceId);
        else {
            const tags = cache.getTagsByName(parsedTag.name);
            if (tags.length > 1)
                throw Error(`Unable to uniquely identify tag '${parsedTag.name}', please include space name`);
            tag = tags[0];
        }
        output = output.replace(`{tag${i}}`, tagBuilder(parsedTag, tag));
    }

    return output;
}


/**
 * The logic for building up a SQL snippet from a tag for the purposes of filtering
 */
function buildTagFilterCondition(parsedTag: ParsedTag, tag: Tag): string {
    let conditions = [];
    for (const searchDepth of parsedTag.searchDepths) {
        if (searchDepth == 0)
            conditions.push(`n.id = ${tag.id}`);
        else if (searchDepth == 1)
            conditions.push(`EXISTS(SELECT 1 ` +
                `FROM NoteTag nt ` +
                `WHERE nt.noteId = n.id AND nt.tagId = ${tag.id}${buildTagDataWhereExpression(parsedTag, 'nt')})`);
        else if (searchDepth == 2)
            conditions.push(`EXISTS(SELECT 1 ` +
                `FROM NoteTag nt1 INNER JOIN NoteTag nt2 ON nt2.noteId = nt1.tagId ` +
                `WHERE nt1.noteId = n.id AND nt2.tagId = ${tag.id}${buildTagDataWhereExpression(parsedTag, 'nt1')})`);
    }
    let output = conditions.join(' OR ');
    if (conditions.length > 1)
        output = `(${output})`;
    return output;
}


/**
 * The logic for building up a SQL snippet from a tag for the purposes of ordering
 */
function buildTagOrderClause(parsedTag: ParsedTag, tag: Tag): string {
    if (parsedTag.searchDepths.length != 1)
        throw Error('Order clauses must specify exactly one search depth which they are ordering by')
    const searchDepth = parsedTag.searchDepths[0];
    if (searchDepth == 0)
        return `n.id = ${tag.id}`;
    if (searchDepth == 1)
        return `(SELECT ${buildTagDataExpression(parsedTag, 'nt')} ` +
            `FROM NoteTag nt ` +
            `WHERE nt.noteId = n.id AND nt.tagId = ${tag.id})`;
    if (searchDepth == 2)
        return `(SELECT ${buildTagDataExpression(parsedTag, 'nt1')} ` +
            `FROM NoteTag nt1 INNER JOIN NoteTag nt2 ON nt2.noteId = nt1.tagId ` +
            `WHERE nt1.noteId = n.id AND nt2.tagId = ${tag.id}`
}


/**
 * A very light wrapper around buildTagDataExpression. Just makes sure that tag data filtering is AND'ed onto the rest of the filter
 */
function buildTagDataWhereExpression(parsedTag: ParsedTag, noteTagsAlias: string): string {
    let output = buildTagDataExpression(parsedTag, noteTagsAlias);
    if (output != '')
        output = ` AND (${output})`;
    return output;
}


/**
 * Takes in a parsed tag and generates SQL to query the jsonb data attached to it
 */
function buildTagDataExpression(parsedTag: ParsedTag, noteTagsAlias: string): string {
    if (!parsedTag.filter)
        return '';
    let output = parsedTag.filter.pattern;
    for (let i = 0; i < parsedTag.filter.exps.length; i++) {
        const parts = parsedTag.filter.exps[i].split('.').map(x => `'${x}'`);
        let exp = 'data';
        for (let i = 0; i < parts.length; i++) {
            if (i + 1 == parts.length)
                exp += '->>';
            else
                exp += '->';
            exp += parts[i];
        }
        output = output.replace(`{exp${i}}`, `${noteTagsAlias}.${exp}`);
    }
    return output;
}


/**
 * Logic for processing literals added by NotuQL for the purposes of being slightly more cross-platform
 */
function processLiterals(query: string) {
    {
        while (query.includes('{True}'))
            query = query.replace('{True}', '1');
    }
    {
        while (query.includes('{False}'))
            query = query.replace('{False}', '0');
    }
    {
        const now = new Date();
        const dateNumber = mapDateToNumber(now).toString();
        while (query.includes('{Now}'))
            query = query.replace('{Now}', dateNumber);
    }
    {
        const today = new Date();
        today.setUTCHours(0, 0, 0, 0);
        const dateNumber = mapDateToNumber(today).toString();
        while (query.includes('{Today}'))
            query = query.replace('{Today}', dateNumber);
    }
    {
        const yesterday = new Date();
        yesterday.setUTCHours(0, 0, 0, 0);
        yesterday.setDate(yesterday.getDate() - 1);
        const dateNumber = mapDateToNumber(yesterday).toString();
        while (query.includes('{Yesterday}'))
            query = query.replace('{Yesterday}', dateNumber);
    }
    {
        const tomorrow = new Date();
        tomorrow.setUTCHours(0, 0, 0, 0);
        tomorrow.setDate(tomorrow.getDate() + 1);
        const dateNumber = mapDateToNumber(tomorrow).toString();
        while (query.includes('{Tomorrow}'))
            query = query.replace('{Tomorrow}', dateNumber);
    }
    //Handle timespan values like {1d 5:00} to express 1 day and 5 hours. Used like {Now} + {0d 3:00}
    {
        const regex = /\{(?:(\d+)d)(?:\s(\d+):(\d{2})(?::(\d{2}))?)?\}/;
        while (true) {
            const match = regex.exec(query);
            if (!match)
                break;
            let secondsTimespan = 24 * 60 * 60 * Number(match[1]);
            if (match[2] != undefined) {
                secondsTimespan += 60 * 60 * Number(match[2]);
                secondsTimespan += 60 * Number(match[3]);
                if (match[4] != undefined)
                    secondsTimespan += Number(match[4]);
            }
            const matchStart = query.indexOf(match[0]);
            const matchEnd = matchStart + match[0].length;
            query = query.substring(0, matchStart) + secondsTimespan.toString() + query.substring(matchEnd);
        }
    }
    //Handle date literals like {2024/06/09 23:50:00}
    {
        const regex = /\{(\d{1,4})(?:\/|-)(\d{1,2})(?:\/|-)(\d{1,2})(?:\s(\d{1,2}):(\d{2})(?::(\d{2}))?)?\}/;
        while (true) {
            const match = regex.exec(query);
            if (!match)
                break;
            const year = Number(match[1]);
            const month = Number(match[2]);
            const day = Number(match[3]);
            let hours = 0;
            let minutes = 0;
            let seconds = 0;
            if (match[4] != undefined) {
                hours = Number(match[4]);
                minutes = Number(match[5]);
                if (match[6] != undefined)
                    seconds = Number(match[6]);
            }
            const matchStart = query.indexOf(match[0]);
            const matchEnd = matchStart + match[0].length;
            const date = new Date(year, month - 1, day, hours, minutes, seconds);
            const dateStr = mapDateToNumber(date).toString();
            query = query.substring(0, matchStart) + dateStr + query.substring(matchEnd);
        }
    }
    return query;
}