// CSV reading for inventory imports. Plant inventories come from Excel in several locales
// (comma in EN, semicolon in PT/ES, often Windows-1252), from OT asset tools (Nozomi, Claroty)
// and from engineering tools, so every step here is explicit and reports what it could not read.
import type { DeviceDef } from './types';
import { parseIPv4 } from './checks';

export type Delimiter = ',' | ';' | '\t';

export interface CsvResult {
  rows: string[][];
  delimiter: Delimiter;
  /** 1-based line numbers of rows whose cell count differs from the header */
  ragged: number[];
}

/** One delimiter for the whole file: an Excel `sep=` line, else the most frequent of , ; TAB in the header line (outside quotes). */
export function detectDelimiter(text: string): Delimiter {
  const sep = /^sep=(.)\r?\n/i.exec(text);
  if (sep && [',', ';', '\t'].includes(sep[1])) return sep[1] as Delimiter;
  const counts: Record<Delimiter, number> = { ',': 0, ';': 0, '\t': 0 };
  let q = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (c === '"') q = !q;
    else if (!q && (c === '\n' || c === '\r')) break;
    else if (!q && (c === ',' || c === ';' || c === '\t')) counts[c]++;
  }
  const [best, n] = (Object.entries(counts) as [Delimiter, number][]).sort((x, y) => y[1] - x[1])[0];
  return n ? best : ',';
}

/** RFC 4180 with a single delimiter: quotes only open at the start of a field, `""` is a quote inside one. */
export function parseCsv(input: string, delimiter?: Delimiter): CsvResult {
  let text = input.replace(/^﻿/, '');
  const d = delimiter ?? detectDelimiter(text);
  text = text.replace(/^sep=.\r?\n/i, '');
  const rows: string[][] = [];
  let row: string[] = [], cell = '', q = false, atStart = true;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (q) {
      if (c === '"') { if (text[i + 1] === '"') { cell += '"'; i++; } else q = false; }
      else cell += c;
      continue;
    }
    if (c === '"' && atStart) { q = true; atStart = false; continue; }
    if (c === d) { row.push(cell); cell = ''; atStart = true; continue; }
    if (c === '\n' || c === '\r') {
      if (c === '\r' && text[i + 1] === '\n') i++;
      row.push(cell); rows.push(row); row = []; cell = ''; atStart = true; continue;
    }
    cell += c; atStart = false;
  }
  if (cell.length || row.length) { row.push(cell); rows.push(row); }
  const kept = rows.filter((r) => r.some((x) => x.trim()));
  const width = kept[0]?.length ?? 0;
  const ragged: number[] = [];
  kept.forEach((r, i) => { if (i && r.length !== width) ragged.push(i + 1); });
  return { rows: kept, delimiter: d, ragged };
}

/** UTF-8 when the bytes are valid UTF-8, else Windows-1252 (what Excel writes as "CSV" in PT/ES Windows). Refuses binary files. */
export function decodeCsv(buf: ArrayBuffer): { text: string; encoding: 'UTF-8' | 'Windows-1252' } {
  const b = new Uint8Array(buf);
  if ((b[0] === 0x50 && b[1] === 0x4b) || b.subarray(0, 4096).includes(0)) {
    throw new Error('This is not a text file. In Excel use File › Save As › CSV, then import that file.');
  }
  try { return { text: new TextDecoder('utf-8', { fatal: true }).decode(b), encoding: 'UTF-8' }; }
  catch { return { text: new TextDecoder('windows-1252').decode(b), encoding: 'Windows-1252' }; }
}

/* ---------- column mapping ---------- */

export type Target = 'skip' | 'name' | 'type' | 'subtitle' | 'addresses' | 'vlan' | `prop:${string}`;

/** lower case, accents removed, separators collapsed: "Endereço IP" → "endereco ip" */
export const normHeader = (h: string) => h.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[_\-./]+/g, ' ').replace(/\s+/g, ' ').trim();
export const propKey = (h: string) => normHeader(h).replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '') || 'col';

const HEADER_ALIASES: Record<Exclude<Target, 'skip' | `prop:${string}`>, string[]> = {
  name: ['name', 'device', 'device name', 'hostname', 'host', 'host name', 'asset name', 'tag', 'nome', 'nombre', 'nome do dispositivo', 'nombre del equipo'],
  type: ['type', 'device type', 'asset type', 'assettype', 'category', 'kind', 'tipo', 'tipo de dispositivo', 'tipo de equipo', 'tipo de equipamento'],
  subtitle: ['role', 'function', 'description', 'funcao', 'funcion', 'descricao', 'descripcion', 'rol', 'papel'],
  addresses: ['ip', 'ips', 'ip address', 'ip addresses', 'ipaddress', 'ipv4', 'ipv4 address', 'address', 'addresses', 'endereco ip', 'enderecos ip', 'direccion ip', 'direcciones ip', 'ip principal'],
  vlan: ['vlan', 'vlan id', 'vlanid', 'vlan name'],
};

const MAC_HEADERS = ['mac', 'mac address', 'macaddress', 'endereco mac', 'direccion mac'];

/** Exact aliases only; each single-valued target goes to the first matching column, the rest become properties. */
export function guessMapping(header: string[]): Target[] {
  const taken = new Set<Target>();
  return header.map((h) => {
    const k = normHeader(h);
    if (!k) return 'skip';
    if (MAC_HEADERS.includes(k)) return 'prop:mac';
    for (const [t, list] of Object.entries(HEADER_ALIASES) as [Target, string[]][]) {
      if (list.includes(k) && !taken.has(t)) { taken.add(t); return t; }
    }
    return `prop:${propKey(h)}` as Target;
  });
}

/* ---------- device types ---------- */

const TYPE_ALIASES: [string[], string][] = [
  [['plc', 'controller', 'cpu', 'programmable logic controller', 'clp', 'controlador', 'rtu', 's7 1500', 's7 1516', 'compactlogix', 'controllogix'], 'plc-modular'],
  [['compact plc', 'plc compact', 's7 1200', 'micro plc'], 'plc-compact'],
  [['safety plc', 'f plc', 'fplc', 'failsafe plc', 'clp de seguranca', 'plc de seguridad'], 'safety-plc'],
  [['hmi', 'panel', 'operator panel', 'ihm', 'touch panel'], 'hmi'],
  [['switch', 'ethernet switch', 'managed switch', 'industrial switch', 'access switch', 'comutador'], 'switch'],
  [['l3 switch', 'layer 3 switch', 'core switch', 'distribution switch'], 'switch-l3'],
  [['router', 'roteador', 'enrutador'], 'router'],
  [['firewall', 'fw', 'security appliance'], 'firewall'],
  [['drive', 'vfd', 'frequency converter', 'inverter', 'inversor', 'variador', 'variador de frecuencia', 'inversor de frequencia'], 'vfd'],
  [['servo', 'servo drive', 'motor driver', 'axis drive'], 'motor-driver'],
  [['remote io', 'remote i o', 'io', 'i o', 'io module', 'io station', 'et200', 'et200sp', 'distributed io'], 'remote-io'],
  [['io link master', 'iolink master', 'io link'], 'iolink'],
  [['camera', 'ip camera', 'cctv', 'camara', 'camera ip'], 'ip-camera'],
  [['vision', 'vision sensor', 'vision system', 'smart camera'], 'vision'],
  [['server', 'servidor'], 'server'],
  [['pc', 'workstation', 'engineering station', 'engineering workstation', 'computer', 'computador'], 'pc'],
  [['ipc', 'industrial pc', 'edge', 'edge device', 'box pc'], 'industrial-pc'],
  [['laptop', 'notebook'], 'laptop'],
  [['robot', 'robot controller', 'robot arm', 'robo'], 'robot-arm'],
  [['gripper', 'garra'], 'gripper'],
  [['sensor'], 'sensor'],
  [['actuator', 'valve', 'valve terminal', 'atuador', 'actuador'], 'actuator'],
  [['access point', 'ap', 'wap', 'wireless access point'], 'access-point'],
  [['gateway', 'iot gateway', 'protocol gateway'], 'iot-gateway'],
  [['ups', 'nobreak', 'sai'], 'ups'],
  [['nas', 'storage'], 'nas'],
  [['database', 'historian'], 'database'],
  [['printer', 'impressora', 'impresora'], 'printer'],
  [['phone', 'ip phone', 'telefone', 'telefono'], 'ip-phone'],
  [['scanner', 'barcode scanner', 'barcode reader', 'reader', 'code reader', 'rfid reader'], 'barcode-scanner'],
  [['patch panel'], 'patch-panel'],
  [['media converter'], 'media-converter'],
  [['modem', 'ont'], 'modem-ont'],
  [['vpn', 'vpn gateway', 'remote access'], 'vpn-gateway'],
  [['wireless controller', 'wlc', 'wlan controller'], 'wireless-controller'],
];

/** The library device for a type value: exact id or name, then an exact alias. `undefined` = ask the user. */
export function guessDefId(value: string, defs: DeviceDef[]): string | undefined {
  const k = normHeader(value);
  if (!k) return undefined;
  const hit = defs.find((d) => d.id === value.trim() || normHeader(d.name) === k);
  if (hit) return hit.id;
  const alias = TYPE_ALIASES.find(([names]) => names.includes(k));
  return alias && defs.some((d) => d.id === alias[1]) ? alias[1] : undefined;
}

/** "10.0.0.1, 10.0.1.5" → the parts that are IPv4 addresses (with optional /prefix), and the parts that are not */
export function splitAddresses(text: string): { ips: string[]; other: string[] } {
  const parts = text.split(/[;,|\n\s]+/).map((t) => t.trim()).filter(Boolean);
  const ips: string[] = [], other: string[] = [];
  for (const p of parts) (parseIPv4(p.split('/')[0]) !== null ? ips : other).push(p);
  return { ips, other };
}
