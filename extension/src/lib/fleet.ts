/**
 * Reporting to the organisation's dashboard, and reading its policy.
 *
 * WHAT LEAVES THE LAPTOP
 *
 * Counts, built from the audit log the compliance report already reads, with
 * one field fewer: the rules that fired are dropped here, so a report is
 * nothing but when, what kind of pass, whether anything was sent, and how many
 * of each kind were hidden. The server refuses a report carrying anything else
 * (server/fleet.py), so this module and that schema have to agree, and the
 * tests hold this side to it.
 *
 * WHERE IT GOES
 *
 * The same server the extension already sends redacted requests to, at
 * /fleet — a bank running /analyze runs this too, so there is no second
 * destination to reason about. Turned off in Settings, nothing is reported.
 */

import type { AuditEntry } from './audit';

export interface FleetIdentity {
  deviceId: string;
  deviceName: string;
  team: string;
}

export interface FleetEntry {
  at: number;
  kind: AuditEntry['kind'];
  examined: AuditEntry['examined'];
  transmitted: boolean;
  counts: AuditEntry['counts'];
  total: number;
  durationMs: number | null;
}

export interface OrgPolicy {
  requireConsent: boolean;
}

const IDENTITY_KEYS = ['fleetDeviceId', 'fleetDeviceName', 'fleetTeam', 'fleetSharing'] as const;

/** The server root, from the /analyze endpoint the extension is configured with. */
export function fleetBase(endpoint: string): string {
  return endpoint.replace(/\/analyze\/?$/, '').replace(/\/+$/, '');
}

/** An audit entry with everything but the counts taken out. */
export function toFleetEntry(entry: AuditEntry): FleetEntry {
  return {
    at: entry.at,
    kind: entry.kind,
    examined: entry.examined,
    transmitted: entry.transmitted,
    counts: entry.counts.map(({ category, count }) => ({ category, count })),
    total: entry.total,
    durationMs: entry.durationMs,
  };
}

export function buildFleetReport(identity: FleetIdentity, entries: readonly AuditEntry[]) {
  return {
    device_id: identity.deviceId,
    device_name: identity.deviceName.slice(0, 40) || 'Laptop',
    team: identity.team.slice(0, 40) || 'Unassigned',
    entries: entries.slice(-200).map(toFleetEntry),
  };
}

/** A random id, made once per install. It names the laptop, never the person. */
function newDeviceId(): string {
  return crypto.randomUUID();
}

export async function readFleetIdentity(): Promise<FleetIdentity & { sharing: boolean }> {
  const stored = await chrome.storage.local.get([...IDENTITY_KEYS]);
  let deviceId = typeof stored['fleetDeviceId'] === 'string' ? stored['fleetDeviceId'] : '';
  if (!/^[A-Za-z0-9-]{8,64}$/.test(deviceId)) {
    deviceId = newDeviceId();
    await chrome.storage.local.set({ fleetDeviceId: deviceId });
  }
  const deviceName =
    typeof stored['fleetDeviceName'] === 'string' && stored['fleetDeviceName'].trim()
      ? stored['fleetDeviceName'].trim()
      : `Laptop ${deviceId.slice(0, 4).toUpperCase()}`;
  const team =
    typeof stored['fleetTeam'] === 'string' && stored['fleetTeam'].trim()
      ? stored['fleetTeam'].trim()
      : 'Unassigned';
  // On unless turned off: counts only, to the server this laptop already uses.
  const sharing = stored['fleetSharing'] !== false;
  return { deviceId, deviceName, team, sharing };
}

export async function saveFleetIdentity(patch: {
  deviceName?: string;
  team?: string;
  sharing?: boolean;
}): Promise<void> {
  const next: Record<string, unknown> = {};
  if (patch.deviceName !== undefined) next['fleetDeviceName'] = patch.deviceName.slice(0, 40);
  if (patch.team !== undefined) next['fleetTeam'] = patch.team.slice(0, 40);
  if (patch.sharing !== undefined) next['fleetSharing'] = patch.sharing;
  await chrome.storage.local.set(next);
}

/** Read the organisation's policy, or null when the server has none to give. */
export function policyFrom(value: unknown): OrgPolicy | null {
  if (typeof value !== 'object' || value === null) return null;
  const requireConsent = (value as Record<string, unknown>)['requireConsent'];
  return typeof requireConsent === 'boolean' ? { requireConsent } : null;
}
