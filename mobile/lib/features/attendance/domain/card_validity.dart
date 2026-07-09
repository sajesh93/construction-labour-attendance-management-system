/// True when the worker's ID card has passed its validity date at the moment of
/// the tap.
///
/// Mirrors the server rule (backend/src/modules/attendance/engine/card-validity.ts):
/// the card is valid *through* [validityTill], so a card stamped 09-Jul-2026
/// still works all day on the 9th and stops on the 10th. The comparison is made
/// on calendar days in the device's local time, which is the site's time.
///
/// A worker with no validity date has an open-ended card and never expires —
/// and so does one whose cache predates the field, which keeps an app upgrade
/// from locking a whole site out of the gate.
bool isCardExpired(DateTime? validityTill, DateTime tapTime) {
  if (validityTill == null) return false;
  final tapDay = DateTime(tapTime.year, tapTime.month, tapTime.day);
  final lastValidDay = DateTime(validityTill.year, validityTill.month, validityTill.day);
  return tapDay.isAfter(lastValidDay);
}
