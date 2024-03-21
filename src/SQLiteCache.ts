import { Attr, Space, Tag } from 'notu';
import { SQLiteConnection } from './SQLiteConnection';
import { mapAttrTypeFromDb } from './SQLMappings';


export class SQLiteCache {
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


    private _tags: Array<Tag> = [];

    getTag(name: string, spaceId: number, connection: SQLiteConnection): Tag {
        let result = this._tags.find(x => x.spaceId == spaceId && x.name == name);
        if (!!result)
            return result;

        this._repopulateTagCache(connection);
        result = this._tags.find(x => x.spaceId == spaceId && x.name == name);
        if (!!result)
            return result;
        
        throw Error(`Unrecognised '${name}' tag in space with ID ${spaceId}.`);
    }

    getTags(connection: SQLiteConnection): Array<Tag> {
        if (this._tags.length == 0)
            this._repopulateTagCache(connection);
        return this._tags;
    }

    getTagById(id: number, connection: SQLiteConnection): Tag {
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
                const tag = new Tag(x.name).in(x.spaceId);
                tag.id = x.id;
                return tag.clean();
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

        this._repopulateAttrCache(connection);
        result = this._attrs.find(x => x.id == id);
        if (!!result)
            return result;

        throw Error(`Unrecognised attr ID ${id}.`);
    }

    private _repopulateAttrCache(connection: SQLiteConnection): void {
        this._attrs = connection
            .getAll('SELECT id, name, spaceId, type FROM Attr;')
            .map(x => {
                const attr = new Attr(x.name).in(x.spaceId);
                attr.id = x.id;
                attr.type = mapAttrTypeFromDb(x.type);
                return attr.clean();
            });
    }

    invalidateAttrs(): void {
        this._attrs = [];
    }
}