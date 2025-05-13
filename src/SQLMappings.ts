export function mapColorToInt(hex: string): number {
    if (!hex)
        return null;
    if (hex.startsWith('#'))
        hex = hex.substring(1);
    return parseInt(hex, 16);
}

export function mapIntToColor(color: number): string {
    if (color == null)
        return null;
    return '#' + color.toString(16).toUpperCase().padStart(6, '0');
}

export function mapDateToNumber(date: Date): number {
    return Math.round(date.getTime() / 1000);
}

export function mapNumberToDate(sqlDate: number): Date {
    return new Date(sqlDate * 1000);
}