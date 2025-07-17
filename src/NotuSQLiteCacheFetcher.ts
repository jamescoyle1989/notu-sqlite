import { ISQLiteConnection } from './SQLiteConnection';
import { mapIntToColor } from './SQLMappings';


export class NotuSQLiteCacheFetcher {

    private _connectionFactory: () => Promise<ISQLiteConnection>;

    constructor(connectionFactory: () => Promise<ISQLiteConnection>) {
        this._connectionFactory = connectionFactory;
    }


    async getSpacesData(): Promise<Array<any>> {
        const connection = await this._connectionFactory();
        try {
            return (await connection
                .getAll('SELECT id, name, version, useCommonSpace FROM Space;'))
                .map(x => ({
                    state: 'CLEAN',
                    id: x.id,
                    name: x.name,
                    version: x.version,
                    useCommonSpace: x.useCommonSpace
                }));
        }
        finally {
            await connection.close();
        }
    }


    async getTagsData(): Promise<Array<any>> {
        const connection = await this._connectionFactory();
        try {
            const tags = (await connection
                .getAll('SELECT n.id, t.name, n.spaceId, t.color, t.availability FROM Note n INNER JOIN Tag t ON n.id = t.id;'))
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
            (await connection
                .getAll('SELECT t.id AS fromId, nt.tagId AS toId FROM Tag t INNER JOIN NoteTag nt ON t.id = nt.noteId;'))
                .map(x => tagsMap.get(x.fromId).links.push(x.toId));
            return Promise.resolve(tags);
        }
        finally {
            await connection.close();
        }
    }
}