export interface PartnerProximityEvent {
  eventType: 'UNKNOWN'|'FOUND'|'LOST';
  partnerId: string;
  distanceM: number;
}