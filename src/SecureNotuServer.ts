import { NotuServer } from './NotuServer';
import { Security } from './Security';
import { Note, Space, Attr, Tag } from 'notu';


export class SecureNotuServer {
    private _notuServer: NotuServer;
    private _security: Security;

    constructor(notuServer: NotuServer, security: Security) {
        this._notuServer = notuServer;
        this._security = security;
    }

    setupSchema(): void {
        this._notuServer.setupSchema();
    }

    async login(username: string, password: string): Promise<string> {
        return await this._security.sign(username, password);
    }

    /** Provides a way to verify the token upfront, so that following actions can be assured that they are working from a verified request. */
    async verify(token: string): Promise<NotuServer> {
        await this._security.verify(token);
        return this._notuServer;
    }

    async getSpaces(token: string): Promise<Array<Space>> {
        await this._security.verify(token);
        return this._notuServer.getSpaces();
    }

    async saveSpace(token: string, space: Space): Promise<void> {
        await this._security.verify(token);
        this._notuServer.saveSpace(space);
    }

    async getAttrs(token: string, spaceId: number = 0): Promise<Array<Attr>> {
        await this._security.verify(token);
        return this._notuServer.getAttrs(spaceId);
    }

    async saveAttr(token: string, attr: Attr): Promise<void> {
        await this._security.verify(token);
        return this._notuServer.saveAttr(attr);
    }

    async getTags(token: string): Promise<Array<Tag>> {
        await this._security.verify(token);
        return this._notuServer.getTags();
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