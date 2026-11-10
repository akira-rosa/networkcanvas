import { describe, it, expect } from 'vitest';
import { parseCsv, detectDelimiter, decodeCsv, guessMapping, guessDefId, splitAddresses } from '../src/model/csv';
import { ALL_BUILTIN } from '../src/library';

const iso = ALL_BUILTIN.filter((d) => (d.style ?? 'iso') === 'iso');

describe('CSV parsing', () => {
  it('uses one delimiter per file, so commas inside semicolon files stay in their cell (pt-BR/es-ES Excel)', () => {
    const r = parseCsv('Nome;Modelo;Local\nPLC-01;S7-1500, CPU 1516;Hall 2, Rack A\n');
    expect(r.delimiter).toBe(';');
    expect(r.rows[1]).toEqual(['PLC-01', 'S7-1500, CPU 1516', 'Hall 2, Rack A']);
    expect(r.ragged).toEqual([]);
  });
  it('treats a quote in the middle of a field as text (19" rack)', () => {
    const r = parseCsv('Name,Model,Location\nSW-01,Scalance X208,19" rack A\nSW-02,Scalance X208,19" rack B\n');
    expect(r.rows.length).toBe(3);
    expect(r.rows[2]).toEqual(['SW-02', 'Scalance X208', '19" rack B']);
  });
  it('keeps quoted delimiters, doubled quotes and line breaks inside quotes', () => {
    const r = parseCsv('a,b\n"x, y","he said ""hi""\nnext line"\n');
    expect(r.rows[1]).toEqual(['x, y', 'he said "hi"\nnext line']);
  });
  it('honours Excel’s sep= line and tab-separated files, and reports ragged rows', () => {
    expect(detectDelimiter('sep=;\na,b;c\n')).toBe(';');
    expect(parseCsv('sep=;\na,b;c\n').rows[0]).toEqual(['a,b', 'c']);
    expect(parseCsv('a\tb\n1\t2\n').delimiter).toBe('\t');
    expect(parseCsv('a,b,c\n1,2,3\n1,2\n').ragged).toEqual([3]);
  });
  it('decodes Windows-1252 when the bytes are not UTF-8, and refuses binary files', () => {
    const latin1 = new Uint8Array([0x46, 0x75, 0x6e, 0xe7, 0xe3, 0x6f]); // "Função" in Windows-1252
    expect(decodeCsv(latin1.buffer)).toEqual({ text: 'Função', encoding: 'Windows-1252' });
    expect(decodeCsv(new TextEncoder().encode('Função').buffer).encoding).toBe('UTF-8');
    expect(() => decodeCsv(new Uint8Array([0x50, 0x4b, 3, 4, 0, 0]).buffer)).toThrow(/not a text file/);
  });
});

describe('column mapping', () => {
  it('maps only exact header names, in English, Portuguese and Spanish', () => {
    expect(guessMapping(['Name', 'Type', 'IP address', 'VLAN', 'Equipment No.', 'Description of fault', 'Shipping'])).toEqual(
      ['name', 'type', 'addresses', 'vlan', 'prop:equipment_no', 'prop:description_of_fault', 'prop:shipping']);
    expect(guessMapping(['Nome', 'Tipo', 'Endereço IP', 'Função'])).toEqual(['name', 'type', 'addresses', 'subtitle']);
    expect(guessMapping(['nombre', 'tipo', 'dirección IP'])).toEqual(['name', 'type', 'addresses']);
  });
  it('never sends a MAC or a second IP-like column to the addresses', () => {
    expect(guessMapping(['name', 'ip', 'mac_address', 'ip address'])).toEqual(['name', 'addresses', 'prop:mac', 'prop:ip_address']);
  });
});

describe('device types', () => {
  it('maps type values by exact alias, never by substring', () => {
    expect(guessDefId('controller', iso)).toBe('plc-modular');
    expect(guessDefId('io_module', iso)).toBe('remote-io');
    expect(guessDefId('Frequency converter', iso)).toBe('vfd');
    expect(guessDefId('Switch', iso)).toBe('switch');
    expect(guessDefId('wireless controller', iso)).toBe('wireless-controller');
    expect(guessDefId('Something unusual', iso)).toBeUndefined();
  });
  it('separates IP addresses from other text', () => {
    expect(splitAddresses('10.0.0.1, 10.0.1.5/24; EQ-10421')).toEqual({ ips: ['10.0.0.1', '10.0.1.5/24'], other: ['EQ-10421'] });
  });
});
