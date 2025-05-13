import { SQLiteConnection } from './SQLiteConnection';
import { mapIntToColor } from './SQLMappings';


export class NotuSQLiteCacheFetcher {

    private _connectionFactory: () => SQLiteConnection;

    constructor(connectionFactory: () => SQLiteConnection) {
        this._connectionFactory = connectionFactory;
    }


    getSpacesData(): Promise<Array<any>> {
        const connection = this._connectionFactory();
        try {
            return Promise.resolve(connection
                .getAll('SELECT id, name, version, useCommonSpace FROM Space;')
                .map(x => ({
                    state: 'CLEAN',
                    id: x.id,
                    name: x.name,
                    version: x.version,
                    useCommonSpace: x.useCommonSpace
                }))
            );
        }
        finally {
            connection.close();
        }
    }


    getTagsData(): Promise<Array<any>> {
        const connection = this._connectionFactory();
        try {
            const tags = connection
                .getAll('SELECT n.id, t.name, n.spaceId, t.color, t.availability FROM Note n INNER JOIN Tag t ON n.id = t.id;')
                .map(x => ({
                    state: 'CLEAN',
                    id: x.id,
                    name: x.name,
                    spaceId: x.spaceId,
                    color: mapIntToColor(x.color),
                    availability: x.availability,
                    links: []
                }));
            const tagsMap = new Map<number, any>();
            for (const tag of tags)
                tagsMap.set(tag.id, tag);
            connection
                .getAll('SELECT t.id AS fromId, nt.tagId AS toId FROM Tag t INNER JOIN NoteTag nt ON t.id = nt.noteId;')
                .map(x => tagsMap.get(x.fromId).links.push(x.toId));
            return Promise.resolve(tags);
        }
        finally {
            connection.close();
        }
    }
}