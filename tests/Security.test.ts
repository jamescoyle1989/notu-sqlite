import { expect, test } from 'vitest';
import { Security } from '../src/Security';


test('sign accepts a username & password, returning a JWT token', async () => {
    const security = new Security(
        () => true,
        'cc7e0d44fd473002f1c42167459001140ec6389b7353f8088f4d9a95f2f596f2'
    );

    const key = await security.sign('James', 'password');

    //Don't really have a good way to test this, more just using it to see that I can get output
    //console.log(key);
});

test('sign throws error if username & password combo not valid', async () => {
    const security = new Security(
        () => false,
        'cc7e0d44fd473002f1c42167459001140ec6389b7353f8088f4d9a95f2f596f2'
    );

    try {
        await security.sign('James', 'password');
        expect('Above line should error').toBe('But somehow it didnt');
    }
    catch (err) {
        expect(err.message).toBe('Invalid username & password combination');
    }
});


test('verify accepts a JWT token and makes sure its valid', async () => {
    const security = new Security(
        () => true,
        'cc7e0d44fd473002f1c42167459001140ec6389b7353f8088f4d9a95f2f596f2'
    );
    const goodKey = await security.sign('James', 'password');

    await security.verify(goodKey);
    try {
        await security.verify(goodKey+'a');
        expect('Above line should error').toBe('But somehow it didnt');
    }
    catch (err) {
        expect(err.message).toBe('Invalid security token supplied');
    }
});