import { Attr, Note, Space, Tag } from 'notu';
import SQLiteConnection from './SQLiteConnection';


export default class SQLiteCache {
    private _spaces: Array<Space> = [];

    private _populateSpaces(connection: SQLiteConnection): void {
        this._spaces = connection
            .getAll('SELECT id, name FROM Space;')
            .map(x => {
                const space = new Space(x.name);
                space.id = x.id;
                return space.clean();
            });
    }
    
    getSpace(name: string, connection: SQLiteConnection): Space {
        let result = this._spaces.find(x => x.name == name);
        if (!!result)
            return result;

        this._populateSpaces(connection);
        result = this._spaces.find(x => x.name == name);
        if (!!result)
            return result;

        throw Error(`Unrecognised '${name}' space`);
    }

    getSpaces(connection: SQLiteConnection): Array<Space> {
        if (this._spaces.length == 0)
            this._populateSpaces(connection);
        return this._spaces;
    }

    invalidateSpaces(): void {
        this._spaces = [];
    }


    private _tags: Array<Note> = [];

    getTag(name: string, spaceId: number, connection: SQLiteConnection): Note {
        let result = this._tags.find(x => x.spaceId == spaceId && x.ownTag.name == name);
        if (!!result)
            return result;

        this._repopulateTagCache(connection);
        result = this._tags.find(x => x.spaceId == spaceId && x.ownTag.name == name);
        if (!!result)
            return result;
        
        throw Error(`Unrecognised '${name}' tag in space with ID ${spaceId}.`);
    }

    getTagById(id: number, connection: SQLiteConnection): Note {
        if (id == null)
            return null;
        let result = this._tags.find(x => x.id == id);
        if (!!result)
            return result;

        this._repopulateTagCache(connection);
        result = this._tags.find(x => x.id == id);
        if (!!result)
            return result;

        throw Error(`Unrecognised tag ID ${id}.`);
    }

    private _repopulateTagCache(connection: SQLiteConnection): void {
        this._tags = connection
            .getAll('SELECT n.id, t.name, n.spaceId FROM Note n INNER JOIN Tag t ON n.id = t.id;')
            .map(x => {
                const note = new Note();
                note.id = x.id;
                note.spaceId = x.spaceId;
                const tag = new Tag(x.name);
                tag.id = x.id;
                note.setOwnTag(tag.clean());
                return note.clean();
            });
    }

    invalidateTags(): void {
        this._tags = [];
    }


    private _attrs: Array<Attr> = [];

    getAttr(name: string, spaceId: number, connection: SQLiteConnection): Attr {
        let result = this._attrs.find(x => x.spaceId == spaceId && x.name == name);
        if (!!result)
            return result;

        this._repopulateAttrCache(connection);
        result = this._attrs.find(x => x.spaceId == spaceId && x.name == name);
        if (!!result)
            return result;
        
        throw Error(`Unrecognised '${name}' attr in space with ID ${spaceId}.`);
    }

    getAttrs(connection: SQLiteConnection): Array<Attr> {
        if (this._attrs.length == 0)
            this._repopulateAttrCache(connection);
        return this._attrs;
    }

    getAttrById(id: number, connection: SQLiteConnection): Attr {
        if (id == null)
            return null;
        let result = this._attrs.find(x => x.id == id);
        if (!!result)
            return result;

        this._repopulateTagCache(connection);
        result = this._attrs.find(x => x.id == id);
        if (!!result)
            return result;

        throw Error(`Unrecognised attr ID ${id}.`);
    }

    private _repopulateAttrCache(connection: SQLiteConnection): void {
        this._attrs = connection
            .getAll('SELECT id, name, spaceId, type FROM Attr;')
            .map(x => {
                const attr = new Attr();
                attr.id = x.id;
                attr.name = x.name;
                attr.spaceId = x.spaceId;
                switch (x.type) {
                    case 1: attr.type = 'TEXT'; break;
                    case 2: attr.type = 'NUMBER'; break;
                    case 3: attr.type = 'BOOLEAN'; break;
                    case 4: attr.type = 'DATE'; break;
                }
                return attr.clean();
            });
    }

    invalidateAttrs(): void {
        this._attrs = [];
    }
}