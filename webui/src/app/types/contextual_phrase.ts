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

  // The displayed version of the phrase, which may be different from `text`.
  // If undefined, the displayed message will be based on `text`.
  displayText?: string;

  // Tags for the phrase, e.g., "care", "temporal".
  tags?: string[];

  // The presence of a conversation partner, as specified by the unique ID for
  // the partner, as a contextual signal.
  partnerId?: string;

  // Creation timestamp for the quick phrase, in ISO format. Assume UTC time
  // zone.
  createdTimestamp?: string;

  // Last modified timestamp (if any), in ISO format. Assume UTC time zone.
  lastModifiedTimestamp?: string;

  // Last used timetamp (if any).
  lastUsedTimestamp?: string;
}

// Request to add a contextual phrase (i.e., "quick phrase").
export interface AddContextualPhraseRequest {
  // ID of the user that the quick phrase is for.
  userId: string;

  // The content of the contextual phrase to be added.
  contextualPhrase: ContextualPhrase;
}

// Response to a request to add a contextual phrase.
export interface AddContextualPhraseResponse {
  // A unique ID of the added phrase. Populated if and only if the
  // add-contextual-phrase is successful.
  phraseId?: string;

  errorMessage?: string;
}

// Request to delete an existing contextual phrase (i.e., "quick phrase").
export interface DeleteContextualPhraseRequest {
  // The ID Of the user the to-be-deleted phrase belongs to.
  userId: string;

  // The unique ID of the to-be-deleted phrase.
  phraseId: string;
}

// Response to a request to delete an existing contextual phrase.
export interface DeleteContextualPhraseResponse {
  // Echo of the deleted contextual phrase. Populated if and only if the
  // deletion is successful.
  phraseId?: string

  errorMessage?: string;
}

// Request to edit a contextual phrase (i.e., "quick phrase").
export interface EditContextualPhraseRequest {
  userId: string;

  phraseId: string;

  text: string;

  displayText: string;
}

// Response to the request to edit a contextual phrase.
export interface EditContextualPhraseResponse {
  // Echoes the phrase ID.
  phraseId: string;

  errorMessage?: string;
}

// Request to mark the usage of a contextual phrase.
export interface MarkContextualPhraseUsageRequest {
  // The ID of the user to which the contextual phrase belongs.
  userId: string;

  // ID of the phrase to mark usage for.
  phraseId: string;

  // Last usage timestamp, in ISO format. Assume UTC time zone.
  lastUsedTimestamp: string;
}

// Response to a qurest to mark a contextual phrase for usage.
export interface MarkContextualPhraseUsageResponse {
  // Echoed phrase ID.
  phraseId: string;
}