import 'package:geolocator/geolocator.dart';

class GeoFix {
  const GeoFix(this.lat, this.lng, this.accuracyM);
  final double lat;
  final double lng;
  final double accuracyM;
}

/// Captures the device GPS fix for an attendance event. Returns null if
/// permission is denied or location is unavailable (tap is never blocked by it
/// unless the site enforces geo, which the server validates).
class LocationService {
  Future<GeoFix?> current() async {
    try {
      final enabled = await Geolocator.isLocationServiceEnabled();
      if (!enabled) return null;

      var permission = await Geolocator.checkPermission();
      if (permission == LocationPermission.denied) {
        permission = await Geolocator.requestPermission();
      }
      if (permission == LocationPermission.denied ||
          permission == LocationPermission.deniedForever) {
        return null;
      }

      final pos = await Geolocator.getCurrentPosition(
        desiredAccuracy: LocationAccuracy.high,
      );
      return GeoFix(pos.latitude, pos.longitude, pos.accuracy);
    } catch (_) {
      return null;
    }
  }
}
