class DateHandler {
  fromISOString(isoString: string): Date {
    return new Date(isoString);
  }

  now(): number {
    return Date.now();
  }

  parse(dateString: string): number {
    return Date.parse(dateString);
  }

  getDate(date: Date): number {
    return date.getDate();
  }

  getDay(date: Date): number {
    return date.getDay();
  }

  getFullYear(date: Date): number {
    return date.getFullYear();
  }

  getHours(date: Date): number {
    return date.getHours();
  }

  getMilliseconds(date: Date): number {
    return date.getMilliseconds();
  }

  getMinutes(date: Date): number {
    return date.getMinutes();
  }

  getMonth(date: Date): number {
    return date.getMonth();
  }

  getSeconds(date: Date): number {
    return date.getSeconds();
  }

  getTime(date: Date): number {
    return date.getTime();
  }

  getTimezoneOffset(date: Date): number {
    return date.getTimezoneOffset();
  }

  getUTCDate(date: Date): number {
    return date.getUTCDate();
  }

  getUTCDay(date: Date): number {
    return date.getUTCDay();
  }

  getUTCFullYear(date: Date): number {
    return date.getUTCFullYear();
  }

  getUTCHours(date: Date): number {
    return date.getUTCHours();
  }

  getUTCMilliseconds(date: Date): number {
    return date.getUTCMilliseconds();
  }

  getUTCMinutes(date: Date): number {
    return date.getUTCMinutes();
  }

  getUTCMonth(date: Date): number {
    return date.getUTCMonth();
  }

  getUTCSeconds(date: Date): number {
    return date.getUTCSeconds();
  }

  setMilliseconds(date: Date, ms: number): number {
    return date.setMilliseconds(ms);
  }

  setMinutes(date: Date, minutes: number, seconds?: number, ms?: number): number {
    return date.setMinutes(minutes, seconds, ms);
  }

  setMonth(date: Date, month: number, day?: number): number {
    return date.setMonth(month, day);
  }

  setSeconds(date: Date, seconds: number, ms?: number): number {
    return date.setSeconds(seconds, ms);
  }

  setTime(date: Date, time: number): number {
    return date.setTime(time);
  }

  setUTCDate(date: Date, day: number): number {
    return date.setUTCDate(day);
  }

  setUTCFullYear(date: Date, year: number, month?: number, day?: number): number {
    return date.setUTCFullYear(year, month, day);
  }

  setUTCHours(date: Date, hours: number, minutes?: number, seconds?: number, ms?: number): number {
    return date.setUTCHours(hours, minutes, seconds, ms);
  }

  setUTCMilliseconds(date: Date, ms: number): number {
    return date.setUTCMilliseconds(ms);
  }

  setUTCMinutes(date: Date, minutes: number, seconds?: number, ms?: number): number {
    return date.setUTCMinutes(minutes, seconds, ms);
  }

  setUTCMonth(date: Date, month: number, day?: number): number {
    return date.setUTCMonth(month, day);
  }

  setUTCSeconds(date: Date, seconds: number, ms?: number): number {
    return date.setUTCSeconds(seconds, ms);
  }
  
  setDate(date: Date, day: number): number {
    return date.setDate(day);
  }

  setFullYear(date: Date, year: number, month?: number, day?: number): number {
    return date.setFullYear(year, month, day);
  }

  setHours(date: Date, hours: number, minutes?: number, seconds?: number, ms?: number): number {
    return date.setHours(hours, minutes, seconds, ms);
  }
  toDateString(date: Date): string {
    return date.toDateString();
  }

  toISOString(date: Date): string {
    return date.toISOString();
  }

  toJSON(date: Date): string {
    return date.toJSON();
  }

  toLocaleDateString(date: Date, locales?: string | string[], options?: Intl.DateTimeFormatOptions): string {
    return date.toLocaleDateString(locales, options);
  }

  toLocaleString(date: Date, locales?: string | string[], options?: Intl.DateTimeFormatOptions): string {
    return date.toLocaleString(locales, options);
  }

  toLocaleTimeString(date: Date, locales?: string | string[], options?: Intl.DateTimeFormatOptions): string {
    return date.toLocaleTimeString(locales, options);
  }

  toString(date: Date): string {
    return date.toString();
  }

  UTC(year: number, month: number, date?: number, hours?: number, minutes?: number, seconds?: number, ms?: number): number {
    return Date.UTC(year, month, date, hours, minutes, seconds, ms);
  }

  valueOf(date: Date): number {
    return date.valueOf();
  }

}

export { DateHandler };
