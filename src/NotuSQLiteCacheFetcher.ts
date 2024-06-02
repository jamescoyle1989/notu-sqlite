import { SQLiteConnection } from './SQLiteConnection';
import { mapAttrTypeFromDb, mapIntToColor } from './SQLMappings';


export class NotuSQLiteCacheFetcher {

    private _connectionFactory: () => SQLiteConnection;

    constructor(connectionFactory: () => SQLiteConnection) {
        this._connectionFactory = connectionFactory;
    }


    getSpacesData(): Promise<Array<any>> {
        const connection = this._connectionFactory();
        try {
            return Promise.resolve(connection
                .getAll('SELECT id, name, version FROM Space;')
                .map(x => ({
                    state: 'CLEAN',
                    id: x.id,
                    name: x.name,
                    version: x.version
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
            return Promise.resolve(connection
                .getAll('SELECT n.id, t.name, n.spaceId, t.color, t.isPublic FROM Note n INNER JOIN Tag t ON n.id = t.id;')
                .map(x => ({
                    state: 'CLEAN',
                    id: x.id,
                    name: x.name,
                    spaceId: x.spaceId,
                    color: mapIntToColor(x.color),
                    isPublic: x.isPublic
                }))
            );
        }
        finally {
            connection.close();
        }
    }


    getAttrsData(): Promise<Array<any>> {
        const connection = this._connectionFactory();
        try {
            return Promise.resolve(connection
                .getAll('SELECT id, name, description, spaceId, type, color FROM Attr;')
                .map(x => ({
                    state: 'CLEAN',
                    id: x.id,
                    name: x.name,
                    description: x.description,
                    type: mapAttrTypeFromDb(x.type),
                    spaceId: x.spaceId,
                    color: mapIntToColor(x.color)
                }))
            );
        }
        finally {
            connection.close();
        }
    }
}