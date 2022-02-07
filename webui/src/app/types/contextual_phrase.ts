/**
 * Type definitions related to contextual phrase predictions ("quick phrases").
 */

export enum DayOfWeek {
  DAY_OF_WEEK_UNKNOWN = 0,
  DAY_OF_WEEK_MONDAY = 1,
  DAY_OF_WEEK_TUESDAY = 2,
  DAY_OF_WEEK_WEDNESDAY = 3,
  DAY_OF_WEEK_THURSDAY = 4,
  DAY_OF_WEEK_FRIDAY = 5,
  DAY_OF_WEEK_SATURDAY = 6,
  DAY_OF_WEEK_SUNDAY = 7,
}

// A temporal range. The fields of this proto are interpreted as having a
// logical AND relation. For example, if `day_of_week` is [DAY_OF_WEEK_SUNDAY]
// and (min_seconds_since_day_start, max_seconds_since_day_start) are (8 * 3600,
// 9 * 3600), it is interpretedas meaning "every Sunday from 8 AM to 9 AM".
export interface TemporalRange {
  // Which day(s) of the week the temporal range applies to.
  dayOfWeek?: DayOfWeek[];

  // Minimum and maximum seconds since the start of the day. Together thse
  // two fields specif the time-of-the day range. The absence of this field
  // is interpreted as the TemporalRange applies to the entire day.
  minSecondsSinceDayStart?: number;
  maxSecondsSinceDayStart?: number;
}

export interface ContextualPhrase {
  // A unique ID for the phrase.
  phraseId: string;

  // The text of the phrase.
  text: string;

  // Tags for the phrase, e.g., "care", "temporal".
  tags?: string[];

  // The presence of a conversation partner, as specified by the unique ID for
  // the partner, as a contextual signal.
  partnerId?: string;
}
