/** Types related to physical proximity of conversation partners. */

/**
 * An event that signifies a change in the physical proximity of a conversation
 * partner.
 */
export interface PartnerProximityEvent {
  // Type of event:
  //   'FOUND' - When the partner enters physical proximity with the user.
  //   'LOST' - When the partner disppears from physical proximity with the user
  //     (e.g., stepping far away so is no longer in the vicinity of the user).
  //   'UNKNOWN' - All other cases.
  eventType: 'UNKNOWN'|'FOUND'|'LOST';

  // ID for the partner.
  partnerId: string;

  // The current distance from the user to the partner, in meters.
  distanceM: number;
}
