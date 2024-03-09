export function mapAttrTypeToDb(attrType: 'TEXT' | 'NUMBER' | 'BOOLEAN' | 'DATE'): number {
    switch (attrType) {
        case 'TEXT': return 1;
        case 'NUMBER': return 2;
        case 'BOOLEAN': return 3;
        case 'DATE': return 4;
    }
    throw new Error('Unrecognised attribute type');
}

export function mapAttrTypeFromDb(attrType: number): 'TEXT' | 'NUMBER' | 'BOOLEAN' | 'DATE' {
    switch (attrType) {
        case 1: return 'TEXT';
        case 2: return 'NUMBER';
        case 3: return 'BOOLEAN';
        case 4: return 'DATE';
    }
    throw new Error('Unrecognised attribute type');
}