import { Attr, Note, Space, Tag } from 'notu';
import SQLiteConnection from './SQLiteConnection';


export default class SQLiteCache {
    private _spaces: Array<Space> = [];
    
    getSpace(name: string, connection: SQLiteConnection): Space {
        let result = this._spaces.find(x => x.name == name);
        if (!!result)
            return result;

        this._spaces = connection
            .getAll('SELECT id, name FROM Space;')
            .map(x => {
                const space = new Space(x.name);
                space.id = x.id;
                return space.clean();
            });
        result = this._spaces.find(x => x.name == name);
        if (!!result)
            return result;

        throw Error(`Unrecognised '${name}' space`);
    }

    invalidateSpaces(): void {
        this._spaces = [];
    }


    private _tags: Array<Note> = [];

    getTag(name: string, spaceId: number, connection: SQLiteConnection): Note {
        let result = this._tags.find(x => x.spaceId == spaceId && x.ownTag.name == name);
        if (!!result)
            return result;

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
        result = this._tags.find(x => x.spaceId == spaceId && x.ownTag.name == name);
        if (!!result)
            return result;
        
        throw Error(`Unrecognised '${name}' tag in space with ID ${spaceId}.`);
    }

    invalidateTags(): void {
        this._tags = [];
    }


    private _attrs: Array<Attr> = [];

    getAttr(name: string, spaceId: number, connection: SQLiteConnection): Attr {
        let result = this._attrs.find(x => x.spaceId == spaceId && x.name == name);
        if (!!result)
            return result;

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
        result = this._attrs.find(x => x.spaceId == spaceId && x.name == name);
        if (!!result)
            return result;
        
        throw Error(`Unrecognised '${name}' attr in space with ID ${spaceId}.`);
    }

    invalidateAttrs(): void {
        this._attrs = [];
    }
}