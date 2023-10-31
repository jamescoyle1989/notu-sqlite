import BetterSqlite3 from 'better-sqlite3';
import { parseQuery } from 'notu';


export default class SQLiteClient {
    private _filename: string = '';
    private _hasUpdatedSchema: boolean = false;

    constructor(filename: string) {
        this._filename = filename;
    }

    connect(): Promise<BetterSqlite3.Database> {
        const db = new BetterSqlite3(this._filename, {});
        db.pragma('journal_mode = WAL');
        if (!this._hasUpdatedSchema)
            this._updateSchema(db);
        return Promise.resolve(db);
    }

    close(connection: BetterSqlite3.Database): Promise<void> {
        connection.close();
        return Promise.resolve();
    }

    private _updateSchema(db: BetterSqlite3.Database): void {
        if (!db.prepare(`SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'Note'`).get()) {
            db.prepare(
                `CREATE TABLE Space (
                    id INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
                    name TEXT NOT NULL
                )`
            ).run();
            
            db.prepare(
                `CREATE TABLE Note (
                    id INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
                    spaceId INTEGER NOT NULL,
                    text TEXT NOT NULL,
                    date INTEGER NOT NULL,
                    archived INTEGER NOT NULL DEFAULT 0,
                    FOREIGN KEY (spaceId) REFERENCES Space(id) ON DELETE CASCADE
                );`
            ).run();
            db.prepare(`CREATE INDEX Note_spaceId ON Note(spaceId);`).run();
            db.prepare(`CREATE INDEX Note_date ON Note(date);`).run();

            db.prepare(
                `CREATE TABLE Tag (
                    id INTEGER NOT NULL,
                    name TEXT NOT NULL,
                    color INTEGER NULL,
                    FOREIGN KEY (id) REFERENCES Note(id) ON DELETE CASCADE
                );`
            ).run();
            db.prepare(`CREATE INDEX Tag_id ON Tag(id);`).run();

            db.prepare(
                `CREATE TABLE NoteTag (
                    noteId INTEGER NOT NULL,
                    tagId INTEGER NOT NULL,
                    FOREIGN KEY (noteId) REFERENCES Note(id) ON DELETE CASCADE,
                    FOREIGN KEY (tagId) REFERENCES Tag(id) ON DELETE CASCADE
                );`
            ).run();
            db.prepare(`CREATE INDEX NoteTag_noteId ON NoteTag(noteId);`).run();
            db.prepare(`CREATE INDEX NoteTag_tagId ON NoteTag(tagId);`).run();

            db.prepare(
                `CREATE TABLE Attr (
                    id INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
                    spaceId INTEGER NOT NULL,
                    name TEXT NOT NULL,
                    type INTEGER NOT NULL,
                    FOREIGN KEY (spaceId) REFERENCES Space(id) ON DELETE CASCADE
                );`
            ).run();
            db.prepare(`CREATE INDEX Attr_spaceId ON Attr(spaceId);`).run();

            db.prepare(
                `CREATE TABLE NoteAttr (
                    noteId INTEGER NOT NULL,
                    attrId INTEGER NOT NULL,
                    value TEXT NOT NULL,
                    tagId INTEGER NULL,
                    FOREIGN KEY (noteId) REFERENCES Note(id) ON DELETE CASCADE,
                    FOREIGN KEY (attrId) REFERENCES Attr(id) ON DELETE CASCADE,
                    FOREIGN KEY (tagId) REFERENCES Tag(id) ON DELETE CASCADE
                );`
            ).run();
            db.prepare(`CREATE INDEX NoteAttr_noteId ON NoteAttr(noteId);`).run();
            db.prepare(`CREATE INDEX NoteAttr_attrId ON NoteAttr(attrId);`).run();
            db.prepare(`CREATE INDEX NoteAttr_tagId ON NoteAttr(tagId);`).run();
        }
    }


    private _spaceIdCache: Map<string, number> = new Map<string, number>();

    private _updateSpaceIdCache(connection: BetterSqlite3.Database): void {
        this._spaceIdCache.clear();
        const queryResults = connection.prepare(`SELECT id, name FROM Space;`).all();
        for (const result of queryResults)
            this._spaceIdCache.set(result['name'], result['id']);
    }

    private _getSpaceId(connection: BetterSqlite3.Database, name: string): void {
        let result = this._spaceIdCache.get(name);
        if (result == undefined)
            this._updateSpaceIdCache(connection);
        result = this._spaceIdCache.get(name);
        if (result == undefined)
            throw Error(`Unrecognised '${name}' space.`);
    }


    private _tagIdCache: Map<string, number> = new Map<string, number>();
    
    private _updateTagIdCache(connection: BetterSqlite3.Database): void {
        this._tagIdCache.clear();
        const queryResults = connection.prepare(
            `SELECT
                id,
                s.name + '.' + t.name AS name
            FROM Tag t
                INNER JOIN Note n ON t.id = n.id
                INNER JOIN Space s ON n.spaceId = s.id;`
        ).all();
        for (const result of queryResults)
            this._tagIdCache.set(result['name'], result['id']);
    }

    private _getTagId(connection: BetterSqlite3.Database, name: string, spaceName: string): void {
        const fullName = spaceName + '.' + name;
        let result = this._tagIdCache.get(fullName);
        if (result == undefined)
            this._updateTagIdCache(connection);
        result = this._tagIdCache.get(fullName);
        if (result == undefined)
            throw Error(`Unrecognised '${name}' tag in '${spaceName}' space.`);
    }


    private _attrIdCache: Map<string, number> = new Map<string, number>();

    private _updateAttrIdCache(connection: BetterSqlite3.Database): void {
        this._attrIdCache.clear();
        const queryResults = connection.prepare(
            `SELECT
                id,
                s.name + '.' + a.name AS name
            FROM Attr a
                INNER JOIN Space s ON a.spaceId = s.id;`
            ).all();
        for (const result of queryResults)
            this._attrIdCache.set(result['name'], result['id']);
    }

    private _getAttrId(connection: BetterSqlite3.Database, name: string, spaceName: string): void {
        const fullName = spaceName + '.' + name;
        let result = this._attrIdCache.get(fullName);
        if (result == undefined)
            this._updateAttrIdCache(connection);
        result = this._attrIdCache.get(fullName);
        if (result == undefined)
            throw Error(`Unrecognised '${name}' attribute in '${spaceName}' space.`);
    }


    getNotes(connection: BetterSqlite3.Database, query: string, spaceName: string): void {
        const parsedQuery = parseQuery(query);
        query = `SELECT n.id, n.spaceId, n.text, n.date, n.archived FROM Note n`;
        if (!!parsedQuery.where)
            query += ` WHERE ${parsedQuery.where}`;
        if (!!parsedQuery.order)
            query += ` ORDER BY ${parsedQuery.order}`;
        else
            query += ` ORDER BY n.date`;

        for (let i = 0; i < parsedQuery.tags.length; i++) {
            const parsedTag = parsedQuery.tags[i];
            const tagId = this._getTagId(connection, parsedTag.name, parsedTag.space ?? spaceName);
            if (parsedTag.searchDepth == 0) {
                query = query.replace(`{tag${i}}`, `n.id = ${tagId}`);
            }
            else if (parsedTag.searchDepth == 1 && parsedTag.strictSearchDepth && !parsedTag.includeOwner) {
                query = query.replace(`{tag${i}}`, `EXISTS(SELECT 1 FROM NoteTag nt WHERE nt.noteId = n.id AND nt.tagId = ${tagId})`);
            }
            else if (parsedTag.searchDepth == 1) {
                query = query.replace(`{tag${i}}`, `(n.id = ${tagId} OR EXISTS(SELECT 1 FROM NoteTag nt WHERE nt.noteId = n.id AND nt.tagId = ${tagId}))`);
            }
            else {
                throw Error(`Sorry, that tag search feature hasn't been implemented yet.`);
            }
        }

        for (let i = 0; i < parsedQuery.attrs.length; i++) {
            const parsedAttr = parsedQuery.tags[i];
            const attrId = this._getAttrId(connection, parsedAttr.name, parsedAttr.space ?? spaceName);
            const tagIds = parsedAttr.tagNameFilters.map(x => this._getTagId(connection, x.name, x.space ?? spaceName));
            if (parsedAttr.exists) {
                if (tagIds.length == 0) {
                    query = query.replace(`{attr${i}}`, `EXISTS(SELECT 1 FROM NoteAttr na WHERE na.noteId = n.id AND na.attrId = ${attrId} AND na.tagId IS NULL)`);
                }
                else {
                    query = query.replace(`{attr${i}}`, `EXISTS(SELECT 1 FROM NoteAttr na WHERE na.noteId = n.id AND na.attrId = ${attrId} AND na.tagId IN (${tagIds.join(',')}))`);
                }
            }
            else {
                if (tagIds.length == 0) {
                    query = query.replace(`{attr${i}}`, `CAST((SELECT na.value FROM NoteAttr na WHERE na.noteId = n.id AND na.attrId = ${attrId} AND na.tagId IS NULL) AS ${1})`);
                }
                else {
                    query = query.replace(`{attr${i}}`, `CAST((SELECT na.value FROM NoteAttr na WHERE na.noteId = n.id AND na.attrId = ${attrId} AND na.tagId IN (${tagIds.join(',')})) AS ${1})`);
                }
            }
        }
    }
}