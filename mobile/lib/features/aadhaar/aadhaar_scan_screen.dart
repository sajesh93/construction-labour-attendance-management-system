import 'package:flutter/material.dart';
import 'package:flutter_zxing/flutter_zxing.dart';

/// Live Aadhaar Secure QR scanner — native zxing-cpp on high-resolution
/// camera frames, the same approach mAadhaar/DigiLocker use. The Secure QR
/// holds ~3000 chars, far beyond what ML Kit reliably reads from a stream,
/// but zxing-cpp at 1080p with tryHarder locks on in well under a second.
/// Pops with the raw decoded string, or null if cancelled.
class AadhaarScanScreen extends StatefulWidget {
  const AadhaarScanScreen({super.key});

  @override
  State<AadhaarScanScreen> createState() => _AadhaarScanScreenState();
}

class _AadhaarScanScreenState extends State<AadhaarScanScreen> {
  bool _handled = false;

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('Scan Aadhaar QR')),
      body: Stack(
        alignment: Alignment.center,
        children: [
          ReaderWidget(
            onScan: (Code code) {
              if (_handled) return;
              final text = code.text;
              if (!code.isValid || text == null || text.isEmpty) return;
              _handled = true;
              Navigator.of(context).pop(text);
            },
            codeFormat: Format.qrCode,
            tryHarder: true,
            tryInverted: true,
            tryRotate: true,
            // 1080p frames + a large crop window: the dense QR gets ~8 px per
            // module, comfortably above zxing-cpp's threshold.
            resolution: ResolutionPreset.veryHigh,
            cropPercent: 0.85,
            scanDelay: const Duration(milliseconds: 250),
            scanDelaySuccess: const Duration(milliseconds: 500),
            showGallery: false,
            showToggleCamera: false,
            showFlashlight: true,
            actionButtonsAlignment: Alignment.bottomRight,
          ),
          const Positioned(
            bottom: 24,
            left: 24,
            right: 24,
            child: Text(
              'Hold the Aadhaar QR inside the box, 10–15 cm away.\n'
              'Keep the card flat; use the flash in low light.',
              textAlign: TextAlign.center,
              style: TextStyle(color: Colors.white, backgroundColor: Colors.black54),
            ),
          ),
        ],
      ),
    );
  }
}
