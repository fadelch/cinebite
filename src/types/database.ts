/**
 * Structural shape shared by Firestore Timestamp implementations.
 * Keeping this interface in the domain layer avoids coupling business types to
 * either the browser Firebase SDK or the server Firebase Admin SDK.
 */
export interface DatabaseTimestamp {
  readonly seconds: number;
  readonly nanoseconds: number;
  toDate(): Date;
}
