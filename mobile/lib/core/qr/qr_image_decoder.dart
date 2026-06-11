import 'package:cross_file/cross_file.dart';
import 'package:flutter_zxing/flutter_zxing.dart';

/// Decodes a QR code from a photo file using the native zxing-cpp engine.
///
/// ML Kit (the live scanner) is fast but unreliable on very dense codes like
/// the Aadhaar Secure QR (~3000 chars). zxing-cpp reads them from a still even
/// when rotated, slightly skewed or low-contrast — verified against a real
/// Aadhaar card photo that both ML Kit stills and the pure-Dart ZXing port
/// failed on.
Future<String?> decodeQrFromFile(String path) async {
  try {
    final result = await zx.readBarcodeImagePath(
      XFile(path),
      DecodeParams(
        format: Format.qrCode,
        tryHarder: true,
        tryRotate: true,
        tryInverted: true,
      ),
    );
    if (result.isValid) {
      final text = result.text;
      if (text != null && text.isNotEmpty) return text;
    }
  } catch (_) {
    // Fall through — caller shows "no QR found" guidance.
  }
  return null;
}
