import 'dart:async';
import 'package:flutter/material.dart';
import 'package:image_picker/image_picker.dart';
import 'package:mobile_scanner/mobile_scanner.dart';

import '../../../core/qr/qr_image_decoder.dart';

/// Full-screen QR scanner. Pops with the decoded string (or null if cancelled).
/// The CLAMS app expects payloads like "CLAMS:W-0001".
///
/// [highDensity] is for very dense codes (Aadhaar Secure QR, ~3000 chars):
/// the live stream rarely resolves those, so this mode leads with a
/// photo-capture pipeline — full-resolution still → ML Kit → ZXing fallback —
/// which is deterministic and immune to camera-stream quirks.
class QrScanScreen extends StatefulWidget {
  const QrScanScreen({
    super.key,
    this.title = 'Scan worker QR',
    this.hint = 'Point the camera at the worker QR badge',
    this.highDensity = false,
  });

  final String title;
  final String hint;
  final bool highDensity;

  @override
  State<QrScanScreen> createState() => _QrScanScreenState();
}

class _QrScanScreenState extends State<QrScanScreen> with WidgetsBindingObserver {
  // Default stream resolution on purpose: forcing 1920x1080 made several
  // devices deliver stretched frames after a camera restart, killing
  // detection entirely. Dense codes go through the photo pipeline instead.
  final MobileScannerController _controller = MobileScannerController(
    autoStart: false,
    detectionSpeed: DetectionSpeed.noDuplicates,
    formats: const [BarcodeFormat.qrCode],
  );
  bool _handled = false;
  bool _decodingPhoto = false;

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addObserver(this);
    unawaited(_controller.start());
  }

  @override
  void didChangeAppLifecycleState(AppLifecycleState state) {
    switch (state) {
      case AppLifecycleState.resumed:
        unawaited(_controller.start());
        break;
      case AppLifecycleState.inactive:
      case AppLifecycleState.paused:
      case AppLifecycleState.detached:
      case AppLifecycleState.hidden:
        unawaited(_controller.stop());
        break;
    }
  }

  @override
  void dispose() {
    WidgetsBinding.instance.removeObserver(this);
    _controller.dispose();
    super.dispose();
  }

  void _onDetect(BarcodeCapture capture) {
    if (_handled) return;
    final code = capture.barcodes.isNotEmpty ? capture.barcodes.first.rawValue : null;
    if (code == null || code.isEmpty) return;
    _handled = true;
    Navigator.of(context).pop(code);
  }

  /// The reliable path for dense codes: capture a full-resolution still, try
  /// ML Kit on it, then ZXing (better at dense QRs). No camera-stream quirks.
  Future<void> _scanFromPhoto() async {
    if (_decodingPhoto) return;
    await _controller.stop();
    try {
      final shot = await ImagePicker().pickImage(
        source: ImageSource.camera,
        imageQuality: 100,
      );
      if (shot == null) {
        if (mounted) unawaited(_controller.start());
        return;
      }

      setState(() => _decodingPhoto = true);
      String? code;
      try {
        final capture = await _controller.analyzeImage(shot.path);
        if (capture != null && capture.barcodes.isNotEmpty) {
          code = capture.barcodes.first.rawValue;
        }
      } catch (_) {
        // ML Kit unavailable for stills on this device — ZXing handles it.
      }
      code ??= await decodeQrFromFile(shot.path);

      if (!mounted) return;
      setState(() => _decodingPhoto = false);
      if (code != null && code.isNotEmpty) {
        _handled = true;
        Navigator.of(context).pop(code);
        return;
      }
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(
          content: Text(
            'No QR found in the photo. Fill the frame with the QR, keep the card flat and avoid glare, then retake.',
          ),
        ),
      );
      unawaited(_controller.start());
    } catch (_) {
      if (mounted) {
        setState(() => _decodingPhoto = false);
        unawaited(_controller.start());
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: Text(widget.title),
        actions: [
          IconButton(
            tooltip: 'Toggle torch',
            icon: const Icon(Icons.flashlight_on),
            onPressed: () => unawaited(_controller.toggleTorch()),
          ),
        ],
      ),
      body: Stack(
        alignment: Alignment.center,
        children: [
          MobileScanner(
            controller: _controller,
            onDetect: _onDetect,
            errorBuilder: (context, error, child) {
              return Container(
                color: Colors.black,
                padding: const EdgeInsets.all(24),
                alignment: Alignment.center,
                child: Column(
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    const Icon(Icons.videocam_off, color: Colors.white, size: 56),
                    const SizedBox(height: 16),
                    Text(
                      'Camera error: ${error.errorCode.name}',
                      style: const TextStyle(color: Colors.white, fontWeight: FontWeight.bold),
                      textAlign: TextAlign.center,
                    ),
                    const SizedBox(height: 8),
                    Text(
                      error.errorDetails?.message ??
                          'Grant camera permission in Settings, or use Manual entry.',
                      style: const TextStyle(color: Colors.white70),
                      textAlign: TextAlign.center,
                    ),
                    const SizedBox(height: 16),
                    FilledButton(
                      onPressed: () => unawaited(_controller.start()),
                      child: const Text('Retry'),
                    ),
                  ],
                ),
              );
            },
          ),
          IgnorePointer(
            child: Container(
              width: widget.highDensity ? 300 : 240,
              height: widget.highDensity ? 300 : 240,
              decoration: BoxDecoration(
                border: Border.all(color: Colors.white, width: 3),
                borderRadius: BorderRadius.circular(16),
              ),
            ),
          ),
          Positioned(
            bottom: 40,
            left: 0,
            right: 0,
            child: Column(
              children: [
                Padding(
                  padding: const EdgeInsets.symmetric(horizontal: 24),
                  child: Text(
                    widget.hint,
                    textAlign: TextAlign.center,
                    style: const TextStyle(color: Colors.white, backgroundColor: Colors.black54),
                  ),
                ),
                if (widget.highDensity) ...[
                  const SizedBox(height: 12),
                  FilledButton.icon(
                    onPressed: _decodingPhoto ? null : _scanFromPhoto,
                    icon: _decodingPhoto
                        ? const SizedBox(
                            width: 18,
                            height: 18,
                            child: CircularProgressIndicator(strokeWidth: 2),
                          )
                        : const Icon(Icons.photo_camera),
                    label: Text(_decodingPhoto ? 'Reading QR…' : 'Take photo (recommended)'),
                  ),
                ],
              ],
            ),
          ),
        ],
      ),
    );
  }
}
