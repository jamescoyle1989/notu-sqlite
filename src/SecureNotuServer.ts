import { NotuServer } from './NotuServer';
import { Security } from './Security';
import { Note, Space, Attr } from 'notu';


export class SecureNotuServer {
    private _notuServer: NotuServer;
    private _security: Security;

    constructor(notuServer: NotuServer, security: Security) {
        this._notuServer = notuServer;
        this._security = security;
    }

    async getSpaces(token: string): Promise<Array<Space>> {
        await this._security.verify(token);
        return this._notuServer.getSpaces();
    }

    async saveSpace(token: string, space: Space): Promise<void> {
        await this._security.verify(token);
        this._notuServer.saveSpace(space);
    }

    async getAttrs(token: string): Promise<Array<Attr>> {
        await this._security.verify(token);
        return this._notuServer.getAttrs();
    }

    async saveAttr(token: string, attr: Attr): Promise<void> {
        await this._security.verify(token);
        return this._notuServer.saveAttr(attr);
    }

    async getNotes(token: string, query: string, spaceId: number): Promise<Array<Note>> {
        await this._security.verify(token);
        return this._notuServer.getNotes(query, spaceId);
    }

    async saveNote(token: string, note: Note): Promise<void> {
        await this._security.verify(token);
        return this._notuServer.saveNote(note);
    }
}